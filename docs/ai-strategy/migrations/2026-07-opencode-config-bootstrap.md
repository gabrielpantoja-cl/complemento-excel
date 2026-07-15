# Migration: 2026-07 — opencode config bootstrap

**Date:** 2026-07-14
**Type:** Additive config + doc augmentation. No source changes.

## Why

Audit (see [research-2026-07-14.md](../research-2026-07-14.md) and
[plan-2026-07-14.md](../plan-2026-07-14.md)) found zero `opencode.json` and
zero explicit permissions in this fork. opencode was running with wide-open
defaults: 75+ providers reachable via models.dev, no `model` pin, no
explicit `permission` block, no `enabled_providers` allow-list.

Pinning the model, narrowing the provider list, adding `.env*` deny rules,
and documenting the AI tooling inventory brings the repo to current
best-practice without touching the add-in build pipeline.

## What changed

- **NEW `opencode.json`** with:
  - `$schema: "https://opencode.ai/config.json"` for editor validation
  - `model: "minimax-coding-plan/MiniMax-M3"` (pins the only model)
  - `enabled_providers: ["minimax-coding-plan"]` (closes off other providers)
  - `share: "disabled"` (no auto-share to opencode.ai)
  - `permission` block tightening `webfetch`/`websearch`/`external_directory`/`doom_loop` to `ask`, denying `.env*` reads, narrowing `bash` to common dev commands
- **EDIT `.gitignore`** — added `.env.*` (with `!.env.example` negation), `.vscode/`, `.idea/`, `*.tsbuildinfo`, `*.log`, `coverage/`.
- **EDIT `AGENTS.md`** — appended Skills / Agents / Commands / Models sections.
- **NEW `docs/ai-strategy/migrations/2026-07-opencode-config-bootstrap.md`** — this file.

## What did NOT change

- No files in `src/` were modified.
- `skills/` at repo root was not moved.
- No custom agents / commands / skills were created.
- No junctions or symlinks.
- No global opencode config touched (`~/.config/opencode/`).
- No deprecated opencode keys migrated (none were present — repo had no `opencode.json` to begin with).

## Lessons learned

- The fork's `skills/` directory is consumed by `src/skills/catalog.ts` via
  `import.meta.glob("../../skills/*/SKILL.md")` and is **not** in any of
  opencode's 6 canonical discovery paths. This is a known and intentional
  divergence from upstream — it lets the add-in bundle skills at build time
  without requiring them to be in the opencode agent context. Accepting the
  split for now; revisit if a future workflow needs opencode to also see the
  bundled skills.
- `minimax-coding-plan/MiniMax-M3` is the primary model per user preference;
  no public docs surfaced during research, so pricing / rate-limit /
  data-residency claims for that provider are unverified.
- Default opencode ships 75+ providers via models.dev. Without an explicit
  `enabled_providers` allow-list, any provider with env-var credentials would
  be reachable. Pinning `enabled_providers: ["minimax-coding-plan"]` is the
  strongest hygiene stance for a single-model setup.

## Open follow-ups

- Decide whether to wire `skills.paths: ["skills"]` into `opencode.json` so
  opencode's `skill` tool also lists the fork's bundled skills. Currently
  deferred — would create a parallel skill universe alongside the add-in's
  internal catalog.
- If a public docs URL for `minimax-coding-plan/MiniMax-M3` surfaces, update
  the Models section in `AGENTS.md` and remove the "Unknown" note here.
- If a custom agent or command is added later, update the corresponding
  AGENTS.md section.

## Related docs

- [research-2026-07-14.md](../research-2026-07-14.md) — pre-flight research
- [plan-2026-07-14.md](../plan-2026-07-14.md) — implementation plan and rollback
