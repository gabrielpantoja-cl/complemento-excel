# How updates flow -- end to end

**Audience:** anyone trying to answer "did my latest push actually land
in the add-in I have open in Excel?"

## TL;DR

```
git push origin main
        |
        v
[pre-push hook] npm run audit:ci          (~ seconds)
        |
        v
Vercel auto-build (npm run build)         (~ 1-2 minutes)
        |
        v
https://complemento-excel.vercel.app/...   (CDN, immutable assets + no-store HTML)
        |
        v
Excel Desktop opens / reloads taskpane   (~ seconds, user-initiated)
        |
        v
New bundle hash -> new HTML reference -> fresh JS
```

If the change does NOT show up after a reload, the cache section
below has the remediation.

## The four layers

### 1. Source (this repo)

`main @ <commit>` is the source of truth. Every push triggers:

| Hook | File | Effect |
|---|---|---|
| `pre-commit` | `.githooks/pre-commit` | Runs `npm run lint && npm run typecheck`. Bypass only when explicitly needed: `git commit --no-verify`. |
| `pre-push` | `.githooks/pre-push` | Runs `npm run audit:ci` (allowlisted CVEs only). Skipped if no manifest changes. |

If a hook fails, the push never reaches Vercel. So a "missing change
in production" can also mean "the hook blocked the push". Always check
`git push` output for hook errors.

### 2. Build (Vercel)

`vercel.json` configures:

- `buildCommand: npm run build`
- `outputDirectory: dist`
- `ignoreCommand` (`scripts/vercel-ignore-command.mjs`): builds on `main`,
  PR previews, and manual deploys; **skips non-PR feature branch pushes**
  to avoid burning build minutes.
- `vercel.json` headers (the only `Cache-Control` overrides):

  | Source | Cache-Control | Why |
  |---|---|---|
  | `/src/taskpane.html` | `no-store` | Guarantees Excel never loads a stale HTML reference. |
  | `/manifest.prod.xml` | `no-store` | Sideload metadata changes are picked up on next open. |
  | `/proxy`, `/proxy.sh` | `no-store` | Proxy bootstrap must always re-validate. |
  | everything else (assets) | default (immutable) | Vite's content-hash filenames (`workspace-Ca72WpvE.js`) make this safe -- a new hash means a new URL means a new fetch. |

The CSP on `/src/taskpane.html` is enforced and tightly scoped to
Office.js + provider/auth endpoints + localhost proxy + Pyodide CDN.
If you add a new outbound dependency, you must extend the CSP here.

### 3. Delivery (Vercel CDN)

After build, Vercel deploys to:
- `https://complemento-excel.vercel.app/` (production)
- `https://complemento-excel-<branch>-<hash>.vercel.app/` (PR previews)

The `manifest.prod.xml` (which Excel has sideloaded) hard-codes the
production URL. **The sideloaded manifest does NOT auto-update.** To
pick up a new manifest, the user must re-sideload.

PR previews use a separate URL and are NOT visible to a sideloaded
production manifest -- they're useful for sharing pre-release links
manually, but they do not exercise the production update path.

### 4. Reload (Excel WebView)

When the user opens the Tasaciones taskpane (or clicks the in-sidebar
reload):

1. Excel loads `/src/taskpane.html` -> `Cache-Control: no-store`
   guarantees fresh HTML.
2. The HTML references `workspace-<hash>.js` (or similar asset). If
   the hash changed since the last load, the browser fetches the new
   file. Otherwise it serves from the WebView cache.
3. The JS bundle initialises, fetches any new skill markdown via
   `import.meta.glob`, and the user sees the new behavior.

A **reload** is sufficient to pick up most UI changes -- confirmed on
2026-07-22 when translating the welcome overlay strings
(`src/taskpane/welcome-login.ts:95,98`) reached Excel in
~3 minutes total (commit `f7a5626` -> Vercel build -> Excel reload).

## How to verify a change landed

This is the **end-user smoke recipe**. Use it any time you push and
want to confirm the deploy before doing more work.

1. Make a visible change -- e.g. a string in the welcome overlay,
   a new emoji in the status bar, or a unique color in a settings
   card. Anything humanly noticeable.
2. `git add . && git commit -m "<msg>"` -- watch the pre-commit hook
   pass (lint + typecheck).
3. `git push` -- watch the pre-push hook pass (audit).
4. Open https://vercel.com/<project>/deployments and confirm the
   latest commit shows a green checkmark. Average time: 1-2 min.
5. In Excel, click Home -> Add-ins -> Tasaciones. If the taskpane
   is already open, click the in-sidebar reload control.
6. Look for the visible change. If you see it, the deploy is live.

### If the change does NOT appear

The most common cause is the Office WebView cache. In order of
escalation:

**Windows (WebView2):**

```powershell
# Close Excel fully first.
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\WebView2"
# Reopen Excel and the taskpane.
```

**macOS (WKWebView):** see `AGENTS.md` -> "Excel sideloaded manifest
gotcha (macOS)" for the WKWebView cache + reload commands.

**Universal last resort:** open the taskpane in a private/incognito
window via Excel on the web (`excel.office.com` -> Upload My Add-in
-> sideload the same `manifest.prod.xml`). No WebView cache survives.

If the change still does not appear after all of the above, the
deploy probably did not happen -- check Vercel logs.

## Known gap: no visible version indicator

Today there is **no commit SHA, version, or build hash shown
anywhere in the UI**. The only way to know which build is loaded is
to make a visible change and observe it (the recipe above) or to
inspect the JS bundle hash via F12 Network.

This is a real UX and DX gap. Proposed follow-up:

- Inject `__COMMIT_SHA__` via Vite `define` from `git rev-parse HEAD`.
- Surface in the status bar footer (where the model/context
  indicators already live) as `v0.1.0 +<7-char-sha>`.
- Optionally also surface in `/settings -> About`.

Estimated effort: ~30 min. Tracked as an open issue in the next
roadmap cycle.

## Why the experiment of 2026-07-22 worked

The translator exercise that confirmed this flow used
`src/taskpane/welcome-login.ts` (two hardcoded English strings on
the no-provider welcome overlay):

| Step | What happened |
|---|---|
| Edit | Translated lines 95 + 98 to Spanish. |
| `npm run check` | Passed (lint + typecheck). |
| `git commit` | pre-commit hook ran lint + typecheck, both passed. |
| `git push` | pre-push hook skipped audit (no manifest changes). |
| Vercel | Auto-built in ~1 min from `f7a5626`. |
| Excel reload | User closed and reopened the taskpane -> new HTML referenced the new bundle hash -> the new bundle loaded -> the Spanish strings were visible. |

Time from `git push` to user-visible change: **~3 minutes**.

## Related docs

- `docs/guides/deploy-vercel.md` -- the deployer's view (Vercel
  project setup, manifest regeneration, ignore policy).
- `docs/architecture/security-threat-model.md` -- CSP and origin
  policy that the deploy inherits.
- `AGENTS.md` -> "Excel sideloaded manifest gotcha (macOS)" -- macOS
  WKWebView cache clearing.
- `docs/architecture/cache-observability-baselines.md` -- how to
  observe prompt cache hit rates (orthogonal concern; covers model
  prompt cache, not HTTP cache).
