# tasaciones-proxy

Local HTTPS CORS proxy helper for Tasaciones by Loxos OAuth logins.

## Usage

```bash
npx tasaciones-proxy
```

This command:

1. Ensures `mkcert` exists (installs via Homebrew on macOS if missing)
2. Creates certificates in `~/.tasaciones/certs/` when needed
3. Starts the proxy at `https://localhost:3003`

Then in Tasaciones by Loxos:

1. Open `/settings`
2. Enable **Proxy**
3. Set URL to `https://localhost:3003`
4. Run `/login`

## Publishing (maintainers)

Package source lives in `pkg/proxy/`.

Before packing/publishing, `prepack` copies runtime files from repo root:

- `scripts/cors-proxy-server.mjs`
- `scripts/proxy-target-policy.mjs`

Publish from this directory:

```bash
cd pkg/proxy
npm publish
```
