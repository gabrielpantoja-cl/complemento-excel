---
name: tasaciones/faja-vial
description: Calcular la indemnización por expropiación de faja vial existente conforme al Art. 24 del DFL 850/1997 (30% del valor base del suelo).
---

# Skill: Expropiación de Faja Vial Existente

Aplica el Art. 24 del DFL 850/1997 (Ley de Caminos) para calcular la indemnización
de terrenos comprendidos dentro de la faja vial existente de una carretera.

## Key legal rule

> Art. 24 DFL 850/1997: "Los terrenos comprendidos dentro de la faja fiscal de los
> caminos públicos existentes serán indemnizados en un 30% del valor base del suelo."

This 30% rule applies **only** to the existing right-of-way (faja fiscal), not to
newly expropriated areas outside the existing faja. The base value must be explicitly
defined and calculated in the report.

**Do not** apply improvement or pasture values — this is a road corridor, not productive farmland.

## Prerequisite

- Confirmed that the expropriated land falls within the *existing* faja vial (not newly acquired)
- Base land value (valor base del suelo) calculated using comparables
- Area to be expropriated (m²)

## Workflow

### Step 1 — Confirm legal applicability

Ask the user:
1. "¿El terreno expropiado está dentro de la faja fiscal de un camino público *existente*?" → must be YES
2. "¿Existe un decreto que define el ancho de la faja vial en este sector?" → record the decree number
3. "¿La tasación corresponde a terreno bruto de camino (sin considerar mejoras)?" → must be YES

If the answer to #1 is NO, this skill does not apply — use the standard expropriation workflow instead.

### Step 2 — Read inputs

| Input | Cell / Source |
|---|---|
| `valor_base_suelo_uf_m2` | From the comparables / homologation sheet |
| `area_faja_m2` | Engineering survey or legal file |
| `uf_hoy` | Current UF value in CLP |

Mark input cells with `style: "input"` (yellow fill).

### Step 3 — Calculate indemnization

```
# Full land value of the strip
valor_pleno_uf = valor_base_suelo_uf_m2 × area_faja_m2

# Art. 24 DFL 850 discount: 30% of full value
factor_faja = 0.30
indemnizacion_uf = valor_pleno_uf × factor_faja

indemnizacion_clp = indemnizacion_uf × uf_hoy
```

### Step 4 — Write table

| Concept | Value |
|---|---|
| Valor base del suelo (UF/m²) | X,XX |
| Área de la faja (m²) | X.XXX,XX |
| Valor pleno del terreno (UF) | X.XXX,XX |
| Factor Art. 24 DFL 850/1997 | 30% |
| **Indemnización faja vial (UF)** | **X.XXX,XX** |
| **Indemnización faja vial (CLP)** | **$ XX.XXX.XXX** |

Apply `style: "total-row"` to the final rows.
Add a footnote cell referencing the legal basis: "Art. 24 DFL 850/1997 — terreno comprendido en faja vial existente."

### Step 5 — Verify

- Confirm the base land value cell is referenced (not hardcoded) in the formula.
- Confirm no construction or improvement values are included.
- Confirm the 30% factor is in an input cell (not hardcoded in the formula).
- Confirm the legal reference (Art. 24 DFL 850/1997) is documented in a cell or comment.

## Output

Indemnization table with: base value, affected area, full value, 30% factor, and final amount in UF and CLP.
