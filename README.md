# Tasaciones by Loxos

> An AI add-in for Microsoft Excel specialized in **appraisals and expropriation valuations in Chile**.
> Open source fork of [pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT),
> maintained by [Loxos](https://loxos.cl).

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-pi--for--excel-0a0a0a.svg)](https://github.com/tmustier/pi-for-excel)
[![Manifest](https://img.shields.io/badge/manifest-complemento--excel.vercel.app-blueviolet)](https://complemento-excel.vercel.app/manifest.prod.xml)

Tasaciones is an AI agent that lives inside Excel. It reads your appraisal workbooks, writes values, formulas and formatting, and conducts research — using the AI model you choose (Claude, GPT, Gemini, or any OpenAI / Anthropic-compatible endpoint). Bring your own API key or use OpenRouter as a unified gateway.

## Why Tasaciones?

Tasaciones is designed for the workflow of a **Chilean real estate appraiser**. The difference from a generic AI add-in lies in what comes pre-installed:

| Feature | Details |
|---|---|
| **Specialized system prompt** | Chilean legal frameworks: DL 2.186, DFL 850 art. 24, LGSE DFL 4/20.018, DS 113/52, CPC art. 411, SII 10.75% withholding, rural homologation factors (7 factors), fee tiering, existing easements. |
| **Pre-installed skills** | 6 appraisal skills: `homologacion`, `honorarios`, `sec-indemnizacion`, `faja-vial`, `cuadro-referenciales`, `verificar-consistencia`. Invoked via the `skills` tool from chat. |
| **Chilean formatting defaults** | Thousands separator as period (`1.331.832`), decimals as comma (`33,54`), dates DD-MM-YYYY, CLP `$ #.##0`, UF `#.##0,00`. User-configurable at any time. |
| **Referential values table** | 2 new tools (`audit_ref_errors`, `link_referenciales_cuadro`) that repair section 8 of the appraisal when cross-references break between `referenciales` and `fichas VR`. |
| **Languages** | Landing page and documentation in Spanish (es-CL). Agent responds in Spanish by default. |

## Features (summary)

**18 native Excel tools** that the agent can call — the 16 original pi-for-excel tools plus 2 specialized ones:

| Tool | What it does |
|---|---|
| `get_workbook_overview` | Structural map: sheets, headers, named ranges, tables, charts, pivots |
| `read_range` | Read cells in compact (markdown), CSV, or detailed (formatted) format |
| `write_cells` | Write values/formulas with overwrite protection and auto-verification |
| `fill_formula` | Auto-fill a formula across a range (relative references adjust automatically) |
| `search_workbook` | Search text, values, or formula references across all sheets |
| `modify_structure` | Insert/delete rows/columns, add/rename/delete/hide sheets |
| `format_cells` | Apply formatting: fonts, colors, numbers, borders, named styles |
| `conditional_format` | Add or clear conditional formatting rules |
| `trace_dependencies` | Trace formula precedence (upstream/downstream) |
| `explain_formula` | Explain a formula in natural language citing referenced cells |
| `view_settings` | Grid lines, headers, frozen panes, tab color, visibility |
| `comments` | Read, add, update, reply to, resolve/reopen comments |
| `workbook_history` | List/restore automatic backups created before each mutation |
| `instructions` | Persistent rules (user-level or workbook-level) |
| `conventions` | Configurable formatting conventions (currency, negatives, decimals) |
| `skills` | Agent skills (bundled + externally installable) |
| `audit_ref_errors` **(\*)** | Scan a sheet for `#REF!` errors and broken formula chains |
| `link_referenciales_cuadro` **(\*)** | Repair a row in the "Referential Values Table" by writing 7 formulas and verifying |

**(\*) New in Tasaciones** — see [NOTICE.md](NOTICE.md#what-this-fork-changes).

**Multi-model** — use your preferred provider, switch models mid-conversation:
- **Anthropic** (Claude) — API key or OAuth
- **OpenAI** / **OpenAI Codex** — API key
- **Google Gemini** — API key
- **GitHub Copilot** — OAuth
- **OpenRouter** (recommended) — single API key, dozens of models
- **OpenAI-compatible gateways** — endpoint + model + API key in `/settings`

**Session management** — multiple tabs per workbook, auto-save/restore, history, `/resume` to pick up where you left off.

**Automatic context injection** — the agent automatically receives the workbook blueprint, your current selection, and recent changes before each turn. No need to manually describe what you're looking at.

**Recovery** — automatic checkpoints before each mutation. One click to revert from the sidebar if something goes wrong.

**Format conventions** — define your style once (currency symbol, negative style, decimals) and the agent follows it automatically.

**Slash commands** — `/model`, `/login`, `/settings`, `/rules`, `/extensions`, `/tools`, `/export`, `/compact`, `/new`, `/resume`, `/history`, `/shortcuts`, and more.

**Extensions** — install sidebar extensions from chat. The agent can generate and install extension code directly with the `extensions_manager` tool.

**Integrations** (opt-in):
- **Web Search** (Jina by default, Serper/Tavily/Brave) + `fetch_page` — search and read external sources without leaving Excel
- **MCP Gateway** — connect to MCP servers configured by the user

**Bridge + advanced controls** (managed via `/experimental`):
- Tmux bridge — bridge URL/token and health checks
- Python / LibreOffice bridge — bridge URL/token
- Files workspace (write/delete gate) — artifacts shared across sessions
- Advanced extension controls — opt-in remote URL, sandbox, Widget API v2

## Install

1. Download [`manifest.prod.xml`](https://complemento-excel.vercel.app/manifest.prod.xml)
2. Upload to Excel — see [**installation guide**](docs/guides/install.md) (macOS + Windows)
3. Click **Open Tasaciones** on the ribbon
4. Connect a provider (API key or OAuth), or configure an OpenAI-compatible gateway in `/settings`
5. Start chatting — try `What sheet am I viewing?` or `Summarize my current selection`

## Project History

| Date | Event |
|---|---|
| Jun 28, 2026 | **Fork initiated**: commit `bd0186d`. Gabriel Pantoja downloads `tmustier/pi-for-excel` v0.9.0-pre ZIP and creates this repository with initial rebranding phase (manifest, package.json, Spanish landing page). |
| Jun 30, 2026 | Bundled first 3 appraisal skills (`homologacion`, `honorarios`, `sec-indemnizacion`, `faja-vial`). |
| Jul 14, 2026 | Bootstrapped opencode as development CLI for this repo. |
| Jul 16, 2026 | Sideload verified on Excel Desktop Windows (Microsoft 365). Smoke run documented in [`docs/release-smoke-runs/2026-07-16-windows-sideload.md`](docs/release-smoke-runs/2026-07-16-windows-sideload.md). |
| Jul 22, 2026 | Shipped `audit_ref_errors` + `link_referenciales_cuadro` (commit `0f052da`) following referential values table transcript. |
| Jul 22, 2026 | **Public open source release** (this commit). |

## Developer Quick Start

### Requirements

- **Node.js ≥ 22.19** (see `engines` in `package.json`).
- **mkcert** — for local HTTPS (required by Office.js).

### Setup

```bash
git clone https://github.com/gabrielpantoja-cl/complemento-excel.git
cd complemento-excel
npm install

# Generate local HTTPS certificates (Office.js requires HTTPS)
mkcert -install   # one-time CA setup
mkcert localhost   # creates localhost.pem + localhost-key.pem
mv localhost-key.pem key.pem
mv localhost.pem cert.pem
```

### Run

```bash
npm run dev        # Vite dev server at https://localhost:3000
```

Then sideload the dev manifest in Excel:

**macOS** ([Microsoft docs](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac)):
```bash
cp manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
```
Then open Excel → **Insert** → **My Add-ins** → **Tasaciones**.

**Windows** ([Microsoft docs](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins)):

Excel Desktop no longer exposes "Upload My Add-in" as of 2026. Use the Trusted Add-in Catalog with this repo's script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1
# Make sure `npm run dev` is running in another terminal
```

Then close/reopen Excel and **Home → Add-ins → More Add-ins → SHARED FOLDER → Tasaciones → Add**. Full procedure in [`docs/guides/windows-sideload.md`](docs/guides/windows-sideload.md).

The dev manifest points to `https://localhost:3000`. The production manifest (`manifest.prod.xml`) points to the Vercel deployment.

### Useful Commands

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server (port 3000, HTTPS) |
| `npm run build` | Production build → `dist/` |
| `npm run check` | Lint + typecheck + CSS theme checks |
| `npm run typecheck` | TypeScript type checking only |
| `npm run lint` | ESLint |
| `npm run test:models` | Unit tests — model ordering |
| `npm run test:context` | Unit tests — tools, context, sessions, extensions, integrations |
| `npm run test:security` | Security policy tests — proxy, CORS, sandbox, OAuth |
| `npm run proxy:https` | CORS proxy for OAuth flows (default `https://localhost:3003`) |
| `npm run validate` | Validate the add-in manifest |

### CORS Proxy

Some OAuth endpoints are blocked by CORS inside Office webviews. If OAuth login fails:

1. User setup: `npx tasaciones-proxy` (or `curl -fsSL https://complemento-excel.vercel.app/proxy | sh` if Node is missing)
2. Dev/source setup: `npm run proxy:https` (default `https://localhost:3003`)
3. In Tasaciones → `/settings` → **Proxy** → enable and set the URL
4. Retry login

API key authentication generally doesn't require a proxy.

### Local Bridges (Python / tmux)

Local bridge helpers with a single command:

- Python / LibreOffice bridge: `npx tasaciones-python-bridge` (default URL `https://localhost:3340`, live mode)
- tmux bridge: `npx tasaciones-tmux-bridge` (default URL `https://localhost:3341`, live mode)

In Tasaciones, these localhost bridge URLs are used by default. Configure `/experimental ...-bridge-url` only if you want a non-default URL.

Live mode prerequisites:

- `python3` must be installed for `python_run` / `python_transform_range`
- LibreOffice (`soffice` or `libreoffice`) is required for `libreoffice_convert`
- `tmux` is required for the tmux bridge in live mode

To force stub mode:

- `PYTHON_BRIDGE_MODE=stub npx tasaciones-python-bridge`
- `TMUX_BRIDGE_MODE=stub npx tasaciones-tmux-bridge`

Source checkout alternatives remain available via `npm run python:bridge:https` and `npm run tmux:bridge:https`.

## Architecture

Tasaciones is a single-page Office taskpane add-in built with:

- **[Vite](https://vite.dev/)** — dev server + production bundler
- **[Lit](https://lit.dev/)** — web components for the sidebar
- **[pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core)** — agent runtime (tool loop, streaming, state)
- **[pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)** — multi-provider LLM abstraction (Anthropic, OpenAI, Google, GitHub Copilot)
- **[pi-web-ui](https://www.npmjs.com/package/@earendil-works/pi-web-ui)** — shared web UI (message rendering, storage, settings)
- **[Office.js](https://learn.microsoft.com/en-us/office/dev/add-ins/)** — Excel workbook API

### Code Layout

```
src/
├── taskpane/          # App init, session management, tab layout, context injection
├── taskpane.html      # Entry HTML (loads Office.js + taskpane.ts)
├── taskpane.ts        # Entry script
├── boot.ts            # Pre-mount setup (CSS, patches)
├── tools/             # 18 core tools + experimental tools + registry
├── prompt/            # System prompt constructor (with DOMAIN_KNOWLEDGE block)
├── context/           # Workbook blueprint cache, selection/change tracking
├── auth/              # OAuth providers, API proxy, credential restore
├── models/            # Model ordering + preset providers (OpenRouter, regional gateways, …)
├── ui/                # Sidebar component, tool renderers, theme CSS
│   └── theme/         # Design tokens, component styles (DM Sans + teal-green palette)
├── commands/          # Slash command registry + builtins
├── extensions/        # Extension store, sandbox runtime, permissions
├── integrations/      # Web Search + MCP Gateway integration catalog
├── skills/            # Agent Skills catalog + runtime loader (includes skills/tasaciones/)
├── experiments/       # Feature flag definitions + toggle logic
├── workbook/          # Workbook identity (hashed), session association, coordinator
├── conventions/       # Format defaults (currency, negatives, decimals)
├── rules/             # Persistent rules store (user-level or workbook-level)
├── compaction/        # Thresholds + auto-compaction logic
├── storage/           # IndexedDB initialization
├── files/             # Files workspace
├── audit/             # Audit log of workbook changes
├── messages/          # Message conversion helpers
├── debug/             # Debug mode utilities
├── stubs/             # Browser stubs for CSP/Node-only deps
├── compat/            # Compatibility patches
└── utils/             # Shared helpers (HTML escape, type guards, errors)

scripts/               # Dev helpers — CORS proxy, tmux/python bridges, manifest gen
pkg/proxy/             # Publishable npm CLI package: `tasaciones-proxy`
pkg/python-bridge/     # Publishable npm CLI package: `tasaciones-python-bridge`
pkg/tmux-bridge/       # Publishable npm CLI package: `tasaciones-tmux-bridge`
tests/                 # Unit + security tests
docs/                  # Current docs (install/deploy/features/policy) + archive/
skills/                # Agent Skills definitions (tasaciones + bridges)
public/assets/         # Add-in icons (16/32/80/128px)
```

### Key Design Patterns

- **Tool registry as single source of truth** — `src/tools/registry.ts` defines all core tool names and construction. UI renderers, input humanizers, and prompt docs derive from it.
- **Workbook coordinator** — serializes mutant tool calls per workbook to prevent concurrent writes from multiple session tabs.
- **Auto-context** — workbook blueprint, selection state, and recent changes are injected before each user message.
- **Execution policy** — each tool is classified as `read/none` or `mutate/content|structure` to determine locking and checkpoint behavior.
- **Recovery checkpoints** — mutations automatically snapshot affected cells before writing, enabling one-click rollback.
- **Extension sandbox** — untrusted extensions run in iframe sandbox by default; built-in/local modules run on the host.

## Deployment

The production build is a static site deployed on [Vercel](https://vercel.com). See [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) for maintainer setup.

Users install by downloading `manifest.prod.xml` and uploading it to Excel — the manifest points to the hosted Vercel URL. Updates are automatic (close and reopen the taskpane).

## Documentation

| Doc | Description |
|---|---|
| [NOTICE.md](NOTICE.md) | Upstream credits and high-level divergences list |
| [docs/guides/install.md](docs/guides/install.md) | Non-technical installation guide |
| [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) | Hosted deployment (Vercel) |
| [docs/guides/windows-sideload.md](docs/guides/windows-sideload.md) | Sideload on Excel Desktop Windows |
| [docs/features/extensions.md](docs/features/extensions.md) | Extension authoring guide |
| [docs/features/integrations-external-tools.md](docs/features/integrations-external-tools.md) | Web Search + MCP setup |
| [docs/architecture/security-threat-model.md](docs/architecture/security-threat-model.md) | Security threat model |
| [docs/architecture/upstream-divergences.md](docs/architecture/upstream-divergences.md) | Intentional divergences vs `tmustier/pi-for-excel` |
| [docs/features/compaction.md](docs/features/compaction.md) | Session compaction (`/compact`) |
| [src/tools/DECISIONS.md](src/tools/DECISIONS.md) | Tool behavior decision log |
| [src/ui/README.md](src/ui/README.md) | UI architecture + Tailwind v4 notes |
| [skills/tasaciones/SKILL.md](skills/tasaciones/SKILL.md) | Index of 6 bundled appraisal skills |

## Credits

This project is an open source fork. Full credits live in [NOTICE.md](NOTICE.md). Summary:

- **[pi-for-excel](https://github.com/tmustier/pi-for-excel)** by [Thomas Mustier](https://github.com/tmustier) (MIT) — the foundation of this fork.
- **[Pi](https://pi.dev)** by [Mario Zechner](https://github.com/badlogic) (MIT) — the agent framework that powers it. Tasaciones uses `pi-agent-core`, `pi-ai`, and `pi-web-ui` for the agent loop, LLM abstraction, and session storage.
- **[whimsical.ts](https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/whimsical.ts)** by [Armin Ronacher](https://github.com/mitsuhiko) (MIT) — the rotating "Working…" messages adapted from his Pi extension and rewritten for an appraisal audience.

**Current maintainer:** Gabriel Pantoja ([@gabrielpantoja-cl](https://github.com/gabrielpantoja-cl)) — [Loxos](https://loxos.cl). Fork maintenance since June 28, 2026.

## License

[MIT](LICENSE) — Copyright (c) 2026 Thomas Mustier; modifications Copyright (c) 2026-present Gabriel Pantoja / Loxos.

> Tasaciones by Loxos is an independent open source fork. It is not affiliated with, endorsed by, or sponsored by the upstream `pi-for-excel` project or its authors. See [NOTICE.md](NOTICE.md) for full credits and the list of intentional divergences.
