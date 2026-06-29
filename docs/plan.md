# Plan: Tasaciones by Loxos — Complemento Excel IA para Tasaciones Chilenas

> Complemento de Microsoft 365 Excel especializado en tasaciones con fines de
> expropiacion en Chile. Fork de [pi-for-excel](https://github.com/tmustier/pi-for-excel)
> (MIT). Desarrollado por [loxos.cl](https://loxos.cl).

---

## 1. Motivacion

Los complementos existentes para integrar IA en Excel tienen problemas:

| Complemento | Problema |
|---|---|
| **Claude for Excel** (Anthropic) | Excelente pero caro ($20-100/mes) |
| **ChatGPT for Excel** (OpenAI) | De pago, beta limitado |
| **Copilot** (Microsoft) | No gusta, limitado |
| **GPT for Work** | Multi-modelo pero caro en escala |

**Solucion:** complemento propio con **BYOK** (Bring Your Own Key) via
[OpenRouter](https://openrouter.ai), que permite usar modelos gratuitos
(openrouter/free, Gemini) y de paga (Claude, GPT) pagando solo los tokens
que se usan.

---

## 2. Base: fork de pi-for-excel

| Atributo | Valor |
|---|---|
| Repositorio origen | `tmustier/pi-for-excel` (MIT) |
| Estrategia | ZIP + repo propio (sin upstream remote) |
| Repositorio propio | `github.com/gabrielpantoja-cl/tasaciones-for-excel` |
| Directorio local | `~/Developer/loxos/tasaciones/` |
| Tecnologia | Lit web components + TypeScript + Vite |
| Runtime agente | `@earendil-works/pi-agent-core` |
| Multi-provider | `@earendil-works/pi-ai` |
| API Office | Office.js (task pane add-in) |

**Razon del fork via ZIP:** divergencia asegurada. El system prompt, skills,
UI, y config de modelos seran 100% personalizados. Mantener un upstream
remote generaria conflictos constantes en los archivos que mas modificamos.

---

## 3. Arquitectura

```
Excel (Desktop / Online)
  └── Task Pane (Office.js)
        └── Tasaciones by Loxos
              ├── Chat UI (Lit web components)
              ├── Selector de modelo (OpenRouter)
              │     ├── openrouter/free (modelos gratuitos)
              │     ├── anthropic/claude-sonnet-4.6
              │     ├── openai/gpt-4o-mini
              │     └── google/gemini-2.5-flash
              ├── System prompt de tasaciones chilenas
              ├── Skills especializadas (markdown)
              │     ├── homologacion
              │     ├── honorarios
              │     ├── sec-indemnizacion
              │     ├── faja-vial
              │     └── verificar-consistencia
              └── 16 herramientas nativas de Excel
                    (read, write, format, chart, formula, etc.)
```

### Flujo de datos

```
Usuario escribe: "Homologa los referenciales de la hoja REF"

  → Agente lee contexto (hoja actual, seleccion, blueprint)
  → System prompt inyecta conocimiento de tasaciones
  → Skill de homologacion se activa
  → Modelo (OpenRouter) procesa
  → Herramienta read_range lee datos de REF
  → Herramienta write_cells escribe resultados
  → Usuario revisa y aprueba
```

---

## 4. System Prompt — Knowledge Base de Tasaciones

El corazon del complemento. Se inyecta como `userInstructions` en el sistema
de reglas persistentes del agente. Contenido:

### 4.1 Marco legal

- **DL 2.186/1978** — Ley de Expropiaciones
- **DFL 850/1998** — Vialidad/MOP
- **LGSE DFL 4/20.018** — Servidumbres electricas (SEC)
- **DS 113** — Reglamento de servidumbres electricas
- **DS 52** — Procedimientos SEC
- **Codigo de Procedimiento Civil** — Peritajes judiciales
- **Art. 24 DFL 850/1997** — Faja vial existente

### 4.2 Codigos SII de destino predial

| Codigo | Destino | Codigo | Destino |
|---|---|---|---|
| A | Agricola | M | Mineria |
| B | Agroindustrial | O | Oficina |
| C | Comercio | P | Adm. Publica / Casa Patronal |
| D | Deporte y Recreacion | Q | Culto |
| E | Educacion y Cultura | S | Salud |
| F | Forestal | T | Transporte |
| G | Hotel, Motel | V | Otros |
| H | Habitacional | W | Sitio Eriazo |
| I | Industria | Y | Gallineros, chancheras |
| L | Bodega y Almacenaje | Z | Estacionamiento |

**Regla:** cuando el SII muestra destino W (Sitio Eriazo) pero la zonificacion
es Agricola, indicar ambos datos.

### 4.3 Homologacion rural — 7 factores

| Factor | Rango | Evalua |
|---|---|---|
| F_ubic (Ubicacion) | 0.70 - 1.30 | Distancia a centros urbanos |
| F_acc (Accesibilidad) | 0.75 - 1.25 | Tipo de camino, distancia a ruta principal |
| F_sup (Superficie) | 0.85 - 1.15 | Economias de escala |
| F_forma (Forma) | 0.90 - 1.10 | Regularidad del perimetro |
| F_topo (Topografia) | 0.75 - 1.20 | Pendiente / terreno |
| F_uso (Capacidad de uso) | 0.70 - 1.30 | Clase de suelo (Klingebiel I-VII) |
| F_rest (Restricciones) | 0.60 - 1.00 | Servidumbres, monumentos, DL 3516 |

**Factor compuesto = producto de los 7 factores.** Si el compuesto esta fuera
de 0.50 - 1.50, el referencial es demasiado disimil.

### 4.4 Formato numerico chileno

| Concepto | Formato | Ejemplo |
|---|---|---|
| Miles | `.` separador | `1.331.832` |
| Decimales | `,` separador | `33,54` |
| UF | `#.##0,00` | `12.450,50 UF` |
| CLP | `$ #.##0` | `$ 45.000.000` |
| Superficie m2 | `#.##0,00 m2` | `5.432,10 m2` |
| Fechas | `DD-MM-AAAA` o `DD de MES de AAAA` | `15-ene-2026` |
| Porcentajes | `0,0%` | `12,5%` |

### 4.5 Calculos especializados

**Valor de indemnizacion:**
```
Valor_Indemnizacion = Suelo + Construcciones + Plantaciones + Otros_Danos
```

**Valor unitario ajustado:**
```
Valor_Unitario_Ajustado = promedio de (Valor_Referencial x F_compuesto)
                         para todos los referenciales homologados
```

**Honorarios (tabla de tramos):**
| Tramo | Porcentaje |
|---|---|
| Hasta 1.000 UF | 10% |
| 1.001 - 3.000 UF | 8% |
| 3.001 - 5.000 UF | 7% |
| 5.001 - 10.000 UF | 6% |
| Sobre 10.000 UF | 5% |
| Minimo por perito | 3,5 UF |

Se aplica descuento de retencion SII (10,75%) y se divide entre los
miembros de la comision.

**Faja vial existente (Art. 24 DFL 850):** aplicar 30% del valor base
del suelo. El valor base debe estar explicitamente definido y calculado
en el cuerpo del informe.

**SEC indemnizacion — 6 categorias:**
1. Suelo ocupado por obras fisicas (bases de torres)
2. Indemnizacion por derecho de tránsito
3. Franja de servidumbre con restricciones de uso
4. Danos a construcciones
5. Perdida de plusvalia del resto del predio
6. Recargo legal del 20%

**Prohibido:** considerar el mayor valor futuro generado por el proyecto
mismo.

### 4.6 Validaciones

- ROL SII debe tener formato valido
- Fecha de escritura debe ser anterior a fecha de inscripcion
- Valores $/m2 dentro de rangos aceptables (0,1 - 500 UF/m2 rural)
- Suma de componentes = valor total del lote
- Factor compuesto de homologacion dentro de 0,50 - 1,50
- Referenciales deben tener ROL SII y datos de inscripcion CBR para ser
  rastreables ("una referencia es valida solo cuando es rastreable")

---

## 5. Skills especializadas

Skills markdown que se instalan en el catalogo de skills del agente.
Cada skill contiene un workflow paso a paso.

### 5.1 `tasaciones/homologacion`

Workflow completo para homologar referenciales rurales:
1. Leer referenciales de la hoja activa o seleccion
2. Identificar columnas: superficie, monto, UF, ubicacion, tipo, fecha
3. Aplicar descuento 12% a ofertas (no a transacciones)
4. Actualizar valores a UF de la fecha de valoracion
5. Solicitar al usuario los 7 factores de homologacion (o usar default)
6. Calcular factor compuesto (producto)
7. Validar rango 0,50 - 1,50
8. Escribir resultados en nueva hoja o columnas adyacentes

### 5.2 `tasaciones/honorarios`

1. Leer valor total de la tasacion (celda o input)
2. Aplicar tabla de tramos
3. Dividir entre miembros de la comision
4. Calcular retencion SII 10,75%
5. Mostrar bruto y liquido por perito
6. Escribir cuadro resumen en hoja nueva

### 5.3 `tasaciones/sec-indemnizacion`

1. Identificar cada una de las 6 categorias de dano
2. Para cada categoria, calcular valor con metodologia Before/After
3. Aplicar recargo legal del 20%
4. Sumar todas las categorias
5. Verificar que no se incluye plusvalia futura del proyecto
6. Generar cuadro de indemnizacion

### 5.4 `tasaciones/faja-vial`

1. Identificar si el lote expropiado es faja vial existente
2. Leer el valor base del suelo (debe estar definido en el informe)
3. Aplicar 30% del valor base
4. Verificar que no se aplican mejoras o praderas (es camino, no tierra
   productiva)
5. Documentar el fundamento legal (Art. 24 DFL 850/1997)

### 5.5 `tasaciones/verificar-consistencia`

Checklist de validacion para el informe completo:
- ROL SII de cada lote vs catastro
- Fechas: escritura < inscripcion < fecha de valoracion
- Valores $/m2 dentro de rango (0,1 - 500 UF/m2 rural)
- Suma de componentes = total
- Referenciales tienen ROL SII y CBR
- Factores de homologacion documentados
- UF en celda parametro (azul, no hardcodeada)
- Sin formulas TEXT() con locale (usar celdas separadas)
- Destino SII vs zonificacion (informar ambos)

---

## 6. Plan de implementacion por fases

### Fase 1 — Fork y scaffolding (COMPLETADO)

- [x] Descargar ZIP de pi-for-excel (28-jun-2026)
- [x] `git init` en `~/Developer/loxos/tasaciones/`
- [x] `.gitignore` (node_modules, dist, .env)
- [x] `git add -A && git commit -m "init..."`
- [x] Crear repo `gabrielpantoja-cl/tasaciones-for-excel` (privado)
- [x] `git push -u origin main`
- [x] `npm install` (803 paquetes)
- [x] Agregar al workspace VS Code
- [x] Escribir este plan (`docs/plan.md`)

### Fase 2 — Branding y config inicial (~2 horas)

- [ ] Renombrar en `package.json`: `name` → `tasaciones`, `displayName` → `Tasaciones`
- [ ] Generar nuevo GUID para `manifest.xml`
- [ ] Cambiar `ProviderName` → `Loxos`
- [ ] Cambiar `Description` → "Complemento IA para tasaciones chilenas"
- [ ] Cambiar iconos en `assets/` y `public/assets/`
- [ ] Crear logo "Tasaciones by Loxos" (icon-16, 32, 80, 128)
- [ ] Modificar landing page (`public/index.html` y `public/landing.js`)
- [ ] Verificar que compila: `npm run build`

### Fase 3 — System prompt de tasaciones (~4 horas)

- [ ] Redactar system prompt completo (~2000 palabras, ver seccion 4)
- [ ] Inyectar como `userInstructions` por defecto en `src/prompt/system-prompt.ts`
- [ ] Alternativa: cargar como user rules persistentes al primer inicio
- [ ] Probar en Excel Desktop: "Que es el DL 2.186?" debe responder
    correctamente
- [ ] Probar: "Que destino SII tiene un sitio eriazo en zona agricola?"
- [ ] Probar: "Cuales son los 7 factores de homologacion?"

### Fase 4 — Modelos OpenRouter por defecto (~1 hora)

- [ ] Agregar OpenRouter como gateway pre-configurado en `src/models/switch-behavior.ts`
- [ ] Curated model list:
    - `openrouter/free` — router automatico de modelos gratuitos
    - `google/gemini-2.5-flash` — bueno y economico
    - `openai/gpt-4o-mini` — solido y rapido
    - `anthropic/claude-sonnet-4.6` — el mejor para analisis
- [ ] Modificar `src/taskpane/default-model.ts` para que el default sea
    `openrouter/free`
- [ ] Probar conexion con API key de OpenRouter

### Fase 5 — Skills de tasaciones (~6 horas)

- [ ] Crear `skills/tasaciones/homologacion.md`
- [ ] Crear `skills/tasaciones/honorarios.md`
- [ ] Crear `skills/tasaciones/sec-indemnizacion.md`
- [ ] Crear `skills/tasaciones/faja-vial.md`
- [ ] Crear `skills/tasaciones/verificar-consistencia.md`
- [ ] Crear `skills/tasaciones/SKILL.md` (indice de la coleccion)
- [ ] Probar cada skill con datos reales de una tasacion

### Fase 6 — Despliegue y documentacion (~2 horas)

- [ ] `npm run build` para produccion
- [ ] Subir a Vercel (o hosting estatico)
- [ ] Generar `manifest.prod.xml` con URL real
- [ ] Escribir `INSTALL.md` con instrucciones para Windows
- [ ] Instalar en el Lenovo Legion (Windows + Microsoft 365)
- [ ] Prueba de extremo a extremo con una tasacion real

### Fase 7 — Mejoras post-lanzamiento (futuro)

- [ ] Web search integrado para buscar referenciales en portales
    (PortalInmobiliario, Yapo)
- [ ] Generacion de cuadros MOP completos con formato institucional
- [ ] Validacion automatica de consistencia del informe completo
- [ ] Integracion con Supabase para cargar referenciales a la base de datos
- [ ] Modo oscuro (viene de fabrica en pi-for-excel)
- [ ] Publicacion en AppSource (opcional, para distribucion)

---

## 7. Costos

| Concepto | Costo |
|---|---|
| Desarrollo del complemento | $0 (codigo propio) |
| Modelos gratuitos OpenRouter | $0 (50 req/dia gratis) |
| Con $10 de credito OpenRouter | $10 una vez (sube a 1000 req/dia gratis + modelos de paga) |
| Hosting (Vercel) | $0 (plan gratis) |
| Licencia Microsoft 365 | Ya incluida |
| **Costo mensual minimo** | **$0** |
| **Costo mensual con Claude/GPT** | **$1-5** (solo los tokens que uses) |

**Comparacion:**
| Alternativa | Costo/mes |
|---|---|
| Claude for Excel (Pro) | $20 |
| Claude for Excel (Max) | $100 |
| ChatGPT for Excel (Plus) | $20 |
| GPT for Work | $29 - $999 |
| **Tasaciones by Loxos** | **$0 - $5** |

---

## 8. Repositorio y versionado

```
tasaciones-for-excel/
├── .gitignore
├── package.json          ← name: "tasaciones", version: "0.1.0"
├── manifest.xml          ← GUID propio, "Tasaciones by Loxos"
├── manifest.prod.xml     ← para produccion (Vercel)
├── vite.config.ts
├── tsconfig.json
├── vercel.json
├── LICENSE               ← MIT (heredado)
├── README.md
├── docs/
│   ├── plan.md           ← Este documento
│   ├── INSTALL.md        ← Instrucciones de instalacion
│   └── CHANGELOG.md      ← Historial de cambios
├── assets/               ← Iconos y branding
├── public/               ← Landing page y assets publicos
├── scripts/              ← Scripts de build, deploy, validacion
├── skills/
│   └── tasaciones/       ← Skills especializadas
├── src/
│   ├── prompt/           ← System prompt
│   ├── models/           ← Config de modelos (OpenRouter)
│   ├── skills/           ← Catalogo de skills
│   ├── tools/            ← 16 herramientas Excel
│   ├── ui/               ← Componentes UI (Lit)
│   ├── auth/             ← Autenticacion
│   ├── excel/            ← Helpers Excel
│   ├── taskpane/         ← Logica del task pane
│   ├── commands/         ← Slash commands
│   └── workbook/         ← Recovery y sesiones
└── tests/                ← Tests (80+)
```

---

## 9. Instalacion en Windows (Microsoft 365)

### Desarrollo (sideload local)

```bash
# En maquina Windows con Node.js 20+
git clone https://github.com/gabrielpantoja-cl/tasaciones-for-excel.git
cd tasaciones-for-excel
npm install
npm run dev          # Servidor local en https://localhost:3000
npm run sideload     # Abre Excel con el add-in cargado
```

### Produccion (Vercel + manifest)

```bash
npm run build
# Subir dist/ a Vercel
npm run manifest:prod   # Genera manifest.prod.xml con URL real
```

Luego en Excel:
1. Insertar → Mis complementos → Subir complemento
2. Seleccionar `manifest.prod.xml`
3. Click en "Tasaciones" en la cinta
4. Configurar API Key de OpenRouter
5. Empezar a usar

---

## 10. Notas tecnicas

### Por que pi-for-excel

- **16 herramientas nativas** para leer, escribir, formatear, graficar
- **Auto-contexto**: sabe que celda/hoja tienes seleccionada
- **Recovery**: checkpoint automatico antes de cada cambio
- **Sesiones multiples**: pestañas por workbook
- **Multi-provider**: Anthropic, OpenAI, Google, GitHub, Custom (OpenRouter)
- **80+ tests**: base solida y probada
- **MIT license**: sin restricciones de uso
- **Comunidad activa**: 367+ estrellas, 47 forks

### Lo que NO cambiamos

Para mantener la base estable:
- Las 16 herramientas de Excel
- Sistema de sesiones y recovery
- UI core (solo branding)
- Logica de autenticacion (solo agregamos OpenRouter como gateway)
- Tests existentes (se agregan nuevos)

### OpenRouter API

- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- API key se configura en `/settings` del complemento
- Modelos gratuitos con 50 req/dia (1000 con $10+ en credito)
- Modelos de paga: solo pagas tokens que usas
- 5,5% de fee en compra de creditos (no en tokens)
- OpenAI-compatible = funciona con cualquier SDK de OpenAI
