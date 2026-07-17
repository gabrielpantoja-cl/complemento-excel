# Smoke Run — Windows sideload (Trusted Add-in Catalog)

- **Date:** 2026-07-16
- **Commit:** `50ec40f` (`feat(sideload): add Trusted Add-in Catalog sideload for Excel Desktop (Windows)`)
- **Environment:** Lenovo Legion 5, Windows 11, Microsoft 365 Excel Desktop (16.0.x, July 2026 channel)
- **Checklist source:** [`docs/release-smoke-test-checklist.md`](../release-smoke-test-checklist.md)
- **Scope:** Narrow — covers **I-2 (Windows install from scratch)** only. Provider/auth flows (I-3, I-4) and Excel-internal smoke (C-*, P-*, H-*) are intentionally left as `Blocked` for follow-up runs.

## Setup notes

- **Manifest used:** `manifest.prod.xml` (production bundle, `<SourceLocation>` points to `https://complemento-excel.vercel.app/src/taskpane.html`).
- **Sideload path followed:** [`docs/windows-sideload.md`](../windows-sideload.md) — Trusted Add-in Catalog via `scripts/sideload-windows.ps1`. Excel Desktop "Upload My Add-in" UI was not used (it is no longer exposed as of 2026 per Microsoft Learn).
- **Dev server:** Not required (`manifest.prod.xml` is served from Vercel).
- **mkcert / local certs:** Not required.
- **Proxy mode:** Disabled.
- **Tenant type:** Personal Microsoft 365 account (no admin gate on custom catalogs).

### Commands executed

```powershell
# 1. Run the sideload script (creates catalog folder + registry entry + marker)
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1
# -> Sideloaded OK. Registry key: HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{<GUID>}

# 2. Verify registry entry
reg.exe query "HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs" /s
# -> Confirm {Id, Url, Flags=1} present.

# 3. Verify the catalog URL responds (admin share)
Test-Path \\localhost\C$\Users\gabri\Documents\TasacionesManifest\manifest.prod.xml
# -> True.

# 4. Close Excel fully (Task Manager → finalize EXCEL.EXE).

# 5. Open Excel → Inicio → Complementos → Más complementos → CARPETA COMPARTIDA → Tasaciones → Agregar.
```

## Checklist coverage

| ID | Status | Evidence | Notes |
|---|---|---|---|
| **I-2** | **Pass** | `/{E2C563C4-CC5B-42FF-B53B-3955BDD26778}.png` (screenshot of the "Más complementos" dialog with **Tasaciones** listed under **CARPETA COMPARTIDA**) | Add-in appears in the SHARED FOLDER catalog, installs on click, **Abrir Tasaciones** button shows on the Home ribbon, taskpane opens and loads the bundle from Vercel. |
| I-3 (Windows leg) | Blocked | — | Requires interactive provider login + prompt in taskpane. Not run in this pass — scope was sideload verification only. |
| I-4 (Windows leg) | Blocked | — | Requires running proxy + in-app `/login` verification. Not run in this pass. |
| C-1..C-5 | Blocked | — | Requires in-host Excel workbook interaction. Not run in this pass. |
| P-1..P-4 | Blocked | — | Requires live workbook + agent-driven edits in Excel. Not run in this pass. |
| H-1..H-4 | Blocked | — | Out of scope for sideload verification. |
| PRE-1 | Pass | Run on commit `50ec40f`: see previous preflight runs. | Sideload change is doc+script only; preflight suite is unaffected by the sideload commit itself. |

## Failure details

None — I-2 passed on first attempt after closing Excel fully (the script ran correctly the first time, but the SHARED FOLDER tab only appeared once Excel was restarted, which is documented behavior).

### Observations worth recording

1. **The first sideload attempt required a clean Excel restart.** Even though the script writes to HKCU (per-user) and Excel reads it on launch, having Excel already open at the moment of script run means Excel caches the previous catalog state. The script's existing "close Excel fully" warning was correct and load-bearing.
2. **The admin-share path (`\\localhost\C$\...`) is required.** A literal `C:\Users\gabri\Documents\TasacionesManifest` path in the registry did not surface in the SHARED FOLDER tab on this Excel build. The script converts to UNC automatically.
3. **Idempotency confirmed.** Re-running `sideload-windows.ps1` overwrites the manifest copy and refreshes the registry values without creating a duplicate catalog entry (GUID is preserved via `.sideload.json` marker).

## Exit criteria

- [x] Required Windows row I-2 covered with Pass + evidence.
- [x] Any `Blocked` rows have explicit blocker + next step (run a broader pass with API-key or proxy flow to close I-3 / I-4).

## Next run targets

1. **I-3 (API key flow)** on Windows desktop — paste a key into `/login`, send one prompt, confirm response.
2. **I-4 (Proxy/OAuth flow)** on Windows desktop — start `npm run proxy:https`, enable proxy in `/settings`, complete a `/login`, send one prompt.
3. **C-1 workbook awareness** on Windows desktop — feed a real workbook into the agent and verify sheet/selection awareness.
4. **P-1 / P-2 prompt examples** — validate that the sample prompts from `docs/release-smoke-test-checklist.md` work end-to-end on Windows.
