/**
 * Pure-logic tests for link_referenciales_cuadro.
 *
 * The Excel.run() integration path requires the Office WebView and is
 * covered by the manual smoke procedure in docs/guides/. Here we focus
 * on the deterministic, side-effect-free parts:
 *
 * 1. buildFormulas() — the formula generation kernel
 * 2. surfaceColumnFor() — the AU vs AV branch
 * 3. CUADRO_OFFSETS — the offset table the user can inspect
 *
 * Reference data (verified against the canonical tasaciones workbook in
 * the 2026-07-22-vinculando-referenciales-a-las-fichas transcript):
 *
 *   Ref | Title | Predio | Calle | Sup col | Fecha | foja | VU
 *   1   | B2    | O6     | P32   | AV33    | AX38  | I50  | U55
 *   6   | B375  | O379   | P405  | AV406   | AX411 | I423 | U428
 *   7   | B447  | O451   | P477  | AV478   | AX483 | I495 | U500
 *   8   | B521  | O525   | P551  | AV552   | AX557 | I569 | U574
 *   9   | B596  | O600   | P626  | AU627   | AX632 | I644 | U649
 *   10  | B671  | O675   | P701  | AU702   | AX707 | I719 | U724
 *   11  | B745  | O749   | P775  | AV776   | AX781 | I793 | U798
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFormulas,
  surfaceColumnFor,
  CUADRO_OFFSETS,
  createLinkReferencialesCuadroTool,
} from "../src/tools/link-referenciales-cuadro.ts";

// ---------------------------------------------------------------------------
// surfaceColumnFor — refs 9, 10 use AU; all others use AV.
// ---------------------------------------------------------------------------

void test("surfaceColumnFor: refs 9 and 10 use AU (template bug)", () => {
  assert.equal(surfaceColumnFor(9), "AU");
  assert.equal(surfaceColumnFor(10), "AU");
});

void test("surfaceColumnFor: all other refs use AV", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13]) {
    assert.equal(surfaceColumnFor(n), "AV", `ref ${n} should use AV`);
  }
});

// ---------------------------------------------------------------------------
// CUADRO_OFFSETS — offsets match the canonical workbook.
// ---------------------------------------------------------------------------

void test("CUADRO_OFFSETS.predio == 0 (Predio is the anchor)", () => {
  assert.equal(CUADRO_OFFSETS.predio, 0);
});

void test("CUADRO_OFFSETS.calle == 26 (NOT 30 — that's the title-relative value)", () => {
  // Calle is P[title+30] = P[predio+26] because Predio is O[title+4].
  assert.equal(CUADRO_OFFSETS.calle, 26);
});

void test("CUADRO_OFFSETS.sup == 27 (matches AV[title+31] = AV[predio+27])", () => {
  assert.equal(CUADRO_OFFSETS.sup, 27);
});

void test("CUADRO_OFFSETS.fecha == 32 (matches AX[title+36] = AX[predio+32])", () => {
  assert.equal(CUADRO_OFFSETS.fecha, 32);
});

void test("CUADRO_OFFSETS.foja/numero/anio == 44/45/46 (NOT 47/48/49)", () => {
  // The conversation transcript first guessed +47/+48/+49 but the actual
  // values are +44/+45/+46 from Predio (I423 - O379 = 44 for ref 6).
  assert.equal(CUADRO_OFFSETS.foja, 44);
  assert.equal(CUADRO_OFFSETS.numero, 45);
  assert.equal(CUADRO_OFFSETS.anio, 46);
});

void test("CUADRO_OFFSETS.vuActualizado == 49 (matches U[title+53] = U[predio+49])", () => {
  assert.equal(CUADRO_OFFSETS.vuActualizado, 49);
});

void test("CUADRO_OFFSETS.numRef == -2 (AT[title+2] = AT[predio-2])", () => {
  assert.equal(CUADRO_OFFSETS.numRef, -2);
});

// ---------------------------------------------------------------------------
// buildFormulas — ref 6 (uses AV for surface).
// ---------------------------------------------------------------------------

void test("buildFormulas ref 6 with Predio at row 379 produces the canonical formulas", () => {
  const formulas = buildFormulas(
    6,
    7, // referenciales!A7
    379, // Predio at O379
    "fichas VR",
    "referenciales",
    "actualizado",
  );

  // Column A: ='fichas VR'!AT[predio_row - 2] = AT377 (user-verified)
  assert.equal(formulas[0], "='fichas VR'!AT377");

  // Column B: Predio + ". Rol " + ROL_predio+1
  assert.equal(formulas[1], "='fichas VR'!O379&\". Rol \"&'fichas VR'!O380");

  // Column C: Comuna at O381 = O[predio+2]
  assert.equal(formulas[2], "='fichas VR'!O381");

  // Column D: Calle at P405 = P[predio+26] (NOT Q!)
  assert.equal(formulas[3], "='fichas VR'!P405");

  // Column E: "Foja X N° Y, año Z" using fichas VR!I (NOT referenciales)
  assert.equal(
    formulas[4],
    "=\"Foja \"&'fichas VR'!I423&\" N\"&CHAR(176)&\" \"&'fichas VR'!I424&\", a\"&CHAR(241)&\"o \"&'fichas VR'!I425",
  );

  // Column F: Fecha at AX411 = AX[predio+32]
  assert.equal(formulas[5], "='fichas VR'!AX411");

  // Column G: Sup at AV406 = AV[predio+27] (ref 6 uses AV)
  assert.equal(formulas[6], "='fichas VR'!AV406");

  // Column H: VU actualizado at U428 = U[predio+49]
  assert.equal(formulas[7], "='fichas VR'!U428");
});

// ---------------------------------------------------------------------------
// buildFormulas — refs 9, 10 must use AU (not AV) for the surface.
// ---------------------------------------------------------------------------

void test("buildFormulas ref 9 uses AU for surface (template bug)", () => {
  const formulas = buildFormulas(9, 10, 600, "fichas VR", "referenciales", "actualizado");
  assert.equal(formulas[6], "='fichas VR'!AU627");
  // Spot-check the rest still uses the canonical columns
  assert.equal(formulas[3], "='fichas VR'!P626");
  assert.equal(formulas[5], "='fichas VR'!AX632");
  assert.equal(formulas[7], "='fichas VR'!U649");
});

void test("buildFormulas ref 10 uses AU for surface (template bug)", () => {
  const formulas = buildFormulas(10, 11, 675, "fichas VR", "referenciales", "actualizado");
  assert.equal(formulas[6], "='fichas VR'!AU702");
});

void test("buildFormulas ref 11 returns to AV for surface", () => {
  const formulas = buildFormulas(11, 12, 749, "fichas VR", "referenciales", "actualizado");
  assert.equal(formulas[6], "='fichas VR'!AV776");
});

// ---------------------------------------------------------------------------
// buildFormulas — uf_mode branch.
// ---------------------------------------------------------------------------

void test("buildFormulas uf_mode=crudo uses referenciales!M for VU", () => {
  const formulas = buildFormulas(6, 7, 379, "fichas VR", "referenciales", "crudo");
  assert.equal(formulas[7], "=referenciales!M7");
});

void test("buildFormulas uf_mode=actualizado uses fichas VR!U[predio+49]", () => {
  const formulas = buildFormulas(6, 7, 379, "fichas VR", "referenciales", "actualizado");
  assert.equal(formulas[7], "='fichas VR'!U428");
});

// ---------------------------------------------------------------------------
// buildFormulas — sheet name escaping / default sheet names.
// ---------------------------------------------------------------------------

void test("buildFormulas escapes sheet names with single quotes", () => {
  const formulas = buildFormulas(6, 7, 379, "fichas VR", "referenciales", "actualizado");
  // All referencias to fichas VR should be quoted
  for (const f of formulas) {
    if (f.includes("fichas VR")) {
      assert.ok(f.includes("'fichas VR'"), `expected quoted sheet ref in: ${f}`);
    }
  }
});

void test("buildFormulas uses non-quoted ref for referenciales (no spaces in name)", () => {
  const formulas = buildFormulas(6, 7, 379, "fichas VR", "referenciales", "crudo");
  assert.match(formulas[7], /^=referenciales!/);
});

// ---------------------------------------------------------------------------
// Tool-level: the schema exposes the new params and the tool description.
// ---------------------------------------------------------------------------

void test("link_referenciales_cuadro schema has the documented params", () => {
  const tool = createLinkReferencialesCuadroTool();
  const schema = tool.parameters as unknown as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  for (const key of [
    "target_sheet",
    "target_row",
    "ref_number",
    "predio_row",
    "uf_mode",
    "fichas_sheet",
    "referenciales_sheet",
    "allow_overwrite",
    "dry_run",
  ]) {
    assert.ok(key in props, `schema should expose ${key}`);
  }
  assert.deepEqual(
    (schema.required ?? []).sort(),
    ["predio_row", "ref_number", "target_row", "target_sheet"],
  );
});

void test("link_referenciales_cuadro description references column A and refs 9/10 surface bug", () => {
  const tool = createLinkReferencialesCuadroTool();
  // The description has newlines from the JS template literal, so use a
  // s-flag-tolerant regex (the .* doesn't span lines but we keep it simple).
  assert.match(tool.description, /columns A-H/);
  assert.match(tool.description, /AU/);
  assert.match(tool.description, /refs?\s+9\s+and\s+10/);
});
