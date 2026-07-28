# Docs

This folder contains **current** docs that should match shipped behavior. Top-level docs are organized into subfolders by purpose; each entry below points at the doc's new home.

## Guides
- [Install Tasaciones by Loxos](./guides/install.md)
- [Sideload en Excel Desktop (Windows)](./guides/windows-sideload.md) — Trusted Add-in Catalog + script `scripts/sideload-windows.ps1`
- [Deploy hosted build on Vercel](./guides/deploy-vercel.md)
- [Release notes (`v0.9.5-pre`)](./release-notes/v0.9.5-pre.md)
- [Release smoke test checklist](./guides/release-smoke-test-checklist.md)
- [Release smoke run logs](./release-smoke-runs/README.md)

## Runtime features
- [Extensions (MVP authoring guide)](./features/extensions.md)
- [Extensions — Secure Connection Bundle](./features/extensions-secure-connection-bundle.md)
- [Integrations + External Tools](./features/integrations-external-tools.md)
- [Agent Skills interop (skills vs integrations)](./features/agent-skills-interop.md)
- [Compaction (`/compact`)](./features/compaction.md)
- [Manual full-workbook backups (`/backup`)](./features/manual-full-backups.md)
- [Files workspace](./features/files-workspace.md)

## Architecture & policy
- [Upstream divergences from pi-mono](./architecture/upstream-divergences.md)
- [Context management policy (cache-safe)](./architecture/context-management-policy.md)
- [Cache observability baselines](./architecture/cache-observability-baselines.md)
- [Security threat model](./architecture/security-threat-model.md)
- [Model / dependency update playbook](./architecture/model-updates.md)
- [How updates flow (end-to-end)](./architecture/update-flow.md) — git push -> Vercel -> Excel, cache headers, end-user verification recipe
- [UI architecture](../src/ui/README.md)
- [Tool behavior decisions](../src/tools/DECISIONS.md)

## Local bridge contracts
- [Tmux bridge contract (v1)](./bridges/tmux-bridge-contract.md)
- [Python / LibreOffice bridge contract (v1)](./bridges/python-bridge-contract.md)

## Archive
Historical planning/design docs were moved to [./archive](./archive/README.md) to keep top-level docs focused and current.