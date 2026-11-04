---
name: tasaciones/honorarios
description: Calcular honorarios periciales aplicando la tabla de tramos chilena, la retención SII vigente según el año comercial de la boleta (Ley 21.133) y la distribución entre miembros de la comisión.
---

# Skill: Cálculo de Honorarios Periciales

Calcula los honorarios de la comisión pericial conforme a la tabla de tramos estándar chilena.

## Prerequisite

- Total appraisal value (valor total de la tasación) in UF
- Number of appraisers in the commission (número de peritos)
- Current UF value in CLP (for CLP conversion)
- **Año comercial de la boleta** — determines the withholding rate. If it is not
  stated in the workbook or by the user, **ask**. Do not assume the present year:
  a fee liquidated today for a boleta of an earlier year withholds at that
  year's rate.

## Fee schedule (tabla de tramos)

| Range (UF) | Rate |
|---|---|
| Up to 1,000 UF | 10% |
| 1,001–3,000 UF | 8% |
| 3,001–5,000 UF | 7% |
| 5,001–10,000 UF | 6% |
| Over 10,000 UF | 5% |
| Minimum per appraiser | 3.5 UF |

Fees apply **progressively by bracket** (like income tax brackets), not to the full amount at a single rate.

## Retención SII (tabla fechada — Ley 21.133)

The withholding rate is **not a constant**. Ley 21.133 replaced the flat 10 %
with a yearly ramp that ends in 2028. Pick the row matching the **año comercial
de la boleta**.

| Año comercial de la boleta | Retención |
|---|---|
| hasta 2019 | 10% |
| 2020 | 10,75% |
| 2021 | 11,5% |
| 2022 | 12,25% |
| 2023 | 13% |
| 2024 | 13,75% |
| 2025 | 14,5% |
| 2026 | 15,25% |
| 2027 | 16% |
| 2028 y siguientes | 17% |

Source of truth in code: `src/domain/retencion-sii.ts`. If this table and that
module ever disagree, the module wins and `npm run test:context` fails.

## Workflow

### Step 1 — Read inputs

Ask the user for (or read from a named cell):
- `valor_tasacion_uf` — total appraisal value in UF
- `num_peritos` — number of appraisers
- `uf_hoy` — current UF value in CLP
- `anio_boleta` — commercial year of the boleta (ask if absent)

Mark these cells with style "input" (yellow fill).

### Step 2 — Calculate gross fees by bracket

```
honorario_bruto = 0

bracket_1 = min(valor_tasacion_uf, 1000) × 0.10
bracket_2 = max(0, min(valor_tasacion_uf, 3000) - 1000) × 0.08
bracket_3 = max(0, min(valor_tasacion_uf, 5000) - 3000) × 0.07
bracket_4 = max(0, min(valor_tasacion_uf, 10000) - 5000) × 0.06
bracket_5 = max(0, valor_tasacion_uf - 10000) × 0.05

honorario_bruto = bracket_1 + bracket_2 + bracket_3 + bracket_4 + bracket_5
```

### Step 3 — Apply minimum and SII withholding

```
honorario_bruto_por_perito = honorario_bruto / num_peritos
honorario_bruto_por_perito = max(honorario_bruto_por_perito, 3.5)  # minimum

tasa_retencion = lookup(anio_boleta)  # from the Retención SII table above
retencion_sii = honorario_bruto_por_perito × tasa_retencion
honorario_liquido_por_perito = honorario_bruto_por_perito - retencion_sii
```

If the fee was agreed **net** of withholding, invert it instead:

```
honorario_bruto_por_perito = honorario_liquido_por_perito / (1 - tasa_retencion)
```

Write the rate into its own cell and reference it from the formula. Never
hardcode the percentage inside the arithmetic: the next revision of the
workbook may fall in a different year.

### Step 4 — Write summary table

Create a table on a sheet or in the current sheet. Suggested layout:

| Concept | UF | CLP |
|---|---|---|
| Valor total tasación | X.XXX,XX | $ XX.XXX.XXX |
| Honorario bruto total | XX,XX | $ XXX.XXX |
| Tramo 1 (hasta 1.000 UF @ 10%) | | |
| Tramo 2 (1.001–3.000 UF @ 8%) | | |
| Tramo 3 (3.001–5.000 UF @ 7%) | | |
| Tramo 4 (5.001–10.000 UF @ 6%) | | |
| Tramo 5 (> 10.000 UF @ 5%) | | |
| Honorario bruto por perito | XX,XX | $ XXX.XXX |
| Año comercial de la boleta | AAAA | |
| Retención SII (tasa del año) | XX,XX | $ XX.XXX |
| **Honorario líquido por perito** | **XX,XX** | **$ XXX.XXX** |
| Número de peritos | N | |

Use `#.##0,00` for UF and `$ #.##0` for CLP. Bold the liquid fee row.
Use `style: "total-row"` for the final row and `style: "input"` for input cells.

## Output

Summary of gross fees, SII withholding, and net per appraiser — in both UF and CLP.
