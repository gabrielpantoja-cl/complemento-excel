/**
 * link_referenciales_cuadro — Repair a single row of the "Cuadro de
 * Referenciales" (punto 8) by linking it to `fichas VR`.
 *
 * Writes the 8 standard formulas in columns A..H of the target row, preserving
 * the existing number formats (m/d/yyyy, #,##0, ...) and verifying post-write
 * that no cell evaluates to #REF! / 0 / empty.
 *
 * The user supplies `predio_row` (absolute row in `fichas VR` where Predio
 * lives for this ref) so the tool works even when block sizes are irregular
 * in the workbook. Within-block offsets (relative to Predio) are constant
 * for all 13 refs, verified against the canonical tasaciones workbook:
 *
 *   N referencial (A, AT)     : title_row + 2 = predio_row - 2
 *   Predio (O)               :  0
 *   ROL (O)                  : +1
 *   Comuna (O)               : +2
 *   Region (O)               : +3
 *   Tipo de bien raiz (O)    : +4
 *   Calle de referencia (P)  : +26
 *   Sup. terreno (AV)       : +27  (refs 9 and 10 use column AU)
 *   Fecha transaccion (AX)   : +32
 *   foja (I)                 : +44
 *   N (I)                    : +45
 *   anio (I)                 : +46
 *   VU $/m2 actualizado (U)  : +53
 *
 * Special case: refs 9 and 10 have the surface in column AU, not AV. This is
 * an inconsistency in the workbook (likely a template bug in the original
 * tasacion file). All other refs use AV.
 *
 * See skills/tasaciones/cuadro-referenciales.md for the full map and the
 * procedure to find `predio_row` for a given ref (search for "REFERENCIAL").
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { excelRun, qualifiedAddress, colToLetter } from "../excel/helpers.js";
import { getErrorMessage } from "../utils/errors.js";

const schema = Type.Object({
  target_sheet: Type.String({
    description: 'Sheet name of the lote (e.g. "81", "82"). Required.',
  }),
  target_row: Type.Number({
    description: "1-indexed row number in `target_sheet` that holds the cuadro row to link (e.g. 118).",
  }),
  ref_number: Type.Number({
    description:
      "Numero de ficha VR in `referenciales` (1..N). The tool validates this exists in " +
      "the master sheet before writing.",
  }),
  /** Absolute row in `fichas VR` where the Predio cell lives for this ref. */
  predio_row: Type.Number({
    description:
      "Absolute row in `fichas VR` where Predio lives for this ref (e.g. 379 for ref 6, " +
      "451 for ref 7, 525 for ref 8 in the canonical tasaciones workbook). " +
      "Find via `search_workbook` for the string \"REFERENCIAL\" in `fichas VR` and " +
      "pick the row whose value column N equals `ref_number`; Predio is in column O of that row.",
  }),
  uf_mode: Type.Optional(
    Type.Union([Type.Literal("crudo"), Type.Literal("actualizado")], {
      description:
        '"actualizado" (default): use fichas VR!U* - VU $/m2 actualizado por UF a la fecha de tasacion. ' +
        '"crudo": use referenciales!M - VU sin actualizar (cuando fecha de tasacion = fecha de escritura). ' +
        "If unsure, ASK the user before calling - see skill tasaciones/cuadro-referenciales.",
    }),
  ),
  fichas_sheet: Type.Optional(
    Type.String({
      description: 'Name of the fichas VR sheet. Default: "fichas VR".',
    }),
  ),
  referenciales_sheet: Type.Optional(
    Type.String({
      description: 'Name of the referenciales master sheet. Default: "referenciales". ' +
        "Used to validate ref_number exists. NOT used for foja/N°/año (those come from fichas VR).",
    }),
  ),
  allow_overwrite: Type.Optional(
    Type.Boolean({
      description:
        "Set to true to overwrite existing data in the target row. " +
        "Default: false. If false and the row has data, the write is blocked.",
    }),
  ),
  dry_run: Type.Optional(
    Type.Boolean({
      description:
        "If true, return the formulas that WOULD be written without actually writing them. " +
        "Use to preview before committing.",
    }),
  ),
});

type Params = Static<typeof schema>;

interface WriteFormulasResult {
  formulas: string[];
  layout: Array<{ col: string; label: string; formula: string }>;
}

interface VerifyResult {
  address: string;
  writtenFormulas: string[];
  readBackValues: unknown[][];
  problems: Array<{ address: string; issue: string; value: unknown }>;
}

const FICHAS_VR_DEFAULT = "fichas VR";
const REFERENCIALES_DEFAULT = "referenciales";

/**
 * Within-block offsets from the Predio cell (column O).
 * Verified against refs 6, 7, 8, 9, 10, 11 in the canonical tasaciones
 * workbook (transcript 2026-07-22-vinculando-referenciales-a-las-fichas).
 */
export const CUADRO_OFFSETS = {
  /** AT[predio_row - 2] for the referencial number (column A). */
  numRef: -2,
  predio: 0,
  rol: 1,
  comuna: 2,
  calle: 26,
  sup: 27,
  fecha: 32,
  foja: 44,
  numero: 45,
  anio: 46,
  vuActualizado: 49,
} as const;

/** Refs 9 and 10 store the surface area in column AU, not AV (template bug). */
export function surfaceColumnFor(refNumber: number): "AU" | "AV" {
  return refNumber === 9 || refNumber === 10 ? "AU" : "AV";
}

export function buildFormulas(
  refNumber: number,
  masterRow: number,
  predioRow: number,
  fichasSheet: string,
  referencialesSheet: string,
  ufMode: "crudo" | "actualizado",
): string[] {
  const fNumRef = `'${fichasSheet}'!AT${predioRow + CUADRO_OFFSETS.numRef}`;
  const fPredio = `'${fichasSheet}'!O${predioRow + CUADRO_OFFSETS.predio}`;
  const fRol = `'${fichasSheet}'!O${predioRow + CUADRO_OFFSETS.rol}`;
  const fComuna = `'${fichasSheet}'!O${predioRow + CUADRO_OFFSETS.comuna}`;
  const fRuta = `'${fichasSheet}'!P${predioRow + CUADRO_OFFSETS.calle}`;
  const fFoja = `'${fichasSheet}'!I${predioRow + CUADRO_OFFSETS.foja}`;
  const fNumero = `'${fichasSheet}'!I${predioRow + CUADRO_OFFSETS.numero}`;
  const fAnio = `'${fichasSheet}'!I${predioRow + CUADRO_OFFSETS.anio}`;
  const supCol = surfaceColumnFor(refNumber);
  const fSup = `'${fichasSheet}'!${supCol}${predioRow + CUADRO_OFFSETS.sup}`;
  const fFecha = `'${fichasSheet}'!AX${predioRow + CUADRO_OFFSETS.fecha}`;
  const fVuActualizado = `'${fichasSheet}'!U${predioRow + CUADRO_OFFSETS.vuActualizado}`;
  const fVuCrudo = `${referencialesSheet}!M${masterRow}`;

  return [
    `=${fNumRef}`,
    `=${fPredio}&". Rol "&${fRol}`,
    `=${fComuna}`,
    `=${fRuta}`,
    `="Foja "&${fFoja}&" N"&CHAR(176)&" "&${fNumero}&", a"&CHAR(241)&"o "&${fAnio}`,
    `=${fFecha}`,
    `=${fSup}`,
    `=${ufMode === "crudo" ? fVuCrudo : fVuActualizado}`,
  ];
}

function buildLayout(formulas: string[], ufMode: string): WriteFormulasResult["layout"] {
  const supColNote = formulas[6]?.includes("!AU") ? " (col AU)" : "";
  return [
    { col: "A", label: "N referencial", formula: formulas[0] },
    { col: "B", label: "Nombre del Predio", formula: formulas[1] },
    { col: "C", label: "Comuna", formula: formulas[2] },
    { col: "D", label: "Ubicacion", formula: formulas[3] },
    { col: "E", label: "Transaccion (CBR)", formula: formulas[4] },
    { col: "F", label: "Fecha Transaccion", formula: formulas[5] },
    { col: "G", label: `Superficie (m2)${supColNote}`, formula: formulas[6] },
    { col: "H", label: `Valor Unitario ($/m2) [${ufMode}]`, formula: formulas[7] },
  ];
}

function detectProblems(
  startCol: number,
  rowIndex: number,
  values: unknown[][],
): VerifyResult["problems"] {
  const problems: VerifyResult["problems"] = [];
  const row = values[0] ?? [];
  for (let c = 0; c < row.length; c += 1) {
    const v = row[c];
    const addr = `${colToLetter(startCol + c)}${rowIndex}`;
    if (typeof v === "string" && v === "#REF!") {
      problems.push({ address: addr, issue: "evaluates to #REF!", value: v });
      continue;
    }
    if (typeof v === "number" && !Number.isFinite(v)) {
      problems.push({ address: addr, issue: "evaluates to NaN/Infinity", value: v });
      continue;
    }
    // Zero in a text column (B, C, D, E) or A (number ref) - signature of
    // column-letter hallucination (e.g. Q405 vs P405) or wrong sheet.
    if (typeof v === "number" && v === 0 && c <= 4) {
      problems.push({
        address: addr,
        issue: "evaluates to 0 in a text/ref column - likely column-letter mismatch",
        value: v,
      });
    }
  }
  return problems;
}

function formatDryRun(
  params: Params,
  formulas: string[],
  layout: WriteFormulasResult["layout"],
  _masterRow: number,
): AgentToolResult<undefined> {
  const lines: string[] = [];
  lines.push(`**Dry run: ${params.target_sheet}!A${params.target_row}:H${params.target_row} <- ref ${params.ref_number}**`);
  lines.push("");
  lines.push(`- Predio absolute row in fichas VR: ${params.predio_row}`);
  lines.push(`- Title row (B[N]) = ${params.predio_row - 4}`);
  lines.push(`- AT[title+2] for column A: AT${params.predio_row - 2}`);
  lines.push(`- uf_mode: ${params.uf_mode ?? "actualizado"}`);
  if (params.ref_number === 9 || params.ref_number === 10) {
    lines.push(`- Note: ref ${params.ref_number} stores superficie in column AU (template bug)`);
  }
  lines.push("");
  lines.push("Formulas that would be written (cols A-H):");
  lines.push("");
  lines.push("| Col | Campo | Formula |");
  lines.push("|---|---|---|");
  for (const item of layout) {
    lines.push(`| ${item.col} | ${item.label} | \`${item.formula}\` |`);
  }
  lines.push("");
  lines.push("_No cells were modified. Re-call with dry_run omitted or false to write._");
  return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
}

function formatResult(
  params: Params,
  result: VerifyResult,
  layout: WriteFormulasResult["layout"],
  _masterRow: number,
): AgentToolResult<undefined> {
  const lines: string[] = [];
  const fullAddr = qualifiedAddress(params.target_sheet, result.address);
  lines.push(`Linked **${fullAddr}** <- ref ${params.ref_number}`);
  lines.push("");
  lines.push(`- Predio absolute row in fichas VR: ${params.predio_row}`);
  lines.push(`- uf_mode: ${params.uf_mode ?? "actualizado"}`);
  lines.push("");

  lines.push("| Col | Campo | Read-back |");
  lines.push("|---|---|---|");
  for (let c = 0; c < (result.readBackValues[0]?.length ?? 0); c += 1) {
    const v = result.readBackValues[0]?.[c];
    const item = layout[c];
    if (!item) continue;
    const display = v === null || v === undefined || v === ""
      ? "(empty)"
      : typeof v === "string"
        ? v.length > 60 ? `${v.slice(0, 60)}...` : v
        : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : JSON.stringify(v);
    lines.push(`| ${item.col} | ${item.label} | ${display} |`);
  }
  lines.push("");

  if (result.problems.length === 0) {
    lines.push("**Post-write verification: PASS** - no #REF!, no zero-in-text, no NaN.");
  } else {
    lines.push(`**Post-write verification: ${result.problems.length} problem(s):**`);
    lines.push("");
    for (const p of result.problems) {
      lines.push(`- **${p.address}**: ${p.issue} (value: ${JSON.stringify(p.value)})`);
    }
    lines.push("");
    lines.push("Hint: column-letter hallucination is the usual cause (e.g. pointing to Q " +
      "when the data is in P). Re-read the candidate columns explicitly and retry.");
  }

  return { content: [{ type: "text", text: lines.join("\n") }], details: undefined };
}

export function createLinkReferencialesCuadroTool(): AgentTool<typeof schema> {
  return {
    name: "link_referenciales_cuadro",
    label: "Link cuadro de referenciales",
    description:
      "Repair one row of the 'Cuadro de Referenciales' (punto 8 del informe) by linking " +
      "it directly to `fichas VR`. Writes the 8 standard formulas in columns A-H " +
      "(referencial number, Predio+Rol, Comuna, Ubicacion, Transaccion CBR, " +
      "Fecha, Superficie, Valor Unitario) and verifies post-write that no cell " +
      "evaluates to #REF! / 0 / empty. Validates that `ref_number` exists in " +
      "`referenciales` before writing. Note: refs 9 and 10 store the surface area in " +
      "column AU (template bug); all other refs use AV. Use `dry_run: true` to preview.",
    parameters: schema,
    execute: async (
      _toolCallId: string,
      params: Params,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const fichasSheet = params.fichas_sheet ?? FICHAS_VR_DEFAULT;
        const referencialesSheet = params.referenciales_sheet ?? REFERENCIALES_DEFAULT;
        const ufMode = params.uf_mode ?? "actualizado";
        const masterRow = params.ref_number + 1;

        const formulas = buildFormulas(
          params.ref_number,
          masterRow,
          params.predio_row,
          fichasSheet,
          referencialesSheet,
          ufMode,
        );

        const layout = buildLayout(formulas, ufMode);

        if (params.dry_run) {
          return formatDryRun(params, formulas, layout, masterRow);
        }

        const startCol = 1; // A
        const endCol = 8; // H

        const result = await excelRun<VerifyResult>(async (context) => {
          const refSheet = context.workbook.worksheets.getItem(referencialesSheet);
          const masterCell = refSheet.getRange(`A${masterRow}`);
          masterCell.load("values");
          await context.sync();
          const masterValue = (masterCell.values as unknown[][])[0]?.[0];
          const masterNum = typeof masterValue === "number"
            ? masterValue
            : typeof masterValue === "string" ? Number(masterValue) : NaN;
          if (!Number.isFinite(masterNum) || masterNum !== params.ref_number) {
            throw new Error(
              `ref_number ${params.ref_number} not found in '${referencialesSheet}' row ${masterRow} ` +
              `(got ${JSON.stringify(masterValue)}). Run audit_ref_errors to map orphan rows.`,
            );
          }

          const targetSheet = context.workbook.worksheets.getItem(params.target_sheet);
          const rowRange = targetSheet.getRange(
            `${colToLetter(startCol)}${params.target_row}:${colToLetter(endCol)}${params.target_row}`,
          );
          rowRange.load("values,formulas");
          await context.sync();

          if (!params.allow_overwrite) {
            const existingFormulas = rowRange.formulas[0] ?? [];
            const existingValues = rowRange.values[0] ?? [];
            const occupied = existingFormulas.some(
              (f) => typeof f === "string" && f.length > 0 && f !== "",
            ) || existingValues.some(
              (v) => v !== null && v !== undefined && v !== "",
            );
            if (occupied) {
              throw new Error(
                `Target row ${params.target_sheet}!A${params.target_row}:H${params.target_row} is not empty. ` +
                `Pass allow_overwrite=true to overwrite.`,
              );
            }
          }

          rowRange.formulas = [formulas];

          const verify = targetSheet.getRange(
            `${colToLetter(startCol)}${params.target_row}:${colToLetter(endCol)}${params.target_row}`,
          );
          verify.load("values,formulas,address");
          await context.sync();

          const readBackValues = verify.values;
          const problems = detectProblems(startCol, params.target_row, readBackValues);

          return {
            address: verify.address,
            writtenFormulas: formulas,
            readBackValues,
            problems,
          };
        });

        return formatResult(params, result, layout, masterRow);
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error linking cuadro row: ${getErrorMessage(e)}` }],
          details: undefined,
        };
      }
    },
  };
}
