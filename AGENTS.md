# AGENTS.md

**Last reviewed:** 2026-06-30

Notes for agents working in this repo. Read this file before making any change.

## Project identity

**Tasaciones by Loxos** — an AI sidebar add-in for Microsoft Excel tailored for Chilean real estate appraisals (*tasaciones*). This repo is a branded fork of [pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT). Divergences from upstream are tracked in `docs/upstream-divergences.md`; read that file before adding new divergences.

Stack: **Vite + Lit + TypeScript**, deployed to **Vercel**. The taskpane runs inside an Office.js WebView (`src/taskpane.html`). The add-in manifest is `manifest.xml` (dev) / `manifest.prod.xml` (prod).

Brand colours, display name (`Tasaciones`), and add-in metadata live in `manifest.prod.xml` and the Vite theme tokens under `src/ui/theme/`. Do not reintroduce upstream branding ("Pi for Excel") in user-visible strings.

## Read before changing behavior

- Tool behavior decisions: `src/tools/DECISIONS.md`
- UI/CSS architecture: `src/ui/README.md` (Tailwind v4 `@layer` gotcha)
- Upstream divergences: `docs/upstream-divergences.md`
- Docs index: `docs/README.md`
- Model registry freshness: `docs/model-updates.md` (if **Last verified** > 1 week, refresh Pi deps + re-verify model IDs before model UX changes)

## High-leverage conventions

### Core tools: one source of truth

- Define core tool names in `src/tools/registry.ts` (`CORE_TOOL_NAMES`, `CoreToolName`, `createCoreTools()`).
- Do not duplicate tool-name lists; import `CORE_TOOL_NAMES`.
- When adding/removing a core tool, update in the same PR:
  - `src/tools/registry.ts`
  - `src/ui/tool-renderers.ts`
  - `src/ui/humanize-params.ts`
  - `src/context/tool-disclosure.ts`
  - `src/prompt/system-prompt.ts` (if documented tool list changes)

### Tool results (`ToolResultMessage.details`)

- Keep human-readable output in `result.content`.
- Put stable machine metadata in `result.details`.
- UI should prefer `details`, with fallback for older persisted sessions.
- Reuse guards/types from `src/tools/tool-details.ts`.

### Workbook identity + session restore

- Never persist raw `Office.context.document.url`.
- Use `getWorkbookContext()` from `src/workbook/context.ts`.
- Use `src/workbook/session-association.ts` helpers for SettingsStore mapping keys.

### Security / HTML / local servers

- Avoid `innerHTML` for user/tool/session content; use DOM APIs or `src/utils/html.ts`.
- Keep markdown protections from `installMarkedSafetyPatch()` (`src/compat/marked-safety.ts`).
- Keep strict origin allowlists in:
  - `scripts/cors-proxy-server.mjs`
  - `scripts/tmux-bridge-server.mjs`
  - `scripts/python-bridge-server.mjs`
- Keep proxy target filtering strict in `scripts/proxy-target-policy.mjs`.
  - Do not commit permissive defaults (e.g. `ALLOW_ALL_TARGET_HOSTS=1`).

### Bundle hygiene (Office WebView)

- Avoid Node-only imports and side-effect barrel imports.
- After import/dependency changes, run `npm run build` and check chunk sizes + Vite browser-compat warnings.

### Prompt caching gotchas

- Prompt cache keys are prefix-based and sensitive to: model identity, system prompt, tool schemas, and session key.
- Keep static prefix content stable (no timestamps/random IDs in system prompt or tool metadata).
- Prefer message-tail updates for volatile state (auto-context/system reminders) instead of mutating base prompt text every turn.
- Keep tool ordering deterministic; do not rebuild tool lists with unstable ordering.
- Do not reintroduce blanket eager `setTools(...)` on refresh passes when extension tools exist; use fingerprint + extension tool revision semantics.
- When changing context/tool/model wiring, validate against `docs/cache-observability-baselines.md` and record expected vs observed `prefixChangeReasons`.

## TypeScript policy

- No `// @ts-ignore`.
- If unavoidable: `// @ts-expect-error -- <reason>` with a real reason.
- Avoid explicit `any` / `as any`; prefer specific types, unions, generics, or `unknown` + narrowing.
- Avoid non-null assertions where practical; use guards/early throws.

## Verification

```bash
npm run check          # lint + typecheck + all CSS/theme/lockstep checks
npm run build          # production bundle — check chunk sizes
npm run test:models    # model ordering unit tests
npm run test:context   # prompt/context/tool disclosure/session wiring tests
npm run test:security  # proxy/bridge/auth/HTML safety tests
```

Run `test:context` when touching prompt, context, tool disclosure, or session wiring.
Run `test:security` when touching proxy, bridge, auth, or HTML safety paths.
Manual Excel smoke test required when touching session persistence, tools, auth, or UI wiring.

> **Dev environment:** Lenovo Legion 5, dual boot Windows 11 + Linux. All build/test commands work on both. Excel smoke tests require Windows boot — sideload `manifest.xml` (dev) or `manifest.prod.xml` (prod) via Insert → My Add-ins → Upload My Add-in.

### Visual UI verification (agent-browser)

Use the **UI Gallery** (`src/ui-gallery.html`) to verify CSS and component changes
without needing Excel. It renders mock components with the real CSS theme.

```bash
./scripts/ui-verify.sh                    # Full gallery screenshot
./scripts/ui-verify.sh diff-table         # Screenshot a specific section
./scripts/ui-verify.sh taskpane           # Screenshot the real taskpane (waits for Office timeout)
./scripts/ui-verify.sh stop               # Clean up browser session
```

Available gallery sections: `badges`, `file-items`, `tool-cards`, `tool-groups`,
`diff-table`, `text-preview`, `buttons`, `toasts`, `markdown`.

Or use agent-browser directly:

```bash
npx agent-browser --session pi-ui open http://localhost:3000/src/ui-gallery.html
npx agent-browser --session pi-ui snapshot -i          # See interactive elements
npx agent-browser --session pi-ui screenshot shot.png
npx agent-browser --session pi-ui close
```

Full taskpane inspection (boots without Excel after 3 s timeout):

```bash
npx agent-browser open http://localhost:3000/src/taskpane.html
npx agent-browser wait 4000
npx agent-browser snapshot -i -c
npx agent-browser console --json
npx agent-browser errors --json
```

When to add new gallery sections:
- Adding a new component type → add a mock render in `src/ui-gallery.ts`
- Changing CSS for an existing component → verify via `./scripts/ui-verify.sh <section>`

## Pre-commit

`.githooks/pre-commit` runs `npm run lint` + `npm run typecheck`.
Bypass only when explicitly needed: `git commit --no-verify`.

## Excel sideloaded manifest gotcha (macOS)

Excel loads a sideloaded manifest from:
`~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/{add-in-id}.manifest.xml`

If local changes do not show up:
1. Verify sideloaded manifest points to `https://localhost:3000/...` (not production URL).
2. Recopy manifest:
   ```bash
   cp manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/a1b2c3d4-e5f6-7890-abcd-ef1234567890.manifest.xml
   ```
3. Quit Excel fully and reopen.
4. If still stale, clear WKWebView cache and relaunch Excel:
   ```bash
   rm -rf ~/Library/Containers/com.microsoft.Excel/Data/Library/WebKit/
   rm -rf ~/Library/Containers/com.microsoft.Excel/Data/Library/Caches/WebKit/
   ```

## Skills

Bundled Agent Skills (loaded into the Excel add-in at build time by
`src/skills/catalog.ts`; **not** auto-loaded by opencode's `skill` tool):

| Skill | Trigger |
|---|---|
| `web-search` | Search the public web for up-to-date facts (Jina default). |
| `mcp-gateway` | Discover and call tools from configured MCP servers. |
| `tmux-bridge` | Local terminal access via the tmux bridge. |
| `python-bridge` | Native Python execution via the Python bridge. |
| `extending-pi` | Plan and build Pi for Excel extensions safely. |
| `tasaciones` | Loxos-specific index of Chilean tasación sub-procedures. |

The fork's `skills/` directory is consumed by the add-in's own runtime loader,
not by opencode's `skill` discovery. Do **not** move `skills/` to
`.opencode/skills/` without also updating `src/skills/catalog.ts`
(`import.meta.glob`) — that path is wired into the Vite build bundle.

## Agents

No custom agents defined in this fork. The built-in agents (`build`, `plan`,
`general`, `explore`, `scout`) cover current needs.

If you add a custom agent, place it at `.opencode/agent/<name>.md` and update
this section.

## Commands

No custom commands defined in this fork.

If you add a custom command, place it at `.opencode/command/<name>.md` and
update this section.

## Models and data residency

| Field | Value |
|---|---|
| Primary model | `minimax-coding-plan/MiniMax-M3` (single-model, no fallback) |
| Provider docs | **Unknown** — no public docs surfaced in research; treat pricing / limits / deprecations as unverified |
| Data residency | Low-sensitivity repo (public code). Provider egress is acceptable for code review. Workbook contents do not leave the user's machine via opencode directly. |
| Cost discipline | No routing available (single model). Discipline lives in prompt-cache hygiene (see "Prompt caching gotchas" above). |
| Provider allow-list | `enabled_providers: ["minimax-coding-plan"]` — only this provider is loadable by opencode. |
