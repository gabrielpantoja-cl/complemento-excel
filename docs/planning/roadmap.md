# Roadmap -- Tasaciones by Loxos

> Living document. Single source of truth for "what's next". Updated as
> commits land and as new evidence (smoke sessions, transcripts, telemetry)
> accumulates. Cite commits by short SHA when possible; preserve the
> link from symptom -> cause -> fix -> followup so future agents and humans
> don't relearn the same lessons.

## Status snapshot -- 2026-07-22

| Surface | State | Evidence |
|---|---|---|
| Branch | `main @ 0f052da` | `git log --oneline -1` |
| Excel web (Linux + Chromium) | **end-to-end working** with MiniMax-M3 via the preset row | This session: sidebar opens, "hola" streams back content |
| Excel Desktop (Windows / Mac) | **untested** | No Windows boot in this iteration; Mac side never set up |
| Smoke runs | 1 transcript processed via the section 5 loop: `2026-07-22-vinculando-referenciales-a-las-fichas.md` (cuadro de referenciales repair) | `docs/transcripts/sessions/` |
| Unit tests | lint + typecheck green; full suite runs only on Node >= 22.19 | `npm run check` passes locally on Node 20; CI runs on Node 22 |
| Deployment | Vercel auto-build on every `main` push; identity must use `gabrielpantojarivera@gmail.com` to avoid the antifraud email-mismatch block | Commit `0f052da` reached prod |
| Domain knowledge | `system-prompt.ts` DOMAIN_KNOWLEDGE extended with cuadro-de-referenciales block; 6 bundled skills including `tasaciones/cuadro-referenciales` | See Track D |
| Tools | 2 new core tools: `audit_ref_errors`, `link_referenciales_cuadro` | Track E |

## Philosophy

Three principles, in priority order:

1. **Real-device smoke first, before new features.** A synthetic test
   that doesn't reproduce the actual user's spreadsheet is worth less
   than a 10-minute desktop session that proves the agent writes to
   real historic tasacion workbooks.
2. **The Continuous Improvement loop is the engine.** Transcripts are
   the highest-leverage artefact we produce. Every smoke run should
   flow through section 5 below and produce committed improvements within
   one working day.
3. **Ship small, ship green.** Each track item should land in its
   own commit with passing `npm run check` and a clear commit message.
   The MiniMax session proved this pays off -- every failing config was
   a single commit revert away.

## Tracks

Tracks are ordered by expected impact per hour of work. Each track has
acceptance criteria and links to the commits that already moved it.

### Track A -- Real-device smoke (Excel Desktop on Windows / Mac)

**Why first.** Every other improvement is wasted if the agent behaves
differently on a fresh Chromium tab than on the actual Excel desktop
where the user does their day job.

| ID  | Action | Acceptance |
|---|---|---|
| A1  | Boot Lenovo Legion 5 into Windows 11, install Microsoft 365, sideload `manifest.prod.xml`. | Add-in shows in Home -> Add-ins -> Tasaciones. |
| A2  | Same on macOS via `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/` sideload path. | Add-in shows in Insert -> My Add-ins. |
| A3  | Open a real historic tasacion workbook (`docs/fixtures/tasaciones/` -- see D3). | Workbook opens; sidebar connects to MiniMax. |
| A4  | Run the canned prompt set in section 4; capture each transcript + every tool call. | Transcripts saved to `docs/transcripts/YYYY-MM-DD-<host>-<slug>.md`. |
| A5  | For each transcript, run the section 5 process; commit fixes. | Each gap -> a commit on `main`. |

**Linked commits:** none yet. **Status:** A1 pending Windows reboot.

### Track B -- Continuous improvement loop (the engine)

| ID  | Action | Acceptance |
|---|---|---|
| B1  | Add `docs/transcripts/` directory with the convention `YYYY-MM-DD-<host>-<slug>.md` (single-file session log). | First transcript committed after A4. |
| B2  | Add a "Export transcript" button in the taskpane footer that downloads the current session as a markdown file (compatible with section 5 prompt input). | Button + handler shipped. |
| B3  | Standardise which dev agent processes transcripts: a single committed `AGENTS.md` instruction + an exported alias. | README + alias in place. |
| B4  | Operate section 5 on every transcript within 48 h. | Each transcript -> >= 1 follow-up commit (skill update, system-prompt patch, tool fix). |

**Linked commits:**
- `a7e1daf feat(export): add Markdown transcript export + button in status bar (roadmap B2/F2)`

**Status:** B1 partially done (1 transcript at `docs/transcripts/sessions/2026-07-22-*.md`), B2 done, B3 + B4 open.

### Track C -- Provider framework maturity

The MiniMax work validated a generic preset abstraction. The next
presets slot in with ~5 lines each, but only after we close the
remaining gaps.

| ID  | Action | Acceptance |
|---|---|---|
| C1  | Add a second Token Plan preset (OpenRouter or Moonshot) to prove the framework generalises. | A second preset works end-to-end with no code changes beyond `PRESET_PROVIDERS`. |
| C2  | Add a boot-time migration step in `src/taskpane/init.ts`: if any `pi-preset:*` record's `baseUrl` no longer matches its current preset definition, rewrite it (keep the user's `apiKey`, drop the old `models[]`). | A user with a stale record gets the new config without an explicit Disconnect + Save. |
| C3  | Document Node 22+ bootstrap in `AGENTS.local.md` so future Linux sessions run unit tests without re-discovering the `--experimental-strip-types` requirement. | Section added. |
| C4  | Promote the "preset rank" ordering to the registry (no longer "first in `ALL_PROVIDERS` wins"). | `presets.ts` exports an explicit `displayOrder`. |

**Linked commits:**
- `362e52e feat(providers): preset provider framework with MiniMax first`
- `80c2854 feat(presets): discriminated union + header overrides per kind`
- `b11c297 fix(presets): route MiniMax through api.minimax.io OpenAI-compat`
- `6792858 test(presets): pin stable-id overwrite guarantee for IndexedDB save`

**Status:** C4 open (reordering must move from UI to registry).

### Track D -- Chilean domain knowledge depth

The addin's job is to *be a perito tasador*. Domain gaps here are
worth more than any UI improvement.

| ID  | Action | Acceptance |
|---|---|---|
| D1  | Audit `src/prompt/system-prompt.ts` `DOMAIN_KNOWLEDGE` block against the seven homologation factors, liquidacion de honorarios (10.75 % SII retencion), faja vial procedure, DL 2.186, DL 1.939. Each section needs a paragraph + worked example. | Diff >= 80 lines; commit tagged `domain(tasaciones)`. |
| D2  | One skill file per major sub-procedure under `skills/tasaciones/`: `predio-vs-lote.md`, `escritura-vs-inscripcion-cbr.md`, `liquidacion-honorarios.md`, `homologacion-7-factores.md`, `faja-vial-dl-2186.md`, `cuadro-referenciales.md`. Each skill opens with: when to invoke, worked example, common pitfalls. | Skills present + tested. |
| D3  | Add `docs/fixtures/tasaciones/` with 3-5 anonymised historic workbooks (comprimido, sin metadatos personales). | Used as canned smoke inputs. |
| D4  | Add a per-skill regression test: an LLM session that invokes the skill against a controlled scenario must reproduce the expected dictamen. | Saved transcripts pinned in `docs/transcripts/regression/`. |

**Linked commits:**
- `0f052da feat(tasaciones): tools for Cuadro de Referenciales repair (Track D2/E1)`

**Status:** D2 partially done (`cuadro-referenciales.md` shipped via `0f052da`); the other 5 still pending.

### Track E -- Excel tool execution reliability

Hallucinated cell coordinates and overwritten formulas are the
top failure mode of LLM spreadsheet agents (per the benchmark
literature). The Tasaciones workload is structurally
forgiving -- lots of cross-references -- which makes reliability here
multiplicatively valuable.

| ID  | Action | Acceptance |
|---|---|---|
| E1  | Snapshot tests for the cell-coordinate conventions used by `write_cells`, `fill_formula`, `format_cells`, `modify_structure`. | AI cannot pretend "D5" is "D-5" or reuse ranges from a previous turn. |
| E2  | Round-trip test: feed a sample workbook through the tool, verify resulting cell values, styles, and formats. | CI catches "tool broke the workbook" regressions. |
| E3  | Fuzz the openai-completions adapter against malformed payloads (truncated JSON, wrong field types, oversized strings). | Addin surfaces a user-readable error, never a stack trace. |
| E4  | Add a "Confirm before mutating" prompt for tool calls that affect sheets other than the active sheet or that touch > 50 cells. | Single toggle in `/settings`. |

**Linked commits:**
- `0f052da feat(tasaciones): tools for Cuadro de Referenciales repair (Track D2/E1)`

**Status:** E1 partially done -- the cuadro-referenciales tool embeds a pure-logic test suite (19 tests) that pins the offset table for refs 1-13 in `fichas VR`. The general "snapshot tests for cell-coordinate conventions" item is still open.

### Track F -- Performance + observability

| ID  | Action | Acceptance |
|---|---|---|
| F1  | Surface bytes / tokens / latency / cache-hit % in the taskpane footer (already partially in place via `payloadStats`). | User can see per-turn cost in real time. |
| F2  | Workspace-level "Export session transcript" button (cf. B2). | One click -> markdown of the whole session. |
| F3  | Per-tool-call timing in the agent_runtime; flag tail latency (> 5 s) with URL, model, prompt. | Telemetry visible in `/settings -> Diagnostics`. |

**Linked commits:**
- `a7e1daf feat(export): add Markdown transcript export + button in status bar (roadmap B2/F2)`

**Status:** F2 done. F1 partly in place via
`src/auth/stream-proxy.ts` `PayloadStats`. F3 open.

### Track G -- Distribution

| ID  | Action | Acceptance |
|---|---|---|
| G1  | `dist-appsource/` build pipeline that emits the AppSource submission zip (manifest + icons + EULA placeholder). | One-command build. |
| G2  | Document the AppSource enrollment process (currently blocked on a Microsoft antifraud step per `docs/2026-06-28-plan.md section 11`). | Updated procedure doc. |
| G3  | Write `docs/admin-center.md` -- a one-pager for a non-engineer sysadmin to install the addin across an org. | Doc + screenshot tour. |

**Linked commits:** none yet. **Status:** G2 in flight, blocked
externally.

## Top priorities for the next 4 weeks

In order. Each item maps to one or more tracks above.

1. **A1-A5 -- Excel Desktop smoke on Windows.** Without it, every other
   change is unverified.
2. **B1-B4 -- Continuous improvement infra.** Once a transcript lands,
   everything else is downstream of this loop. (B1 partially done
   via the 2026-07-22 cuadro transcript.)
3. **D1 -- Audit `system-prompt.ts` against the seven homologation
   factors + liquidacion de honorarios + faja vial.** This is what the
   user is paying for.
4. **D3 -- Anonymised fixtures.** Without real-world workbooks to test
   against, A3 stays blocked.
5. **C2 -- Boot-time migration step.** Config-changing deploys
   shouldn't strand users with stale records (the lesson from the
   `.io`-vs-`.com` regression).
6. (lower priority) **C1, C4, E1-E4, F1, F3, G1-G3.** E1 is partly de-risked
   by `0f052da`'s cuadro offset tests but still open for the other tools.

## Canned prompt set for section 4 (used by A4)

These are the seed prompts. Each smoke run does them in order on a
fresh session:

1. "Resume this tasacion worksheet. Tell me what I'm looking at:
   what's the property, what year of UF, and what the dictamen
   status is."
2. "Add a row for the comprador's RUT under 'Identificacion'. Use
   Chilean format."
3. "Run the seven homologation factors on this comparable and tell
   me which one moves the price the most."
4. "Compute the liquidacion de honorarios for this tasacion with
   10.75 % SII retencion."
5. "If this tasacion triggers faja vial under DL 2.186, draft the
   indemnizacion line for cell L18."

Each transcript captures: full prompt, full response, every tool
call (with arguments and results), and the resulting workbook
snapshot (commit `tests/fixtures/tasaciones/outbox/` after the run).

## Continuous Improvement Mega Prompt

This is the prompt to paste into whatever dev agent processes each
transcript. Source of truth lives here so future agents have the
exact wording. Pulled from a 2026-07-16 design session with the
project owner; do not modify without explicit owner sign-off.

```text
Role & Context

Act as an Expert AI Architect and Senior Real Estate Appraiser
(Perito Tasador en Chile). We are continuously improving an Excel Web
Add-in powered by an LLM (MiniMax-M3) designed to automate and assist
in real estate valuation reports (tasaciones e indemnizaciones por
expropiacion).

The Process

I will provide you with a raw transcript of a recent interaction
between the user and the Excel Add-in. This transcript includes the
user's prompts, the LLM's responses, and the tools it executed
(e.g., writing to cells, formatting, reading ranges).

Your Objective

Analyze the transcript meticulously and generate a Continuous
Improvement Action Plan. You must evaluate the AI's performance
across three pillars:

1. Domain Knowledge Accuracy (Tasaciones en Chile):

   Did the AI demonstrate absolute mastery of Chilean real estate
   concepts? Look for critical nuances, such as:

   - Differentiating between Fecha de Escritura (Deed Date) and Fecha
     de Inscripcion CBR (Conservador de Bienes Raices Registration
     Date).
   - Understanding the technical and legal difference between a
     Predio and a Lote.
   - Correctly applying fee calculation rules (Liquidacion de
     honorarios, retencion del 10.75 % SII).
   - Proper application of rural homologation factors and
     expropriation laws (e.g., DFL 850, faja vial).

2. Excel Tool Execution & Formatting:

   - Did the AI use the correct tools (e.g., write-cells, read-range,
     fill-formula)?
   - Were there hallucinations in cell coordinates?
   - Did it overwrite important formulas or format data poorly?

3. Prompt Adherence & Tone:

   - Did it sound like a professional appraiser?
   - Was it too conversational or too robotic?

Output Format

A. Incident Diagnosis: A bulleted list of what the AI did right, and
   specifically what it got wrong or misunderstood in the provided
   context.

B. Knowledge Base Updates: Specific text additions or modifications
   to be added to our skill files (e.g., homologacion.md,
   honorarios.md). Draft the exact markdown paragraphs I should
   copy-paste to teach the AI the missing domain knowledge.

C. Tool / System Prompt Tweaks: Recommendations to adjust our
   TypeScript tools or the main system prompt to prevent execution
   errors in the future.

D. Few-Shot Examples: Write 1 or 2 Q&A pairs based on the
   transcript's failure points that we can inject into the AI's
   context so it learns exactly how to answer next time.

Transcript to Analyze:

[PASTE YOUR CHAT TRANSCRIPT AND TOOL EXECUTION LOGS HERE]
```

How to feed this:
- Save the transcript under `docs/transcripts/YYYY-MM-DD-<host>-<slug>.md`
  per convention.
- Open a session with a dev agent that has the project context
  (`AGENTS.md` loaded).
- Paste the prompt, then `cat docs/transcripts/<file>.md` as input.
- Save the action plan in `docs/transcripts/YYYY-MM-DD-<host>-<slug>-plan.md`.
- Follow-up commits per the plan's recommendations.

## Issue log

Rolling. Each row links symptom -> cause -> fix -> followup. Use this to
audit "what did we already learn" before spending time on a new
hypothesis.

| Date | Track | Symptom | Root cause | Fix | Follow-up |
|---|---|---|---|---|---|
| 2026-07-16 | C | MiniMax row at the bottom of `ALL_PROVIDERS` | no explicit UI ordering | `4e3b1fc fix(providers): reorder...` | C4: make ordering a registry concern |
| 2026-07-16 | C | `api.minimaxi.com` rejected MiniMax Token Plan Subscription Key (`sk-cp-...`) | wrong cluster (used Chinese `.com` host, key authenticates against `.io`) | `b11c297 fix(presets): route through api.minimax.io OpenAI-compat` | live-probe CI per C |
| 2026-07-16 | C | MiniMax "Connection error" via Anthropic route | CORS preflight at `api.minimax.io/anthropic/v1/messages` doesn't whitelist `x-api-key` | revert to OpenAI-compat in `b11c297` | -- (fix complete) |
| 2026-07-16 | E | Chrome blocked POST: `x-stainless-os is not allowed by Access-Control-Allow-Headers` | OpenAI SDK (Stainless) auto-injects telemetry headers that MiniMax doesn't whitelist | `82435c9 fix(cors): strip Stainless telemetry headers...` | watch for new SDK telemetry families |
| 2026-07-16 | -- | Vercel deploy blocked: `gabriel@loxos.cl` doesn't match the GitHub account | dev agent used `-c user.email` override | amended to use global `gabrielpantojarivera@gmail.com`, force-pushed `82435c9` | never use `-c` for git identity |
| 2026-07-16 | -- | commit author assumed `sk-cp-` was opencode-coding-plan key | docs/token-format mismatch (real Subscription Key IS `sk-cp-`) | switched host to `.io` (b11c297) | add a "key format table" to AGENTS.local.md (Track B-tools) |
| 2026-07-16 | -- | IndexDB cache held stale `baseUrl` after deploy changing it | login row uses stable id `pi-preset:<id>` so save overwrites in place; user just didn't disconnect-and-save | `6792858 test(presets): pin stable-id overwrite guarantee` | C2: boot-time migration so users don't have to |
| 2026-07-22 | E1, D2 | Cuadro de referenciales D[ref] evaluated to `0.0000e+0` after `write_cells` for `fichas VR!Q405` | column-letter hallucination: AI guessed Q instead of reading the actual cell (Ruta lives in column P, not Q, of the bloque in `fichas VR`) | `0f052da feat(tasaciones): tools for Cuadro de Referenciales repair` -- adds `audit_ref_errors` + `link_referenciales_cuadro` with post-write verification that fails on zero-in-text; system-prompt now mandates read-back verification after any cross-sheet write | E1 still open for the rest of the tool surface; track all writes through `audit_ref_errors` before declaring success |
| 2026-07-22 | E1, D2 | `referenciales!B7` resolved to `#REF!B7` in the cuadro de la "Transaccion" formula | `referenciales` sheet was deleted/renamed between sessions; relying on it for foja/N°/ano is fragile | `0f052da` -- `link_referenciales_cuadro` now sources foja/N°/ano from `fichas VR!I[predio+44..+46]` (verified against refs 6/7/8) | document the "cuadro de referenciales" sheet-name dependency in `docs/transcripts/regression/` |
| 2026-07-22 | D2 | VU $/m2 in `fichas VR!U[col][row]` resolved to `0` for refs 9 and 10 | template bug: refs 9 and 10 store superficie in column **AU**, all other refs use AV | `0f052da` -- `surfaceColumnFor(refNumber)` returns `"AU"` for refs 9/10 and `"AV"` for the rest; documented in `skills/tasaciones/cuadro-referenciales.md` | when re-extracting the template, normalize refs 9/10 to use AV |

## Operating cadence

- **Weekly**. One Excel Desktop smoke session (Track A). Drop one
  transcript and one action plan.
- **Within 48 h** of any smoke. Process the transcript through section 5; land
  follow-up commits.
- **Per PR** to `main`. New entry in the issue log above + commit SHA
  on the same row.
- **Quarterly**. Re-read this document. Demote tracks that didn't
  move; promote what did. Move closed tracks to `docs/archive/`.

## Cross-links

- `AGENTS.md` -- repo-wide agent instructions (read first).
- `docs/guides/release-smoke-test-checklist.md` -- historic smoke template;
  A1-A5 will produce a new entry here.
- `docs/architecture/security-threat-model.md` -- relevant for F1-F3.
- `docs/2026-06-28-plan.md section 11` -- AppSource antifraud block (G2).
- `docs/architecture/upstream-divergences.md` -- known diffs from `tmustier/pi-for-excel`
  (commit history going back further lives there).
- `AGENTS.local.md` (gitignored, machine-local) -- MiniMax-specific
  diagnostics. Promote stable findings from here into this roadmap.
