import assert from "node:assert/strict";
import { test } from "node:test";

import { createExecuteOfficeJsTool } from "../src/tools/execute-office-js.ts";
import {
  buildBorderInstructions,
  normalizeBorderParams,
} from "../src/tools/format-cells-borders.ts";

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const block = result.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Expected first content block to be text.");
  }

  return block.text;
}

void test("execute_office_js runs code and serializes result", async () => {
  const tool = createExecuteOfficeJsTool({
    runCode: () => Promise.resolve({
      ok: true,
      sheet: "Sheet1",
      changedCells: 4,
    }),
  });

  const result = await tool.execute("tool-call-1", {
    explanation: "Recalculate dashboard totals",
    code: "return { ok: true };",
  });

  const text = firstText(result);
  assert.match(text, /Executed Office\.js: Recalculate dashboard totals/u);
  assert.match(text, /```json/u);
  assert.match(text, /"ok": true/u);
});

void test("execute_office_js blocks nested Excel.run usage", async () => {
  let runCalled = false;

  const tool = createExecuteOfficeJsTool({
    runCode: () => {
      runCalled = true;
      return Promise.resolve(null);
    },
  });

  const result = await tool.execute("tool-call-2", {
    explanation: "Update workbook",
    code: "return Excel.run(async (context) => { await context.sync(); });",
  });

  const text = firstText(result);
  assert.match(text, /Do not call Excel\.run\(\)/u);
  assert.equal(runCalled, false);
});

void test("execute_office_js reports non-serializable result payloads", async () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;

  const tool = createExecuteOfficeJsTool({
    runCode: () => Promise.resolve(circular),
  });

  const result = await tool.execute("tool-call-3", {
    explanation: "Inspect workbook state",
    code: "return {};",
  });

  const text = firstText(result);
  assert.match(text, /Result is not JSON-serializable/u);
});

void test("format_cells border shorthand none is normalized and clears all edges", () => {
  const borderParams = normalizeBorderParams({
    borders: "BordersNone",
  });

  const instructions = buildBorderInstructions(borderParams, {}, undefined);

  assert.deepEqual(borderParams, {
    shorthand: "none",
    top: undefined,
    bottom: undefined,
    left: undefined,
    right: undefined,
  });

  assert.deepEqual(instructions, {
    operations: [
      { edge: "EdgeTop", weight: "none" },
      { edge: "EdgeBottom", weight: "none" },
      { edge: "EdgeLeft", weight: "none" },
      { edge: "EdgeRight", weight: "none" },
      { edge: "InsideHorizontal", weight: "none" },
      { edge: "InsideVertical", weight: "none" },
    ],
    appliedText: "none borders",
  });
});

void test("format_cells rejects invalid border values instead of falling back", () => {
  assert.throws(
    () => normalizeBorderParams({ borders: "remove-all" }),
    /Invalid borders/u,
  );
});

void test("execute_office_js invokes a whole function declaration instead of only declaring it", async () => {
  const { prepareOfficeJsBody } = await import("../src/tools/execute-office-js.ts");

  const declared = prepareOfficeJsBody(
    "async function checkMerge(context) {\n  const s = \"}\"; // }\n  return { ok: s };\n}",
  );
  assert.match(declared, /return await checkMerge\(context\);$/u);

  const arrow = prepareOfficeJsBody("async (context) => { return 1; };");
  assert.equal(arrow, "return await (async (context) => { return 1; })(context);");

  const anonymous = prepareOfficeJsBody("async function (context) { return 2; }");
  assert.equal(anonymous, "return await (async function (context) { return 2; })(context);");

  const body = "const r = context.workbook.getSelectedRange();\nreturn 1;";
  assert.equal(prepareOfficeJsBody(body), body);

  const helperThenBody = "function helper(x) { return x; }\nreturn helper(3);";
  assert.equal(prepareOfficeJsBody(helperThenBody), helperThenBody);
});

void test("execute_office_js passes the invoking wrapper to runCode and flags missing return", async () => {
  let received = "";
  const tool = createExecuteOfficeJsTool({
    runCode: (code) => {
      received = code;
      return Promise.resolve(undefined);
    },
  });

  const result = await tool.execute("tool-call-4", {
    explanation: "Check merge",
    code: "async function run(context) { await context.sync(); }",
  });

  assert.match(received, /return await run\(context\);/u);
  assert.match(firstText(result), /returned no value/u);
});
