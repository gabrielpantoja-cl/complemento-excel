---
name: tasaciones/verificar-consistencia
description: Checklist de validación para un informe de tasación o peritaje chileno. Verifica datos, formatos, trazabilidad y consistencia aritmética.
---

# Skill: Verificar Consistencia del Informe

Checklist exhaustivo para validar un informe de tasación antes de firmarlo.
Run this skill on the workbook after all calculations are complete.

## Workflow

Read each sheet in the workbook, then verify each item below.
Report findings as a checklist: ✓ pass, ✗ fail (with cell reference), ⚠ warning.

---

### 1. Property identity

- [ ] ROL SII present and in valid format (`commune_code-roll` or `XXXX-XXX`)
- [ ] Property address matches the legal file
- [ ] SII land-use destination code is recorded (A/H/W/etc.)
- [ ] If SII shows W (Sitio Eriazo) but zoning is Agrícola — both are reported
- [ ] Commune and region match the CBR jurisdiction

### 2. Dates

- [ ] Deed date (escritura) < inscription date (inscripción CBR)
- [ ] Inscription date ≤ valuation date (fecha de valoración)
- [ ] Date format is DD-MM-AAAA (not MM/DD/YYYY)
- [ ] Valuation date is explicitly stated in a labelled cell

### 3. Comparables (referenciales)

- [ ] Each comparable has ROL SII + CBR inscription number (trazability rule)
- [ ] No comparable is missing both ROL and CBR data
- [ ] Asking prices (ofertas) have the 12% discount applied
- [ ] All prices updated to valuation date UF (no raw CLP without UF conversion)
- [ ] Rural unit values are within plausible range: 0.1–500 UF/m²
- [ ] Comparables outside 0.50–1.50 composite factor are excluded and documented

### 4. Homologation factors

- [ ] All 7 factors are documented for each comparable (not just the composite)
- [ ] Each factor is within its valid range (see DOMAIN_KNOWLEDGE)
- [ ] Composite = product of 7 factors (verify formula, not just values)
- [ ] Accepted composite factors are within 0.50–1.50

### 5. Calculations

- [ ] Sum of components = total indemnization (arithmetic check)
- [ ] SEC recargo legal = exactly 20% of categories 1–5
- [ ] Faja vial factor = exactly 30% of base land value (if applicable)
- [ ] Fee brackets are applied progressively (not flat rate on total)
- [ ] SII withholding = exactly 10.75% of gross fee per appraiser

### 6. Cell conventions

- [ ] Parameter cells (UF value, date, rates) use `style: "input"` (yellow fill)
- [ ] No formula contains hardcoded UF values or interest rates — all reference input cells
- [ ] No `TEXT()` function with locale-dependent format strings
- [ ] Formulas reference cells by address, not by hardcoded values
- [ ] Negative values shown in parentheses or in red (not just with `-` sign) for financial tables

### 7. Number format (Chilean)

- [ ] Thousands separator is `.` (period), NOT `,` (comma)
- [ ] Decimal separator is `,` (comma), NOT `.` (period)
- [ ] UF values formatted as `#.##0,00`
- [ ] CLP values formatted as `$ #.##0`
- [ ] Area values formatted as `#.##0,00 m2`
- [ ] Percentage values formatted as `0,0%`
- [ ] All dates in DD-MM-AAAA format

### 8. Legal references

- [ ] Legal basis cited for each methodology (e.g. "DL 2.186 art. X", "DFL 850 art. 24")
- [ ] SEC indemnization: LGSE DFL 4/20.018 + DS 113 cited
- [ ] Faja vial: Art. 24 DFL 850/1997 cited
- [ ] Expert witness basis: CPC art. 411 cited if it's a judicial appraisal

---

## Summary report

After checking, produce a summary:

```
INFORME DE CONSISTENCIA — [property address] — [date]

✓ Passed: N items
✗ Failed: N items (list each with cell reference and description)
⚠ Warnings: N items

[List all failures and warnings here]

Recommendation: [APTO PARA FIRMA / REQUIERE CORRECCIONES]
```

Write this report to a sheet named `VERIFICACION` or to the current sheet if the user prefers.
