# Tasaciones by Loxos

> Complemento IA para Microsoft Excel especializado en **tasaciones y peritajes de expropiación en Chile**.
> Fork open source de [pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT),
> mantenido por [Loxos](https://loxos.cl).

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-pi--for--excel-0a0a0a.svg)](https://github.com/tmustier/pi-for-excel)
[![Manifest](https://img.shields.io/badge/manifest-complemento--excel.vercel.app-blueviolet)](https://complemento-excel.vercel.app/manifest.prod.xml)

Tasaciones es un agente IA que vive dentro de Excel. Lee tu libro de tasaciones, escribe valores, fórmulas y formatos, y hace investigación — usando el modelo de IA que tú elijas (Claude, GPT, Gemini o cualquier endpoint compatible con OpenAI / Anthropic). Trae tu propia API key o usa OpenRouter como pasarela unificada.

## ¿Por qué Tasaciones?

Tasaciones está pensado para el flujo de trabajo de un **perito tasador en Chile**. La diferencia con un add-in IA genérico está en lo que ya viene pre-instalado:

| Característica | Detalle |
|---|---|
| **System prompt especializado** | DL 2.186, DFL 850 art. 24, LGSE DFL 4/20.018, DS 113/52, CPC art. 411, retención SII 10.75%, factores de homologación rural (7 factores), liquidacion de honorarios por tramos, faja vial existente. |
| **Skills pre-instaladas** | 6 skills de tasación: `homologacion`, `honorarios`, `sec-indemnizacion`, `faja-vial`, `cuadro-referenciales`, `verificar-consistencia`. Se invocan con la herramienta `skills` desde el chat. |
| **Formatos chilenos por defecto** | Miles con punto (`1.331.832`), decimales con coma (`33,54`), fechas DD-MM-AAAA, CLP `$ #.##0`, UF `#.##0,00`. Configurable por el usuario en cualquier momento. |
| **Cuadro de referenciales** | 2 herramientas nuevas (`audit_ref_errors`, `link_referenciales_cuadro`) que reparan el punto 8 del informe cuando se rompen las referencias cruzadas entre `referenciales` y `fichas VR`. |
| **Idiomas** | Landing y documentación en español (es-CL). El agente responde en español por defecto. |

## Features (resumen)

**18 herramientas nativas de Excel** que el agente puede llamar — las 16 originales de pi-for-excel más 2 especializadas:

| Tool | Qué hace |
|---|---|
| `get_workbook_overview` | Mapa estructural: hojas, encabezados, rangos nombrados, tablas, gráficos, pivots |
| `read_range` | Lee celdas en formato compacto (markdown), CSV o detallado (con formato) |
| `write_cells` | Escribe valores/fórmulas con protección contra sobre-escritura y auto-verificación |
| `fill_formula` | Auto-rellena una fórmula en un rango (referencias relativas se ajustan solas) |
| `search_workbook` | Busca texto, valores o referencias a fórmulas en todas las hojas |
| `modify_structure` | Inserta/elimina filas/columnas, agrega/renombra/elimina/oculta hojas |
| `format_cells` | Aplica formato: fuentes, colores, número, bordes, estilos nombrados |
| `conditional_format` | Agrega o limpia reglas de formato condicional |
| `trace_dependencies` | Traza linaje de fórmulas (precedentes aguas arriba o dependientes aguas abajo) |
| `explain_formula` | Explica una fórmula en lenguaje natural citando las celdas referenciadas |
| `view_settings` | Líneas de cuadrícula, encabezados, paneles congelados, color de pestaña, visibilidad |
| `comments` | Lee, agrega, actualiza, responde, resuelve/reabre comentarios |
| `workbook_history` | Lista/restaura backups automáticos creados antes de cada mutación |
| `instructions` | Reglas persistentes (a nivel usuario o a nivel libro) |
| `conventions` | Convenciones de formato configurables (moneda, negativos, ceros, decimales) |
| `skills` | Skills del agente (bundled + externos instalables) |
| `audit_ref_errors` **(\*)** | Escanea una hoja en busca de errores `#REF!` y cadenas de fórmulas rotas |
| `link_referenciales_cuadro` **(\*)** | Repara una fila del "Cuadro de Referenciales" escribiendo 7 fórmulas y verificando |

**(\*) Nuevas en Tasaciones** — ver [NOTICE.md](NOTICE.md#what-this-fork-changes).

**Multi-modelo** — usa el proveedor que prefieras, cambia de modelo a mitad de conversación:
- **Anthropic** (Claude) — API key o OAuth
- **OpenAI** / **OpenAI Codex** — API key
- **Google Gemini** — API key
- **GitHub Copilot** — OAuth
- **OpenRouter** (recomendado) — una API key, decenas de modelos
- **Gateways OpenAI-compatibles** — endpoint + modelo + API key en `/settings`

**Gestión de sesiones** — múltiples pestañas por libro, auto-guardado/restauración, historial, `/resume` para retomar donde quedaste.

**Inyección automática de contexto** — el agente recibe automáticamente el blueprint del libro, tu selección actual y los cambios recientes antes de cada turno. No necesitas describir manualmente qué estás mirando.

**Recuperación** — checkpoints automáticos antes de cada mutación. Un clic para revertir desde la barra lateral si algo sale mal.

**Convenciones de formato** — define tu estilo una vez (símbolo de moneda, estilo de negativos, decimales) y el agente lo sigue automáticamente.

**Slash commands** — `/model`, `/login`, `/settings`, `/rules`, `/extensions`, `/tools`, `/export`, `/compact`, `/new`, `/resume`, `/history`, `/shortcuts`, y más.

**Extensiones** — instala extensiones para la barra lateral desde el chat. El agente puede generar e instalar código de extensiones directamente con la herramienta `extensions_manager`.

**Integraciones** (opt-in):
- **Web Search** (Jina por defecto, Serper/Tavily/Brave) + `fetch_page` — busca y lee fuentes externas sin salir de Excel
- **MCP Gateway** — conéctate a servidores MCP configurados por el usuario

**Bridge + controles avanzados** (gestionado vía `/experimental`):
- Tmux bridge — URL/token del bridge y health checks
- Python / LibreOffice bridge — URL/token del bridge
- Files workspace (gate de escritura/borrado) — artefactos compartidos entre sesiones
- Controles avanzados de extensiones — opt-in URL remoto, sandbox, Widget API v2

## Install

1. Descarga [`manifest.prod.xml`](https://complemento-excel.vercel.app/manifest.prod.xml)
2. Súbelo a Excel — ver [**guía de instalación**](docs/guides/install.md) (macOS + Windows)
3. Click **Abrir Tasaciones** en la cinta de opciones
4. Conecta un proveedor (API key u OAuth), o configura un gateway OpenAI-compatible en `/settings`
5. Empieza a chatear — prueba `¿Qué hoja estoy viendo?` o `Resúmeme mi selección actual`

## Historia del proyecto

| Fecha | Evento |
|---|---|
| 28 jun 2026 | **Inicio del fork**: commit `bd0186d`. Gabriel Pantoja descarga el ZIP de `tmustier/pi-for-excel` v0.9.0-pre y crea este repositorio con la primera fase de rebranding (manifest, package.json, landing en español). |
| 30 jun 2026 | Bundled las primeras 3 skills de tasaciones (`homologacion`, `honorarios`, `sec-indemnizacion`, `faja-vial`). |
| 14 jul 2026 | Bootstrap de opencode como CLI de desarrollo para este repo. |
| 16 jul 2026 | Sideload verificado en Excel Desktop Windows (Microsoft 365). Smoke run documentado en [`docs/release-smoke-runs/2026-07-16-windows-sideload.md`](docs/release-smoke-runs/2026-07-16-windows-sideload.md). |
| 22 jul 2026 | Shipped `audit_ref_errors` + `link_referenciales_cuadro` (commit `0f052da`) tras el transcript del cuadro de referenciales. |
| 22 jul 2026 | **Release público open source** (este commit). |

## Developer Quick Start

### Requisitos

- **Node.js ≥ 22.19** (ver `engines` en `package.json`).
- **mkcert** — para HTTPS local (requerido por Office.js).

### Setup

```bash
git clone https://github.com/gabrielpantoja-cl/complemento-excel.git
cd complemento-excel
npm install

# Generar certificados HTTPS locales (Office.js requiere HTTPS)
mkcert -install   # one-time CA setup
mkcert localhost   # crea localhost.pem + localhost-key.pem
mv localhost-key.pem key.pem
mv localhost.pem cert.pem
```

### Run

```bash
npm run dev        # Vite dev server en https://localhost:3000
```

Después sideload el manifest dev en Excel:

**macOS** ([docs Microsoft](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac)):
```bash
cp manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
```
Después abre Excel → **Insert** → **My Add-ins** → **Tasaciones**.

**Windows** ([docs Microsoft](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins)):

Excel Desktop ya no expone "Upload My Add-in" desde 2026. Usa el Trusted Add-in Catalog con el script de este repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1
# Asegúrate de que `npm run dev` esté corriendo en otra terminal
```

Después cierra/reabre Excel y **Home → Add-ins → More Add-ins → SHARED FOLDER → Tasaciones → Add**. Procedimiento completo en [`docs/guides/windows-sideload.md`](docs/guides/windows-sideload.md).

El manifest dev apunta a `https://localhost:3000`. El manifest de producción (`manifest.prod.xml`) apunta al despliegue hospedado en Vercel.

### Comandos útiles

| Comando | Descripción |
|---|---|
| `npm run dev` | Vite dev server (puerto 3000, HTTPS) |
| `npm run build` | Build de producción → `dist/` |
| `npm run check` | Lint + typecheck + CSS theme checks |
| `npm run typecheck` | TypeScript type checking solamente |
| `npm run lint` | ESLint |
| `npm run test:models` | Tests unitarios — orden de modelos |
| `npm run test:context` | Tests unitarios — tools, contexto, sesiones, extensiones, integraciones |
| `npm run test:security` | Tests de políticas de seguridad — proxy, CORS, sandbox, OAuth |
| `npm run proxy:https` | CORS proxy para flujos OAuth (default `https://localhost:3003`) |
| `npm run validate` | Valida el manifest del add-in |

### CORS proxy

Algunos endpoints OAuth están bloqueados por CORS dentro de los webviews de Office. Si el login OAuth falla:

1. Setup del usuario: `npx tasaciones-proxy` (o `curl -fsSL https://complemento-excel.vercel.app/proxy | sh` si falta Node)
2. Setup de dev/source: `npm run proxy:https` (default `https://localhost:3003`)
3. En Tasaciones → `/settings` → **Proxy** → habilitar y set la URL
4. Reintentar login

La autenticación por API key generalmente no requiere proxy.

### Bridges locales (Python / tmux)

Helpers de bridge local con un solo comando:

- Python / LibreOffice bridge: `npx tasaciones-python-bridge` (default URL `https://localhost:3340`, modo real)
- tmux bridge: `npx tasaciones-tmux-bridge` (default URL `https://localhost:3341`, modo real)

En Tasaciones, estas URLs de localhost bridge se usan por defecto. Configura `/experimental ...-bridge-url` solo si quieres una URL no-default.

Prerequisitos del modo real:

- `python3` debe estar instalado para `python_run` / `python_transform_range`
- LibreOffice (`soffice` o `libreoffice`) es requerido para `libreoffice_convert`
- `tmux` es requerido para el tmux bridge en modo real

Para forzar modo simulado:

- `PYTHON_BRIDGE_MODE=stub npx tasaciones-python-bridge`
- `TMUX_BRIDGE_MODE=stub npx tasaciones-tmux-bridge`

Alternativas de checkout de fuente siguen disponibles via `npm run python:bridge:https` y `npm run tmux:bridge:https`.

## Arquitectura

Tasaciones es un taskpane add-in de Office single-page construido con:

- **[Vite](https://vite.dev/)** — dev server + bundler de producción
- **[Lit](https://lit.dev/)** — web components para la barra lateral
- **[pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core)** — runtime del agente (tool loop, streaming, state)
- **[pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)** — abstracción multi-provider LLM (Anthropic, OpenAI, Google, GitHub Copilot)
- **[pi-web-ui](https://www.npmjs.com/package/@earendil-works/pi-web-ui)** — web UI compartida (rendering de mensajes, storage, settings)
- **[Office.js](https://learn.microsoft.com/en-us/office/dev/add-ins/)** — API de libro Excel

### Layout del código

```
src/
├── taskpane/          # App init, gestión de sesiones, layout de tabs, inyección de contexto
├── taskpane.html      # Entry HTML (carga Office.js + taskpane.ts)
├── taskpane.ts        # Entry script
├── boot.ts            # Pre-mount setup (CSS, patches)
├── tools/             # 18 core tools + tools experimentales + registry
├── prompt/            # Constructor del system prompt (con bloque DOMAIN_KNOWLEDGE)
├── context/           # Cache del blueprint del libro, tracking de selección/cambios
├── auth/              # OAuth providers, API proxy, restore de credenciales
├── models/            # Orden de modelos + preset providers (OpenRouter, gateways regionales, …)
├── ui/                # Componente de sidebar, renderers de tool, theme CSS
│   └── theme/         # Design tokens, estilos de componentes (DM Sans + paleta teal-green)
├── commands/          # Slash command registry + builtins
├── extensions/        # Extension store, sandbox runtime, permissions
├── integrations/      # Web Search + MCP Gateway integration catalog
├── skills/            # Agent Skills catalog + runtime loader (incluye skills/tasaciones/)
├── experiments/       # Definición de feature flags + toggle logic
├── workbook/          # Identidad del libro (hashed), asociación de sesión, coordinator
├── conventions/       # Defaults de formato (moneda, negativos, dp)
├── rules/             # Store de reglas persistentes (usuario/libro)
├── compaction/        # Thresholds + lógica de auto-compaction
├── storage/           # Inicialización de IndexedDB
├── files/             # Files workspace
├── audit/             # Audit log de cambios del libro
├── messages/          # Helpers de conversión de mensajes
├── debug/             # Utilidades de debug mode
├── stubs/             # Browser stubs para deps CSP/Node-only
├── compat/            # Patches de compatibilidad
└── utils/             # Helpers compartidos (HTML escape, type guards, errors)

scripts/               # Dev helpers — CORS proxy, tmux/python bridges, manifest gen
pkg/proxy/             # Paquete npm CLI publicable: `tasaciones-proxy`
pkg/python-bridge/     # Paquete npm CLI publicable: `tasaciones-python-bridge`
pkg/tmux-bridge/       # Paquete npm CLI publicable: `tasaciones-tmux-bridge`
tests/                 # Tests unitarios + de seguridad
docs/                  # Docs actuales (install/deploy/features/policy) + archive/
skills/                # Definiciones de Agent Skills (tasaciones + bridges)
public/assets/         # Iconos del add-in (16/32/80/128px)
```

### Patrones de diseño clave

- **Tool registry como single source of truth** — `src/tools/registry.ts` define todos los nombres y construcción de core tools. Los renderers UI, humanizers de input y prompt docs derivan de ahí.
- **Workbook coordinator** — serializa tool calls mutantes por libro para evitar escrituras concurrentes desde múltiples tabs de sesión.
- **Auto-context** — el blueprint del libro, el estado de selección y los cambios recientes se inyectan antes de cada mensaje del usuario.
- **Execution policy** — cada tool se clasifica como `read/none` o `mutate/content|structure` para determinar locking y comportamiento de checkpoint.
- **Recovery checkpoints** — las mutaciones snapshot automáticamente las celdas afectadas antes de escribir, permitiendo rollback de un clic.
- **Extension sandbox** — extensiones no confiables corren en iframe sandbox por defecto; built-in/local modules corren en el host.

## Deployment

El build de producción es un sitio estático desplegado en [Vercel](https://vercel.com). Ver [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) para setup del mantenedor.

Los usuarios instalan descargando `manifest.prod.xml` y subiéndolo a Excel — el manifest apunta a la URL de Vercel hospedada. Las actualizaciones son automáticas (cerrar y reabrir el taskpane).

## Documentación

| Doc | Descripción |
|---|---|
| [NOTICE.md](NOTICE.md) | Créditos upstream y lista de divergencias de alto nivel |
| [docs/guides/install.md](docs/guides/install.md) | Guía de instalación no-técnica |
| [docs/guides/deploy-vercel.md](docs/guides/deploy-vercel.md) | Despliegue hospedado (Vercel) |
| [docs/guides/windows-sideload.md](docs/guides/windows-sideload.md) | Sideload en Excel Desktop Windows |
| [docs/features/extensions.md](docs/features/extensions.md) | Guía de autoría de extensiones |
| [docs/features/integrations-external-tools.md](docs/features/integrations-external-tools.md) | Setup de Web Search + MCP |
| [docs/architecture/security-threat-model.md](docs/architecture/security-threat-model.md) | Modelo de amenazas de seguridad |
| [docs/architecture/upstream-divergences.md](docs/architecture/upstream-divergences.md) | Divergencias intencionales vs `tmustier/pi-for-excel` |
| [docs/features/compaction.md](docs/features/compaction.md) | Compaction de sesión (`/compact`) |
| [src/tools/DECISIONS.md](src/tools/DECISIONS.md) | Log de decisiones de comportamiento de tools |
| [src/ui/README.md](src/ui/README.md) | Arquitectura UI + notas de Tailwind v4 |
| [skills/tasaciones/SKILL.md](skills/tasaciones/SKILL.md) | Índice de las 6 skills de tasaciones bundled |

## Créditos

Este proyecto es un fork de código abierto. Los créditos completos viven en [NOTICE.md](NOTICE.md). Resumen:

- **[pi-for-excel](https://github.com/tmustier/pi-for-excel)** por [Thomas Mustier](https://github.com/tmustier) (MIT) — la base de este fork.
- **[Pi](https://pi.dev)** por [Mario Zechner](https://github.com/badlogic) (MIT) — el framework de agente que lo potencia. Tasaciones usa `pi-agent-core`, `pi-ai` y `pi-web-ui` para el agent loop, abstracción LLM y storage de sesiones.
- **[whimsical.ts](https://github.com/mitsuhiko/agent-stuff/blob/main/pi-extensions/whimsical.ts)** por [Armin Ronacher](https://github.com/mitsuhiko) (MIT) — los mensajes rotativos de "Trabajando…" adaptados de su extensión de Pi y reescritos para una audiencia de tasación.

**Mantenedor actual:** Gabriel Pantoja ([@gabrielpantoja-cl](https://github.com/gabrielpantoja-cl)) — [Loxos](https://loxos.cl). Mantenimiento del fork desde el 28 de junio de 2026.

## Licencia

[MIT](LICENSE) — Copyright (c) 2026 Thomas Mustier; modificaciones Copyright (c) 2026-present Gabriel Pantoja / Loxos.

> Tasaciones by Loxos es un fork open source independiente. No está afiliado, respaldado ni patrocinado por el proyecto upstream `pi-for-excel` o sus autores. Ver [NOTICE.md](NOTICE.md) para los créditos completos y la lista de divergencias intencionales.
