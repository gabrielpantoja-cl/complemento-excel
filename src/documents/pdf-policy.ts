/**
 * PDF reading policy — pure decision helpers, no DOM and no pdf.js.
 *
 * The whole point of this module is the question "is the text layer good
 * enough, or does this page have to go to the model as an image?". Chilean
 * appraisal inputs (resoluciones exentas, copias de inscripción CBR,
 * certificados de avalúo) arrive both ways, often in the same file: a cover
 * page produced by a word processor followed by scanned annexes.
 *
 * Keeping the rule here — instead of inline in the tool — means it can be
 * unit-tested in Node without a browser, and tuned in one place.
 */

/**
 * Minimum number of meaningful characters a page must yield before its text
 * layer is trusted.
 *
 * Rationale: a scanned page is not always empty. Scanners and PDF printers
 * frequently leave a short header, a page number, or a stamp as real text on
 * top of the raster. Anything under ~120 characters is far below what a real
 * page of prose or a table row block produces, so it is treated as "no usable
 * text layer" rather than as content.
 */
export const DEFAULT_MIN_TEXT_CHARS_PER_PAGE = 120;

/** Default number of pages rendered as images in a single call. */
export const DEFAULT_MAX_IMAGE_PAGES = 4;

/** Hard ceiling on image pages per call, to protect the context window. */
export const MAX_IMAGE_PAGES_LIMIT = 20;

/** Default number of pages inspected in a single call. */
export const DEFAULT_MAX_PAGES = 40;

/** Default character budget for the text returned to the model. */
export const DEFAULT_MAX_TEXT_CHARS = 20_000;

/** Longest edge, in pixels, of a rendered page image. */
export const DEFAULT_IMAGE_MAX_EDGE = 1_600;

/** JPEG quality used when rasterising a page. */
export const DEFAULT_IMAGE_QUALITY = 0.8;

/** Budget for the raw (pre-base64) bytes of all page images in one call. */
export const DEFAULT_IMAGE_BYTE_BUDGET = 4 * 1024 * 1024;

export type PdfPageSourceMode = "text" | "image";

export type PdfReadMode = "auto" | "text" | "images";

export type PdfDocumentClassification = "text" | "scanned" | "mixed" | "empty";

/**
 * Collapse a raw pdf.js text-layer dump into something comparable across
 * pages: single spaces, no leading/trailing padding.
 */
export function normalizePageText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Characters that count towards the "is the text layer usable" decision. */
export function countMeaningfulChars(raw: string): number {
  return normalizePageText(raw).replace(/\s/g, "").length;
}

/**
 * The decision rule: trust the text layer, or rasterise the page?
 *
 * `minChars` defaults to {@link DEFAULT_MIN_TEXT_CHARS_PER_PAGE}.
 */
export function decidePageMode(
  meaningfulCharCount: number,
  minChars: number = DEFAULT_MIN_TEXT_CHARS_PER_PAGE,
): PdfPageSourceMode {
  const threshold = Number.isFinite(minChars) && minChars > 0
    ? Math.floor(minChars)
    : DEFAULT_MIN_TEXT_CHARS_PER_PAGE;

  return meaningfulCharCount >= threshold ? "text" : "image";
}

/** Document-level verdict, derived from the per-page decisions. */
export function classifyDocument(modes: readonly PdfPageSourceMode[]): PdfDocumentClassification {
  if (modes.length === 0) return "empty";

  const textPages = modes.filter((mode) => mode === "text").length;
  if (textPages === modes.length) return "text";
  if (textPages === 0) return "scanned";
  return "mixed";
}

/**
 * Parse a page selection such as `"1-4,9"` into an ascending list of unique
 * 1-based page numbers, clamped to `pageCount`.
 *
 * An empty/missing spec selects every page.
 */
export function parsePageSelection(spec: string | undefined, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("Document has no pages.");
  }

  const trimmed = spec?.trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  }

  const selected = new Set<number>();

  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);

      if (start < 1 || end < 1) {
        throw new Error(`Invalid page range '${part}': pages start at 1.`);
      }
      if (end < start) {
        throw new Error(`Invalid page range '${part}': end is before start.`);
      }

      for (let page = start; page <= Math.min(end, pageCount); page++) {
        selected.add(page);
      }
      continue;
    }

    const singleMatch = /^\d+$/.exec(part);
    if (!singleMatch) {
      throw new Error(`Invalid page selection '${part}'. Use forms like '3', '1-5', '1-2,7'.`);
    }

    const page = Number.parseInt(part, 10);
    if (page < 1) {
      throw new Error(`Invalid page '${part}': pages start at 1.`);
    }
    if (page <= pageCount) {
      selected.add(page);
    }
  }

  if (selected.size === 0) {
    throw new Error(`Page selection '${trimmed}' does not match any page (document has ${pageCount}).`);
  }

  return [...selected].sort((left, right) => left - right);
}

export interface PdfPagePlan {
  /** Pages that will actually be inspected. */
  pages: number[];
  /** Pages the caller asked for but that were dropped by the page cap. */
  dropped: number[];
}

/** Apply the per-call page cap to a parsed selection. */
export function planPages(selection: readonly number[], maxPages: number): PdfPagePlan {
  const cap = Number.isFinite(maxPages) && maxPages > 0
    ? Math.floor(maxPages)
    : DEFAULT_MAX_PAGES;

  if (selection.length <= cap) {
    return { pages: [...selection], dropped: [] };
  }

  return {
    pages: selection.slice(0, cap),
    dropped: selection.slice(cap),
  };
}

/** Clamp a caller-supplied image-page count into the supported range. */
export function clampImagePages(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_MAX_IMAGE_PAGES;
  }

  const floored = Math.floor(requested);
  if (floored < 0) return 0;
  return Math.min(floored, MAX_IMAGE_PAGES_LIMIT);
}

/** Upper bound on the render scale, so a tiny page cannot blow up the canvas. */
export const MAX_RENDER_SCALE = 8;

/**
 * Render scale so that the longest page edge lands on `maxEdge` pixels.
 *
 * Scaling **up** is deliberate and is the whole reason scanned pages come out
 * legible. A scanned page is usually a 300-dpi raster placed on a 72-dpi page
 * box: at pdf.js scale 1 an oficio page is only ~612×936 px, which throws away
 * most of the scan. Targeting a fixed long edge recovers that detail.
 */
export function computeRenderScale(
  width: number,
  height: number,
  maxEdge: number = DEFAULT_IMAGE_MAX_EDGE,
): number {
  const longestEdge = Math.max(width, height);
  if (!Number.isFinite(longestEdge) || longestEdge <= 0) return 1;

  const target = Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : DEFAULT_IMAGE_MAX_EDGE;

  return Math.min(MAX_RENDER_SCALE, target / longestEdge);
}

/** Approximate the decoded byte length of a base64 payload. */
export function base64ByteLength(base64: string): number {
  const length = base64.length;
  if (length === 0) return 0;

  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;

  return Math.floor((length * 3) / 4) - padding;
}
