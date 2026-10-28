# Tasaciones by Loxos

> Excel add-in with an LLM agent for **appraisals and expropriation valuations in Chile**.
> Open source fork of [pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT), maintained by [Loxos](https://loxos.cl).

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-pi--for--excel-0a0a0a.svg)](https://github.com/tmustier/pi-for-excel)
[![Manifest](https://img.shields.io/badge/manifest-complemento--excel.vercel.app-blueviolet)](https://complemento-excel.vercel.app/manifest.prod.xml)

A sidebar agent that reads appraisal workbooks and writes values, formulas and formatting, using the model you choose. Bring your own API key — **OpenRouter** (one key, hundreds of models), Anthropic, OpenAI, Google — or any OpenAI-compatible gateway.

## What's different from pi-for-excel

- **Chilean appraisal system prompt** — DL 2.186, DFL 850, LGSE, CPC art. 411, SII 10.75 % withholding, 7 rural homologation factors, fee tiering.
- **Bundled skills** — homologación, honorarios, indemnización SEC, faja vial, cuadro de referenciales, consistency checks ([index](skills/tasaciones/SKILL.md)).
- **Two extra tools** — `audit_ref_errors` and `link_referenciales_cuadro` repair section 8 (*valores referenciales*).
- **Chilean formats** by default (`1.331.832`, `33,54`, DD-MM-YYYY, CLP/UF) and Spanish responses.

Everything else from upstream is kept: 18 Excel tools, multi-session tabs, automatic checkpoints with one-click revert, slash commands, extensions, web search and MCP. Full list in [NOTICE.md](NOTICE.md).

## Install

1. Download [`manifest.prod.xml`](https://complemento-excel.vercel.app/manifest.prod.xml).
2. Sideload it in Excel — [installation guide](docs/guides/install.md) (web, Windows, macOS).
3. Click **Abrir Tasaciones** on the Home ribbon and connect a provider (e.g. paste an [OpenRouter key](https://openrouter.ai/keys)).

## Development

Requires Node.js ≥ 22.19 and [mkcert](https://github.com/FiloSottile/mkcert) (Office.js needs HTTPS).

```bash
git clone https://github.com/gabrielpantoja-cl/complemento-excel.git
cd complemento-excel && npm install
mkcert -install && mkcert localhost && mv localhost-key.pem key.pem && mv localhost.pem cert.pem
npm run dev      # https://localhost:3000, then sideload manifest.xml
npm run check    # lint + typecheck + style checks
```

Sideloading, proxy, bridges and deployment: [docs/README.md](docs/README.md). Contributor and agent conventions: [AGENTS.md](AGENTS.md). What's next: [docs/roadmap.md](docs/roadmap.md).

## Credits and license

Built on [pi-for-excel](https://github.com/tmustier/pi-for-excel) by Thomas Mustier and [Pi](https://pi.dev) by Mario Zechner; see [NOTICE.md](NOTICE.md).

[MIT](LICENSE) — © 2026 Thomas Mustier; modifications © 2026-present Gabriel Pantoja / Loxos. Independent fork, not affiliated with or endorsed by the upstream project.
