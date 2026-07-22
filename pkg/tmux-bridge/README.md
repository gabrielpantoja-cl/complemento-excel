# tasaciones-tmux-bridge

Local HTTPS tmux bridge helper for Tasaciones by Loxos.

## Usage

```bash
npx tasaciones-tmux-bridge
```

This command:

1. Ensures `mkcert` exists (installs via Homebrew on macOS if missing)
2. Creates certificates in `~/.tasaciones/certs/` when needed
3. Starts the tmux bridge at `https://localhost:3341`

Then in Tasaciones by Loxos, the bridge is reachable by default — configure `/experimental tmux-bridge-url` only to override.

## Installing missing dependencies (macOS)

```bash
npx tasaciones-tmux-bridge --install-missing
```

This will (via Homebrew):

- Install `tmux` if it is missing

Manual install:

```bash
brew install tmux
```

To force safe simulated mode instead:

```bash
TMUX_BRIDGE_MODE=stub npx tasaciones-tmux-bridge
```

## Publishing (maintainers)

Package source lives in `pkg/tmux-bridge/`.

Before packing/publishing, `prepack` copies runtime files from repo root:

- `scripts/tmux-bridge-server.mjs`
- `scripts/proxy-target-policy.mjs` (shared with `tasaciones-proxy`)

Publish from this directory:

```bash
cd pkg/tmux-bridge
npm publish
```
