/**
 * audit_ref_errors — Audit a worksheet for #REF! errors and broken cross-sheet
 * references. Read-only tool that helps plan repairs to the
 * "Cuadro de Referenciales" (punto 8 del informe de tasación) and similar
 * cross-sheet link tables.
 *
 * Detects:
 * 1. Cells whose value is a literal #REF! error.
 * 2. Formulas containing the substring `#REF!` (e.g. `=#REF!&". Rol "&#REF!`)
 *    — the signature of the cuadro roto.
 * 3. Orphan rows where a # in column A (ref number) does not appear in the
 *    `referenciales` master sheet.
 *
 * Use this BEFORE repairing the cuadro to map the surface area, plan offsets,
 * and confirm the layout (column P vs Q etc.).
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { excelRun, qualifiedAddress, parseCell, colToLetter } from "../excel/helpers.js";
import { formatAsMarkdownTable } from "../utils/format.js";
import { getErrorMessage } from "../utils/errors.js";

const schema = Type.Object({
  sheet: Type.String({
    description:
      'Name of the sheet to audit (e.g. "81", "fichas VR"). Required.',
  }),
  range: Type.Optional(
    Type.String({
      description:
        'Optional A1 range to scan (e.g. "A100:H130"). If omitted, uses the used range. ' +
        'Use a narrow range when scanning the cuadro (typically B110:H125).',
    }),
  ),
  referenciales_sheet: Type.Optional(
    Type.String({
      description:
        'Name of the master sheet that lists referenciales. Default: "referenciales". ' +
        "Used to flag orphan rows whose N° in column A does not exist in the master.",
    }),
  ),
});

type Params = Static<typeof schema>;

interface RefErrorCell {
  address: string;
  formula?: string;
  kind: "value_ref" | "formula_ref";
}

interface OrphanRow {
  row: number;
  refNumber: string;
}

interface AuditResult {
  sheetName: string;
  range: string;
  totalCells: number;
  refErrorCount: number;
  refErrorCells: RefErrorCell[];
  /** Contiguous row bands that contain at least one #REF! cell. */
  brokenRowBands: Array<{ startRow: number; endRow: number; errorCount: number }>;
  orphanRows: OrphanRow[];
  referencialesSheet?: string;
  masterRefs?: number[];
}

export function createAuditRefErrorsTool(): AgentTool<typeof schema> {
  return {
    name: "audit_ref_errors",
    label: "Audit #REF! errors",
    description:
      "Scan a worksheet for #REF! errors and broken cross-sheet formula chains. " +
      "Returns a structured report grouped by row, plus a list of orphan rows " +
      "whose N° in column A is not present in the `referenciales` master sheet. " +
      "Use this BEFORE repairing a cuadro to plan the work. Read-only — does not write.",
    parameters: schema,
    execute: async (
      _toolCallId: string,
      params: Params,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const refSheetName = params.referenciales_sheet ?? "referenciales";
        const result = await excelRun<AuditResult>(async (context) => {
          // 1) Read the master `referenciales` column A so we can flag orphans.
          let masterRefs: number[] | undefined;
          let referencialesSheet: string | undefined;
          try {
            const refSheet = context.workbook.worksheets.getItem(refSheetName);
            const refA = refSheet.getRange("A:A").getUsedRange();
            refA.load("values");
            await context.sync();
            masterRefs = [];
            for (const cell of refA.values.flat()) {
              const n = typeof cell === "number"
                ? cell
                : typeof cell === "string" ? Number(cell) : NaN;
              if (Number.isFinite(n) && n > 0) {
                masterRefs.push(n);
              }
            }
            referencialesSheet = refSheetName;
          } catch {
            // referenciales sheet missing — skip orphan detection.
            masterRefs = undefined;
          }

          // 2) Scan the target sheet / range.
          const sheet = context.workbook.worksheets.getItem(params.sheet);
          const range = params.range
            ? sheet.getRange(params.range)
            : sheet.getUsedRangeOrNullObject();

          range.load("values,formulas,address,rowCount,columnCount");
          await context.sync();

          if ("isNullObject" in range && range.isNullObject) {
            return {
              sheetName: params.sheet,
              range: "(empty)",
              totalCells: 0,
              refErrorCount: 0,
              refErrorCells: [],
              brokenRowBands: [],
              orphanRows: [],
              referencialesSheet,
              masterRefs,
            } satisfies AuditResult;
          }

          const values = range.values as unknown[][];
          const formulas = range.formulas as unknown[][];
          const address = range.address;
          const cellPart = address.includes("!") ? address.split("!")[1] : address;
          const start = parseCell(cellPart.split(":")[0]);

          const refErrorCells: RefErrorCell[] = [];
          const rowErrorCount = new Map<number, number>();

          for (let r = 0; r < values.length; r += 1) {
            for (let c = 0; c < values[r].length; c += 1) {
              const v = values[r][c];
              const f = formulas[r][c];
              const addr = `${colToLetter(start.col + c)}${start.row + r}`;
              const isRefValue = typeof v === "string" && v === "#REF!";
              const isRefFormula = typeof f === "string"
                && f.includes("#REF!") && f !== "#REF!";
              if (isRefValue || isRefFormula) {
                refErrorCells.push({
                  address: addr,
                  formula: typeof f === "string" ? f : undefined,
                  kind: isRefFormula ? "formula_ref" : "value_ref",
                });
                rowErrorCount.set(start.row + r, (rowErrorCount.get(start.row + r) ?? 0) + 1);
              }
            }
          }

          // 3) Group contiguous row bands.
          const brokenRowBands: AuditResult["brokenRowBands"] = [];
          const sortedRows = [...rowErrorCount.keys()].sort((a, b) => a - b);
          let bandStart: number | null = null;
          let bandEnd = 0;
          let bandCount = 0;
          for (const row of sortedRows) {
            if (bandStart === null) {
              bandStart = row;
              bandEnd = row;
              bandCount = rowErrorCount.get(row) ?? 0;
              continue;
            }
            if (row === bandEnd + 1) {
              bandEnd = row;
              bandCount += rowErrorCount.get(row) ?? 0;
            } else {
              brokenRowBands.push({
                startRow: bandStart,
                endRow: bandEnd,
                errorCount: bandCount,
              });
              bandStart = row;
              bandEnd = row;
              bandCount = rowErrorCount.get(row) ?? 0;
            }
          }
          if (bandStart !== null) {
            brokenRowBands.push({
              startRow: bandStart,
              endRow: bandEnd,
              errorCount: bandCount,
            });
          }

          // 4) Orphan rows: read column A in the scanned range, flag any N°
          //    that is missing from masterRefs.
          const orphanRows: OrphanRow[] = [];
          if (masterRefs) {
            const masterSet = new Set(masterRefs);
            const colA = sheet.getRange(`${colToLetter(start.col)}${start.row}:${colToLetter(start.col)}${start.row + values.length - 1}`);
            colA.load("values");
            await context.sync();
            for (let r = 0; r < colA.values.length; r += 1) {
              const cell: unknown = (colA.values as unknown[][])[r]?.[0];
              const n = typeof cell === "number"
                ? cell
                : typeof cell === "string" ? Number(cell) : NaN;
              if (Number.isFinite(n) && n > 0 && !masterSet.has(n)) {
                orphanRows.push({ row: start.row + r, refNumber: String(cell) });
              }
            }
          }

          return {
            sheetName: params.sheet,
            range: address,
            totalCells: values.length * Math.max(0, values[0]?.length ?? 0),
            refErrorCount: refErrorCells.length,
            refErrorCells,
            brokenRowBands,
            orphanRows,
            referencialesSheet,
            masterRefs,
          } satisfies AuditResult;
        });

        return formatAuditResult(result);
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error auditing "${params.sheet}": ${getErrorMessage(e)}` }],
          details: undefined,
        };
      }
    },
  };
}

function formatAuditResult(result: AuditResult): AgentToolResult<undefined> {
  const lines: string[] = [];
  const fullAddr = qualifiedAddress(result.sheetName, result.range);
  lines.push(`**Audit: ${fullAddr}** — scanned ${result.totalCells} cell(s).`);
  lines.push("");

  lines.push(`🔴 **#REF! errors: ${result.refErrorCount}**`);
  if (result.refErrorCount === 0) {
    lines.push("_No broken references found._");
  } else {
    lines.push("");
    lines.push("**Contiguous broken row bands:**");
    lines.push("");
    lines.push("| Rows | #REF! cells |");
    lines.push("|---|---|");
    for (const band of result.brokenRowBands) {
      lines.push(`| ${band.startRow}–${band.endRow} | ${band.errorCount} |`);
    }

    // Surface the "broken-by-formula" pattern separately: concatenation
    // over `#REF!` is the classic cuadro roto signature.
    const formulaHits = result.refErrorCells.filter((c) => c.kind === "formula_ref");
    if (formulaHits.length > 0) {
      lines.push("");
      lines.push("⚠️ **Concatenation-over-#REF! pattern detected** (likely origin: deleted rows in `referenciales`).");
      lines.push("These formulas reference `#REF!` inside `&`-chains:");
      lines.push("");
      for (const c of formulaHits.slice(0, 10)) {
        lines.push(`- \`${c.address}\`: \`${c.formula ?? "(no formula)"}\``);
      }
      if (formulaHits.length > 10) {
        lines.push(`- …and ${formulaHits.length - 10} more.`);
      }
    }

    const valueHits = result.refErrorCells.filter((c) => c.kind === "value_ref");
    if (valueHits.length > 0) {
      lines.push("");
      lines.push("Cells evaluating to literal `#REF!`:");
      const previewRows = valueHits.slice(0, 20).map((c) => [c.address]);
      lines.push(formatAsMarkdownTable(previewRows));
      if (valueHits.length > 20) {
        lines.push(`_…and ${valueHits.length - 20} more._`);
      }
    }
  }

  if (result.orphanRows.length > 0) {
    lines.push("");
    lines.push(`🟡 **Orphan rows: ${result.orphanRows.length}**`);
    lines.push("");
    lines.push("These rows have a N° in column A that is NOT present in `referenciales`:");
    const preview = result.orphanRows.slice(0, 20).map((o) => [`${o.row}`, o.refNumber]);
    lines.push(formatAsMarkdownTable(preview));
    if (result.orphanRows.length > 20) {
      lines.push(`_…and ${result.orphanRows.length - 20} more._`);
    }
  }

  if (result.referencialesSheet && !result.masterRefs) {
    lines.push("");
    lines.push(`Orphan detection skipped: \`${result.referencialesSheet}\` was empty or unreadable.`);
  }

  lines.push("");
  lines.push("**Suggested next step:** use `link_referenciales_cuadro` to repair one row at a time, " +
    "or read skill `tasaciones/cuadro-referenciales` for the full offset map.");

  return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
}
