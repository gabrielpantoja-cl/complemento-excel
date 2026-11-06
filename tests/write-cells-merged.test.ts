import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findDroppedWrites,
  findMergedWriteConflicts,
  parseMergedAreaAddresses,
} from "../src/tools/write-cells.ts";

void test("parseMergedAreaAddresses strips quoted sheet names and $ signs", () => {
  assert.deepEqual(
    parseMergedAreaAddresses("'Lote 1'!$AT$36:$BB$36, 'Lote 1'!J39:AB39,'Lote 1'!M5"),
    ["AT36:BB36", "J39:AB39", "M5"],
  );
});

void test("findMergedWriteConflicts flags non-anchor targets and points to the anchor", () => {
  // Writing AU36 (inside AT36:BB36) is dropped by Excel; AT36 is fine.
  const conflicts = findMergedWriteConflicts([["x"]], "AU36", ["AT36:BB36"]);
  assert.deepEqual(conflicts, [{ cell: "AU36", mergedArea: "AT36:BB36", anchor: "AT36" }]);

  assert.deepEqual(findMergedWriteConflicts([[5000]], "AT36", ["AT36:BB36"]), []);
  // Empty padding inside a merge is harmless.
  assert.deepEqual(findMergedWriteConflicts([["a", "", ""]], "AT36", ["AT36:AV36"]), []);
});

void test("findDroppedWrites reports values Excel read back as empty", () => {
  const dropped = findDroppedWrites(
    [["kept", "lost", ""], ["=A1", 0, null]],
    [["kept", "", ""], [1, 0, ""]],
    [["kept", "", ""], ["=A1", 0, ""]],
    "B2",
  );
  assert.deepEqual(dropped, ["C2"]);
});

void test("read_range resolves the sheet param instead of silently reading the active sheet", async () => {
  const { resolveSheetRef: resolveReadRangeRef } = await import("../src/excel/helpers.ts");
  assert.equal(resolveReadRangeRef("A1:B5", "Ficha VR"), "'Ficha VR'!A1:B5");
  assert.equal(resolveReadRangeRef("A1:B5"), "A1:B5");
  assert.equal(resolveReadRangeRef("'Ficha VR'!A1", "Ficha VR"), "'Ficha VR'!A1");
  assert.throws(() => resolveReadRangeRef("Lote 1!A1", "Ficha VR"), /sheet param/u);
});

void test("findMergedWriteConflicts catches targets inside merges larger than the write range", () => {
  // 2026-11-06 regression: writing A56:A57 into the A56:BB63 merge.
  const conflicts = findMergedWriteConflicts([["Observaciones"], ["texto"]], "A56", ["A56:BB63", "AT36:BB36"]);
  assert.deepEqual(conflicts, [{ cell: "A57", mergedArea: "A56:BB63", anchor: "A56" }]);
});
