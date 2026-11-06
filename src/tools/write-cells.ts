/**
 * write_cells — Write values and formulas to Excel cells.
 *
 * Features:
 * - Overwrite protection (blocks by default if target has data)
 * - Auto-verify: reads back after writing, reports formula errors
 * - Supports formulas (strings starting with "=")
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { WriteCellsDetails } from "./tool-details.js";
import {
  excelRun, getRange, qualifiedAddress, parseCell,
  colToLetter, computeRangeAddress, padValues,
} from "../excel/helpers.js";
import { buildWorkbookCellChangeSummary } from "../audit/cell-diff.js";
import { getWorkbookChangeAuditLog } from "../audit/workbook-change-audit.js";
import { dispatchWorkbookSnapshotCreated } from "../workbook/recovery-events.js";
import { getWorkbookRecoveryLog } from "../workbook/recovery-log.js";
import { formatAsMarkdownTable, findErrors } from "../utils/format.js";
import { getErrorMessage } from "../utils/errors.js";
import {
  CHECKPOINT_SKIPPED_NOTE,
  CHECKPOINT_SKIPPED_REASON,
} from "./recovery-metadata.js";
import { finalizeMutationOperation } from "./mutation/finalize.js";
import type { MutationFinalizeDependencies } from "./mutation/types.js";
import { appendMutationResultNote } from "./mutation/result-note.js";

const schema = Type.Object({
  start_cell: Type.String({
    description:
      'Top-left cell to write from, e.g. "A1", "Sheet2!B3". ' +
      "If no sheet is specified, uses the active sheet.",
  }),
  values: Type.Array(Type.Array(Type.Any()), {
    description:
      "2D array of values. Each inner array is a row. " +
      'Strings starting with "=" are formulas. ' +
      'Example: [["Name", "Total"], ["Alice", "=SUM(B2:B10)"]]',
  }),
  allow_overwrite: Type.Optional(
    Type.Boolean({
      description:
        "Set to true to overwrite existing data. Default: false. " +
        "If false and the target range contains values or formulas, the write is blocked " +
        "and the existing data is returned so you can ask the user.",
    }),
  ),
});

type Params = Static<typeof schema>;

interface InvalidFormula {
  address: string;
  formula: string;
  reason: string;
}

type WriteCellsResult =
  | {
    blocked: true;
    reason: "merged";
    sheetName: string;
    address: string;
    conflicts: MergedWriteConflict[];
  }
  | {
    blocked: true;
    reason?: "occupied";
    sheetName: string;
    address: string;
    existingCount: number;
    existingValues: unknown[][];
  }
  | {
    blocked: false;
    sheetName: string;
    address: string;
    beforeValues: unknown[][];
    beforeFormulas: unknown[][];
    readBackValues: unknown[][];
    readBackFormulas: unknown[][];
  };

type BlockedWriteCellsResult = Extract<WriteCellsResult, { blocked: true; reason?: "occupied" }>;
type MergedBlockedWriteCellsResult = Extract<WriteCellsResult, { reason: "merged" }>;
type SuccessWriteCellsResult = Extract<WriteCellsResult, { blocked: false }>;

const mutationFinalizeDependencies: MutationFinalizeDependencies = {
  appendAuditEntry: (entry) => getWorkbookChangeAuditLog().append(entry),
};

export function createWriteCellsTool(): AgentTool<typeof schema, WriteCellsDetails> {
  return {
    name: "write_cells",
    label: "Write Cells",
    description:
      "Write values and formulas to Excel cells. Provide a start cell and a 2D array. " +
      'Strings starting with "=" are treated as formulas. ' +
      "By default, blocks if the target range already contains data — " +
      "set allow_overwrite=true after confirming with the user. " +
      "After writing, automatically verifies results and reports any formula errors.",
    parameters: schema,
    execute: async (
      toolCallId: string,
      params: Params,
    ): Promise<AgentToolResult<WriteCellsDetails>> => {
      try {
        if (!params.values || params.values.length === 0) {
          return {
            content: [{ type: "text", text: "Error: values array is empty." }],
            details: { kind: "write_cells", blocked: false },
          };
        }

        const { padded, rows, cols } = padValues(params.values);

        const startCellRef = params.start_cell.includes("!")
          ? params.start_cell.split("!")[1]
          : params.start_cell;

        if (startCellRef.includes(":")) {
          return {
            content: [{ type: "text", text: "Error: start_cell must be a single cell (e.g. \"A1\")." }],
            details: { kind: "write_cells", blocked: false },
          };
        }

        let invalidFormulas: InvalidFormula[] = [];
        try {
          invalidFormulas = findInvalidFormulas(padded, startCellRef);
        } catch {
          return {
            content: [{ type: "text", text: `Error: invalid start_cell "${params.start_cell}".` }],
            details: { kind: "write_cells", blocked: false },
          };
        }

        if (invalidFormulas.length > 0) {
          const lines: string[] = [];
          lines.push("⛔ **Write blocked** — invalid formula syntax detected:");
          for (const invalid of invalidFormulas) {
            lines.push(`- ${invalid.address}: ${invalid.formula} (${invalid.reason})`);
          }
          lines.push("");
          lines.push("Fix the formulas and retry.");
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: { kind: "write_cells", blocked: true },
          };
        }

        const result = await excelRun<WriteCellsResult>(async (context) => {
          const { sheet } = getRange(context, params.start_cell);
          sheet.load("name");

          const rangeAddr = computeRangeAddress(startCellRef, rows, cols);
          const targetRange = sheet.getRange(rangeAddr);
          targetRange.load("values,formulas");
          await context.sync();

          const beforeValues = targetRange.values;
          const beforeFormulas = targetRange.formulas;

          // Excel silently drops values written into non-anchor cells of a
          // merged area. Detect that up front instead of reporting success.
          const mergedAddresses = await loadMergedAreaAddresses(context, sheet, targetRange);
          const conflicts = findMergedWriteConflicts(padded, startCellRef, mergedAddresses);
          if (conflicts.length > 0) {
            return {
              blocked: true,
              reason: "merged",
              sheetName: sheet.name,
              address: rangeAddr,
              conflicts,
            };
          }

          // Overwrite protection: check if target has existing data (values or formulas)
          if (!params.allow_overwrite) {
            const occupiedCount = countOccupiedCells(beforeValues, beforeFormulas);
            if (occupiedCount > 0) {
              return {
                blocked: true,
                sheetName: sheet.name,
                address: rangeAddr,
                existingCount: occupiedCount,
                existingValues: beforeValues,
              };
            }
          }

          // Write
          targetRange.values = padded;
          await context.sync();

          // Read back to verify
          const verify = sheet.getRange(rangeAddr);
          verify.load("values,formulas,address");
          await context.sync();

          return {
            blocked: false,
            sheetName: sheet.name,
            address: verify.address,
            beforeValues,
            beforeFormulas,
            readBackValues: verify.values,
            readBackFormulas: verify.formulas,
          };
        });

        if (result.blocked && result.reason === "merged") {
          return formatMergedBlocked(result);
        }

        if (result.blocked) {
          const blockedResult = formatBlocked(result);

          await finalizeMutationOperation(mutationFinalizeDependencies, {
            auditEntry: {
              toolName: "write_cells",
              toolCallId,
              blocked: true,
              outputAddress: blockedResult.details.address,
              changedCount: 0,
              changes: [],
            },
          });

          return blockedResult;
        }

        const successResult = formatSuccess(result, rows, cols, padded);

        await finalizeMutationOperation(mutationFinalizeDependencies, {
          auditEntry: {
            toolName: "write_cells",
            toolCallId,
            blocked: false,
            outputAddress: successResult.details.address,
            changedCount: successResult.details.changes?.changedCount ?? 0,
            changes: successResult.details.changes?.sample ?? [],
          },
          recovery: {
            result: successResult,
            appendRecoverySnapshot: () => getWorkbookRecoveryLog().append({
              toolName: "write_cells",
              toolCallId,
              address: successResult.details.address ?? qualifiedAddress(result.sheetName, result.address),
              changedCount: successResult.details.changes?.changedCount ?? 0,
              beforeValues: result.beforeValues,
              beforeFormulas: result.beforeFormulas,
            }),
            appendResultNote: appendMutationResultNote,
            unavailableReason: CHECKPOINT_SKIPPED_REASON,
            unavailableNote: CHECKPOINT_SKIPPED_NOTE,
            dispatchSnapshotCreated: (checkpoint) => {
              dispatchWorkbookSnapshotCreated({
                snapshotId: checkpoint.id,
                toolName: checkpoint.toolName,
                address: checkpoint.address,
                changedCount: checkpoint.changedCount,
              });
            },
          },
        });

        return successResult;
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error writing cells: ${getErrorMessage(e)}` }],
          details: { kind: "write_cells", blocked: false },
        };
      }
    },
  };
}

function findInvalidFormulas(values: unknown[][], startCell: string): InvalidFormula[] {
  const start = parseCell(startCell);
  const invalid: InvalidFormula[] = [];

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const value = values[r][c];
      if (typeof value === "string" && value.startsWith("=")) {
        const reason = validateFormula(value);
        if (reason) {
          invalid.push({
            address: `${colToLetter(start.col + c)}${start.row + r}`,
            formula: value,
            reason,
          });
        }
      }
    }
  }

  return invalid;
}

export function validateFormula(formula: string): string | null {
  if (!formula.startsWith("=")) return null;
  const body = formula.slice(1);

  if (body.trim().length === 0) return "Empty formula";

  const quoteCount = (body.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) return "Unbalanced quotes";

  let depth = 0;
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth < 0) return "Unbalanced parentheses";
    }
  }
  if (depth !== 0) return "Unbalanced parentheses";

  const trimmed = body.trim();
  if (/[+\-*/^&,]$/.test(trimmed)) return "Formula ends with an operator";

  return null;
}

export function countOccupiedCells(values: unknown[][], formulas: unknown[][]): number {
  let count = 0;
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const value = values[r][c];
      const formula = formulas?.[r]?.[c];
      const hasValue = value !== null && value !== undefined && value !== "";
      const hasFormula = typeof formula === "string" && formula.startsWith("=");
      if (hasValue || hasFormula) count += 1;
    }
  }
  return count;
}

const VERIFIED_VALUES_PREVIEW_ROWS = 8;
const VERIFIED_VALUES_PREVIEW_COLS = 6;

interface VerifiedValuesPreview {
  values: unknown[][];
  totalRows: number;
  totalCols: number;
  shownRows: number;
  shownCols: number;
  omittedRows: number;
  omittedCols: number;
  truncated: boolean;
}

function buildVerifiedValuesPreview(values: unknown[][]): VerifiedValuesPreview {
  const totalRows = values.length;
  const totalCols = values.reduce((max, row) => Math.max(max, row.length), 0);

  const shownRows = Math.min(totalRows, VERIFIED_VALUES_PREVIEW_ROWS);
  const shownCols = Math.min(totalCols, VERIFIED_VALUES_PREVIEW_COLS);

  const previewValues: unknown[][] = [];
  for (let r = 0; r < shownRows; r += 1) {
    previewValues.push(values[r].slice(0, shownCols));
  }

  const omittedRows = Math.max(totalRows - shownRows, 0);
  const omittedCols = Math.max(totalCols - shownCols, 0);
  const truncated = omittedRows > 0 || omittedCols > 0;

  return {
    values: previewValues,
    totalRows,
    totalCols,
    shownRows,
    shownCols,
    omittedRows,
    omittedCols,
    truncated,
  };
}

function formatBlocked(result: BlockedWriteCellsResult): AgentToolResult<WriteCellsDetails> {
  const fullAddr = qualifiedAddress(result.sheetName, result.address);
  const lines: string[] = [];

  lines.push(`⛔ **Write blocked** — ${fullAddr} contains ${result.existingCount} non-empty cell(s).`);
  lines.push("");

  if (result.existingCount > 0) {
    lines.push("**Existing data:**");
    lines.push(formatAsMarkdownTable(result.existingValues));
    lines.push("");
  } else {
    lines.push("**Existing data:** (empty)");
    lines.push("");
  }

  lines.push(
    "To overwrite, confirm with the user and retry with `allow_overwrite: true`.",
  );

  const details: WriteCellsDetails = {
    kind: "write_cells",
    blocked: true,
    address: fullAddr,
    existingCount: result.existingCount,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], details };
}

function formatSuccess(
  result: SuccessWriteCellsResult,
  rows: number,
  cols: number,
  intended: unknown[][],
): AgentToolResult<WriteCellsDetails> {
  const fullAddr = qualifiedAddress(result.sheetName, result.address);
  const cellPart = result.address.includes("!") ? result.address.split("!")[1] : result.address;
  const startCell = cellPart.split(":")[0];

  const lines: string[] = [];
  lines.push(`Written to **${fullAddr}** (${rows}×${cols})`);

  // Check for formula errors
  const errors = findErrors(result.readBackValues, startCell);
  if (errors.length > 0) {
    // Attach formula info to errors
    const start = parseCell(startCell);
    for (const err of errors) {
      const errCell = parseCell(err.address);
      const r = errCell.row - start.row;
      const c = errCell.col - start.col;
      if (r >= 0 && c >= 0 && r < result.readBackFormulas.length && c < result.readBackFormulas[r].length) {
        const f = result.readBackFormulas[r][c];
        if (typeof f === "string") {
          err.formula = f;
        }
      }
    }

    lines.push("");
    lines.push(`⚠️ **${errors.length} formula error(s):**`);
    for (const e of errors) {
      lines.push(`- ${e.address}: ${e.error}${e.formula ? ` (formula: ${e.formula})` : ""}`);
    }
    lines.push("");
    lines.push("Review and fix with another write_cells call.");
  } else {
    const preview = buildVerifiedValuesPreview(result.readBackValues);

    lines.push("");
    if (preview.truncated) {
      lines.push(
        `**Verified values (preview ${preview.shownRows}×${preview.shownCols} of ${preview.totalRows}×${preview.totalCols}):**`,
      );
    } else {
      lines.push("**Verified values:**");
    }
    lines.push(formatAsMarkdownTable(preview.values));

    if (preview.truncated) {
      const omissions: string[] = [];
      if (preview.omittedRows > 0) {
        omissions.push(`${preview.omittedRows} more row${preview.omittedRows === 1 ? "" : "s"}`);
      }
      if (preview.omittedCols > 0) {
        omissions.push(`${preview.omittedCols} more column${preview.omittedCols === 1 ? "" : "s"}`);
      }

      lines.push("");
      lines.push(`_Showing preview only (${omissions.join(" and ")})._`);
      lines.push("_Use `read_range` for full verification if needed._");
    }
  }

  const dropped = findDroppedWrites(intended, result.readBackValues, result.readBackFormulas, startCell);
  if (dropped.length > 0) {
    const shown = dropped.slice(0, 12).join(", ");
    const more = dropped.length > 12 ? ` (+${dropped.length - 12} more)` : "";
    lines.push("");
    lines.push(
      `⚠️ **${dropped.length} value(s) did not persist:** ${shown}${more}. ` +
      "Excel kept these cells empty (often merged areas, data validation, or protection). " +
      "Do not report them as written; inspect the layout with read_range before retrying.",
    );
  }

  const changes = buildWorkbookCellChangeSummary({
    sheetName: result.sheetName,
    startCell,
    beforeValues: result.beforeValues,
    beforeFormulas: result.beforeFormulas,
    afterValues: result.readBackValues,
    afterFormulas: result.readBackFormulas,
  });

  if (changes.changedCount > 0) {
    lines.push("");
    lines.push(`Changed cell(s): ${changes.changedCount}.`);
  }

  const details: WriteCellsDetails = {
    kind: "write_cells",
    blocked: false,
    address: fullAddr,
    formulaErrorCount: errors.length,
    droppedCount: dropped.length,
    changes,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], details };
}


// ============================================================================
// Merged-area safety
// ============================================================================

export interface MergedWriteConflict {
  /** Cell the caller tried to write (non-anchor cell of a merged area). */
  cell: string;
  /** Merged area containing that cell, e.g. "AT36:BB36". */
  mergedArea: string;
  /** Top-left cell of the merged area: the only cell Excel keeps a value in. */
  anchor: string;
}

/**
 * Merged areas that intersect the write target.
 *
 * `Range.getMergedAreasOrNullObject()` only returns areas fully contained in
 * the queried range, so querying the target alone misses e.g. A56:BB63 when
 * writing A56:A57. Query the sheet's used range (which contains every merged
 * area) and let `findMergedWriteConflicts` keep the ones that overlap.
 */
async function loadMergedAreaAddresses(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  target: Excel.Range,
): Promise<string[]> {
  try {
    const used = sheet.getUsedRangeOrNullObject();
    const mergedInUsed = used.getMergedAreasOrNullObject();
    const mergedInTarget = target.getMergedAreasOrNullObject();
    mergedInUsed.load("address");
    mergedInTarget.load("address");
    await context.sync();

    const addresses = new Set<string>();
    for (const merged of [mergedInUsed, mergedInTarget]) {
      if (merged.isNullObject) continue;
      for (const area of parseMergedAreaAddresses(merged.address)) addresses.add(area);
    }
    return [...addresses];
  } catch {
    // ExcelApi 1.13 unavailable: rely on the post-write dropped-value check.
    return [];
  }
}

/** Parse a RangeAreas address ("'My Sheet'!A1:B2, 'My Sheet'!C3:D4") into ["A1:B2", "C3:D4"]. */
export function parseMergedAreaAddresses(address: string): string[] {
  const clean = address.replace(/\$/gu, "");
  const matches = clean.match(/[A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?(?=\s*(?:,|$))/giu) ?? [];
  return matches.map((m) => m.toUpperCase());
}

function isMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function findMergedWriteConflicts(
  values: unknown[][],
  startCell: string,
  mergedAreas: string[],
): MergedWriteConflict[] {
  if (mergedAreas.length === 0) return [];
  const start = parseCell(startCell);
  const conflicts: MergedWriteConflict[] = [];

  for (const area of mergedAreas) {
    const [first, last = first] = area.split(":");
    const a = parseCell(first);
    const b = parseCell(last);

    for (let row = a.row; row <= b.row; row += 1) {
      for (let col = a.col; col <= b.col; col += 1) {
        if (row === a.row && col === a.col) continue;
        const value = values[row - start.row]?.[col - start.col];
        if (!isMeaningfulValue(value)) continue;
        conflicts.push({
          cell: `${colToLetter(col)}${row}`,
          mergedArea: area,
          anchor: first,
        });
      }
    }
  }

  return conflicts;
}

/** Cells where a non-empty value was written but Excel reads back empty. */
export function findDroppedWrites(
  intended: unknown[][],
  readBackValues: unknown[][],
  readBackFormulas: unknown[][],
  startCell: string,
): string[] {
  const start = parseCell(startCell);
  const dropped: string[] = [];

  for (let r = 0; r < intended.length; r += 1) {
    for (let c = 0; c < intended[r].length; c += 1) {
      if (!isMeaningfulValue(intended[r][c])) continue;
      const value = readBackValues[r]?.[c];
      const formula = readBackFormulas[r]?.[c];
      if (isMeaningfulValue(value) || isMeaningfulValue(formula)) continue;
      dropped.push(`${colToLetter(start.col + c)}${start.row + r}`);
    }
  }

  return dropped;
}

function formatMergedBlocked(result: MergedBlockedWriteCellsResult): AgentToolResult<WriteCellsDetails> {
  const fullAddr = qualifiedAddress(result.sheetName, result.address);
  const lines: string[] = [];

  lines.push(
    `⛔ **Write blocked** — ${result.conflicts.length} value(s) target non-anchor cells of merged areas in ${fullAddr}. ` +
    "Excel would silently discard them.",
  );
  lines.push("");
  for (const conflict of result.conflicts.slice(0, 15)) {
    lines.push(`- ${conflict.cell} is inside ${conflict.mergedArea}: write to **${conflict.anchor}** instead`);
  }
  if (result.conflicts.length > 15) {
    lines.push(`- … ${result.conflicts.length - 15} more`);
  }
  lines.push("");
  lines.push(
    "Nothing was written. In templates, the visible value of a merged field lives in its top-left cell; " +
    "write each field to its anchor.",
  );

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: {
      kind: "write_cells",
      blocked: true,
      address: fullAddr,
      mergedConflictCount: result.conflicts.length,
    },
  };
}
