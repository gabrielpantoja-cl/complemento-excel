import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_IMAGE_MAX_EDGE,
  DEFAULT_MAX_IMAGE_PAGES,
  DEFAULT_MIN_TEXT_CHARS_PER_PAGE,
  MAX_IMAGE_PAGES_LIMIT,
  MAX_RENDER_SCALE,
  base64ByteLength,
  clampImagePages,
  classifyDocument,
  computeRenderScale,
  countMeaningfulChars,
  decidePageMode,
  normalizePageText,
  parsePageSelection,
  planPages,
} from "../src/documents/pdf-policy.ts";

void test("normalizePageText collapses the whitespace pdf.js emits between items", () => {
  assert.equal(normalizePageText("  RESOLUCIÓN   S.R.M.\n\n Nº 27 "), "RESOLUCIÓN S.R.M. Nº 27");
  assert.equal(normalizePageText("   "), "");
});

void test("countMeaningfulChars ignores whitespace", () => {
  assert.equal(countMeaningfulChars("ab cd\nef"), 6);
  assert.equal(countMeaningfulChars(" \n\t "), 0);
});

void test("decidePageMode sends sparse pages to the image path", () => {
  // A scan that leaked a page number or a stamp into the text layer must
  // still be rasterised: a handful of characters is not a page of content.
  assert.equal(decidePageMode(0), "image");
  assert.equal(decidePageMode(12), "image");
  assert.equal(decidePageMode(DEFAULT_MIN_TEXT_CHARS_PER_PAGE - 1), "image");
  assert.equal(decidePageMode(DEFAULT_MIN_TEXT_CHARS_PER_PAGE), "text");
  assert.equal(decidePageMode(5_000), "text");
});

void test("decidePageMode honours a custom threshold and rejects nonsense ones", () => {
  assert.equal(decidePageMode(40, 20), "text");
  assert.equal(decidePageMode(40, 80), "image");
  assert.equal(decidePageMode(40, 0), "image");
  assert.equal(decidePageMode(40, Number.NaN), "image");
});

void test("classifyDocument distinguishes text, scanned and mixed inputs", () => {
  assert.equal(classifyDocument([]), "empty");
  assert.equal(classifyDocument(["text", "text"]), "text");
  assert.equal(classifyDocument(["image", "image"]), "scanned");
  assert.equal(classifyDocument(["text", "image", "text"]), "mixed");
});

void test("parsePageSelection accepts singles, ranges and lists", () => {
  assert.deepEqual(parsePageSelection(undefined, 3), [1, 2, 3]);
  assert.deepEqual(parsePageSelection("", 2), [1, 2]);
  assert.deepEqual(parsePageSelection("2", 5), [2]);
  assert.deepEqual(parsePageSelection("1-3", 5), [1, 2, 3]);
  assert.deepEqual(parsePageSelection("3,1,1-2", 5), [1, 2, 3]);
  assert.deepEqual(parsePageSelection(" 1 - 2 , 4 ", 9), [1, 2, 4]);
});

void test("parsePageSelection clamps to the document and rejects bad input", () => {
  assert.deepEqual(parsePageSelection("1-99", 3), [1, 2, 3]);
  assert.deepEqual(parsePageSelection("2,99", 3), [2]);

  assert.throws(() => parsePageSelection("99", 3), /does not match any page/);
  assert.throws(() => parsePageSelection("5-2", 9), /end is before start/);
  assert.throws(() => parsePageSelection("0", 9), /pages start at 1/);
  assert.throws(() => parsePageSelection("abc", 9), /Invalid page selection/);
  assert.throws(() => parsePageSelection("1", 0), /no pages/);
});

void test("planPages applies the per-call page cap and reports the remainder", () => {
  assert.deepEqual(planPages([1, 2, 3], 10), { pages: [1, 2, 3], dropped: [] });
  assert.deepEqual(planPages([1, 2, 3, 4], 2), { pages: [1, 2], dropped: [3, 4] });
});

void test("clampImagePages keeps the request inside the supported range", () => {
  assert.equal(clampImagePages(undefined), DEFAULT_MAX_IMAGE_PAGES);
  assert.equal(clampImagePages(Number.NaN), DEFAULT_MAX_IMAGE_PAGES);
  assert.equal(clampImagePages(0), 0);
  assert.equal(clampImagePages(-3), 0);
  assert.equal(clampImagePages(2.7), 2);
  assert.equal(clampImagePages(500), MAX_IMAGE_PAGES_LIMIT);
});

void test("computeRenderScale upscales a 72-dpi page box towards the target edge", () => {
  // Chilean oficio at pdf.js scale 1 is ~612×936 px — far below what a
  // 300-dpi scan actually carries. Upscaling is what makes it legible.
  const oficio = computeRenderScale(612, 936, DEFAULT_IMAGE_MAX_EDGE);
  assert.ok(oficio > 1.7 && oficio < 1.72, `unexpected scale ${oficio}`);
  assert.equal(Math.round(936 * oficio), DEFAULT_IMAGE_MAX_EDGE);

  // Already-large page boxes are scaled down instead.
  assert.equal(computeRenderScale(3200, 1600, 1600), 0.5);

  // Degenerate input and tiny pages stay bounded.
  assert.equal(computeRenderScale(0, 0), 1);
  assert.equal(computeRenderScale(10, 10, 1600), MAX_RENDER_SCALE);
});

void test("base64ByteLength matches the decoded size", () => {
  const cases = ["", "AA==", "AAA=", "AAAA", Buffer.from("resolución 27").toString("base64")];

  for (const value of cases) {
    assert.equal(base64ByteLength(value), Buffer.from(value, "base64").byteLength, value);
  }
});
