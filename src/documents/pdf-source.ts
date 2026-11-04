/**
 * The contract between PDF orchestration (`pdf-read.ts`) and whatever can
 * actually open a PDF.
 *
 * In the taskpane that is pdf.js (`pdf-engine.ts`); in tests it is a fake.
 * Kept in its own module so the orchestrator never imports the engine, and
 * therefore never pulls pdf.js into the boot chunk.
 */

export interface RenderedPdfPage {
  mimeType: string;
  /** Base64 payload without a data-URL prefix. */
  base64: string;
  width: number;
  height: number;
  /** Render scale applied relative to the PDF page box. */
  scale: number;
}

export interface RenderPdfPageOptions {
  /** Target length, in pixels, of the longest edge. */
  maxEdge: number;
  /** JPEG quality, 0–1. */
  quality: number;
}

export interface PdfSourceDocument {
  readonly pageCount: number;
  /** Normalised text-layer content of one 1-based page. */
  getPageText(pageNumber: number): Promise<string>;
  renderPage(pageNumber: number, options: RenderPdfPageOptions): Promise<RenderedPdfPage>;
  close(): Promise<void>;
}

export type PdfDocumentOpener = (bytes: Uint8Array) => Promise<PdfSourceDocument>;
