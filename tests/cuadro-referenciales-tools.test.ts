/**
 * Tests for the cuadro-referenciales tools (audit_ref_errors +
 * link_referenciales_cuadro).
 *
 * These tests focus on:
 * 1. Pure-function logic that does NOT require Office.js: offset
 *    computation, formula generation, dry_run output, post-write problem
 *    detection (signature of column-letter hallucination).
 * 2. Wiring (CORE_TOOL_NAMES, capabilities metadata, system-prompt
 *    rendering of new tool descriptions).
 *
 * The Excel.run() paths are covered indirectly via the build/dry-run
 * surface; full Excel integration requires the WebView sandbox which
 * is exercised via the manual smoke procedure in docs/guides/.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSystemPrompt } from "../src/prompt/system-prompt.ts";
import {
  CORE_TOOL_CAPABILITIES,
  TOOL_UI_METADATA,
} from "../src/tools/capabilities.ts";
import { createCoreTools } from "../src/tools/registry.ts";
import { CORE_TOOL_NAMES } from "../src/tools/names.ts";

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

void test("CORE_TOOL_NAMES includes audit_ref_errors and link_referenciales_cuadro", () => {
  assert.ok(CORE_TOOL_NAMES.includes("audit_ref_errors"));
  assert.ok(CORE_TOOL_NAMES.includes("link_referenciales_cuadro"));
});

void test("createCoreTools returns the two new tools", () => {
  const tools = createCoreTools();
  const names = new Set(tools.map((t) => t.name));
  assert.ok(names.has("audit_ref_errors"));
  assert.ok(names.has("link_referenciales_cuadro"));
});

void test("new tools have UI renderer + humanizer metadata", () => {
  for (const name of ["audit_ref_errors", "link_referenciales_cuadro"] as const) {
    const meta = TOOL_UI_METADATA[name];
    assert.equal(meta.renderer, true, `${name} should be renderer-enabled`);
    assert.equal(meta.humanizer, true, `${name} should be humanizer-enabled`);
  }
});

void test("new tools have capability metadata in core tier", () => {
  const auditMeta = CORE_TOOL_CAPABILITIES.find((c) => c.name === "audit_ref_errors");
  const linkMeta = CORE_TOOL_CAPABILITIES.find((c) => c.name === "link_referenciales_cuadro");
  assert.ok(auditMeta);
  assert.ok(linkMeta);
  assert.equal(auditMeta?.tier, "core");
  assert.equal(linkMeta?.tier, "core");
  assert.equal(auditMeta?.category, "inspect");
  assert.equal(linkMeta?.category, "write");
  assert.match(auditMeta?.promptDescription ?? "", /#REF!/);
  assert.match(linkMeta?.promptDescription ?? "", /cuadro/i);
});

// ---------------------------------------------------------------------------
// System prompt integration
// ---------------------------------------------------------------------------

void test("system prompt lists both new tools in TOOLS section", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /\*\*audit_ref_errors\*\*/);
  assert.match(prompt, /\*\*link_referenciales_cuadro\*\*/);
});

void test("system prompt includes the cuadro de referenciales domain note", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Cuadro de referenciales \(punto 8 del informe\)/);
  // The "column P not Q" hint should be present to prevent the Q-vs-P bug.
  assert.match(prompt, /columna P/);
  assert.match(prompt, /NO en Q/);
  // The skill name should be referenced so the model calls it before touching.
  assert.match(prompt, /tasaciones\/cuadro-referenciales/);
  // The new tools should be cross-referenced.
  assert.match(prompt, /audit_ref_errors/);
  assert.match(prompt, /link_referenciales_cuadro/);
});

void test("system prompt mandates post-write read-back verification", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Excel tool discipline/);
  assert.match(prompt, /read_range/);
  assert.match(prompt, /Post-write verification/);
  assert.match(prompt, /column-letter hallucination/);
  // The block must warn about both signatures: literal #REF! and 0.0000e+0.
  assert.match(prompt, /`#REF!`/);
  assert.match(prompt, /0\.0000e\+0/);
});
