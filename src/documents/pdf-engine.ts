/**
 * pdf.js engine adapter.
 *
 * Everything that touches pdf.js and the DOM lives here, behind the
 * {@link PdfDocumentOpener} contract from `pdf-source.ts`. Two reasons:
 *
 * 1. **Bundle size.** pdf.js plus its worker is ~1.4 MB. The import is
 *    dynamic, so Vite emits it as its own chunk and the taskpane boots
 *    without it. Nothing is downloaded until a PDF is actually read.
 * 2. **Testability.** The orchestration in `pdf-read.ts` is exercised in Node
 *    against a fake opener; this file is the only part that needs a WebView.
 *
 * Office WebView constraints baked in below:
 * - `isEvalSupported: false` — the taskpane CSP has no `unsafe-eval`, and
 *   pdf.js otherwise compiles some font/PostScript programs with `Function`.
 * - `useWorkerFetch: false`, no `cMapUrl` / `standardFontDataUrl` — never
 *   reach out to a CDN for optional font data. Text extraction and raster
 *   rendering (the scanned case) do not need it.
 * - `disableFontFace: true` — rasterise glyphs instead of injecting
 *   `@font-face` rules into the taskpane document.
 */

import type {
  PdfSourceDocument,
  RenderedPdfPage,
} from "./pdf-source.js";
import { computeRenderScale, normalizePageText } from "./pdf-policy.js";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, workerUrlModule] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);

    // Same-origin module worker: allowed by the taskpane CSP via
    // `script-src 'self'` (worker-src falls back to script-src).
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrlModule.default;
    return pdfjs;
  })();

  return pdfjsPromise;
}

function isTextItem(item: unknown): item is { str: string } {
  return typeof item === "object" && item !== null && typeof Reflect.get(item, "str") === "string";
}

function toCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  if (typeof document === "undefined") {
    throw new Error("Rendering PDF pages requires a browser document.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Could not acquire a 2D canvas context for PDF rendering.");
  }

  // Scans are rasterised onto white: a transparent background would reach the
  // model as black after JPEG flattening.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  return { canvas, context };
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

/**
 * Open a PDF with pdf.js. The returned handle must be closed by the caller.
 */
export const openPdfWithPdfJs = async (bytes: Uint8Array): Promise<PdfSourceDocument> => {
  const pdfjs = await loadPdfJs();

  // pdf.js transfers (and then detaches) the buffer it is handed. Copy so the
  // caller's bytes stay usable — the workspace read result is reused for the
  // details payload.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);

  const document_ = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  return {
    pageCount: document_.numPages,

    async getPageText(pageNumber: number): Promise<string> {
      const page = await document_.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const parts: string[] = [];

        for (const item of textContent.items) {
          if (isTextItem(item)) parts.push(item.str);
        }

        return normalizePageText(parts.join(" "));
      } finally {
        page.cleanup();
      }
    },

    async renderPage(pageNumber, options): Promise<RenderedPdfPage> {
      const page = await document_.getPage(pageNumber);

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = computeRenderScale(
          baseViewport.width,
          baseViewport.height,
          options.maxEdge,
        );
        const viewport = page.getViewport({ scale });
        const { canvas, context } = toCanvas(viewport.width, viewport.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "#ffffff",
        }).promise;

        const mimeType = "image/jpeg";
        const base64 = dataUrlToBase64(canvas.toDataURL(mimeType, options.quality));

        // Free the backing store eagerly: a 1600 px oficio page is ~8 MB of
        // RGBA, and the sidebar WebView is memory-constrained.
        canvas.width = 0;
        canvas.height = 0;

        return {
          mimeType,
          base64,
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          scale,
        };
      } finally {
        page.cleanup();
      }
    },

    async close(): Promise<void> {
      await document_.destroy();
    },
  };
};
