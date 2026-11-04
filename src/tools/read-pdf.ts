/**
 * read_pdf — read a PDF from the file workspace, text layer or scan.
 *
 * Why this exists: the inputs of a tasación (resolución exenta, copias de
 * inscripción del CBR, certificados de avalúo del SII, planos de expropiación)
 * arrive as PDFs, and a good share of them are scans with no text layer at
 * all. Upstream pi-web-ui only extracts the text layer, which returns an empty
 * string for exactly those files.
 *
 * The decision rule lives in `src/documents/pdf-policy.ts`:
 * - a page whose text layer yields enough meaningful characters is returned as
 *   text (cheap, exact, no vision needed);
 * - a page below that threshold is rasterised and returned as an image content
 *   block, so a vision-capable model reads it directly. That is the OCR path:
 *   the model does the transcription, no OCR engine ships in the bundle.
 *
 * Intake: drop the PDF on the chat input (it lands in the workspace and shows
 * up in auto-context), then call this tool with its path.
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { Type, type Static } from "@sinclair/typebox";

import {
  DEFAULT_IMAGE_MAX_EDGE,
  DEFAULT_MAX_IMAGE_PAGES,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_TEXT_CHARS,
  MAX_IMAGE_PAGES_LIMIT,
} from "../documents/pdf-policy.js";
import { readPdfDocument, type PdfReadResult } from "../documents/pdf-read.js";
import type { PdfDocumentOpener } from "../documents/pdf-source.js";
import { base64ToBytes } from "../files/encoding.js";
import { formatBytes } from "../files/mime.js";
import { getWorkspaceBaseName, normalizeWorkspacePath } from "../files/path.js";
import {
  getFilesWorkspace,
  type FilesWorkspaceAuditContext,
} from "../files/workspace.js";
import type { ReadPdfDetails } from "./tool-details.js";

/**
 * Largest PDF accepted. The whole file is held in memory as base64 plus bytes
 * inside the taskpane WebView, so this is a guard against a hung sidebar
 * rather than a pdf.js limit.
 */
export const MAX_PDF_BYTES = 40 * 1024 * 1024;

const schema = Type.Object({
  path: Type.String({
    description:
      "Workspace path of the PDF, as shown by the files tool or auto-context "
      + "(e.g. \"Resolucion-SRM-N27.pdf\" or \"imports/cbr-fojas-1530.pdf\").",
  }),
  pages: Type.Optional(Type.String({
    description:
      "Page selection, 1-based: \"3\", \"1-5\", \"1-2,7\". Default: every page, "
      + `up to ${DEFAULT_MAX_PAGES} per call.`,
  })),
  mode: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("text"),
    Type.Literal("images"),
  ], {
    description:
      "auto (default): text layer where it is usable, page image where it is not. "
      + "text: text layer only, never rasterise (cheapest; returns little for scans). "
      + "images: rasterise every selected page (use when the text layer is present but garbled).",
  })),
  max_image_pages: Type.Optional(Type.Number({
    minimum: 0,
    maximum: MAX_IMAGE_PAGES_LIMIT,
    description:
      `Maximum pages to return as images (default: ${DEFAULT_MAX_IMAGE_PAGES}). `
      + "Each page image costs roughly as much context as a page of text.",
  })),
  max_chars: Type.Optional(Type.Number({
    minimum: 500,
    maximum: 200000,
    description: `Character budget for extracted text (default: ${DEFAULT_MAX_TEXT_CHARS}).`,
  })),
  image_max_edge: Type.Optional(Type.Number({
    minimum: 400,
    maximum: 3000,
    description:
      `Longest edge, in pixels, of each rendered page (default: ${DEFAULT_IMAGE_MAX_EDGE}). `
      + "Raise it for dense scans with small print; it increases cost.",
  })),
});

type Params = Static<typeof schema>;

const TOOL_AUDIT_CONTEXT: FilesWorkspaceAuditContext = {
  actor: "assistant",
  source: "tool:read_pdf",
};

export interface ReadPdfToolDependencies {
  /** Overridable for tests; defaults to the lazily-loaded pdf.js engine. */
  openDocument?: PdfDocumentOpener;
  /**
   * Input modalities the active model accepts, as declared by the registry
   * (`Model.input`). When it is known and excludes `"image"`, page images are
   * withheld: sending them would fail at the provider with an opaque error,
   * and the user needs to be told to switch models instead.
   *
   * Returning `undefined` means "unknown" and the images are sent.
   */
  getActiveModelInput?: () => readonly string[] | undefined;
}

async function defaultOpenDocument(bytes: Uint8Array) {
  const { openPdfWithPdfJs } = await import("../documents/pdf-engine.js");
  return openPdfWithPdfJs(bytes);
}

function describeClassification(result: PdfReadResult): string {
  switch (result.classification) {
    case "text":
      return "text layer on every inspected page";
    case "scanned":
      return "scanned (no usable text layer)";
    case "mixed":
      return "mixed: some pages have a text layer, some are scans";
    case "empty":
      return "no pages inspected";
  }
}

function renderMarkdown(args: {
  path: string;
  fileName: string;
  fileSize: number;
  result: PdfReadResult;
}): string {
  const { result } = args;
  const lines: string[] = [];

  lines.push(`**${args.fileName}** — ${result.pageCount} page(s), ${formatBytes(args.fileSize)}`);
  lines.push("");
  lines.push(`- Path: \`${args.path}\``);
  lines.push(`- Verdict: ${describeClassification(result)}`);
  lines.push(
    `- Inspected: ${result.inspectedPages.length} page(s) — `
    + `${result.textPageCount} from the text layer, ${result.imagePageCount} rendered as image(s)`,
  );
  lines.push(
    `- Decision rule: a page needs ≥ ${result.minTextChars} meaningful characters `
    + `to be read as text (mode: ${result.mode})`,
  );

  for (const note of result.notes) {
    lines.push(`- ⚠️ ${note}`);
  }

  for (const page of result.pages) {
    lines.push("");

    if (page.outcome === "text") {
      lines.push(`### Page ${page.pageNumber} — text layer (${page.charCount} chars)`);
      lines.push(page.text && page.text.length > 0 ? page.text : "_(empty)_");
      continue;
    }

    if (page.outcome === "image") {
      const size = page.image ? `${page.image.width}×${page.image.height}px` : "image";
      lines.push(
        `### Page ${page.pageNumber} — rendered as image (${size}, text layer: ${page.charCount} chars)`,
      );
      lines.push("_See the attached page image below; transcribe what you need from it._");
      continue;
    }

    if (page.outcome === "text_budget_exhausted") {
      lines.push(`### Page ${page.pageNumber} — not returned (character budget reached)`);
      continue;
    }

    lines.push(`### Page ${page.pageNumber} — not rendered (image budget reached)`);
  }

  return lines.join("\n");
}

function buildDetails(args: {
  path: string;
  fileName: string;
  fileSize: number;
  result: PdfReadResult;
  imagesWithheld: boolean;
}): ReadPdfDetails {
  const { result } = args;

  return {
    kind: "read_pdf",
    path: args.path,
    fileName: args.fileName,
    fileSize: args.fileSize,
    pageCount: result.pageCount,
    mode: result.mode,
    classification: result.classification,
    minTextChars: result.minTextChars,
    inspectedPages: [...result.inspectedPages],
    textPageCount: result.textPageCount,
    imagePageCount: result.imagePageCount,
    pages: result.pages.map((page) => ({
      pageNumber: page.pageNumber,
      charCount: page.charCount,
      decision: page.decision,
      outcome: page.outcome,
      imageWidth: page.image?.width,
      imageHeight: page.image?.height,
    })),
    imagesWithheld: args.imagesWithheld,
    notes: [...result.notes],
  };
}

/**
 * `undefined` when the active model's modalities are unknown (send images and
 * let the provider decide), otherwise whether it accepts image input.
 */
function resolveVisionSupport(
  getActiveModelInput: (() => readonly string[] | undefined) | undefined,
): boolean | undefined {
  if (!getActiveModelInput) return undefined;

  let input: readonly string[] | undefined;
  try {
    input = getActiveModelInput();
  } catch {
    return undefined;
  }

  if (!input || input.length === 0) return undefined;
  return input.includes("image");
}

export function createReadPdfTool(
  dependencies: ReadPdfToolDependencies = {},
): AgentTool<typeof schema, ReadPdfDetails> {
  const openDocument = dependencies.openDocument ?? defaultOpenDocument;

  return {
    name: "read_pdf",
    label: "Read PDF",
    description:
      "Read a PDF stored in the file workspace, including scans with no text layer. "
      + "Pages with a usable text layer come back as text; pages without one are rendered "
      + "as images for a vision-capable model to transcribe. "
      + "Use it for resoluciones, copias de inscripción del CBR, certificados de avalúo "
      + "and other antecedentes before writing their data into the workbook.",
    parameters: schema,
    execute: async (
      _toolCallId: string,
      params: Params,
      signal?: AbortSignal,
    ): Promise<AgentToolResult<ReadPdfDetails>> => {
      const path = normalizeWorkspacePath(params.path);
      const fileName = getWorkspaceBaseName(path);

      if (!/\.pdf$/i.test(fileName)) {
        throw new Error(
          `'${path}' is not a .pdf file. Use the files tool for text and data files.`,
        );
      }

      const workspace = getFilesWorkspace();
      const file = await workspace.readFile(path, {
        mode: "base64",
        // Base64 inflates by 4/3; allow the full cap plus headroom so a file
        // under MAX_PDF_BYTES is never silently truncated mid-read.
        maxChars: Math.ceil((MAX_PDF_BYTES * 4) / 3) + 16,
        audit: TOOL_AUDIT_CONTEXT,
      });

      if (file.truncated) {
        throw new Error(
          `'${path}' is larger than the ${formatBytes(MAX_PDF_BYTES)} read limit. `
          + "Split it outside Excel and import the part you need.",
        );
      }

      const base64 = file.base64 ?? "";
      if (base64.length === 0) {
        throw new Error(`'${path}' is empty.`);
      }

      const bytes = base64ToBytes(base64);
      if (bytes.byteLength > MAX_PDF_BYTES) {
        throw new Error(
          `'${path}' is ${formatBytes(bytes.byteLength)}, over the `
          + `${formatBytes(MAX_PDF_BYTES)} read limit.`,
        );
      }

      const result = await readPdfDocument(bytes, {
        openDocument,
        pages: params.pages,
        mode: params.mode,
        maxImagePages: params.max_image_pages,
        maxTextChars: params.max_chars,
        imageMaxEdge: params.image_max_edge,
        signal,
      });

      const supportsVision = resolveVisionSupport(dependencies.getActiveModelInput);
      const withheldImages = supportsVision === false && result.imagePageCount > 0;

      if (withheldImages) {
        const pageList = result.pages
          .filter((page) => page.outcome === "image")
          .map((page) => page.pageNumber)
          .join(", ");

        result.notes.push(
          `The active model does not accept image input, so ${result.imagePageCount} rendered `
          + `page(s) (${pageList}) were NOT attached. Tell the user that reading this scan needs a `
          + "vision-capable model and that they can switch with /model; do not guess at the content.",
        );
      }

      const content: (TextContent | ImageContent)[] = [{
        type: "text",
        text: renderMarkdown({
          path,
          fileName,
          fileSize: file.size,
          result,
        }),
      }];

      if (!withheldImages) {
        for (const page of result.pages) {
          if (page.outcome !== "image" || !page.image) continue;

          content.push({
            type: "image",
            data: page.image.base64,
            mimeType: page.image.mimeType,
          });
        }
      }

      return {
        content,
        details: buildDetails({
          path,
          fileName,
          fileSize: file.size,
          result,
          imagesWithheld: withheldImages,
        }),
      };
    },
  };
}
