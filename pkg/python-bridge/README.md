# tasaciones-python-bridge

Local HTTPS Python / LibreOffice bridge helper for Tasaciones by Loxos.

## Usage

```bash
npx tasaciones-python-bridge
```

This command:

1. Ensures `mkcert` exists (installs via Homebrew on macOS if missing)
2. Creates certificates in `~/.tasaciones/certs/` when needed
3. Starts the Python / LibreOffice bridge at `https://localhost:3340`

Then in Tasaciones by Loxos, the bridge is reachable by default — configure `/experimental python-bridge-url` only to override.

## Installing missing dependencies (macOS)

```bash
npx tasaciones-python-bridge --install-missing
```

This will (via Homebrew):

- Install `python` if `python3` is missing
- Install LibreOffice (`--cask`) if `soffice` / `libreoffice` is not on PATH

Manual install:

```bash
brew install python
brew install --cask libreoffice
```

To force safe simulated mode instead:

```bash
PYTHON_BRIDGE_MODE=stub npx tasaciones-python-bridge
```

## Publishing (maintainers)

Package source lives in `pkg/python-bridge/`.

Before packing/publishing, `prepack` copies runtime files from repo root:

- `scripts/python-bridge-server.mjs`
- `scripts/proxy-target-policy.mjs` (shared with `tasaciones-proxy`)

Publish from this directory:

```bash
cd pkg/python-bridge
npm publish
```
