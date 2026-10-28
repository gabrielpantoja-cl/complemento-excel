# Roadmap

**Last reviewed:** 2026-10-27

Public roadmap for Tasaciones by Loxos. Work is grouped in tracks, ordered by
impact. Each item should land as its own commit with `npm run check` green.
Internal planning (accounts, tenants, private presets) lives outside this repo.

## Now

| ID | Item | Status |
|---|---|---|
| P1 | **OpenRouter as a first-class provider.** Login row in `/login` + welcome overlay, default model (latest Claude Sonnet via `anthropic/claude-sonnet-*`, fallback `openrouter/auto`). Uses pi-ai's built-in `openrouter` registry (~250 models). | Shipped in code; needs Excel smoke |
| P2 | **Excel Desktop smoke with OpenRouter** (Windows, then macOS): login, stream, `write_cells` round-trip, `/model` switching between OpenRouter models. | Open |
| P3 | **Refresh Pi deps** (`pi-ai` / `pi-agent-core` are on `0.79.1`; npm has `1.x`). Follow `docs/architecture/model-updates.md` — the major bump needs an API review. | Open |
| P4 | **Fix the 31 skipped tests** from `faf30ec` (Windows path bug, docs restructure, truncation format drift). | Open |

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
| B1 | Audit the `DOMAIN_KNOWLEDGE` block in `src/prompt/system-prompt.ts`: 7 homologation factors, fee calculation (10.75 % SII withholding), faja vial (DL 2.186), DFL 850. |
| B2 | Skills per sub-procedure under `skills/tasaciones/` (predio vs lote, escritura vs inscripción CBR, …), each with a worked example and common pitfalls. |
| B3 | 3–5 anonymised historic workbooks as smoke fixtures. |

## Track C — Reliability & observability

| ID | Item |
|---|---|
| C1 | Tokens / latency / cache-hit / cost per turn in the status bar. |
| C2 | Snapshot tests for cell-coordinate handling in `write_cells`, `fill_formula`, `format_cells`, `modify_structure`. |
| C3 | Round-trip tests: workbook → tool → verify values, formats, formulas. |
| C4 | Optional "confirm before mutating" for writes outside the active sheet or > 50 cells. |

## Track D — Improvement loop

Each smoke session is exported (status bar → export transcript), reviewed, and turned
into follow-up commits (skill text, prompt tweak, or tool fix) within 48 h.

## Track E — Distribution

| ID | Item |
|---|---|
| E1 | AppSource submission package (`dist-appsource/`). |
| E2 | One-page admin guide for tenant-wide deployment (Microsoft 365 admin center). |

## Done

- Cuadro de referenciales tools: `audit_ref_errors`, `link_referenciales_cuadro` (`0f052da`).
- Markdown transcript export (`a7e1daf`).
- Preset provider framework (`src/auth/provider-presets.ts`).
- Windows sideload via Trusted Add-in Catalog (`scripts/sideload-windows.ps1`).
