# Upcoming (open issues digest)

Purpose: keep a lightweight, *engineering-oriented* digest of open GitHub issues and the likely direction of the project, so refactors/cleanup are aligned with where weâ€™re going.

> Source of truth: GitHub issues. This file is a curated summary + implications, not a replacement.

---

## Working assumptions (tentative)

These reflect current direction and may change as we prototype.

- **Workbook identity/scoping:** likely **local-only by default** (to reduce risk of sensitive metadata traveling with a workbook). Weâ€™re prototyping an **opt-in workbook-attached ID** (e.g. a random GUID) if it proves materially better.
- **Artifacts/files:** aim for a **global workspace** plus **per-workbook namespaces/tags**. Implementation likely uses **File System Access API** when available, with **OPFS** fallback for Mac Excel/WKWebView.
- **Extensibility:** **user-supplied code in hosted builds is a core requirement.**
  - **V1:** *paste code* only â†’ store in IndexedDB, load via Blob URL + dynamic `import()` (no `eval`).
  - **V2:** add *install from URL* (GitHub raw / releases) and potentially *package sources* (npm), with explicit enable + clear warnings/permissions.

---

## Product semantics & scoping (workbooks, sessions, instructions)

### #31 â€” Design: multi-workbook semantics + per-workbook chats
https://github.com/tmustier/pi-for-excel/issues/31

**Status:** closed (2026-02-11).

Implemented for this phase:
- sidebar shows active workbook label (best-effort)
- auto-restore is workbook-scoped when workbook identity is known (no global fallback)
- `/resume` supports cross-workbook workflows (all-workbooks toggle + warning before cross-workbook resume)

**Implication:** workbook identity is now a foundational primitive for remaining session/workbook work (#23, #30, #32).

---

### #23 â€” Sessions: session history UI + resume per workbook
https://github.com/tmustier/pi-for-excel/issues/23

**What itâ€™s asking:** first-class session history UI + tie session metadata to workbook identity.

**Status note:** we now have workbook-aware default filtering + cross-workbook resume warning in the existing `/resume` overlay; a dedicated sessions surface can be deferred until broader session management work is prioritized.

---

### #30 â€” Design: workbook-scoped agent instructions (AGENTS.md equivalent)
https://github.com/tmustier/pi-for-excel/issues/30

**What itâ€™s asking:** a workbook-scoped instruction store (â€œconventions / do-donâ€™t / assumptionsâ€) with UI to edit + audit.

**Status note:** core implementation is now in place:
- `/instructions` overlay with User + Workbook tabs
- persistent storage (`user.instructions`, `workbook.instructions.v1.<workbookId>`)
- new `instructions` tool (`append` / `replace`)
- prompt integration every turn (user + workbook instructions sections)
- status-bar indicator when instructions are active

**Remaining follow-up (if needed):** workbook-attached opt-in storage (`workbook.settings`) and richer audit/history UX for instruction edits.

---

## Trust, safety, auditability

### #6 â€” UX: change approval UI + clickable cell citations
https://github.com/tmustier/pi-for-excel/issues/6

**Status:** closed (2026-02-12).

Resolved outcome:
- clickable citations are implemented
- destructive-tool pre-execution approval is intentionally not planned for now

**Implication:** if confirmations are revisited later, track them in a new focused issue with narrow UX scope.

---

### #28 â€” Auditability: diff view + audit log for agent changes
https://github.com/tmustier/pi-for-excel/issues/28

**Status:** closed (2026-02-12).

Delivered for this phase:
- structured mutation diffs for core cell-write paths (`write_cells`, `fill_formula`, `python_transform_range`)
- compact in-card **Changes** rendering with clickable cell links
- persisted workbook mutation audit log (`workbook.change-audit.v1`)
- expanded operation-level audit coverage for formatting/structure/comment/view/history-restore mutation paths
- JSON export via `/export audit` (download) and `/export audit clipboard`

**Follow-up tracking:**
- #100 â€” complete remaining workbook-mutating audit coverage alignment
- #101 â€” optional â€œExplain these changesâ€ UX

---

### #27 â€” Design: YOLO mode + workbook recovery/versioning strategy
https://github.com/tmustier/pi-for-excel/issues/27

**Status note:** rollback UX is now in place:
- automatic backups for `write_cells`, `fill_formula`, `python_transform_range`, `format_cells` (with scoped limits), `conditional_format`, mutating `comments` actions, and all `modify_structure` actions (including value-preserving destructive deletes when capture fits recovery size limits)
- new `workbook_history` tool (list / restore / delete / clear)
- backup browser overlay (menu + `/history`) with restore/delete/clear controls, plus `/revert` for latest-backup rollback
- restore creates an inverse backup so rollbacks are themselves reversible
- unsupported mutation tools/actions (and oversized/unsupported `modify_structure` destructive captures) explicitly report when no backup is created
- structure-absence restores (`sheet_absent`, `rows_absent`, `columns_absent`) are blocked when target data exists to avoid irreversible deletes, except restore-generated inverse checkpoints that explicitly allow value-preserving deletes
- conditional-format backup restore now covers all current rule families: `custom`, `cell_value`, `contains_text`, `top_bottom`, `preset_criteria`, `data_bar`, `color_scale`, `icon_set`

**Remaining follow-up:**
- richer history UX (search/filter/export, retention controls)
- optional/manual desktop-oriented full-backup flow design (if needed), now that full per-mutation snapshot feasibility has been documented

---

### #62 â€” Security follow-up: sunset legacy OAuth localStorage migration path
https://github.com/tmustier/pi-for-excel/issues/62

**What itâ€™s asking:** remove the remaining compatibility path for legacy OAuth `localStorage` migration.

**Key hotspots:**
- `src/auth/oauth-storage.ts` should read/write IndexedDB settings only
- docs/comments should no longer describe a localStorage OAuth fallback

**Implication:** keep credential persistence simple and auditable before expanding higher-risk surfaces (#24, #25, #32, #3).

---

## Context management

### #20 â€” Auto-compaction: manage context window budget for long conversations
https://github.com/tmustier/pi-for-excel/issues/20

**Status:** closed (2026-02-11).

Completed for this phase:
- token budgeting + auto-triggered compaction (Pi-style thresholds)
- preserved recent tail context after compaction
- archived pre-compaction history + â€œShow earlier messagesâ€ UX (from #41)
- compaction queue/ordering + explicit compacting indicator UX (from #40)

**Implication:** further tuning (e.g., provider/model-family threshold adjustments) should be tracked as focused follow-up issues, not reopened umbrella scope.

**Policy reference:** see [`docs/architecture/context-management-policy.md`](../architecture/context-management-policy.md) for the active cache-safe rollout slices (payload snapshots, progressive tool disclosure, tool-result shaping, workbook-context invalidation).

---

## Agent interface / platform design

### #14 â€” Design: agent interface â€” tools, system prompt, context strategy
https://github.com/tmustier/pi-for-excel/issues/14

**Status:** closed (2026-02-11) as an umbrella issue.

**Scope moved to focused issues:**
- #18 â€” tool inventory / progressive disclosure
- #20 â€” context budget / compaction behavior
- #30 + #1 â€” workbook instructions + conventions storage/exposure
- #24 + #13 â€” integrations/external tools and extension platform
- #6 + #28 + #27 â€” planning/approval UX, auditability, and recovery safety

**Implication:** treat those mapped issues as the source of truth for ongoing implementation.

---

## Tools & Excel capability expansion

### #18 â€” Tool inventory: Excel JS API capabilities not yet exposed
https://github.com/tmustier/pi-for-excel/issues/18

**What itâ€™s asking:** inventory + tiering / progressive disclosure for future tools.

**Comment updates in issue:** tool consolidation happened, and tiering should apply to *new tools only* (charts/tables/validation etc.).

**Implication:** a capability registry (tools grouped into tiers) should exist at one central point, not scattered across prompt/UI/tool code.

---

### #22 â€” view_settings: expand with sheet visibility, standard width, and activate
https://github.com/tmustier/pi-for-excel/issues/22

**What itâ€™s asking:** add actions:
- hide/show/very-hide sheet
- set standard width
- activate sheet
- extend `get` output

**Implication:** this is a good test-case for keeping tool registration + UI input humanization in sync (right now those mappings drift in multiple files).

---

### #29 â€” Explainability: trace precedents/dependents + explain formula UX
https://github.com/tmustier/pi-for-excel/issues/29

**Status note:** explainability workflow is now in place:
- `trace_dependencies` supports both directions (`mode: precedents|dependents`) with structured metadata and clickable, collapsible tree rendering
- `explain_formula` provides plain-language explanations for single formula cells with cited direct references

**Implication:** future enhancements can stay additive (richer narratives, deeper lineage controls) on top of structured `details` metadata and clickable citations.

---

### #19 â€” Decide: integrate with Excel native Style API or keep our own style system
https://github.com/tmustier/pi-for-excel/issues/19

**What itâ€™s asking:** decide between:
- A) adopt native Excel styles
- B) keep our style resolver (current)
- C) hybrid: keep our resolver + sync `pi.*` styles into workbook for inspectability

**Notable comments in issue:**
- header style uses hardcoded hex (theme mismatch risk)
- header alignment for number columns may need variants or style inheritance

**Implication:**
- donâ€™t bake too much of the current style system into tool/UI assumptions; keep it behind `conventions/` boundaries
- if we ever sync to native styles, weâ€™ll want tooling that can *read back* â€œwhat was appliedâ€ in a stable way

---

## External tools / bridges / extensibility

### #13 â€” Extensions API: design & build-out
https://github.com/tmustier/pi-for-excel/issues/13

**Status note:** MVP is now shipped (extension manager UI, dynamic loading, persisted registry, extension tool registration, lifecycle cleanup).

**Remaining tracked follow-ups:**
- Widget API baseline is now shipped (issue #80 slices A/B/C); future extension UI expansion continues under #13.

**Recently closed:**
- #80 â€” widget API evolution baseline (lifecycle + deterministic placement + collapse/sizing + docs)
- #111 â€” sandbox runtime default-on for untrusted sources + rollback kill switch
- #79 â€” sandbox + permissions model umbrella
- #81 â€” extension authoring docs (merged in #82)

**Implication:** keep extension architecture additive while we harden:
- a centralized tool registry that can be extended dynamically
- a clear permission model + lifecycle hooks

---

### #24 â€” Tools: enable web search + MCP integration
https://github.com/tmustier/pi-for-excel/issues/24

**Status:** closed (2026-02-12).

Delivered:
- `web_search` tool (Brave provider) with explicit request attribution
- `mcp` gateway tool (status/connect/search/describe/call)
- Integrations manager UI (`/integrations`) with per-session/per-workbook scope
- MCP server config UI (add/remove/test URL + optional token)
- global external-tools gate (`external.tools.enabled`, default-off)
- active integrations visibility in the status bar

**Note:** we implemented integrations as first-class bundles while keeping extensions as the generalized plugin runtime.

---

### #25 â€” Tools: Python runner + LibreOffice bridge
https://github.com/tmustier/pi-for-excel/issues/25

**Status:** closed (2026-02-12) via #78.

Delivered:
- gated tools: `python_run`, `libreoffice_convert`, `python_transform_range`
- local helper: `scripts/python-bridge-server.mjs` (`stub` + `real` modes)
- config: `/experimental python-bridge-url` + `/experimental python-bridge-token`
- first-run approval cached per bridge URL for Python/LibreOffice executions
- bridge setup controls in `/extensions`

**Remaining follow-up:** richer sandboxing controls, artifact-first workflows, and safer patch/apply patterns for structural workbook edits.

---

### #3 â€” Explore tmux tool via local bridge (Excel add-in)
https://github.com/tmustier/pi-for-excel/issues/3

**What itâ€™s asking:** local helper for tmux/shell-like interaction.

**Implication:** also drives the â€œlocal bridgeâ€ architecture shared with #25 and possibly #24 MCP.

---

### #32 â€” Artifacts: file upload + assistant workspace (create/share/edit files)
https://github.com/tmustier/pi-for-excel/issues/32

**What itâ€™s asking:** a Files/Artifacts panel + tool surface (`list/read/write/delete`) + (optional) local workspace folder.

**Important implementation comment in issue:**
- recommended backend strategy:
  - **File System Access API** (`showDirectoryPicker`) when available (Windows/Web)
  - **OPFS** fallback for WKWebView (Mac Excel)
- upstream `pi-web-ui` already includes substantial attachment infrastructure (pdf/docx/pptx/text/image handling), but itâ€™s not yet wired into our sidebar input.

**Implication:**
- we should treat â€œartifacts/filesâ€ as a first-class subsystem (store, UI, tools, context injection)
- bundling/perf matters: PDF/document handling pulls large deps (pdfjs/xlsx)

---

## UI polish

### #12 â€” UX: decide what to put in the header bar
https://github.com/tmustier/pi-for-excel/issues/12

**What itâ€™s asking:** decide whether the header is used for session switcher, workbook indicator, settings, etc. or removed entirely.

**Notable comment:** toast offset was changed when header was emptied; if header returns, toast positioning may need adjustment.

---

### #21 â€” Show thinking duration: â€œThought for Xm Xsâ€ on completed thinking blocks
https://github.com/tmustier/pi-for-excel/issues/21

**What itâ€™s asking:** per-thinking-block timing + DOM patching since the component is upstream.

**Implication:** keep monkey patches isolated (fits current `src/compat/*` convention).

---

## Conventions & configuration

### #1 â€” Decide where to store/expose spreadsheet conventions
https://github.com/tmustier/pi-for-excel/issues/1

**Status note:** Phase 1 is implemented (`src/conventions/*`, prompt now references named styles). Remaining scope is user-configurable + workbook-scoped.

**Implication:** dovetails with #30 workbook instructions; likely the cleanest approach is a workbook-scoped instruction/config store with UI.

---

## Distribution

### #16 â€” Distribution: non-technical install (hosted build + prod manifest)
https://github.com/tmustier/pi-for-excel/issues/16

**What itâ€™s asking:** a path that requires no Node/mkcert/terminal.

**Implication:** any solution relying on a local helper (proxy/bridge) needs a story for non-technical users.

---

## Cross-cutting implications for cleanup / refactor work

From the issues above, the most leverage comes from making a few primitives explicit and stable:

1) **Workbook identity + scoping**
- needed by sessions, workbook instructions, artifacts, audit logs
- suggests a `workbookContext` module that can provide `{ id, name, url? }` and is safe across hosts

2) **A single extensible capability registry**
- tools + tool tiers + UI renderers + humanizers should be registered in one place
- should be designed to allow extension/integration/MCP-based injection later

3) **Structured tool results (`details`)**
- unlocks approval UI, diffs/audit log, interactive graphs/trees, better tool cards

4) **A safe â€œexternal capabilityâ€ boundary**
- web search, MCP, bridges, filesystem all need opt-in gating + auditability (ties to #26)

5) **UI architecture that supports new panels**
- Files panel, Sessions panel, Workbook Instructions editor likely require more than overlays
- suggests a small â€œsidebar tabs / panelsâ€ framework rather than ad-hoc overlays
