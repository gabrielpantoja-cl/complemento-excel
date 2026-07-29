---
description: Audit the cuadro de referenciales for broken #REF! errors and offset mismatches in `fichas VR`. Dispatches to @qa-excel.
agent: qa-excel
subtask: true
---

Run a deep audit of the "Cuadro de Referenciales" (punto 8 del informe
de tasacion) wiring. Focus on three failure modes that have hit this
project before (see `docs/transcripts/sessions/`):

1. **#REF! values in the cuadro.** Search across all lote sheets
   (`81`-`100`) for cells containing the literal text `#REF!` and for
   formulas that concatenate over a `#REF!` substring
   (`=#REF!&...`). The signature of the cuadro roto bug.

2. **Column-letter hallucination.** Especially the Calle de referencia
   field which lives in column P (not Q) of the fichas VR bloque --
   pointing to Q produces `0.0000e+0`. Verify any formula of the
   pattern `='fichas VR'!Q[predio+...]` is not actually targeting Q.

3. **Sheet-name dependency on `referenciales`.** The cuadro's
   Transaccion column originally read from `referenciales!B/C/D` for
   foja/N/ano. If that sheet was renamed or deleted, the field
   resolves to `#REF!`. The canonical fix uses `fichas VR!I[predio+44..+46]`
   instead (see `link_referenciales_cuadro` tool).

Use `git log --oneline -- src/tools/link-referenciales-cuadro.ts
src/tools/audit-ref-errors.ts src/tools/cuadro-referenciales*` to find
the relevant commit history (the canonical pattern was added in
`0f052da`).

For each failure mode found, report:
- Sheet + cell address
- The formula (if any)
- A concrete one-line fix the build agent can apply

Do not edit files -- you are a diagnostician.
