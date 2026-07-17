# Pi for Excel

Open-source, multi-model AI sidebar add-in for Microsoft Excel. Powered by [Pi](https://pi.dev).

Pi for Excel is an AI agent that lives inside Excel. It reads your workbook, makes changes, and does research â€” using any model you choose. Bring your own API key or OAuth login for Anthropic, OpenAI, Google Gemini, or GitHub Copilot.

## Features

**Core spreadsheet tools** â€” 16 built-in tools that the AI can call to interact with your workbook:

| Tool | What it does |
|---|---|
| `get_workbook_overview` | Structural blueprint â€” sheets, headers, named ranges, tables, charts, pivots |
| `read_range` | Read cells in compact (markdown), CSV, or detailed (with formatting) mode |
| `write_cells` | Write values/formulas with overwrite protection and auto-verification |
| `fill_formula` | AutoFill a formula across a range (relative refs adjust automatically) |
| `search_workbook` | Find text, values, or formula references across all sheets |
| `modify_structure` | Insert/delete rows/columns, add/rename/delete/hide sheets |
| `format_cells` | Apply formatting â€” fonts, colors, number formats, borders, named styles |
| `conditional_format` | Add or clear conditional formatting rules |
| `trace_dependencies` | Trace formula lineage (precedents upstream or dependents downstream) |
| `explain_formula` | Plain-language formula explanation with cited cell references |
| `view_settings` | Gridlines, headings, freeze panes, tab color, sheet visibility |
| `comments` | Read, add, update, reply, resolve/reopen cell comments |
| `workbook_history` | List/restore automatic in-between-saves backups for workbook mutations |
| `instructions` | Persistent user-level and workbook-level guidance for the AI |
| `conventions` | Configurable formatting defaults (currency, negatives, zeros, decimal places) |
| `skills` | Bundled Agent Skills for task-specific workflows |

**Multi-model support** â€” use any supported provider; switch models mid-conversation:
- **Anthropic** (Claude) â€” API key or OAuth
- **OpenAI** / **OpenAI Codex** â€” API key
- **Google Gemini** â€” API key
- **GitHub Copilot** â€” OAuth
- **Custom OpenAI-compatible gateways** â€” configure endpoint + model + API key in `/settings`

**Session management** â€” multiple session tabs per workbook, auto-save/restore, session history, `/resume` to pick up where you left off.

**Auto-context injection** â€” the AI automatically receives the workbook blueprint, your current selection, and recent cell changes before every turn. No need to manually describe what you're looking at.

**Workbook recovery** â€” automatic checkpoints before every mutation. One-click revert from the sidebar if something goes wrong.

**Formatting conventions** â€” define your house style once (currency symbol, negative style, decimal places) and the AI follows it automatically.

**Slash commands** â€” `/model`, `/login`, `/settings`, `/rules`, `/extensions`, `/tools`, `/export`, `/compact`, `/new`, `/resume`, `/history`, `/shortcuts`, and more.

**Extensions** â€” install sidebar extensions (mini-apps) from chat. The AI can generate and install extension code directly via the `extensions_manager` tool. Extensions run in an iframe sandbox by default.

**Integrations** â€” opt-in external tool integrations:
- **Web Search** (Jina default, Serper/Tavily/Brave) + `fetch_page` â€” find and read external sources without leaving Excel
- **MCP Gateway** â€” connect to user-configured MCP servers for custom tool access

**Bridge + advanced controls** (managed via `/experimental`):
- Tmux bridge settings â€” configure bridge URL/token and run health checks
- Python / LibreOffice bridge settings â€” configure bridge URL/token
- Files workspace write/delete gate â€” shared artifact storage across sessions (assistant built-in docs under `assistant-docs/` are always available read-only)
- Advanced extension controls â€” remote URL opt-in, permission enforcement, sandbox rollback, and Widget API v2

(Web Search + MCP are managed in `/tools`, or `/extensions` â†’ Connections.)

## Install

1. Download [`manifest.prod.xml`](https://pi-for-excel.vercel.app/manifest.prod.xml)
2. Add it to Excel â€” see [**install guide**](docs/guides/install.md) for step-by-step instructions (macOS + Windows)
3. Click **Open Pi** in the ribbon
4. Connect a provider (API key or OAuth), or configure a custom OpenAI-compatible gateway in `/settings`
5. Start chatting â€” try `What sheets do I have?` or `Summarize my current selection`

## Developer Quick Start

### Prerequisites

- **Node.js â‰¥ 20**
- **mkcert** â€” for local HTTPS (required by Office.js)

### Setup

```bash
git clone https://github.com/tmustier/pi-for-excel.git
cd pi-for-excel
npm install

# Generate local HTTPS certs (Office.js requires HTTPS)
mkcert -install   # one-time CA setup
mkcert localhost   # creates localhost.pem + localhost-key.pem
mv localhost-key.pem key.pem
mv localhost.pem cert.pem
```

### Run

```bash
npm run dev        # Vite dev server on https://localhost:3000
```

Then sideload the dev manifest into Excel:

**macOS** ([Microsoft docs](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac)):
```bash
cp manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
```
Then open Excel â†’ **Insert** â†’ **My Add-ins** â†’ **Pi for Excel**.

**Windows** ([Microsoft docs](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins)):

Excel Desktop no longer exposes an "Upload My Add-in" UI as of 2026. Use a Trusted Add-in Catalog via the script in this repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -ManifestPath .\manifest.xml
# Make sure `npm run dev` is running in another terminal
```

Then close/reopen Excel and **Home â†’ Add-ins â†’ More Add-ins â†’ SHARED FOLDER â†’ Tasaciones â†’ Add**. Full procedure and troubleshooting in [`docs/guides/windows-sideload.md`](docs/guides/windows-sideload.md).

The dev manifest points to `https://localhost:3000`. The production manifest (`manifest.prod.xml`) points to the hosted Vercel deployment.

### Useful commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (port 3000, HTTPS) |
| `npm run build` | Production build â†’ `dist/` |
| `npm run check` | Lint + typecheck + CSS theme checks |
| `npm run typecheck` | TypeScript type checking only |
| `npm run lint` | ESLint |
| `npm run test:models` | Unit tests â€” model ordering |
| `npm run test:context` | Unit tests â€” tools, context, sessions, extensions, integrations |
| `npm run test:security` | Security policy tests â€” proxy, CORS, sandbox, OAuth |
| `npm run proxy:https` | CORS proxy for OAuth flows (default `https://localhost:3003`) |
| `npm run validate` | Validate the Office add-in manifest |

### CORS proxy

Some OAuth token endpoints are blocked by CORS inside Office webviews. If OAuth login fails:

1. User setup command: `npx pi-for-excel-proxy` (or `curl -fsSL https://piforexcel.com/proxy | sh` if Node is missing)
2. Dev/source setup command: `npm run proxy:https` (defaults to `https://localhost:3003`)
3. In Pi â†’ `/settings` â†’ **Proxy** â†’ enable and set the URL
4. Retry login

API-key auth generally works without the proxy.

### Local bridges (Python / tmux)

Use one-command local bridge helpers:

- Python / LibreOffice bridge: `npx pi-for-excel-python-bridge` (default URL `https://localhost:3340`, real mode)
- tmux bridge: `npx pi-for-excel-tmux-bridge` (default URL `https://localhost:3341`, real mode)

In Pi, these localhost bridge URLs are used by default. Configure `/experimental ...-bridge-url` only when you want a non-default URL.

Real-mode prerequisites:

- `python3` must be installed for `python_run` / `python_transform_range`
- LibreOffice (`soffice` or `libreoffice`) is required for `libreoffice_convert`
- `tmux` is required for the tmux bridge real mode

Optional assisted install (macOS/Homebrew):

- `npx pi-for-excel-python-bridge --install-missing`
- `npx pi-for-excel-tmux-bridge --install-missing`

Manual macOS install:

```bash
brew install tmux
brew install --cask libreoffice
```

To force safe simulated mode instead:

- `PYTHON_BRIDGE_MODE=stub npx pi-for-excel-python-bridge`
- `TMUX_BRIDGE_MODE=stub npx pi-for-excel-tmux-bridge`

Source-checkout alternatives remain available via `npm run python:bridge:https` and `npm run tmux:bridge:https`.

## Architecture

Pi for Excel is a single-page Office taskpane add-in built with:

- **[Vite](https://vite.dev/)** â€” dev server + production bundler
- **[Lit](https://lit.dev/)** â€” web components for the sidebar UI
- **[pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core)** â€” agent runtime (tool loop, streaming, state management)
- **[pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)** â€” multi-provider LLM abstraction (Anthropic, OpenAI, Google, GitHub Copilot)
- **[pi-web-ui](https://www.npmjs.com/package/@earendil-works/pi-web-ui)** â€” shared web UI components (message rendering, storage, settings dialogs)
- **[Office.js](https://learn.microsoft.com/en-us/office/dev/add-ins/)** â€” Excel workbook API

### Source layout

```
src/
â”œâ”€â”€ taskpane/          # App init, session management, tab layout, context injection
â”œâ”€â”€ taskpane.html      # Entry HTML (loads Office.js + taskpane.ts)
â”œâ”€â”€ taskpane.ts        # Entry script
â”œâ”€â”€ boot.ts            # Pre-mount setup (CSS, patches)
â”œâ”€â”€ tools/             # 16 core tools + feature-flagged tools + registry
â”œâ”€â”€ prompt/            # System prompt builder
â”œâ”€â”€ context/           # Workbook blueprint cache, selection/change tracking
â”œâ”€â”€ auth/              # OAuth providers, API proxy, credential restore
â”œâ”€â”€ models/            # Model ordering + version scoring
â”œâ”€â”€ ui/                # Sidebar component, tool renderers, theme CSS
â”‚   â””â”€â”€ theme/         # Design tokens, component styles (DM Sans + teal-green palette)
â”œâ”€â”€ commands/          # Slash command registry + builtins
â”œâ”€â”€ extensions/        # Extension store, sandbox runtime, permissions
â”œâ”€â”€ integrations/      # Web Search + MCP Gateway integration catalog
â”œâ”€â”€ skills/            # Agent Skills catalog + runtime loader
â”œâ”€â”€ experiments/       # Feature flag definitions + toggle logic
â”œâ”€â”€ workbook/          # Workbook identity (hashed), session association, coordinator
â”œâ”€â”€ conventions/       # Formatting defaults (currency, negatives, dp)
â”œâ”€â”€ rules/             # Persistent user/workbook rules store
â”œâ”€â”€ compaction/        # Auto-compaction thresholds + logic
â”œâ”€â”€ storage/           # IndexedDB initialization
â”œâ”€â”€ files/             # Files workspace (read/list always on; write/delete feature-gated)
â”œâ”€â”€ audit/             # Workbook change audit log
â”œâ”€â”€ messages/          # Message conversion helpers
â”œâ”€â”€ debug/             # Debug mode utilities
â”œâ”€â”€ stubs/             # Browser stubs for CSP/Node-only deps (Ajv, Bedrock, stream, etc.)
â”œâ”€â”€ compat/            # Compatibility patches (Lit, marked, model selector)
â””â”€â”€ utils/             # Shared helpers (HTML escape, type guards, errors)

scripts/               # Dev helpers â€” CORS proxy, tmux/python bridges, manifest gen
pkg/proxy/             # Publishable npm CLI package: `pi-for-excel-proxy`
pkg/python-bridge/     # Publishable npm CLI package: `pi-for-excel-python-bridge`
pkg/tmux-bridge/       # Publishable npm CLI package: `pi-for-excel-tmux-bridge`
tests/                 # Unit + security tests (~50 test files)
docs/                  # Current docs (install/deploy/features/policy) + archive/ for historical plans
skills/                # Bundled Agent Skill definitions (web-search, mcp-gateway, tmux-bridge, python-bridge)
public/assets/         # Add-in icons (16/32/80/128px)
```

### Key design patterns

- **Tool registry as single source of truth** â€” `src/tools/registry.ts` defines all core tool names and construction. UI renderers, input humanizers, and prompt docs all derive from it.
- **Workbook coordinator** â€” serializes mutating tool calls per-workbook to prevent concurrent writes from multiple session tabs.
- **Auto-context** â€” the workbook blueprint, selection state, and recent changes are injected before each user message so the AI always knows what it's looking at.
- **Execution policy** â€” each tool is classified as `read/none` or `mutate/content|structure` to determine locking and checkpoint behavior.
- **Recovery checkpoints** â€” mutations automatically snapshot affected cells before writing, enabling one-click rollback.
- **Extension sandbox** â€” untrusted extensions (inline code, remote URLs) run in an iframe sandbox by default; built-in/local modules run on the host.

## Deployment

The production build is a static site deployed to [Vercel](https://vercel.com). See [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) for maintainer setup.

Users install by downloading `manifest.prod.xml` and uploading it in Excel â€” the manifest points to the hosted Vercel URL. Updates are automatic (close and reopen the taskpane).

## Documentation

| Doc | Description |
|---|---|
| [docs/guides/install.md](docs/guides/install.md) | Non-technical install guide |
| [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) | Hosted deployment (Vercel) |
| [docs/features/extensions.md](docs/features/extensions.md) | Extension authoring guide |
| [docs/features/integrations-external-tools.md](docs/features/integrations-external-tools.md) | Web Search + MCP integration setup |
| [docs/architecture/security-threat-model.md](docs/architecture/security-threat-model.md) | Security threat model |
| [docs/features/compaction.md](docs/features/compaction.md) | Session compaction (`/compact`) |
| [src/tools/DECISIONS.md](src/tools/DECISIONS.md) | Tool behavior decisions log |
| [src/ui/README.md](src/ui/README.md) | UI architecture + Tailwind v4 notes |

## Credits

- [Pi](https://github.com/badlogic/pi-mono) by [@badlogic](https://github.com/badlogic) (Mario Zechner) â€” the agent framework powering this project. Pi for Excel uses pi-agent-core, pi-ai, and pi-web-ui for the agent loop, LLM abstraction, and session storage.
- [whimsical.ts](https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/whimsical.ts) by [@mitsuhiko](https://github.com/mitsuhiko) (Armin Ronacher) â€” the rotating "Workingâ€¦" messages are adapted from his Pi extension, rewritten for a spreadsheet/finance audience.

## License

[MIT](LICENSE) Â© Thomas Mustier
