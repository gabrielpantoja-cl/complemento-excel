# Deep-research prompt: opencode dev environment for Tasaciones by Loxos

This file holds the verbatim copy-paste prompt for Gemini Deep
Research (or any other long-context research tool). It is meant
to be lifted in full and used as-is -- the goal is for the next
iteration of this investigation (after applying some of Gemini's
recommendations) to have an anchor to compare against.

## How to use

1. Open https://gemini.google.com (or your preferred Deep Research
   client -- Claude with web search works too).
2. Paste the entire **Prompt** section below into the chat.
3. Wait for the result. Cross-check citations against the source.
4. Convert Gemini's recommendations into concrete `.opencode/`
   changes via small PRs.

## Prompt

```markdown
You are a technical researcher. I'm going to give you context on a
specific project and I want you to investigate in depth how to improve
its development environment by configuring `.opencode/` (agents,
commands, skills). Look for evidence in opencode's official docs,
source code on GitHub, technical blog posts, and community
discussions. Cite sources with URLs. Distinguish between "opencode
explicitly says this" vs "this is community best practice" vs "this is
my speculation".

## The project

**Tasaciones by Loxos** is a Microsoft Excel add-in for real estate
appraisals and expropriation expert reports in Chile. It is a branded
fork of [pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT).

Stack: Vite + Lit + TypeScript. The taskpane runs inside an
Office.js WebView (`src/taskpane.html`). The bundle is served from
Vercel (`https://complemento-excel.vercel.app/src/taskpane.html`).

Repository: github.com/gabrielpantoja-cl/complemento-excel
Local path: `C:\Users\gabri\Developer\loxos\complemento-excel`
Dev OS: Windows 11 (also Linux for CI/tests).

## Current state of the development environment

### Repo documentation and conventions
- `AGENTS.md` at the root -- 290 lines, read before any change. It
  covers project identity, core tools conventions (with the wiring
  chain: `names.ts` -> `registry.ts` -> `capabilities.ts` ->
  `humanize-params.ts`), bundle hygiene, prompt caching gotchas,
  TypeScript policy, verification scripts and Excel sideloading.
- `AGENTS.local.md` is in `.gitignore` -- machine-local config.
- Pre-commit hook: `npm run lint && npm run typecheck`.
- Pre-push hook: `npm run audit:ci`.

### Skills (careful: there are two systems)
1. **`skills/` at the repo root** -- These are Agent Skills loaded
   into the Excel add-in at build time by `src/skills/catalog.ts`
   (via `import.meta.glob`). There are 6 tasaciones skills plus
   others (web-search, mcp-gateway, tmux-bridge, python-bridge,
   extending-pi). **They are NOT auto-loaded by opencode.**
2. **`.opencode/skills/`** -- These would be Agent Skills that
   opencode discovers and exposes to the LLM via its `skills` tool.
   They don't exist yet in this repo.

`AGENTS.md` has an explicit note: "Do not move `skills/` to
`.opencode/skills/` without also updating `src/skills/catalog.ts`
(`import.meta.glob`) -- that path is wired into the Vite build
bundle." In other words: the two systems do NOT mix automatically.

### LLM configuration
- Primary provider: MiniMax (MiniMax-M3 preset via the "preset" row
  in the add-in's provider login).
- In local `.opencode`: the dev uses the opencode CLI (I don't have
  access to read the exact `opencode.json`, but I do know it has
  MiniMax-M3 configured as the primary model).
- Two profiles: one low-budget for frequent diff iterations, one
  with M-3 for deep analysis.

### Built-in opencode agents available
The project does not define custom agents in `.opencode/agents/`. Only
the built-in ones (`build`, `plan`, `general`, `explore`, `scout`) are
used, explicitly mentioned in AGENTS.md. The dev has worked mainly
with `explore` (code search) and `general` (multi-step repair).

### Frictions I want to solve

1. **No version indicator in the add-in.** To verify that a push
   actually reached production I have to do the "change something
   visible and check if it changed" exercise (documented in
   `docs/architecture/update-flow.md`).
2. **The cuadro de referenciales keeps breaking.** The add-in has
   the `audit_ref_errors` read-only tool and the
   `link_referenciales_cuadro` write tool. But the dev has to
   remember to invoke them manually.
3. **`AGENTS.md` is loaded with things that are actually dev-specific
   (MiniMax-M3 preset row, Windows sideload commands). AGENTS.md
   should be repo-canonical; the local stuff goes to AGENTS.local.md.
4. **There is no command to run the §5 (Continuous Improvement loop)
   on a transcript.** The dev has to open the mega prompt manually
   every time.
5. **There is no agent specialized in the tasaciones domain.** The
   dev invokes `tasaciones/homologacion` or `tasaciones/honorarios`
   skills manually, but there is no agent that coordinates these
   decisions for a full appraisal workflow.

## Specific questions to investigate

Answer each one with sources and justification:

1. **Canonical structure of `.opencode/`**. What is the layout
   recommended by opencode for `config`, `agents/`, `commands/`,
   `skills/`? Is there an official "best practices" section? What
   opencode version supports it?

2. **Custom agents for this project**. Design and justify 3-5
   custom agents that would close the gaps mentioned above. For each
   one:
   - Name
   - When to invoke it (trigger pattern)
   - Which tools/skills should it have available
   - What would the system prompt content look like (sketch, not
     exhaustive)
   - Whether it should be a sub-agent (Task tool) or top-level

3. **Custom commands for this project**. Design 5-8 commands
   (`/...`) that replace the ad-hoc bash the dev runs frequently.
   For each one:
   - Name and arguments
   - One-line description
   - What it does exactly

4. **Opencode-side skills**. Should there be separate skills in
   `.opencode/skills/` in addition to those that already exist in
   `skills/`? If yes, which ones? How to avoid drift between the two?

5. **Split AGENTS.md vs AGENTS.local.md**. What content should move
   from AGENTS.md (canonical) to AGENTS.local.md (machine-local)?
   Concrete line-by-line list for the sections that are currently
   mixed together.

6. **Wiring with `src/skills/catalog.ts`**. If I define opencode
   skills that complement the add-in ones, how do I avoid drift? Is
   there a recommended pattern (e.g. a sync script)?

7. **Prompt cache hygiene with MiniMax-M3**. AGENTS.md has strict
   cache rules (don't rebuild tool lists with unstable ordering,
   don't mutate the base system prompt mid-turn). How do these
   rules affect the design of agents/commands/skills? Are there
   specific patterns to avoid?

8. **Is `.opencode/mcp.json` worth it** for this project? We
   already have python-bridge and tmux-bridge as local scripts.
   What do we gain by exposing them as MCP servers to opencode?

9. **Differences: opencode CLI vs the add-in**. The dev uses the
   opencode CLI to talk to me, but the add-in has its own tools
   (`read_range`, `write_cells`, etc.). Is there a pattern for
   opencode commands to invoke add-in tools, or are these
   completely disjoint systems?

## Expected output format

- Executive summary (3 bullets max)
- Section per question with answer + sources
- Concrete file sketch for `agents/`, `commands/`, `skills/` that
  I can copy and paste
- Risks / things to avoid
- If you find trade-offs, explain them without recommending timidity

Don't give me a generic survey of "what is opencode". Start by
assuming I know what it is and that I need specific recommendations
for THIS project. If at any point a recommendation depends on an
experimental or unstable opencode feature, flag it as such.
```

## Iteration log

| Date | Change |
|---|---|
| 2026-07-22 | Initial Spanish version. |
| 2026-07-22 | Translated to English for Gemini Deep Research; added iteration log table. |
