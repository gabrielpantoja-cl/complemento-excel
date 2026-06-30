---
name: tasaciones/honorarios
description: Calcular honorarios periciales aplicando la tabla de tramos chilena, retención SII del 10,75% y distribución entre miembros de la comisión.
---

# Skill: Cálculo de Honorarios Periciales

Calcula los honorarios de la comisión pericial conforme a la tabla de tramos estándar chilena.

## Prerequisite

- Total appraisal value (valor total de la tasación) in UF
- Number of appraisers in the commission (número de peritos)
- Current UF value in CLP (for CLP conversion)

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

## Workflow

### Step 1 — Read inputs

Ask the user for (or read from a named cell):
- `valor_tasacion_uf` — total appraisal value in UF
- `num_peritos` — number of appraisers
- `uf_hoy` — current UF value in CLP

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

retencion_sii = honorario_bruto_por_perito × 0.1075
honorario_liquido_por_perito = honorario_bruto_por_perito - retencion_sii
```

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
| Retención SII (10,75%) | XX,XX | $ XX.XXX |
| **Honorario líquido por perito** | **XX,XX** | **$ XXX.XXX** |
| Número de peritos | N | |

Use `#.##0,00` for UF and `$ #.##0` for CLP. Bold the liquid fee row.
Use `style: "total-row"` for the final row and `style: "input"` for input cells.

## Output

Summary of gross fees, SII withholding, and net per appraiser — in both UF and CLP.
