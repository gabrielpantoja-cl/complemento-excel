---
description: Run the prompt-cache hygiene checks (prefix churn, system-prompt regression) and report any anomaly.
---

Run the prompt-cache observability checks:

!`npm run test:context 2>&1 | tail -60`

Then run:

!`grep -lE "no-store|setCacheKey|prefixChange" src/auth/stream-proxy.ts src/tools/system-prompt.ts 2>/dev/null || echo "(no prefix-cache observability code yet)"`

Read `docs/architecture/cache-observability-baselines.md` and
`AGENTS.md` section "Prompt caching gotchas" to interpret the output.

The things you are looking for:

1. **Tests passing in `test:context`.** This suite covers
   `prefix-churn.test.ts` and `tool-result-shaping.test.ts` which
   guard against cache invalidation bugs.

2. **No new tool list churn.** AGENTS.md rule: "do not rebuild tool
   lists with unstable ordering". If a recent change reorders
   tools in `src/tools/capabilities.ts` or adds/removes core tools,
   that invalidates the entire prefix cache for that model.

3. **No system-prompt mutation.** AGENTS.md rule: "do not mutate base
   prompt text every turn". Look for any recent change that
   appends timestamps, IDs, or run-specific data into the static
   prefix region of the system prompt.

4. **No new Vercel cache headers missing.** Run
   `git diff origin/main -- vercel.json` and confirm no header rule
   was weakened (e.g. someone removed `Cache-Control: no-store` from
   `/src/taskpane.html`).

Report findings as a 4-line summary, one per check above. If any
check fails, propose the minimal fix and call out the cache-cost
impact (MiniMax-M3 prefix cache has up to 24h TTL per the docs).
