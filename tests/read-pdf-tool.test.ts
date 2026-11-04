import assert from "node:assert/strict";
import { test } from "node:test";

import { readPdfDocument } from "../src/documents/pdf-read.ts";
import type {
  PdfDocumentOpener,
  PdfSourceDocument,
  RenderedPdfPage,
} from "../src/documents/pdf-source.ts";
import { getFilesWorkspace } from "../src/files/workspace.ts";
import { createReadPdfTool, MAX_PDF_BYTES } from "../src/tools/read-pdf.ts";
import type { ReadPdfDetails } from "../src/tools/tool-details.ts";

const PROSE = "La comisión de peritos tasadores se constituyó en terreno conforme al D.L. 2.186. ".repeat(4);

interface FakePageSpec {
  /** Text layer the page yields; "" models a scan with no text layer. */
  text: string;
  /** Decoded size of the rendered image, in bytes. */
  imageBytes?: number;
}

interface FakeEngine {
  opener: PdfDocumentOpener;
  rendered: number[];
  textRequested: number[];
  closed: number;
  openedBytes: number[];
}

function makeFakeEngine(pages: readonly FakePageSpec[]): FakeEngine {
  const engine: FakeEngine = {
    rendered: [],
    textRequested: [],
    closed: 0,
    openedBytes: [],
    opener: () => Promise.reject(new Error("not initialised")),
  };

  engine.opener = (bytes: Uint8Array): Promise<PdfSourceDocument> => {
    engine.openedBytes.push(bytes.byteLength);

    const document_: PdfSourceDocument = {
      pageCount: pages.length,

      getPageText(pageNumber: number): Promise<string> {
        engine.textRequested.push(pageNumber);
        return Promise.resolve(pages[pageNumber - 1].text);
      },

      renderPage(pageNumber: number): Promise<RenderedPdfPage> {
        engine.rendered.push(pageNumber);
        const byteLength = pages[pageNumber - 1].imageBytes ?? 1024;

        return Promise.resolve({
          mimeType: "image/jpeg",
          base64: Buffer.alloc(byteLength, 7).toString("base64"),
          width: 1_200,
          height: 1_600,
          scale: 1.7,
        });
      },

      close(): Promise<void> {
        engine.closed += 1;
        return Promise.resolve();
      },
    };

    return Promise.resolve(document_);
  };

  return engine;
}

async function withPdfInWorkspace(
  path: string,
  bytes: Uint8Array,
  run: () => Promise<void>,
): Promise<void> {
  const workspace = getFilesWorkspace();
  await workspace.writeBase64File(path, Buffer.from(bytes).toString("base64"), "application/pdf");

  try {
    await run();
  } finally {
    await workspace.deleteFile(path);
  }
}

/* ── Orchestration ──────────────────────────────────────────── */

void test("auto mode reads the text layer and rasterises only the scanned pages", async () => {
  const engine = makeFakeEngine([
    { text: PROSE },
    { text: "" },
    { text: "3" },
    { text: PROSE },
  ]);

  const result = await readPdfDocument(new Uint8Array([1, 2, 3]), {
    openDocument: engine.opener,
  });

  assert.equal(result.classification, "mixed");
  assert.equal(result.textPageCount, 2);
  assert.equal(result.imagePageCount, 2);
  assert.deepEqual(engine.rendered, [2, 3]);
  assert.deepEqual(result.pages.map((page) => page.outcome), ["text", "image", "image", "text"]);
  assert.equal(result.pages[0].text, PROSE);
  assert.equal(result.pages[1].image?.mimeType, "image/jpeg");
  assert.equal(engine.closed, 1);
  assert.ok(result.notes.some((note) => note.includes("vision-capable model")));
});

void test("mode=text never rasterises and says so when pages are thin", async () => {
  const engine = makeFakeEngine([{ text: PROSE }, { text: "" }]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    mode: "text",
  });

  assert.deepEqual(engine.rendered, []);
  assert.equal(result.imagePageCount, 0);
  assert.equal(result.classification, "text");
  assert.ok(result.notes.some((note) => note.includes("mode='text' was forced")));
});

void test("mode=images rasterises every page without consulting the text layer", async () => {
  const engine = makeFakeEngine([{ text: PROSE }, { text: PROSE }]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    mode: "images",
    maxImagePages: 2,
  });

  assert.deepEqual(engine.textRequested, []);
  assert.deepEqual(engine.rendered, [1, 2]);
  assert.equal(result.classification, "scanned");
  assert.equal(result.textPageCount, 0);
});

void test("the image-page cap stops rendering and names the remaining pages", async () => {
  const engine = makeFakeEngine([{ text: "" }, { text: "" }, { text: "" }]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    maxImagePages: 1,
  });

  assert.deepEqual(engine.rendered, [1]);
  assert.equal(result.imagePageCount, 1);
  assert.deepEqual(
    result.pages.map((page) => page.outcome),
    ["image", "image_budget_exhausted", "image_budget_exhausted"],
  );
  assert.ok(result.notes.some((note) => note.includes("still missing")));
});

void test("the image byte budget still returns the first page", async () => {
  const engine = makeFakeEngine([
    { text: "", imageBytes: 4_000 },
    { text: "", imageBytes: 4_000 },
  ]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    imageByteBudget: 1_000,
  });

  assert.equal(result.imagePageCount, 1);
  assert.equal(result.pages[1].outcome, "image_budget_exhausted");
});

void test("the text budget truncates instead of dropping the whole page", async () => {
  const engine = makeFakeEngine([{ text: PROSE }, { text: PROSE }]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    maxTextChars: 50,
  });

  assert.equal(result.pages[0].text?.length, 50);
  assert.equal(result.pages[1].outcome, "text_budget_exhausted");
  assert.ok(result.notes.some((note) => note.includes("character budget")));
});

void test("page selection and the per-call page cap are both honoured", async () => {
  const engine = makeFakeEngine([
    { text: PROSE },
    { text: PROSE },
    { text: PROSE },
    { text: PROSE },
    { text: PROSE },
  ]);

  const result = await readPdfDocument(new Uint8Array([1]), {
    openDocument: engine.opener,
    pages: "2-5",
    maxPages: 2,
  });

  assert.deepEqual(result.requestedPages, [2, 3, 4, 5]);
  assert.deepEqual(result.inspectedPages, [2, 3]);
  assert.deepEqual(engine.textRequested, [2, 3]);
  assert.ok(result.notes.some((note) => note.includes("pages 4-5")));
});

void test("the document is closed even when a page read throws", async () => {
  const engine = makeFakeEngine([{ text: PROSE }]);
  const failing: PdfDocumentOpener = async (bytes) => {
    const document_ = await engine.opener(bytes);
    return {
      ...document_,
      getPageText: () => Promise.reject(new Error("corrupt page")),
    };
  };

  await assert.rejects(
    readPdfDocument(new Uint8Array([1]), { openDocument: failing }),
    /corrupt page/,
  );
  assert.equal(engine.closed, 1);
});

void test("an aborted signal stops before the document is opened", async () => {
  const engine = makeFakeEngine([{ text: PROSE }]);
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    readPdfDocument(new Uint8Array([1]), {
      openDocument: engine.opener,
      signal: controller.signal,
    }),
    /aborted/,
  );
  assert.deepEqual(engine.openedBytes, []);
});

/* ── Tool surface ───────────────────────────────────────────── */

void test("read_pdf returns one image content block per rasterised page", async () => {
  const engine = makeFakeEngine([{ text: PROSE }, { text: "" }]);
  const tool = createReadPdfTool({ openDocument: engine.opener });

  await withPdfInWorkspace("imports/resolucion-27.pdf", new Uint8Array([37, 80, 68, 70]), async () => {
    const result = await tool.execute("call-1", { path: "imports/resolucion-27.pdf" });

    const textBlocks = result.content.filter((block) => block.type === "text");
    const imageBlocks = result.content.filter((block) => block.type === "image");

    assert.equal(textBlocks.length, 1);
    assert.equal(imageBlocks.length, 1);
    assert.equal(imageBlocks[0].mimeType, "image/jpeg");

    const details: ReadPdfDetails = result.details;
    assert.equal(details.kind, "read_pdf");
    assert.equal(details.path, "imports/resolucion-27.pdf");
    assert.equal(details.fileName, "resolucion-27.pdf");
    assert.equal(details.pageCount, 2);
    assert.equal(details.classification, "mixed");
    assert.equal(details.imagePageCount, 1);
    assert.deepEqual(details.pages.map((page) => page.outcome), ["text", "image"]);
    assert.equal(details.pages[1].imageWidth, 1_200);
  });
});

void test("read_pdf refuses non-PDF paths and missing files", async () => {
  const engine = makeFakeEngine([{ text: PROSE }]);
  const tool = createReadPdfTool({ openDocument: engine.opener });

  await assert.rejects(
    tool.execute("call-2", { path: "notes/index.md" }),
    /is not a \.pdf file/,
  );
  await assert.rejects(
    tool.execute("call-3", { path: "imports/missing.pdf" }),
    /not found|missing/i,
  );
  assert.deepEqual(engine.openedBytes, []);
});

void test("read_pdf keeps the size limit well under the WebView memory ceiling", () => {
  assert.ok(MAX_PDF_BYTES <= 64 * 1024 * 1024);
  assert.ok(MAX_PDF_BYTES >= 8 * 1024 * 1024);
});
