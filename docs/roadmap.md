# Roadmap

**Last reviewed:** 2026-11-04

Public roadmap for Tasaciones by Loxos. Work is grouped in tracks, ordered by
impact. Each item should land as its own commit with `npm run check` green.
Internal planning (accounts, tenants, private presets) lives outside this repo.

Tracks A–E are product and platform work. Tracks F–M were derived on 2026-11-03
from a survey of the private appraisal repository (`tasaciones-peritajes`): its
31 active and ~160 archived peritajes, 30 skills, 14 agents, 11 commands, and
the real pre-delivery audit reports under each project's `trabajo/`. Every item
in F–M traces back to a procedure that already exists on the operator's side and
is executed outside Excel today. See [Where the backlog comes
from](#where-the-backlog-comes-from) for the evidence behind each track.

Nothing here is scheduled. The list is deliberately longer than any one stretch
of work: pick from it with [How to pick the next item](#how-to-pick-the-next-item).

## Now

| ID | Item | Status |
|---|---|---|
| P1 | **OpenRouter as a first-class provider.** Login row in `/login` + welcome overlay, default model (latest Claude Sonnet via `anthropic/claude-sonnet-*`, fallback `openrouter/auto`). Uses pi-ai's built-in `openrouter` registry (~250 models). | Shipped in code; needs Excel smoke |
| P2 | **Excel Desktop smoke with OpenRouter** (Windows, then macOS): login, stream, `write_cells` round-trip, `/model` switching between OpenRouter models. | Open |
| P3 | **Refresh Pi deps** (`pi-ai` / `pi-agent-core` are on `0.79.1`; npm has `1.x`). Follow `docs/architecture/model-updates.md` — the major bump needs an API review. **The live `pi-ai` dependency is actively causing conflicts** (see C8): it is the hub of the transitive tree, pinned tree-wide by the `overrides` entry `"@earendil-works/pi-ai": "$@earendil-works/pi-ai"` and guarded by `check:pi-lockstep`, so its resolution decides the versions of `zod`, `@anthropic-ai/sdk`, `@google/genai` → `@modelcontextprotocol/sdk`, `openai` and `@mistralai/mistralai` all at once. **Being worked in a separate session — do not bump Pi deps from here without syncing first**, or the two sessions will fight over `package-lock.json`. | In progress elsewhere |
| P4 | **Fix the 31 skipped tests** from `faf30ec` (Windows path bug, docs restructure, truncation format drift). | Open |
| P5 | **Template map (F1).** Nothing in F–M can be built reliably until the add-in knows the sheets of the master workbook by name. Cheap, unblocks a whole track. | Open |

## Track A — Providers

| ID | Item |
|---|---|
| A1 | OpenRouter: curated "featured" list in `/model` (free router, a cheap model, Sonnet, Opus) instead of the raw ~250-model list. |
| A2 | OpenRouter: send `HTTP-Referer` / `X-Title` attribution headers so usage shows up as "Tasaciones" on openrouter.ai. Check CORS preflight first. |
| A3 | OpenRouter: surface cost per turn using the registry's `cost` fields (ties into C1). |
| A4 | Boot-time migration for `pi-preset:*` records whose `baseUrl` changed, so users don't need Disconnect + Save. |
| A5 | Move provider display order from `ALL_PROVIDERS` into an explicit registry field. |
| A6 | Keep the landing's model examples (`public/index.html`) in sync with the registry. |

## Track B — Domain knowledge (Chile)

| ID | Item |
|---|---|
| B1 | Audit the `DOMAIN_KNOWLEDGE` block in `src/prompt/system-prompt.ts`: 7 homologation factors, fee calculation (retención done; brackets per mandante are I6), faja vial (DL 2.186), DFL 850. |
| B2 | Skills per sub-procedure under `skills/tasaciones/` (predio vs lote, escritura vs inscripción CBR, …), each with a worked example and common pitfalls. |
| B3 | 3–5 anonymised historic workbooks as smoke fixtures. Candidates with a written audit to check against: Lanco Res-10 (3 lotes, 4 refs), Valdivia Res-55 (multi-lote with sub-lots 1-A…2-C), Las Cabras Res-174/175/181/182 (concesiones, 54 lotes across 4 resolutions). |
| B4 | Jurisprudence block: CS Rol 31.423-2025 (fusion potential is not indemnisable; lucro cesante by lease needs proven continuity). Used to defend the report against a private counter-appraisal. |
| B5 | Record the Vialidad MOP best-practice process for comparables (2019 departmental recommendations) as a skill: deed-date UF indexation, rights-only sales, internet offers, rounding to two decimals. |

## Track C — Reliability & observability

| ID | Item |
|---|---|
| C1 | Tokens / latency / cache-hit / cost per turn in the status bar. |
| C2 | Snapshot tests for cell-coordinate handling in `write_cells`, `fill_formula`, `format_cells`, `modify_structure`. |
| C3 | Round-trip tests: workbook → tool → verify values, formats, formulas. |
| C4 | Optional "confirm before mutating" for writes outside the active sheet or > 50 cells. |
| C5 | Undo journal: a per-session list of every cell the add-in wrote, with previous value, and a `/revert` command. The master workbook is the signed legal deliverable; Excel's own undo stack does not survive a reload of the taskpane. |
| C6 | Dry-run mode for the cascade tools (F4, G6): report the cell list it would touch, write nothing. |
| C7 | **Dependency audit gate blocks every push that touches `package.json`.** `npm run audit:ci` fails with **72 advisories outside the `audit-ci.jsonc` allowlist**, ~8 of them critical: Handlebars JS injection ×3 (`GHSA-8r5x-fm3f-whwj`, `GHSA-p8wg-vrv2-v86f`, `GHSA-xw65-4hp5-5hc7`), `proxy-addr` IP spoofing (`GHSA-jqcg-44mw-7w3h`), `shell-quote` command injection (`GHSA-pqg4-j6r4-53mv`), `node-tar` DoS (`GHSA-23hp-3jrh-7fpw`), `node-forge` signature verification (`GHSA-86w9-cpqp-85rv`), `source-map-js` event-loop DoS (`GHSA-68fv-2mgg-jv7q`). The 31 existing allowlist entries expire 2026-12-31, so that wave needs re-triage in the same pass. Triage question per advisory: reachable from the Office WebView bundle, or dev-tooling only? Most of the volume is `office-addin-*` and `@modelcontextprotocol/sdk` transitives, i.e. the second. Until this is done `.githooks/pre-push` fires on any manifest change and the only way through is `git push --no-verify`. Overlaps P3: much of it should resolve with the Pi bump. Found 2026-11-04. |
| C8 | **`npm run build` is red independently of any source change.** `node_modules/zod/v4/core` does not exist, so `node_modules/zod/v4/classic/external.js` cannot resolve `../core/index.js` — 5 `UNRESOLVED_IMPORT` errors, build exits 1. Confirmed pre-existing by stashing all local work and building at `3fcefe7`: identical failure. `npm install` does **not** repair it, and leaves `package-lock.json` untouched. The tree carries two `zod` majors: `4.3.6` deduped at the root (via `pi-ai` → `@anthropic-ai/sdk`, `@google/genai`, `openai`, `@mistralai/mistralai`) and `3.25.76` nested under `pi-web-ui@0.75.3` → `@lmstudio/sdk`. Try `rm -rf node_modules && npm ci` first; if the `v4/core` subpath is genuinely absent from the published `zod@4.3.6`, the fix belongs to P3 and not here. Note the consequence: the `npm run build` step AGENTS.md requires after an import change cannot pass right now, so a verification run that reports build as green is reporting wrongly. Found 2026-11-04. |

## Track D — Improvement loop

Each smoke session is exported (status bar → export transcript), reviewed, and turned
into follow-up commits (skill text, prompt tweak, or tool fix) within 48 h.

The exported transcripts land in the private repo under
`transcripts/sessions/<peritaje>/`; their redacted twins under `transcripts/redacted/`
are the raw material for skill and prompt work here. Track J makes that handoff
mechanical instead of manual.

## Track E — Distribution

| ID | Item |
|---|---|
| E1 | AppSource submission package (`dist-appsource/`). |
| E2 | One-page admin guide for tenant-wide deployment (Microsoft 365 admin center). |

---

## Track F — The master workbook template

Today the add-in understands exactly one region of the appraisal workbook: the
"8.- VALORES REFERENCIALES" table. The real workbook has at least six
interdependent sheets (`referenciales`, `fichas VR`, `Lote N`, `minuta refes`,
`calc hon`, `informe acta`), and the written audits cite cells across all of them.
Until the add-in can name those sheets and find their anchors, every tool in
tracks G–I has to re-derive the layout from scratch.

| ID | Item |
|---|---|
| F1 | Skill `tasaciones/plantilla-madre`: sheet inventory, what each sheet is for, and the anchor cells the audits actually cite (`Fichas VR!AS248`, `minuta refes!E13`, `calc hon!H43`, `informe acta!A13`, `Lote N!A240`). **In Now as P5.** |
| F2 | Tool `locate_informe_anchors`: detect the template and return a map of anchors per sheet, tolerant to row drift. Every later tool consumes this instead of hardcoding offsets. |
| F3 | Template fingerprinting and variant detection: VR blocks range 71–75 rows; refs 9 and 10 store surface in column AU instead of AV. Warn loudly when a workbook does not match a known variant rather than writing to the wrong cell. |
| F4 | Tool `new_lote_sheet`: clone a lote sheet from the template and renumber every cross-sheet reference. Las Cabras runs 54 lotes across four resolutions; this is done by hand today. |
| F5 | "Ghost value" detector: a hardcoded number sitting where the template expects a formula. This is how stale totals from an earlier revision survive into a signed PDF. |
| F6 | Cross-sheet dependency map for a single lote, rendered in the sidebar: which cells feed the lote total, and which sheets break if one is edited. |

## Track G — Pre-delivery audit inside Excel

The private repo already runs a full audit before printing, via the
`revision-tasacion-excel` agent, the `tasacion-checklist` skill and the
`/quality-check` command. It runs on a *copy* of the workbook, in Python, outside
Excel, and its findings come back as a Markdown file the appraiser then applies
by hand. Running it in the sidebar closes that loop.

Severity vocabulary is already established and should be reused: **Bloqueante /
Mayor / Menor**.

| ID | Item |
|---|---|
| G1 | Tool `audit_informe`: the orchestrator. Findings in `result.details` with severity, sheet, cell, and a one-line fix. |
| G2 | Transverse arithmetic: terreno + plantaciones + construcciones + otras = lote total; Σ lotes = project total; VU × superficie = subtotal; the amount written in words matches the figure. |
| G3 | UF verification against the official SII table for each deed date, flagging differences > 0.5 %. Needs a UF source; `skills/web-search` is the cheap path, a cached endpoint the robust one. |
| G4 | Placeholder detection: `$X` in a computed column, "a definir" in a date, a lote with no ROL, an empty conclusion. |
| G5 | Date coherence: escritura < inscripción ≤ report date, and an explicit warning when a supporting document postdates the report. Real case: Lanco Res-10 is dated 03-ago-2026 but its CBR copies were issued 16-sep-2026, while the text claims they were "tenidos a la vista". |
| G6 | Cascade impact of dropping or adding a comparable. Real case: removing Ref. 4 from Lanco Res-10 required edits in `minuta refes` (row 13 + `A79` + the ranges in `A80`), the ficha block, the cuadro 8 of each of three lote sheets, three 9.10.1 sections, `informe acta!A13`, and the quoted average in two conclusions. Nine edits across six sheets, enumerated by hand. |
| G7 | Export the audit as Markdown in the shape of `trabajo/auditoria-informe-*.md`, so it drops straight into the project folder and into Git. |
| G8 | Duplicate-item detection across lotes. Real case: a boundary fence shared between lotes 2 and 3 counted once in each. |
| G9 | Narrative-vs-figures check: averages, counts ("4 referenciales") and unit values quoted in prose must match what the tables compute. |
| G10 | Checklist coverage per mandante: Vialidad/MOP, SERVIU, SEC and judicial each have their own required sections and citations (SEC needs LGSE Art. 63/63 bis/63 ter, DS 113, DS 52). |

## Track H — Antecedentes: from PDF to worksheet

The data that fills `referenciales` is sitting in PDFs under `respaldos/` of each
project. Extracting it is a skill (`extract-cbr`) and a command
(`/tabla-referenciales`) on the operator's side, producing Markdown that is then
retyped into Excel. The add-in is the natural place to land the extraction.

| ID | Item |
|---|---|
| H1 | CBR extraction: foja (keeping the `v` for *vuelta*), número, año, **fecha de escritura distinguished from fecha de inscripción**, ROL, monto UF and CLP, surface normalised to m², comprador, vendedor. Write directly to the `referenciales` sheet. |
| H2 | OCR path for resoluciones and cuadros that arrive scanned with no text layer, including the decision rule for when native extraction is enough. |
| H3 | Parse the resolución exenta and pre-load the lote table (ROL, propietario, superficie, obra, expediente) so a new peritaje starts with the identity block filled. |
| H4 | Coordinates by ROL from the SII Cartografía Digital, plus the destino predial code. Note the ROL splits into comuna / manzana / predio as three separate fields; the combined form is rejected. Feeds the KML for the field visit. |
| H5 | Internet offers: apply the 12 % discount, and require a verifiable publication date. Real case: Lanco Ref. 4 was dated 03-ago-2026 in the workbook while the listing read "Fecha Publicación 11/08/2026" — a blocking finding that survived three revisions. |
| H6 | SII assessment certificate: read the ROL status and surface *with its date*. A ROL in "Subdivisión Parcial" means historic surfaces describe the original fundo. Real case: Buin Res. 444 used a historic 234,75 ha against a certified 28,65 ha and understated the expropriation percentage eightfold. |
| H7 | Attachment intake in the sidebar: drop a PDF on the taskpane and route it to the right extractor. Depends on the bridge story (python-bridge or a hosted endpoint); scope it before committing. |

## Track I — Calculation and methodology

Methods the operator applies today with a calculator, a Python script, or by hand.
Each is small on its own; together they are the reason the workbook exists.

| ID | Item |
|---|---|
| I1 | Ross-Heidecke depreciation for buildings: reposition cost tables by type/materiality/quality, useful-life table, the conservation-state residual table, and the 20–30 % penalty for construction without a municipal permit. |
| I2 | Descriptive statistics over the comparables (N, mean, median, SD, CV, Q1/Q3, IQR) with IQR outlier detection, and the adopted-value rule: CV < 15 % → mean, 15–30 % → median, > 30 % → median excluding documented outliers; warn when N < 5. |
| I3 | DL 2.186 deadline calculator: 3 days to accept, 10 to constitute the commission, 30 to issue the report, extendable by 30. Art. 40 counting is Monday to Saturday, Sunday does not run, the first day is not counted. Surface the result in the workbook and in the sidebar. |
| I4 | Atypical Vialidad lotes: inactive ROL, two lotes sharing one ROL, sitio eriazo in an agricultural zone, total expropriation, and very small fractions. |
| I5 | Daño al resto for partial expropriation (DFL 850 Art. 38: actual patrimonial damage only). |
| I6 | Fee calculation beyond the retención table: bracket table per mandante and per year (Vialidad changes annually, SERVIU follows its instructivo, SEC follows the resolution that created the commission), viáticos per real field day, distribution across commission members. |
| I7 | Plantations and fruit trees: the archive has a dedicated `PLANTILLAS-AGROECONOMICAS` family and a `valuador-frutales` agent. Scope what belongs in Excel versus what stays a document. |
| I8 | Faja vial (DFL 850 Art. 24) — skill exists; add the arithmetic checks and a worked example to it. |
| I9 | SEC electrical servitude — skill exists with 6 categories; add the resolution-citation checks from G10. |

## Track J — Bridge to the appraisal repository

The two repos already reference each other: `transcripts/README.md` in the private
repo specifies the exact frontmatter the add-in's `/export markdown` should emit.
It does not emit it yet, so every export is edited by hand before filing.

| ID | Item |
|---|---|
| J1 | `/export markdown` emits the agreed YAML frontmatter: `peritaje`, `libro`, `hoja`, `modelo`, `thinking`, `categoria` (A/B/C/D), `anonimizar`, `fecha_export` (ISO 8601 with offset), `tags`. |
| J2 | Infer `peritaje` from the workbook path or name against the `YYYY-MM-DD_AUTHORITY_LOCATION_ID` convention, and leave `_general` as the fallback. |
| J3 | Optional redaction pass before export, mirroring `transcripts/scripts/redact_transcript.py`, so a transcript can be filed under `redacted/` without a round trip. |
| J4 | Suggested filename on export: `YYYY-MM-DD-HHMM-<short-slug>.md`, slug free of RUT and identifying data. |
| J5 | Read-only view of Supabase `peritajes_historial` (estado, fecha de notificación, deadline) in the sidebar, via the MCP gateway. Note the `check_estado_valido` constraint requires the literal accent in `Elaboración`. |
| J6 | The private repo's `transcripts/README.md` points at `docs/planning/roadmap.md §5`, which is now `docs/roadmap.md`. Dead link; fix it there when J1 lands. |

## Track K — Deliverables and printing

The workbook is printed on Chilean oficio and signed. The private repo's
`xlsx-chile` skill documents the formatting that survives that trip; the add-in
knows none of it, so a `format_cells` call can silently break pagination of a
45-page report.

| ID | Item |
|---|---|
| K1 | Page setup preset for Chilean oficio 216×330 mm: `paperSize` 14, portrait, `fitToWidth`, 0.6″ margins — and the gotcha that `fitTo*` is ignored unless `pageSetUpPr.fitToPage` is set. |
| K2 | Print-area and page-break management per lote sheet, keeping working zones below or to the right of the printed area. |
| K3 | Row-height calculation for merged cells holding legal paragraphs. Excel does not autofit merged rows; the validated approximation is `ceil(len / chars_per_line) * 13.5 + 6` for Arial 10. |
| K4 | Guard against `TEXT()` inside sentences: the format code is interpreted in the opening Excel's locale. Enforce the validated pattern — prose in a merged cell, amount in its own numeric cell with `number_format`. |
| K5 | Pre-print checklist: pages with no extractable text, ficha pagination, annexes in order, digital signatures still valid on the regenerated PDF. |
| K6 | Warn when a formula uses a function the downstream validator cannot evaluate (structured tables, LAMBDA, sometimes XLOOKUP), since the public services' Excel is often old. Prefer INDEX/MATCH and SUMIFS. |

## Track L — Chilean professional writing

Report text lives in cells, and those cells are read by public officials, lawyers
and judges. The private repo's writing rules are explicit and currently enforced
only by the operator's own agents, never by the add-in that writes the cells.

| ID | Item |
|---|---|
| L1 | Ban em dash (U+2014) and en dash (U+2013) as inline separators in any cell the add-in writes, and lint existing text cells on request. It is the strongest AI tell in Chilean professional prose. |
| L2 | The "el suscrito" rule: first person only when it changes the meaning — declaring a limitation, separating own work from another professional's, or adopting a debatable criterion. Impersonal voice everywhere else. |
| L3 | Cross-references described, not numbered: "al tratar el alcance de las fuentes cartográficas" instead of "conforme a la sección VII.3", so renumbering cannot break them. |
| L4 | Chilean numeric and unit conventions as a validation pass: thousands `.`, decimals `,`, dates `DD-MM-AAAA`, `ha` without an accent, UF to two decimals, amounts as numbers with `number_format` and never as pre-formatted text. |
| L5 | Spanish orthography check on text cells (tildes, eñes), as a tool rather than a prompt instruction. |
| L6 | Avoid the connector pile-up ("Asimismo", "Adicionalmente", "Por otra parte") and the "no es solo X, sino también Y" filler in generated prose. |

## Track M — Data residency and sensitivity

The private repo's owner has authorised sending unredacted expediente data to the
providers he uses for work. The add-in, however, can now reach ~250 OpenRouter
models hosted anywhere, and the user choosing a model is not the same act as the
owner authorising a provider.

| ID | Item |
|---|---|
| M1 | Surface the session's data classification (A/B/C/D, per `chilean-data-residency`) in the status bar, derived from what the workbook actually contains. |
| M2 | Warn once per session when the selected model's host falls outside the configured allow-list, with the category at stake. Warn, do not block. |
| M3 | Document the add-in's own egress surface in `docs/`: what leaves the WebView, to whom, and what never does (credentials, tokens). |
| M4 | Make the provider allow-list configurable in `/settings` rather than implicit in the registry. |

---

## How to pick the next item

In order, stop at the first that applies:

1. **A wrong number the add-in produces.** None open today. A stale rate or a
   bad formula propagates into signed legal documents and is worse than any
   missing feature. The retención SII fix is the worked example: the rate was
   right once and then silently wasn't, so prefer a dated table plus a lockstep
   test over a constant.
2. **Something shipped but unverified.** P1 → P2. Code that has never run in
   Excel Desktop is not shipped.
3. **A blocker for a track you want to open.** F1/F2 gate G, H and I. Doing
   them out of order means rewriting.
4. **Whatever the last smoke session tripped over.** Track D exists for this;
   the transcript names the item.
5. **The cheapest item in the track matching this week's real peritaje.** If the
   week is a 54-lote Las Cabras resolution, F4 pays immediately. If it is a
   single rural lote with four comparables, I2 does.

Two rules of thumb. Prefer an item with a real case behind it in this file over
one without; the ones citing Lanco, Buin or Las Cabras are not hypotheses.
And prefer a tool the add-in can run over a skill that tells the model what to
do: the model forgets, the tool does not.

## Where the backlog comes from

Tracks F–M were derived on 2026-11-03 from `tasaciones-peritajes` (private).
What was read, and what it contributed:

| Source | Contributed |
|---|---|
| `.opencode/agents/revision-tasacion-excel.md` | Track G almost entirely: the workflow, the severity vocabulary, the arithmetic checks, the UF 0.5 % tolerance |
| `.opencode/skills/tasacion-checklist` | G10, the per-mandante checklists |
| `.opencode/skills/extract-cbr`, `ocr-pdf-escaneado` | H1, H2 |
| `.opencode/skills/sii-catastro-coordenadas` | H4, H6 |
| `.opencode/skills/xlsx-chile` | Track K entirely, plus K6 |
| `.opencode/skills/valor-construccion` | I1 |
| `.opencode/skills/market-stats`, `homologa-rural-chile` | I2 |
| `.opencode/skills/plazos-expropiacion`, `base-tasacion-chile` | I3, B4, B5 |
| `.opencode/skills/lotes-especiales-vialidad` | I4 |
| `.opencode/commands/liquidar-honorarios.md` | P0 (the 15.25 % discrepancy), I6 |
| `.opencode/commands/tabla-referenciales.md`, `quality-check.md` | H1, G1 |
| `AGENTS.md` writing conventions | Track L entirely |
| `AGENTS.md` sensitive-data decision, skill `chilean-data-residency` | Track M |
| `transcripts/README.md` | Track J, including the exact frontmatter and the dead link (J6) |
| `PERITAJES-EN-CURSO/2026-06-22_LOS-RIOS_LANCO_RES-10/trabajo/auditoria-informe-res-10-lanco.md` | F1 anchors, G5, G6, G8, G9, H5 — all with cell-level evidence |
| `docs/methodology/PROCESO-REFERENCIALES-MOP.md` | B5, H5 |
| Project inventory (31 active, ~160 archived) | F4, B3 |

Nothing from that repository is reproduced here beyond method and cell
addresses. No RUT, owner name, amount or ROL belongs in this public repo.

## Done

- **SII withholding as a dated table.** `src/domain/retencion-sii.ts` keys the
  rate to the boleta's commercial year (Ley 21.133: 10,75 % in 2020 → 15,25 %
  in 2026 → 17 % from 2028), verified against the SII. Replaces the 10,75 %
  constant in the system prompt, `honorarios`, `verificar-consistencia`,
  `README.md` and `NOTICE.md`. `tests/retencion-sii.test.ts` pins the schedule
  and fails if prompt or skill text quotes a rate outside it. Was P0.
- Cuadro de referenciales tools: `audit_ref_errors`, `link_referenciales_cuadro` (`0f052da`).
- Markdown transcript export (`a7e1daf`).
- Preset provider framework (`src/auth/provider-presets.ts`).
- Windows sideload via Trusted Add-in Catalog (`scripts/sideload-windows.ps1`).
