import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  RETENCION_SII_FINAL_RAMP_YEAR,
  RETENCION_SII_FIRST_RAMP_YEAR,
  RETENCION_SII_LEY,
  RETENCION_SII_RATE_BEFORE_RAMP,
  applyRetencionSii,
  formatRetencionSiiRate,
  getRetencionSiiRate,
  grossFromNetRetencionSii,
  listRetencionSiiSchedule,
  renderRetencionSiiSummary,
  renderRetencionSiiTable,
  resolveRetencionSii,
} from "../src/domain/retencion-sii.ts";
import { buildSystemPrompt } from "../src/prompt/system-prompt.ts";

/**
 * Rates verified against SII (noticia 26-12-2025: 2026 = 15,25 %, up from
 * 14,5 % in 2025, 16 % in 2027, 17 % from 2028) and the Ley 21.133 ramp of
 * +0,75 pp per year from 10,75 % in 2020, with a final +1 pp step in 2028.
 */
const EXPECTED_RATES: ReadonlyArray<readonly [number, number]> = [
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

void test("Ley 21.133 ramp matches the SII schedule year by year", () => {
  for (const [year, rate] of EXPECTED_RATES) {
    assert.equal(getRetencionSiiRate(year), rate, `rate for ${year}`);
    assert.equal(resolveRetencionSii(year).basis, "scheduled", `basis for ${year}`);
  }
});

void test("the 2020 rate is no longer used for later years", () => {
  // The bug this table replaces: 10.75 hardcoded everywhere.
  for (const year of [2024, 2025, 2026, 2027, 2028]) {
    assert.notEqual(getRetencionSiiRate(year), 10.75, `${year} must not use the 2020 rate`);
  }
});

void test("years before the ramp use the flat pre-Ley rate", () => {
  for (const year of [2015, 2018, RETENCION_SII_FIRST_RAMP_YEAR - 1]) {
    const resolved = resolveRetencionSii(year);
    assert.equal(resolved.rate, RETENCION_SII_RATE_BEFORE_RAMP);
    assert.equal(resolved.basis, "pre-ramp");
  }
});

void test("the rate stops rising after the final ramp year", () => {
  const final = resolveRetencionSii(RETENCION_SII_FINAL_RAMP_YEAR);

  for (const year of [2029, 2035, 2100]) {
    const resolved = resolveRetencionSii(year);
    assert.equal(resolved.rate, final.rate, `rate for ${year}`);
    assert.equal(resolved.basis, "post-ramp");
  }
});

void test("the schedule rises monotonically and is ordered oldest-first", () => {
  const schedule = listRetencionSiiSchedule();

  for (let index = 1; index < schedule.length; index += 1) {
    const [previousYear, previousRate] = schedule[index - 1];
    const [year, rate] = schedule[index];

    assert.equal(year, previousYear + 1, `years must be contiguous around ${year}`);
    assert.ok(rate > previousRate, `rate must rise from ${previousYear} to ${year}`);
  }
});

void test("a non-integer or implausible year is rejected rather than guessed", () => {
  assert.throws(() => resolveRetencionSii(Number.NaN), /commercial year/);
  assert.throws(() => resolveRetencionSii(2026.5), /commercial year/);
  assert.throws(() => resolveRetencionSii(26), /plausible range/);
  assert.throws(() => resolveRetencionSii(-2026), /plausible range/);
});

void test("withholding and net are computed from the boleta's year", () => {
  const { retencion, net, applied } = applyRetencionSii(100_000, 2026);

  assert.equal(applied.rate, 15.25);
  assert.ok(Math.abs(retencion - 15_250) < 1e-6, `expected ~15250, got ${retencion}`);
  assert.ok(Math.abs(net - 84_750) < 1e-6, `expected ~84750, got ${net}`);
});

/** The module returns unrounded values on purpose; compare within float noise. */
function assertClose(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${message}: expected ~${expected}, got ${actual}`,
  );
}

void test("the same gross fee withholds differently across years", () => {
  const twentyFour = applyRetencionSii(100_000, 2024).retencion;
  const twentySix = applyRetencionSii(100_000, 2026).retencion;

  assertClose(twentyFour, 13_750, "2024 withholding");
  assertClose(twentySix, 15_250, "2026 withholding");
  assertClose(twentySix - twentyFour, 1_500, "difference between 2024 and 2026");
});

void test("gross from net inverts the withholding", () => {
  const gross = grossFromNetRetencionSii(84_750, 2026);

  assert.ok(Math.abs(gross - 100_000) < 1e-6, `expected ~100000, got ${gross}`);
  assert.ok(Math.abs(applyRetencionSii(gross, 2026).net - 84_750) < 1e-6);
});

void test("a non-finite fee is rejected", () => {
  assert.throws(() => applyRetencionSii(Number.NaN, 2026), /finite number/);
  assert.throws(() => grossFromNetRetencionSii(Number.POSITIVE_INFINITY, 2026), /finite number/);
});

void test("rates render in Chilean convention", () => {
  assert.equal(formatRetencionSiiRate(15.25), "15,25%");
  assert.equal(formatRetencionSiiRate(16), "16%");
  assert.equal(formatRetencionSiiRate(10.75), "10,75%");
});

void test("the rendered table is byte-stable, so it cannot churn the prompt prefix", () => {
  assert.equal(renderRetencionSiiTable(), renderRetencionSiiTable());
  assert.equal(renderRetencionSiiSummary(), renderRetencionSiiSummary());
});

void test("the rendered table covers every year plus the pre-ramp row", () => {
  const table = renderRetencionSiiTable();

  assert.match(table, /hasta 2019 \| 10%/);
  assert.match(table, /2028 y siguientes \| 17%/);

  for (const [year, rate] of EXPECTED_RATES) {
    assert.ok(
      table.includes(`| ${year}${year === RETENCION_SII_FINAL_RAMP_YEAR ? " y siguientes" : ""} | ${formatRetencionSiiRate(rate)} |`),
      `table row for ${year}`,
    );
  }
});

void test("the system prompt carries the dated table, not a single rate", () => {
  const prompt = buildSystemPrompt();

  assert.match(prompt, /SII withholding \(retención\)/);
  assert.ok(prompt.includes(renderRetencionSiiTable()), "prompt must embed the rendered table");
  assert.ok(prompt.includes(RETENCION_SII_LEY), "prompt must cite the statute");
  assert.match(prompt, /commercial year of\s+the boleta/, "prompt must key the rate to the boleta year");
  assert.match(prompt, /ask for it/i, "prompt must tell the model to ask when the year is unknown");
});

void test("the system prompt no longer states the 2020 rate as the rate", () => {
  const prompt = buildSystemPrompt();

  assert.doesNotMatch(prompt, /Apply 10\.75% SII withholding/);
  assert.doesNotMatch(prompt, /10,75% SII/);
});

/**
 * Lockstep guard. Skill text is prose the model reads as authority, so a rate
 * written there must exist in the table above. This is the check that would
 * have caught the original bug: 10,75 % survived in three skill files and the
 * prompt for six commercial years.
 */
const SKILLS_WITH_RATES: readonly string[] = [
  "skills/tasaciones/honorarios.md",
  "skills/tasaciones/verificar-consistencia.md",
];

const ALL_SKILL_AND_PROMPT_SOURCES: readonly string[] = [
  ...SKILLS_WITH_RATES,
  "skills/tasaciones/SKILL.md",
  "skills/tasaciones/cuadro-referenciales.md",
  "skills/tasaciones/faja-vial.md",
  "skills/tasaciones/homologacion.md",
  "skills/tasaciones/sec-indemnizacion.md",
];

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function knownRateStrings(): ReadonlySet<string> {
  const known = new Set<string>([formatRetencionSiiRate(RETENCION_SII_RATE_BEFORE_RAMP)]);

  for (const [, rate] of listRetencionSiiSchedule()) {
    known.add(formatRetencionSiiRate(rate));
    known.add(`${String(rate)}%`);
  }

  return known;
}

void test("skill text quotes no withholding rate absent from the table", async () => {
  const known = knownRateStrings();

  for (const path of ALL_SKILL_AND_PROMPT_SOURCES) {
    const contents = await readRepoFile(path);
    const retencionLines = contents
      .split("\n")
      .filter((line) => /retenci[oó]n|withholding/i.test(line));

    for (const line of retencionLines) {
      for (const match of line.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/g)) {
        const normalised = `${match[1].replace(".", ",")}%`;
        const plain = `${match[1].replace(",", ".")}%`;

        assert.ok(
          known.has(normalised) || known.has(plain),
          `${path}: "${match[0]}" is not a rate in the Ley 21.133 table — update src/domain/retencion-sii.ts or fix the text.\n  ${line.trim()}`,
        );
      }
    }
  }
});

void test("the honorarios skill reproduces the table exactly", async () => {
  const contents = await readRepoFile("skills/tasaciones/honorarios.md");

  assert.match(contents, /hasta 2019 \| 10%/);

  for (const [year, rate] of listRetencionSiiSchedule()) {
    const suffix = year === RETENCION_SII_FINAL_RAMP_YEAR ? " y siguientes" : "";
    assert.ok(
      contents.includes(`| ${year}${suffix} | ${formatRetencionSiiRate(rate)} |`),
      `honorarios.md is missing the ${year} row`,
    );
  }

  assert.ok(
    contents.includes("src/domain/retencion-sii.ts"),
    "honorarios.md must point at the source of truth",
  );
});

void test("skills tell the model to ask for the boleta year", async () => {
  for (const path of SKILLS_WITH_RATES) {
    const contents = await readRepoFile(path);
    assert.match(contents, /año comercial de la boleta/i, `${path} must key the rate to the boleta year`);
  }
});

void test("no rate is hardcoded as a multiplier in skill formulas", async () => {
  for (const path of SKILLS_WITH_RATES) {
    const contents = await readRepoFile(path);
    assert.doesNotMatch(contents, /×\s*0\.1075/, `${path} still multiplies by the 2020 rate`);
  }
});
