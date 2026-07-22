# NOTICE — Tasaciones by Loxos

This project is a **branded fork** of [pi-for-excel](https://github.com/tmustier/pi-for-excel) by Thomas Mustier (MIT). It is not affiliated with, endorsed by, or sponsored by the upstream project or its authors. We are grateful to the upstream maintainers and contributors for the foundation this work builds on.

## Project identity

| Field | Value |
|---|---|
| Name | **Tasaciones by Loxos** |
| Manifest display name | **Tasaciones** |
| Add-in provider | **Loxos** |
| Repository | <https://github.com/gabrielpantoja-cl/complemento-excel> |
| Hosted bundle | <https://complemento-excel.vercel.app/> |
| Maintainer | Gabriel Pantoja ([@gabrielpantoja-cl](https://github.com/gabrielpantoja-cl)) |
| Started | **28 June 2026** (commit `bd0186d` — initial ZIP import of `tmustier/pi-for-excel` v0.9.0-pre) |
| First public release | pending (target: 22 July 2026) |
| License | MIT (see `LICENSE`) |

## Upstream acknowledgements

This fork would not exist without the following projects and contributors. All are MIT-licensed where not otherwise noted.

### Code base — [pi-for-excel](https://github.com/tmustier/pi-for-excel)

- **Original author:** [Thomas Mustier](https://github.com/tmustier) (<thomas@mustier.dev>)
- **License:** MIT
- **Last sync reference:** v0.9.0-pre (commit `a089f86`) at the time of the 28 June 2026 import.
- The base project, in turn, depends on the [Pi](https://pi.dev) agent framework, listed below.

### Agent runtime — [Pi (pi-mono)](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic) (Mario Zechner)

- License: MIT.
- Tasaciones uses the following packages from the Pi monorepo (published as `@earendil-works/*`):
  - `@earendil-works/pi-agent-core` — agent loop, state management.
  - `@earendil-works/pi-ai` — multi-provider LLM abstraction (Anthropic, OpenAI, Google, GitHub Copilot).
  - `@earendil-works/pi-web-ui` — shared web UI components (message rendering, storage, settings dialogs).

### Rotating "Working…" hints — [whimsical.ts](https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/whimsical.ts)

- **Original author:** [Armin Ronacher](https://github.com/mitsuhiko)
- **License:** MIT.
- Adapted from his Pi extension and rewritten for a Chilean-real-estate / spreadsheet audience.

### Inspiration

- [Pi Coding Agent](https://pi.dev) and its design as a multi-model, terminal-style agent.
- The Chilean appraisal community, whose workflows inform every domain rule and skill in this fork.

## What this fork changes

A non-exhaustive list of intentional divergences from upstream `pi-for-excel`. Full table with rationale and commit history: [`docs/architecture/upstream-divergences.md`](docs/architecture/upstream-divergences.md).

### Branding and product surface

- Renamed the Office add-in from **Pi for Excel** to **Tasaciones by Loxos** (display name: **Tasaciones**, provider: **Loxos**).
- Re-skinned landing page (`public/index.html`) and bundled help copy in Chilean Spanish.
- Replaced the bundled "working…" status hints with Chilean-appraisal-relevant copy (`src/ui/working-indicator.ts`).
- Manifest description, provider name, and `package.json` `name`/`displayName` all point at the Tasaciones identity.

### Domain knowledge and skills

- Replaced the English-language generic system prompt with a Chilean-appraisal specialised identity block (`src/prompt/system-prompt.ts`).
- Shipped six new Agent Skills under `skills/tasaciones/`:
  - `homologacion` — rural referencial homologation (7 factors).
  - `honorarios` — per-appraiser fee schedule with 10.75% SII withholding.
  - `sec-indemnizacion` — SEC electrical easement indemnification (6 categories).
  - `faja-vial` — DFL 850 art. 24 faja vial procedure.
  - `cuadro-referenciales` — repair of the "8.- VALORES REFERENCIALES" cross-sheet cuadro.
  - `verificar-consistencia` — end-to-end report consistency checklist.
- Chilean number-format conventions baked into the system prompt (period thousands, comma decimals, DD-MM-AAAA dates, `$ #.##0` CLP, `#.##0,00` UF).

### Tools

- Two new core tools specialised for the cuadro-de-referenciales workflow:
  - `audit_ref_errors` — scans a sheet for `#REF!` errors and broken cross-sheet formula chains.
  - `link_referenciales_cuadro` — repairs one row of the "Cuadro de Referenciales" by writing 7 formulas and verifying post-write.
- Tool registry entries follow the upstream single-source-of-truth pattern (`src/tools/names.ts` → `src/tools/registry.ts` → `src/tools/capabilities.ts` → `src/ui/humanize-params.ts` → `src/prompt/system-prompt.ts`).

### Providers and presets

- Promoted the "preset provider" framework (a discriminated union of `kind: "openai-compat" | "anthropic-messages" | …`) so that adding a regional provider is a small change in `src/models/presets.ts`.
- Shipped a first regional preset (subscription-style token plan routed through an OpenAI-compatible gateway with header overrides) to prove the framework works end-to-end. The preset ID and routing details are intentionally not documented here — they live in the maintainer's local config.

### Documentation and developer experience

- Continuous-improvement loop: every desktop smoke session feeds back into skill files, system-prompt blocks, or tool fixes within 48 hours. Loop details and the private roadmap live outside this repo.
- Markdown transcript export (`a7e1daf`) so a single click from the taskpane produces the artefact that the section-5 process consumes.
- Updated Windows sideload flow using a Trusted Add-in Catalog (`scripts/sideload-windows.ps1`) because Excel Desktop stopped exposing "Upload My Add-in" in 2026.
- Landing/install copy anchored to OpenRouter and BYOK (no proxy required for the common case).

### Repository hygiene

- Renamed the three CLI npm packages from `pi-for-excel-*` to `tasaciones-*`:
  - `tasaciones-proxy`
  - `tasaciones-python-bridge`
  - `tasaciones-tmux-bridge`
- Renamed the IndexedDB database from `pi-for-excel` to `tasaciones` (no migration needed — fork had no public users at the time of the rename).
- Updated CI dependabot groups to keep the Pi stack (`@earendil-works/*`) on its own cadence, distinct from general npm updates.

## What we keep in lockstep with upstream

In areas that are not Chilean-appraisal-specific, we intentionally stay close to upstream `pi-for-excel` and rebase cautiously:

- The 16 built-in Excel tools (`get_workbook_overview`, `read_range`, `write_cells`, …).
- The agent loop, prompt-cache discipline, and compaction call shape.
- The Pi stack dependencies (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-web-ui`).
- Security model and proxy / bridge host policy (`scripts/proxy-target-policy.mjs`).
- Manifest shape, Vite build, and deployment topology.

Where upstream does something a certain way, we assume there is a good reason — every divergence is justified in `docs/architecture/upstream-divergences.md`.

## Contributing

Issues and PRs welcome at <https://github.com/gabrielpantoja-cl/complemento-excel/issues> and <https://github.com/gabrielpantoja-cl/complemento-excel/pulls>.

Spanish and English are both fine for issues. For code changes, read `AGENTS.md` first — it documents the conventions, the lockstep guard for Pi stack updates, and the verification commands (`npm run check`, `npm run test:context`, `npm run test:security`).

## License

MIT. See [`LICENSE`](LICENSE).
