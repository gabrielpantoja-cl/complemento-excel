/**
 * PDF read orchestration.
 *
 * Walks the requested pages, applies the text-layer decision rule from
 * `pdf-policy.ts`, and rasterises the pages that have no usable text so a
 * vision-capable model can read them. No pdf.js and no DOM here: the engine
 * arrives as a {@link PdfDocumentOpener}.
 */

import {
  DEFAULT_IMAGE_BYTE_BUDGET,
  DEFAULT_IMAGE_MAX_EDGE,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_TEXT_CHARS,
  DEFAULT_MIN_TEXT_CHARS_PER_PAGE,
  base64ByteLength,
  clampImagePages,
  classifyDocument,
  countMeaningfulChars,
  decidePageMode,
  parsePageSelection,
  planPages,
  type PdfDocumentClassification,
  type PdfPageSourceMode,
  type PdfReadMode,
} from "./pdf-policy.js";
import type { PdfDocumentOpener, RenderedPdfPage } from "./pdf-source.js";

export type PdfPageOutcome = "text" | "image" | "text_budget_exhausted" | "image_budget_exhausted";

export interface PdfPageResult {
  pageNumber: number;
  /** Meaningful (whitespace-stripped) character count of the text layer. */
  charCount: number;
  /** What the decision rule said about this page. */
  decision: PdfPageSourceMode;
  /** What was actually returned for this page. */
  outcome: PdfPageOutcome;
  text?: string;
  image?: RenderedPdfPage;
}

export interface PdfReadResult {
  pageCount: number;
  /** Pages the caller asked for, after clamping to the document. */
  requestedPages: number[];
  /** Pages actually inspected, after the per-call page cap. */
  inspectedPages: number[];
  pages: PdfPageResult[];
  classification: PdfDocumentClassification;
  textPageCount: number;
  imagePageCount: number;
  /** Decision threshold used, in meaningful characters per page. */
  minTextChars: number;
  mode: PdfReadMode;
  notes: string[];
}

export interface PdfReadOptions {
  openDocument: PdfDocumentOpener;
  /** Page selection, e.g. `"1-4,9"`. Omitted selects every page. */
  pages?: string;
  /** `auto` (default) follows the decision rule; `text`/`images` force a path. */
  mode?: PdfReadMode;
  maxImagePages?: number;
  maxPages?: number;
  maxTextChars?: number;
  minTextChars?: number;
  imageMaxEdge?: number;
  imageQuality?: number;
  imageByteBudget?: number;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("PDF read aborted.");
  }
}

function positiveOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored > 0 ? floored : fallback;
}

function resolveQuality(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_IMAGE_QUALITY;
  if (requested <= 0 || requested > 1) return DEFAULT_IMAGE_QUALITY;
  return requested;
}

function resolveDecision(
  mode: PdfReadMode,
  charCount: number,
  minTextChars: number,
): PdfPageSourceMode {
  if (mode === "images") return "image";
  if (mode === "text") return "text";
  return decidePageMode(charCount, minTextChars);
}

export async function readPdfDocument(
  bytes: Uint8Array,
  options: PdfReadOptions,
): Promise<PdfReadResult> {
  const mode: PdfReadMode = options.mode ?? "auto";
  const minTextChars = positiveOr(options.minTextChars, DEFAULT_MIN_TEXT_CHARS_PER_PAGE);
  const maxPages = positiveOr(options.maxPages, DEFAULT_MAX_PAGES);
  const maxTextChars = positiveOr(options.maxTextChars, DEFAULT_MAX_TEXT_CHARS);
  const imageMaxEdge = positiveOr(options.imageMaxEdge, DEFAULT_IMAGE_MAX_EDGE);
  const imageByteBudget = positiveOr(options.imageByteBudget, DEFAULT_IMAGE_BYTE_BUDGET);
  const imageQuality = resolveQuality(options.imageQuality);
  const maxImagePages = mode === "text" ? 0 : clampImagePages(options.maxImagePages);

  throwIfAborted(options.signal);

  const source = await options.openDocument(bytes);
  const notes: string[] = [];

  try {
    const requestedPages = parsePageSelection(options.pages, source.pageCount);
    const plan = planPages(requestedPages, maxPages);

    if (plan.dropped.length > 0) {
      const firstDropped = plan.dropped[0];
      const lastDropped = plan.dropped[plan.dropped.length - 1];
      notes.push(
        `Inspected the first ${plan.pages.length} of ${requestedPages.length} selected pages ` +
        `(per-call cap: ${maxPages}). Not read: pages ${firstDropped}-${lastDropped}. ` +
        "Call again with 'pages' to continue.",
      );
    }

    const pages: PdfPageResult[] = [];
    const decisions: PdfPageSourceMode[] = [];

    let textCharsUsed = 0;
    let imageBytesUsed = 0;
    let imagePagesUsed = 0;
    let textBudgetExhausted = false;
    let imageBudgetExhausted = false;

    for (const pageNumber of plan.pages) {
      throwIfAborted(options.signal);

      const rawText = mode === "images" ? "" : await source.getPageText(pageNumber);
      const charCount = countMeaningfulChars(rawText);
      const decision = resolveDecision(mode, charCount, minTextChars);
      decisions.push(decision);

      if (decision === "text") {
        const remaining = maxTextChars - textCharsUsed;

        if (remaining <= 0) {
          textBudgetExhausted = true;
          pages.push({ pageNumber, charCount, decision, outcome: "text_budget_exhausted" });
          continue;
        }

        const text = rawText.length > remaining ? rawText.slice(0, remaining) : rawText;
        textCharsUsed += text.length;
        if (text.length < rawText.length) textBudgetExhausted = true;

        pages.push({ pageNumber, charCount, decision, outcome: "text", text });
        continue;
      }

      if (imagePagesUsed >= maxImagePages) {
        imageBudgetExhausted = true;
        pages.push({ pageNumber, charCount, decision, outcome: "image_budget_exhausted" });
        continue;
      }

      const image = await source.renderPage(pageNumber, {
        maxEdge: imageMaxEdge,
        quality: imageQuality,
      });
      const imageBytes = base64ByteLength(image.base64);

      // Always return at least one page image, even if a single scan is
      // bigger than the budget — otherwise an oversized first page would
      // yield an empty result with no way to see why.
      if (imagePagesUsed > 0 && imageBytesUsed + imageBytes > imageByteBudget) {
        imageBudgetExhausted = true;
        pages.push({ pageNumber, charCount, decision, outcome: "image_budget_exhausted" });
        continue;
      }

      imageBytesUsed += imageBytes;
      imagePagesUsed += 1;
      pages.push({ pageNumber, charCount, decision, outcome: "image", image });
    }

    if (textBudgetExhausted) {
      notes.push(
        `Text output hit the ${maxTextChars}-character budget. ` +
        "Narrow 'pages' or raise 'max_chars' to read the rest.",
      );
    }

    if (imageBudgetExhausted) {
      const budgetMb = Math.round(imageByteBudget / (1024 * 1024));
      notes.push(
        `Not every page without a text layer was rendered (caps: ${maxImagePages} image page(s), ` +
        `~${budgetMb} MB). Re-run with 'pages' set to the pages still missing.`,
      );
    }

    const classification = classifyDocument(decisions);

    if (mode === "auto" && (classification === "scanned" || classification === "mixed")) {
      notes.push(
        "Pages with no usable text layer were rasterised and returned as images. " +
        "Reading them needs a vision-capable model; transcribe the figures you rely on.",
      );
    }

    if (mode === "text" && decisions.length > 0) {
      const thinPages = pages
        .filter((page) => page.charCount < minTextChars)
        .map((page) => page.pageNumber);

      if (thinPages.length > 0) {
        notes.push(
          `mode='text' was forced, so ${thinPages.length} page(s) below the ${minTextChars}-character ` +
          "threshold returned little or nothing. Re-run with mode='auto' to rasterise them.",
        );
      }
    }

    return {
      pageCount: source.pageCount,
      requestedPages,
      inspectedPages: plan.pages,
      pages,
      classification,
      textPageCount: pages.filter((page) => page.outcome === "text").length,
      imagePageCount: pages.filter((page) => page.outcome === "image").length,
      minTextChars,
      mode,
      notes,
    };
  } finally {
    try {
      await source.close();
    } catch {
      // A failed teardown must not mask a successful read.
    }
  }
}
