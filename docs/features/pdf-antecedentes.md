# PDF antecedentes (`read_pdf`)

**Last reviewed:** 2026-11-04

Reads a PDF from the [files workspace](./files-workspace.md) — including a scan
with no text layer — and hands it to the model as session input.

This is the intake path for the documents a tasación is built from: resolución
exenta, copias de inscripción del CBR, certificados de avalúo del SII, planos de
expropiación. Those arrive as PDFs, and a good share of them are scans.

Upstream `pi-web-ui` ships an `extract_document` tool that only reads the text
layer, which returns an empty string for exactly those files; this fork stubs it
out (see [upstream divergences](../architecture/upstream-divergences.md)) and
ships `read_pdf` instead.

## How a PDF gets in

1. Drag the PDF onto the chat input, or use **Files → import**. It lands in the
   workspace tagged to the active workbook.
2. The next message carries a `[Workspace files refresh]` auto-context block
   that names the file, so the model can see it arrived.
3. The model calls `read_pdf` with the workspace path.

Nothing is uploaded anywhere by the import itself. The bytes stay in the
workspace backend (OPFS by default). What leaves the WebView is whatever
`read_pdf` returns — extracted text and/or rendered page images — and only as
part of the model request.

## The decision rule

Per page, after normalising the pdf.js text layer to single spaces, count the
**meaningful** (non-whitespace) characters:

| Meaningful chars | Treated as | Returned as |
|---|---|---|
| ≥ 120 | usable text layer | text |
| < 120 | no usable text layer | rendered page image |

120 is deliberately well above zero. A scanned page is frequently *not* empty:
scanners and PDF printers leave a page number, a header, or a stamp as real text
on top of the raster. Anything under ~120 characters is far below a page of
prose or a block of table rows, so it counts as "nothing usable" rather than as
content.

The rule lives in `src/documents/pdf-policy.ts` (`decidePageMode`) and is
unit-tested in `tests/pdf-policy.test.ts`. The threshold is reported back in
every tool result, so a transcript shows which rule produced which page.

Document-level verdict: `text` (all pages), `scanned` (none), or `mixed`.

## OCR is the model

There is no OCR engine in the bundle. A page with no text layer is rasterised
and returned as an **image content block**, and a vision-capable model reads it.
That keeps the add-in's footprint small and gets better results on Chilean
notarial layouts than a bundled Tesseract would.

Consequences worth knowing:

- **A text-only model cannot read scanned pages.** It will see the tool's text
  summary ("rendered as image") and nothing else. Switch to a vision model —
  the preset catalog marks these with `input: ["text", "image"]`.
- The system prompt instructs the model to **transcribe** the fields it needs
  (foja, número, año, fecha de escritura, ROL, monto, superficie) and to state
  which page each figure came from, before writing anything into the workbook.
  A scan is not an authoritative source until it has been transcribed and read
  back.

## Rendering

Scanned pages are upscaled on purpose. A scan is usually a 300-dpi raster placed
on a 72-dpi page box: at pdf.js scale 1 a Chilean oficio page is only ~612×936
px, which throws away most of the scan. `read_pdf` targets a fixed long edge
(1600 px by default, `image_max_edge` up to 3000) and renders JPEG at quality
0.8 onto a white background.

## Budgets

Page images are expensive in context, so every call is capped:

| Cap | Default | Parameter |
|---|---|---|
| Pages inspected per call | 40 | `pages` |
| Pages returned as images | 4 (max 20) | `max_image_pages` |
| Extracted text | 20 000 chars | `max_chars` |
| Total image bytes | ~4 MB | — |
| PDF size | 40 MB | — |

When a cap is reached the result says so and names the pages still missing, so
the next call can continue with `pages`. Prefer narrowing `pages` over raising a
budget: a 40-page resolución costs far less read one block at a time.

## Parameters

| Parameter | Meaning |
|---|---|
| `path` | Workspace path of the PDF (required). |
| `pages` | 1-based selection: `"3"`, `"1-5"`, `"1-2,7"`. Default: every page. |
| `mode` | `auto` (default) applies the rule; `text` never rasterises; `images` rasterises every selected page. |
| `max_image_pages` | Page images to return, 0–20. |
| `max_chars` | Character budget for extracted text. |
| `image_max_edge` | Long edge in px, 400–3000. Raise for dense small print. |

`mode: "images"` exists for the case where a text layer is present but wrong —
a bad OCR pass baked into the file, or a mis-mapped font that extracts as
mojibake. Forcing the raster bypasses it.

## Office WebView constraints

pdf.js is configured in `src/documents/pdf-engine.ts` for the taskpane CSP:

- `isEvalSupported: false` — the taskpane CSP has no `unsafe-eval`, and pdf.js
  otherwise compiles some font/PostScript programs with `Function`.
- `useWorkerFetch: false`, no `cMapUrl` / `standardFontDataUrl` — never reach a
  CDN for optional font data. Neither text extraction nor raster rendering needs
  it.
- `disableFontFace: true` — rasterise glyphs instead of injecting `@font-face`
  into the taskpane document.
- The worker is a same-origin module worker emitted by Vite; it is allowed by
  `script-src 'self'` (CSP `worker-src` falls back to `script-src`).

**Known limitation:** pages whose images are JPEG 2000 (JPX) encoded need
pdf.js's OpenJPEG WebAssembly decoder, which is not wired up (the CSP has no
`wasm-unsafe-eval`). Those pages render without the image. JPX is rare in
Chilean notarial scans — CCITT G4 and JPEG dominate — but if a page comes back
blank, that is the first thing to check.

## Bundle impact

pdf.js is loaded with a dynamic `import()`, so it never enters the boot chunk:

- `assets/pdf-*.js` — ~400 kB (117 kB gzip), loaded on the first `read_pdf` call
- `assets/pdf.worker.min-*.mjs` — ~1.0 MB, loaded by the worker

The taskpane boots without downloading either.

## Not covered

- DOCX / XLSX / PPTX intake. The `files` tool handles text formats; Office
  binaries would mean bundling `docx-preview` and `xlsx`, which this fork
  deliberately stubs out.
- Structured extraction. `read_pdf` returns text and page images; turning a
  copia de inscripción into `referenciales` rows is roadmap item H1, and parsing
  the resolución's lote table is H3.
- A bundled OCR engine. If model-side transcription proves insufficient for a
  document family, the fallback is Tesseract behind the
  [python bridge](../bridges/python-bridge-contract.md), not in the WebView.
