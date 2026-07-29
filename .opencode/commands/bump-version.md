---
description: Bump the version in package.json (semver) and surface what other release notes need to go into the commit. Dispatches to @release-manager.
agent: release-manager
subtask: true
---

Bump the version with semver increment: $ARGUMENTS

Valid $ARGUMENTS values: `patch`, `minor`, `major`. If empty or
unknown, default to `patch`.

The subagent @release-manager will:
1. Check the working tree is clean (`git status`).
2. Run `npm run check` -- abort if lint/typecheck fail.
3. Run `npm version $ARGUMENTS` to bump `package.json` and create a
   git tag.
4. Print the suggested commit message and any follow-up tasks
   (e.g. update the AGENTS.md "Last reviewed" date, add a release
   note under `docs/release-notes/`).

This command does NOT push -- the user reviews the bump locally and
then runs `git push --follow-tags` after the commit lands.
