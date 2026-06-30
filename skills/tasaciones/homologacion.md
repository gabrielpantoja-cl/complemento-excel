---
name: tasaciones/homologacion
description: Homologar referenciales rurales aplicando los 7 factores de ajuste. Produce un valor unitario ajustado ($/m²) listo para el informe de tasación.
---

# Skill: Homologación de Referenciales Rurales

Aplica los 7 factores de homologación conforme a la metodología estándar chilena de tasación rural.

## Prerequisite

The active sheet must contain comparable sales (referenciales). Minimum required columns:
- Surface area (m²)
- Sale price (CLP or UF)
- Date of transaction
- Location / commune
- Transaction type: sale (compraventa) or listing (oferta)

Optional but recommended: ROL SII, CBR inscription data, land class (clase de suelo).

## Workflow

### Step 1 — Read and validate comparables

1. Read the sheet with `read_range` to identify columns.
2. Verify each comparable has ROL SII + CBR inscription (trazability rule).
3. Flag any comparable missing these fields — ask the user whether to exclude it.

### Step 2 — Normalize prices to UF at valuation date

```
# Ask the user for: valuation_date, uf_at_valuation_date (CLP/UF)
# For each comparable:
if transaction_type == "oferta":
    price_clp = price_clp * 0.88   # 12% discount for asking prices
uf_value_at_sale = (price_clp / surface_m2) / uf_at_sale_date
uf_at_valuation = uf_value_at_sale  # UF is self-adjusting, no update needed
```

> UF already adjusts for inflation — no restatement needed. Only apply the 12% discount to *ofertas*.

### Step 3 — Collect the 7 homologation factors

Ask the user to rate each comparable on each factor, or accept defaults (1.00 = neutral):

| Factor | Range | Question to ask |
|---|---|---|
| F_ubic | 0.70–1.30 | ¿El referencial está más cerca o más lejos de centros urbanos que el predio tasado? |
| F_acc | 0.75–1.25 | ¿La accesibilidad vial del referencial es mejor o peor? |
| F_sup | 0.85–1.15 | ¿La superficie del referencial es mucho mayor o menor? |
| F_forma | 0.90–1.10 | ¿La forma del referencial es más o menos regular? |
| F_topo | 0.75–1.20 | ¿La topografía del referencial es más o menos favorable? |
| F_uso | 0.70–1.30 | ¿La capacidad de uso agrícola (clase Klingebiel) es mejor o peor? |
| F_rest | 0.60–1.00 | ¿El referencial tiene más o menos restricciones (servidumbres, DL 3516)? |

### Step 4 — Calculate composite factor and adjusted value

```
F_compuesto = F_ubic × F_acc × F_sup × F_forma × F_topo × F_uso × F_rest

# Validation
if F_compuesto < 0.50 or F_compuesto > 1.50:
    EXCLUDE — comparable is too dissimilar, flag to user

valor_ajustado_uf_m2 = valor_referencial_uf_m2 × F_compuesto
```

### Step 5 — Compute final unit value

```
valor_unitario_ajustado = mean(valor_ajustado_uf_m2 for all accepted comparables)
```

Report median and standard deviation as well to show dispersion.

### Step 6 — Write results

Write the homologation table to a new sheet named `HOMOLOGACION` (or adjacent columns if the user prefers):

| Column | Content |
|---|---|
| A | ID referencial |
| B | Superficie (m²) |
| C | Precio (UF/m²) |
| D | Tipo (venta/oferta) |
| E | Descuento oferta |
| F–L | F_ubic, F_acc, F_sup, F_forma, F_topo, F_uso, F_rest |
| M | F_compuesto |
| N | Valor ajustado (UF/m²) |
| O | Incluido (Sí/No) |

Add a summary row with the mean, median, and count of accepted comparables.
Format all UF/m² values as `#.##0,00` and all factors as `0,000`.
Mark parameter cells (UF value, valuation date) with style "input" (yellow fill).

## Output

- Sheet `HOMOLOGACION` with the full comparison table
- Summary: `Valor Unitario Ajustado = X,XX UF/m²` (N referenciales aceptados)
- Flag any excluded comparables with reason
