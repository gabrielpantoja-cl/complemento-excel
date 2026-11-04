/**
 * SII withholding (retención de boletas de honorarios) — dated rate table.
 *
 * Ley 21.133 (2019) replaced the flat 10 % withholding with a yearly ramp that
 * ends in 2028. The rate therefore depends on the **commercial year of the
 * boleta**, never on "today": a fee liquidated in 2026 for work invoiced in
 * 2024 withholds at the 2024 rate.
 *
 * Deliberately pure and date-free. Nothing here may read the system clock:
 * this table is rendered into the static system prompt, and a value that
 * changes between turns would invalidate the prompt cache prefix on every
 * request (see AGENTS.md, "Prompt caching gotchas").
 *
 * Source: SII, "Boletas de honorarios electrónicas" / noticia 26-12-2025
 * (2026 = 15,25 %, up from 14,5 % in 2025, rising to 16 % in 2027 and 17 %
 * from 2028), Ley 21.133.
 */

/** The statute that sets the ramp, for citation in generated report text. */
export const RETENCION_SII_LEY = "Ley 21.133";

/**
 * Flat rate in force for commercial years before the ramp began.
 * Kept because historic peritajes are re-liquidated and audited.
 */
export const RETENCION_SII_RATE_BEFORE_RAMP = 10;

/** First commercial year covered by the Ley 21.133 ramp. */
export const RETENCION_SII_FIRST_RAMP_YEAR = 2020;

/** Year the ramp reaches its final rate; it does not rise after this. */
export const RETENCION_SII_FINAL_RAMP_YEAR = 2028;

/**
 * Rate per commercial year, as a percentage of the gross fee.
 * Ordered oldest-first; rendering depends on this order being stable.
 */
const RETENCION_SII_SCHEDULE: ReadonlyArray<readonly [year: number, rate: number]> = [
  [2020, 10.75],
  [2021, 11.5],
  [2022, 12.25],
  [2023, 13],
  [2024, 13.75],
  [2025, 14.5],
  [2026, 15.25],
  [2027, 16],
  [2028, 17],
];

const RETENCION_SII_BY_YEAR: ReadonlyMap<number, number> = new Map(RETENCION_SII_SCHEDULE);

/** Why a given rate applies — surfaced so tools can explain themselves. */
export type RetencionSiiBasis = "pre-ramp" | "scheduled" | "post-ramp";

export interface RetencionSii {
  /** The commercial year the rate was resolved for. */
  readonly year: number;
  /** Withholding rate as a percentage (e.g. 15.25 for 15,25 %). */
  readonly rate: number;
  /** Rate as a multiplier ready for arithmetic (e.g. 0.1525). */
  readonly fraction: number;
  readonly basis: RetencionSiiBasis;
}

function assertCommercialYear(year: number): void {
  if (!Number.isInteger(year)) {
    throw new Error(
      `SII withholding needs the boleta's commercial year as an integer; received ${String(year)}.`,
    );
  }

  if (year < 1900 || year > 2999) {
    throw new Error(
      `SII withholding year ${year} is outside the plausible range 1900–2999; check the boleta date.`,
    );
  }
}

/**
 * Resolve the withholding rate for a boleta issued in `year`.
 *
 * @param year Commercial year of the boleta. Must be explicit — if the caller
 *   does not know it, ask; do not substitute the current year.
 * @throws If `year` is not a plausible integer commercial year.
 */
export function resolveRetencionSii(year: number): RetencionSii {
  assertCommercialYear(year);

  const scheduled = RETENCION_SII_BY_YEAR.get(year);

  if (scheduled !== undefined) {
    return { year, rate: scheduled, fraction: scheduled / 100, basis: "scheduled" };
  }

  if (year < RETENCION_SII_FIRST_RAMP_YEAR) {
    return {
      year,
      rate: RETENCION_SII_RATE_BEFORE_RAMP,
      fraction: RETENCION_SII_RATE_BEFORE_RAMP / 100,
      basis: "pre-ramp",
    };
  }

  const finalRate = RETENCION_SII_BY_YEAR.get(RETENCION_SII_FINAL_RAMP_YEAR);

  if (finalRate === undefined) {
    throw new Error("SII withholding schedule is missing its final year; the table is corrupt.");
  }

  return { year, rate: finalRate, fraction: finalRate / 100, basis: "post-ramp" };
}

/** Convenience accessor when only the percentage is needed. */
export function getRetencionSiiRate(year: number): number {
  return resolveRetencionSii(year).rate;
}

/** Format a rate in Chilean convention: decimal comma, no trailing zeros. */
export function formatRetencionSiiRate(rate: number): string {
  const trimmed = Number.isInteger(rate) ? String(rate) : String(rate).replace(".", ",");
  return `${trimmed}%`;
}

/**
 * Withholding and net amount for one gross fee.
 *
 * Rounding is left to the caller: UF carries two decimals, CLP none, and the
 * workbook decides which it is writing.
 */
export function applyRetencionSii(
  grossFee: number,
  year: number,
): { readonly retencion: number; readonly net: number; readonly applied: RetencionSii } {
  if (!Number.isFinite(grossFee)) {
    throw new Error(`Gross fee must be a finite number; received ${String(grossFee)}.`);
  }

  const applied = resolveRetencionSii(year);
  const retencion = grossFee * applied.fraction;

  return { retencion, net: grossFee - retencion, applied };
}

/**
 * Gross fee that yields `netFee` after withholding — the "boleta por líquido"
 * case the SII documents as dividing by (1 − tasa).
 */
export function grossFromNetRetencionSii(netFee: number, year: number): number {
  if (!Number.isFinite(netFee)) {
    throw new Error(`Net fee must be a finite number; received ${String(netFee)}.`);
  }

  const applied = resolveRetencionSii(year);
  return netFee / (1 - applied.fraction);
}

/**
 * Markdown rows of the schedule, for the system prompt and skill text.
 * Pure function of a frozen table, so the output is byte-stable across turns.
 */
export function renderRetencionSiiTable(): string {
  const rows = RETENCION_SII_SCHEDULE.map(
    ([year, rate]) =>
      `| ${year}${year === RETENCION_SII_FINAL_RAMP_YEAR ? " y siguientes" : ""} | ${formatRetencionSiiRate(rate)} |`,
  );

  return [
    "| Año comercial de la boleta | Retención |",
    "|---|---|",
    `| hasta ${RETENCION_SII_FIRST_RAMP_YEAR - 1} | ${formatRetencionSiiRate(RETENCION_SII_RATE_BEFORE_RAMP)} |`,
    ...rows,
  ].join("\n");
}

/** One-line summary of the schedule, for compact contexts. */
export function renderRetencionSiiSummary(): string {
  const pairs = RETENCION_SII_SCHEDULE.map(
    ([year, rate]) => `${year}: ${formatRetencionSiiRate(rate)}`,
  ).join("; ");

  return `${pairs} (${RETENCION_SII_FINAL_RAMP_YEAR} onward unchanged); ${RETENCION_SII_FIRST_RAMP_YEAR - 1} and earlier: ${formatRetencionSiiRate(RETENCION_SII_RATE_BEFORE_RAMP)}. Ramp set by ${RETENCION_SII_LEY}.`;
}

/** The schedule as data, for tests and for tools that render their own view. */
export function listRetencionSiiSchedule(): ReadonlyArray<readonly [year: number, rate: number]> {
  return RETENCION_SII_SCHEDULE;
}
