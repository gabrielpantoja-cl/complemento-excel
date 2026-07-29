# `.opencode/` -- per-project OpenCode configuration

This directory configures per-project OpenCode behavior: agents,
commands, and (in the future) skills. Discovered automatically by
OpenCode when working in this repo. See
[OpenCode docs](https://opencode.ai/docs/agents/) for the discovery
mechanism.

## Layout

```
.opencode/
  agents/
    qa-excel.md          # Lit + Office.js debugger
    perito.md            # Chilean appraisal domain advisor (read-only)
    release-manager.md   # pre-deploy gatekeeper (lint/typecheck/build)
  commands/
    audit-cuadro.md     # /audit-cuadro  -> @qa-excel
    bump-version.md      # /bump-version   -> @release-manager
    check-prompt-cache.md # /check-prompt-cache (built-in agent)
```

## What lives here vs. elsewhere

| Concern | Lives in | Why |
|---|---|---|
| Agent personas | `.opencode/agents/` | Discovered by opencode CLI; project-canonical |
| Slash commands | `.opencode/commands/` | Discovered by opencode CLI; project-canonical |
| LLM provider keys, model IDs | `opencode.json` at repo root, **gitignored** | Per-developer; not committable (per AGENTS.md "Cost discipline" + "Provider allow-list" rows) |
| Add-in Agent Skills (Excel runtime) | `skills/tasaciones/*.md` | Discovered at build time by `src/skills/catalog.ts`; loaded INTO the add-in, **not** by opencode |
| Project rules and conventions | `AGENTS.md` at repo root | Auto-loaded by opencode as the default instruction file |

These five systems do NOT mix automatically. The two skills systems
in particular are intentionally separate (see "Why no
`.opencode/skills/` yet" below).

## Agents

Three subagents (mode: subagent) cover the project's chronic
frictions. All have `permission.task: deny` so they cannot spawn
sub-subagents -- this prevents the "doom loop" pattern documented in
opencode issues.

| Agent | When to invoke | Tools |
|---|---|---|
| `@qa-excel` | Lit/Office.js bugs, cuadro de referenciales roto, reactivity or sync issues, CSP problems | read-only + bash ask |
| `@perito` | Chilean appraisal questions: homologation formulas, DL 2.186 indemnization, faja vial, honorarios fee schedule, faja vial procedure | read-only (no bash, no edits) |
| `@release-manager` | Before pushing a version bump commit: validate lint/typecheck/build + cache headers | edit ask on package.json + taskpane.html; bash allowlisted for the verification commands |

To invoke any of these, type `@<agent-name>` in the opencode CLI/TUI
followed by your question.

## Commands

Three slash commands. Two dispatch to a subagent (`subtask: true`),
one runs shell checks directly against the primary agent.

| Command | What it does |
|---|---|
| `/audit-cuadro` | Dispatches to @qa-excel to scan all lote sheets (81-100) for `#REF!` errors, column-letter mismatches (P vs Q), and broken `referenciales` references |
| `/bump-version $ARGUMENTS` | Dispatches to @release-manager to bump semver and prepare the commit + release note |
| `/check-prompt-cache` | Runs `npm run test:context`, greps `vercel.json` cache headers, diffs against origin/main to catch prefix-cache hygiene regressions |

To use, type `/` in the opencode CLI/TUI to see the command palette,
or type `/<command-name>` directly.

## Why no `.opencode/skills/` yet

The repo already has a skill system at `skills/tasaciones/*.md`. These
are loaded into the Excel add-in at build time via
`src/skills/catalog.ts` (`import.meta.glob`) and surfaced to the
runtime LLM. They are **not** discovered by opencode CLI.

The Gemini Deep Research report (see
`docs/research/gemini-Opencode-Environment-Optimization-Plan.md`)
recommended merging these two systems by changing
`src/skills/catalog.ts` to glob from `.opencode/skills/`. We
deliberately skipped that for v1 because:

1. The skill frontmatter schemas are different. opencode accepts
   `name` + `description` only; the add-in's skill loader also reads
   custom fields (e.g. `metadata.audience`). Cross-globbing would
   require a translator in `catalog.ts`.
2. The skill content is interpreted by **two different LLMs with
   different prompt shapes** (opencode's CLI LLM vs the add-in's
   Excel-context LLM). A skill that reads cleanly in one may not in
   the other.
3. The two are coupled to different release cadences. Add-in skills
   ship inside the Vite bundle on every push. opencode skills are
   read live from disk by the CLI. Mixing them invites drift.

If a future iteration wants to consolidate, the right pattern is
probably: keep the source-of-truth skills in `.opencode/skills/`,
have `src/skills/catalog.ts` compile them into the bundle via
`import.meta.glob('../../.opencode/skills/*/SKILL.md', { as: 'raw' })`,
and add a thin schema-normalizer in catalog.ts. **Do not** do this
without testing the build output (per AGENTS.md "Bundle hygiene"
section).

## Why no MCP servers yet

The Gemini report recommended exposing `python-bridge` and
`tmux-bridge` as MCP servers via `.opencode/opencode.json`'s `mcp`
section. We skipped this for v1 because:

1. The existing bridge scripts are local-only (see
   `docs/bridges/python-bridge-contract.md`). They run as part of the
   add-in's local development server, not as standalone processes.
2. Exposing them as MCP would require them to be launchable as
   standalone `node` scripts with stdio JSON-RPC, which they
   currently aren't.
3. The docs/sources cited by the Gemini report on this topic
   (e.g. `v2.opencode.ai/mcp-servers`) don't exist or return 404, so
   we can't verify the configuration syntax without significant web
   research of our own.

If a future iteration wants MCP, the right move is to factor the
existing bridges into standalone MCP servers, then add the `mcp`
section to `opencode.json` (gitignored). See the official docs at
`https://opencode.ai/docs/mcp-servers/` when ready.

## Why no `opencode.json` at repo root

The Gemini report suggested committing `opencode.json` with
`instructions: ["AGENTS.md", "AGENTS.local.md"]`. We deliberately
skipped that because:

1. AGENTS.local.md is **gitignored** (it's per-developer local
   config, per AGENTS.md). Committing a project config that references
   a gitignored file would break any contributor who lacks that
   file.
2. opencode auto-loads `AGENTS.md` from the repo root by convention,
   so listing it in `instructions` would be redundant.
3. The gitignored per-developer `opencode.json` already covers
   provider keys, model ID, and per-machine config. Adding a checked-in
   one would either shadow it (per docs precedence rules) or be
   shadowed by it -- either way, confusing.

If a project-level override becomes needed (e.g. to set a
`default_agent: build` or pin a model), create a fresh
`opencode.json` with ONLY safe-to-commit keys. Keep model/provider
config in the gitignored one.

## Provenance

This layout is the v1 implementation of the recommendations in
`docs/research/gemini-Opencode-Environment-Optimization-Plan.md`,
with three deliberate omissions:

1. **`.opencode/skills/`** -- deferred (see above)
2. **MCP bridge to the add-in** -- deferred (see above)
3. **WebSocket bridge between opencode CLI and the add-in's
   `audit_ref_errors` / `link_referenciales_cuadro` tools** -- the
   Gemini report's Section 9 proposed this as a way to invoke add-in
   tools from the CLI. We deliberately skipped it because the
   opencode CLI and the Excel WebView run in disjoint processes
   (Node.js vs WebView2) and bridging them requires WebSocket
   infrastructure that doesn't exist in this repo. If a future
   need surfaces (e.g. "I want to invoke `audit_ref_errors` from
   the CLI directly"), open a discussion first -- the architectural
   cost is non-trivial.

When any of these are revisited, update this README with the
resulting decisions so the next agent doesn't re-litigate them.

## Validation

Run `npm run check` to confirm no regressions. The `.opencode/`
directory contains only Markdown and is not bundled by Vite, so
no client-side impact.

Run the agents manually from the opencode TUI (`@qa-excel` etc.) to
verify the system prompts render correctly.
