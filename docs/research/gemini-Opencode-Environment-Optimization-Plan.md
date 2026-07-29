# **Reporte de Investigación Arquitectónica: Optimización del Entorno OpenCode para Tasaciones by Loxos**

La arquitectura de un entorno de desarrollo basado en agentes requiere una orquestación meticulosa entre el contexto del repositorio, las capacidades del modelo de lenguaje y las restricciones del entorno de ejecución. En el caso del proyecto "Tasaciones by Loxos", la intersección entre un Add-in de Excel operado por Office.js, un motor de interfaz basado en Lit y el entorno de terminal gobernado por OpenCode presenta un desafío bidimensional. El modelo cognitivo del agente CLI de OpenCode debe alinearse con la arquitectura de la aplicación compilada por Vite, sin que ambos ecosistemas colisionen.  
Este documento devela la estrategia óptima para estructurar, configurar y potenciar el directorio .opencode/, resolviendo las fricciones operativas actuales. Se abordan las topologías de agentes y comandos, la separación de la lógica local versus la canónica, las mecánicas de caché de MiniMax-M3 y la orquestación de herramientas a través del Model Context Protocol (MCP).

## **Resumen Ejecutivo**

* La consolidación del entorno exige abandonar las convenciones heredadas de Claude Code (como mcp.json o .claude/) en favor de un directorio .opencode/ estrictamente tipado que centralice agentes, comandos y la configuración opencode.json, orquestando la sincronización de habilidades (skills) mediante la resolución en tiempo de compilación de Vite (import.meta.glob) para evitar la deriva de código1.  
* La superación de la brecha de ejecución entre el CLI de OpenCode y el panel de tareas de Excel demanda una arquitectura de puente basada en MCP; esto permite transformar scripts aislados de Python y Tmux en herramientas nativas del agente, facilitando el diagnóstico del estado del DOM virtual de Lit y de los objetos RequestContext sin requerir invocaciones manuales del desarrollador4.  
* La eficiencia económica y operativa del modelo MiniMax-M3 depende críticamente de la higiene del caché de prefijos (prefix caching); esto obliga a escindir el voluminoso archivo AGENTS.md inyectando contextos estáticos tempranos y relegando la información mutacional (como resultados de comandos Bash o invocaciones de herramientas) a la cola dinámica de la conversación, previniendo la invalidación masiva del contexto5.

## **1\. Estructura Canónica de .opencode/**

Para estabilizar el entorno de desarrollo y eliminar las ambigüedades en el descubrimiento de recursos, es imperativo adoptar la estructura de directorios canónica que el motor de OpenCode espera de forma nativa. La documentación oficial establece que OpenCode descubre su configuración buscando de manera ascendente desde el directorio de trabajo actual hasta encontrar la raíz del *git worktree*1.

### **El Layout Recomendado y Reglas de Descubrimiento**

En las versiones recientes de OpenCode (v1.15+ y la arquitectura de transición hacia v2.0), el sistema prefiere explícitamente la nomenclatura en plural para los subdirectorios, aunque mantiene compatibilidad retroactiva con nombres en singular8. El estándar arquitectónico recomendado para este proyecto se define a continuación:

| Directorio / Archivo | Función Arquitectónica | Especificaciones de Implementación |
| :---- | :---- | :---- |
| opencode.json | Configuración maestra | Define los proveedores de LLM, reglas globales de permisos, servidores MCP (sustituyendo a mcp.json) y el arreglo de instrucciones compartidas. |
| agents/ | Perfiles de subagentes | Archivos Markdown (\*.md) que contienen *frontmatter* YAML. El nombre del archivo se convierte en el invocador del agente (ej. @tasador.md se invoca como @tasador). |
| commands/ | Macros conversacionales | Archivos Markdown que definen comandos *slash* (/...). Permiten la inyección de comandos shell (\! comando) y la inclusión de referencias a archivos (@archivo). |
| skills/ | Habilidades estáticas | Subdirectorios con nombres estrictamente en minúsculas alfanuméricas separados por guiones. Cada uno debe contener un archivo llamado exactamente SKILL.md (en mayúsculas) con *frontmatter* YAML validado. |
| plugins/ | Extensiones de ejecución | Scripts TypeScript/JavaScript que utilizan la API de plugins de OpenCode para interceptar ciclos de vida de comandos o herramientas. |

### **Mejores Prácticas Oficiales y Comunitarias**

OpenCode establece directrices explícitas para el manejo de habilidades. El nombre del directorio dentro de skills/ debe coincidir exactamente con el campo name declarado en el *frontmatter* del archivo SKILL.md subyacente. La validación del nombre sigue la expresión regular ^\[a-z0-9\]+(-\[a-z0-9\]+)\*$, limitándose a un máximo de 64 caracteres y prohibiendo guiones consecutivos1.  
Aunque la especificación JSON de OpenCode permite definir comandos y agentes directamente dentro de opencode.json mediante las claves "command" y "agent"10, la mejor práctica comunitaria es externalizar estas definiciones en archivos Markdown individuales dentro de sus respectivos directorios. Esta externalización ofrece múltiples ventajas: mejora drásticamente la legibilidad, facilita las revisiones de código en sistemas de control de versiones y, fundamentalmente, permite que el LLM lea e interprete el archivo como un documento de texto estándar durante la depuración de sus propios flujos de trabajo12.  
Es crítico destacar que la estructura .claude/ y el archivo mcp.json son artefactos heredados de la compatibilidad con Claude Code. OpenCode los soporta como mecanismo de *fallback*, pero su uso genera inconsistencias en la resolución de rutas complejas y en el manejo de servidores MCP locales13. La recomendación absoluta es migrar toda la configuración exclusivamente a .opencode/.

## **2\. Agentes Personalizados para el Proyecto**

El desarrollador ha dependido históricamente de los agentes genéricos integrados (build, general, explore), los cuales carecen del contexto normativo del negocio de tasaciones y de las particularidades del ecosistema Lit \+ Office.js. Para resolver las fricciones de orquestación, se diseñan cuatro agentes especializados.

### **A. @tasador-jefe (Orquestador de Lógica de Negocio)**

Este agente actúa como el cerebro de las operaciones inmobiliarias. Su propósito es coordinar las decisiones algorítmicas de las tasaciones, la homologación de valores y los cálculos de honorarios, liberando al desarrollador de tener que encadenar manualmente estas habilidades.

* **Patrón de invocación:** /run @tasador-jefe diseña la fórmula de depreciación para el nuevo componente de expropiaciones.  
* **Jerarquía:** Agente Principal (mode: primary).  
* **Herramientas disponibles:** skill, read, bash.  
* **Diseño del Prompt y Frontmatter (.opencode/agents/tasador-jefe.md):**

YAML  
\---  
description: Experto en normativa de tasaciones chilenas y orquestador de lógica de negocio.  
mode: primary  
model: minimax/minimax-m3  
steps: 15  
permissions:  
  \- action: edit  
    resource: "\*"  
    effect: deny  
  \- action: shell  
    resource: "npm run test:math \*"  
    effect: allow  
\---  
Asumes el rol del Tasador Jefe de Loxos, experto en el mercado inmobiliario de Valdivia y la normativa nacional de expropiaciones.  
Tu objetivo principal es traducir requerimientos de tasación en especificaciones lógicas claras y arquitecturas de datos.  
No escribes código de interfaz de usuario. Tu dominio son los algoritmos matemáticos, las fórmulas de homologación y la validación de honorarios.

Directrices operativas:  
1. Utiliza la herramienta \`skill\` para cargar las habilidades \`tasaciones/homologacion\` y \`tasaciones/honorarios\` siempre que se discutan cálculos de valor.  
2. Asegura que todas las fórmulas propuestas cumplan con los estándares definidos en la documentación técnica del proyecto.  
3. Si requieres verificar una fórmula, instruye la creación de un script Python o TypeScript aislado en lugar de intentar inyectarlo en el código de producción prematuramente.

### **B. @qa-excel (Auditor de DOM y Referenciales)**

El cuadro de referenciales sufre roturas constantes debido a la desincronización entre el estado reactivo de Lit y el proxy asíncrono de Office.js. Este agente se especializa en diagnosticar y reparar estas anomalías específicas.

* **Patrón de invocación:** /run @qa-excel el cuadro de referenciales no actualiza los valores tras el evento onClick.  
* **Jerarquía:** Subagente (mode: subagent).  
* **Herramientas disponibles:** read, edit, glob, grep.  
* **Diseño del Prompt y Frontmatter (.opencode/agents/qa-excel.md):**

YAML  
\---  
description: Especialista en depuración de estado de Lit y sincronización de Office.js.  
mode: subagent  
model: minimax/minimax-m3  
steps: 8  
permissions:  
  \- action: subagent  
    resource: "\*"  
    effect: deny  
  \- action: shell  
    resource: "\*"  
    effect: ask  
\---  
Eres el ingeniero de control de calidad especializado en la integración de Lit Element con las APIs de Microsoft Excel (Office.js).  
Tu objetivo es diagnosticar fallos en el "cuadro de referenciales" y prevenir fugas de memoria.

Directrices operativas:  
1. Al auditar un componente, verifica siempre que los bloques \`Excel.run(async (context) \=\> {...})\` gestionen correctamente las promesas y llamen a \`context.sync()\` antes de leer propiedades.  
2. Analiza el manejo del estado reactivo de Lit (propiedades decoradas con \`@state\` o \`@property\`).  
3. Tienes prohibido invocar a otros subagentes para evitar bucles de recursión. Debes analizar los archivos usando tus herramientas nativas de lectura y búsqueda.  
4. Si detectas un error de referencias en las celdas, instruye al desarrollador a utilizar la herramienta externa \`audit\_ref\_errors\`, dado que no puedes ejecutarla desde la terminal.

(Justificación de riesgos: La directiva de permisos action: subagent, effect: deny mitiga proactivamente un defecto crítico documentado en OpenCode donde los subagentes con permisos de tareas habilitados pueden entrar en un bucle infinito de recursión, generando sesiones anidadas que consumen tokens aceleradamente sin llegar a un resultado15).

### **C. @release-manager (Orquestador de Despliegue)**

Resuelve la fricción de la falta de indicadores visuales de versión, asegurando que cada *push* a producción sea validado.

* **Patrón de invocación:** /run @release-manager prepara la versión 1.4.2 para despliegue.  
* **Jerarquía:** Subagente (mode: subagent).  
* **Herramientas disponibles:** bash, edit, read.  
* **Diseño del Prompt y Frontmatter (.opencode/agents/release-manager.md):**

YAML  
\---  
description: Controlador de versiones, auditor de pre-push y verificador de despliegues.  
mode: subagent  
model: minimax/minimax-m3  
steps: 5  
permissions:  
  \- action: edit  
    resource: "src/taskpane.html"  
    effect: allow  
  \- action: edit  
    resource: "package.json"  
    effect: allow  
\---  
Eres el gestor de despliegues del proyecto Tasaciones by Loxos. Tu responsabilidad es garantizar la trazabilidad de cada actualización.

Flujo de trabajo obligatorio antes de autorizar un despliegue:  
1. Localiza el indicador de versión visible en \`src/taskpane.html\` o en los componentes base de Lit.  
2. Asegúrate de que el indicador de versión coincida con el incremento semántico propuesto.  
3. Ejecuta los scripts de verificación locales (\`npm run lint\` y \`npm run audit:ci\`).  
4. Si los tests fallan, reporta el error y detén el proceso de despliegue inmediatamente.

### **D. @lit-architect (Arquitecto de Componentes)**

Diseñado para asistir en la construcción estructurada del código frontal.

* **Patrón de invocación:** /run @lit-architect crea un nuevo componente para la tabla de honorarios.  
* **Jerarquía:** Subagente (mode: subagent).  
* **Herramientas disponibles:** edit, write, read.  
* **Diseño del Prompt y Frontmatter (.opencode/agents/lit-architect.md):**

YAML  
\---  
description: Generador de componentes web basados en Lit y TypeScript.  
mode: subagent  
model: minimax/minimax-m3  
steps: 6  
\---  
Eres el arquitecto frontend especializado en Lit y TypeScript. Tu misión es asegurar la higiene y consistencia del código del Add-in.

Directrices operativas:  
1. Todo nuevo componente debe extender de \`LitElement\` y utilizar TypeScript estricto.  
2. Emplea constructos de Shadow DOM de manera consistente para encapsular estilos.  
3. Evita re-renderizados innecesarios optimizando el ciclo de vida \`shouldUpdate\`.  
4. Utiliza la herramienta de escritura (\`edit\`) para andamiar nuevos archivos respetando la jerarquía de directorios \`src/components/\`.

## **3\. Comandos Personalizados para el Proyecto**

El uso recurrente de *scripts* Bash *ad-hoc* introduce ineficiencia y propensión al error. El sistema de comandos de OpenCode (.opencode/commands/) permite empaquetar lógicas complejas, inyectar el *output* del shell dinámicamente (\! comando) y automatizar la inclusión de contextos de archivos (@archivo) directamente en el prompt del LLM11.  
A continuación, se diseñan 6 comandos estratégicos para reemplazar la intervención manual del desarrollador.

### **1\. /refine (Bucle de Mejora Continua)**

Elimina la necesidad de copiar y pegar manualmente el *mega prompt* (§5) en cada sesión.

* **Argumentos:** $ARGUMENTS (Ruta o nombre del componente a refinar).  
* **Descripción breve:** Ejecuta el protocolo de mejora continua sobre un componente específico.  
* **Implementación (.opencode/commands/refine.md):**

YAML  
\---  
description: Ejecuta el bucle de mejora continua sobre el código actual.  
agent: qa-excel  
\---  
Aplica el protocolo de mejora continua (Mega Prompt §5) sobre el siguiente componente o módulo: $ARGUMENTS.

Realiza un análisis exhaustivo bajo los siguientes criterios:  
1. Vulnerabilidades de memoria relacionadas con la recolección de basura de objetos de Office.js.  
2. Fugas de eventos en el ciclo de vida de Lit (asegurando limpieza en \`disconnectedCallback\`).  
3. Ineficiencias de tipado en TypeScript, sugiriendo inferencias de tipos más robustas.

Genera un plan de refactorización detallado antes de proponer modificaciones directas.

### **2\. /bump (Sincronización de Versión)**

Aborda la primera fricción reportada: la incapacidad de verificar si un *push* alcanzó producción sin realizar un cambio visible.

* **Argumentos:** $1 (Tipo de incremento: patch, minor, major).  
* **Descripción breve:** Incrementa la versión en package.json y en la UI del add-in.  
* **Implementación (.opencode/commands/bump.md):**

YAML  
\---  
description: Prepara la versión para asegurar la trazabilidad visual en producción.  
agent: release-manager  
\---  
Se ha solicitado un incremento de versión de tipo: $1.

Analiza el estado actual del repositorio mediante el log reciente:  
\!\`git log \--oneline \-5\`

Tu tarea es:  
1. Modificar el archivo \`package.json\` aplicando el incremento semántico correspondiente.  
2. Actualizar el indicador visual de versión dentro de \`src/taskpane.html\` o la constante de configuración equivalente.  
3. Proponer el comando git de commit para registrar el cambio de versión.

### **3\. /sideload (Asistente de Despliegue Local)**

Mitiga la fricción de recordar los comandos específicos y las peculiaridades del *sideloading* de Excel en el entorno Windows 11\.

* **Argumentos:** Ninguno.  
* **Descripción breve:** Ejecuta la regeneración de certificados y guía el proceso de sideloading.  
* **Implementación (.opencode/commands/sideload.md):**

YAML  
\---  
description: Regenera certificados mkcert y prepara el sideload de Windows 11.  
\---  
Se requiere preparar el entorno local para probar el Add-in en Microsoft Excel para escritorio (Windows 11).

Primero, analiza el resultado de la regeneración de certificados locales:  
\!\`npm run certs:generate\`

Con base en este estado, proporciona instrucciones precisas al usuario sobre cómo:  
1. Copiar \`manifest.xml\` a la carpeta compartida en red (\`C:\\Users\\gabri\\...\`).  
2. Configurar el "Trust Center" de Excel para reconocer el catálogo compartido.  
Identifica y advierte sobre errores comunes de CORS o certificados inválidos en este contexto.

### **4\. /sync-skills (Auditoría de Deriva de Habilidades)**

Previene discrepancias silenciosas entre los ecosistemas de habilidades, garantizando coherencia arquitectónica.

* **Argumentos:** Ninguno.  
* **Descripción breve:** Verifica la deriva de habilidades entre OpenCode y el Add-in de Excel.  
* **Implementación (.opencode/commands/sync-skills.md):**

YAML  
\---  
description: Audita discrepancias entre las carpetas de skills de OpenCode y el código fuente.  
\---  
Se debe auditar la paridad estructural de las habilidades del proyecto.

Examina el contenido actual del directorio \`.opencode/skills/\`:  
\!\`ls \-la .opencode/skills/\`

Revisa la configuración actual del catálogo compilado por Vite en el código fuente:  
Revisa el contenido en @src/skills/catalog.ts.

Identifica cualquier habilidad presente en \`.opencode/skills/\` que no esté correctamente enrutada en la exportación de Vite y sugiere el código TypeScript necesario para corregir la deriva.

### **5\. /audit-ref (Diagnóstico de Referenciales)**

Automatiza la invocación de herramientas críticas que el desarrollador suele olvidar, reduciendo fallos recurrentes.

* **Argumentos:** Ninguno.  
* **Descripción breve:** Invoca al agente de QA para revisar el cuadro de referenciales.  
* **Implementación (.opencode/commands/audit-ref.md):**

YAML  
\---  
description: Revisa la lógica y el estado de datos del cuadro de referenciales.  
agent: qa-excel  
\---  
Inicia una auditoría profunda sobre la implementación del cuadro de referenciales.

Utiliza el siguiente output del comando de validación estática como punto de partida:  
\!\`npm run lint:components\`

Evalúa la integridad de los enlaces de datos (data-binding) y propone soluciones concretas si detectas condiciones de carrera entre la inicialización de Lit y la carga de datos de Office.js. Recomienda al usuario invocar la herramienta \`audit\_ref\_errors\` en el Add-in si los datos son sospechosos.

### **6\. /test-ui (Ejecución de Pruebas Frontend)**

Permite validar la UI de manera ágil sin abandonar el entorno de conversación.

* **Argumentos:** Ninguno.  
* **Descripción breve:** Ejecuta la suite de pruebas enfocada en componentes Lit.  
* **Implementación (.opencode/commands/test-ui.md):**

YAML  
\---  
description: Ejecuta pruebas de interfaz y resume los fallos.  
\---  
Se han ejecutado las pruebas de los componentes de la interfaz de usuario:  
\!\`npm run test:ui\`

Analiza los resultados anteriores. Si hay pruebas fallidas, enfócate en aislar el error, sugiriendo parches específicos para los componentes Lit involucrados.

## **4\. Habilidades (Skills): Dualidad OpenCode vs Add-in de Excel**

Existe un conflicto arquitectónico documentado en AGENTS.md: el repositorio posee habilidades en la carpeta skills/ en la raíz (consumidas por Vite mediante import.meta.glob en el entorno de ejecución de Excel)3, y requiere habilidades en .opencode/skills/ (descubiertas por el CLI de OpenCode en el entorno de desarrollo). La instrucción actual establece que ambos sistemas "NO se mezclan automáticamente".  
**La decisión arquitectónica:** ¿Deberían existir habilidades separadas en .opencode/skills/? Sí, es imperativo mantener una separación lógica, pero **no** una separación física redundante que invite a la deriva de conocimiento. Las habilidades cumplen funciones en dimensiones disjuntas:

> 1. **Habilidades de tiempo de ejecución (Add-in):** Operan sobre celdas de Excel, iteran sobre rangos y modifican el lienzo del documento. Son extensiones del agente que corre en el WebView.  
> 2. **Habilidades de tiempo de desarrollo (OpenCode CLI):** Operan sobre archivos fuente, orquestan commits, diagnostican logs y diseñan arquitecturas.

**¿Qué habilidades nativas de OpenCode se deben incorporar?** Se deben incorporar habilidades que empoderen al LLM durante el proceso de codificación, tales como:

* lit-lifecycle-mastery: Una habilidad que detalle las mejores prácticas para escribir el ciclo de vida de componentes Lit en el contexto específico de este proyecto.  
* officejs-error-handling: Habilidad que enseñe al modelo cómo estructurar el código de captura de errores de RequestContext y evitar bloqueos en el hilo de Excel.  
* tasaciones-logic-guide: Una guía declarativa sobre las fórmulas matemáticas y los algoritmos chilenos de tasación, asegurando que cuando el CLI genere código de lógica de negocio, este se base en parámetros normativos correctos.

### **Normativa de Formato de Habilidades en OpenCode**

Cualquier habilidad añadida a .opencode/skills/ debe adherirse estrictamente a las reglas de descubrimiento de OpenCode. Debe existir una carpeta por habilidad, y dentro de ella, un archivo obligatorio nombrado SKILL.md (exactamente en mayúsculas). El *frontmatter* YAML debe ser inmaculado, respetando las validaciones de longitud y formato de campos (el nombre no debe contener guiones iniciales, finales o consecutivos)1.  
**Esquema de ejemplo (.opencode/skills/lit-lifecycle-mastery/SKILL.md):**

YAML  
\---  
name: lit-lifecycle-mastery  
description: Mejores prácticas y patrones seguros para componentes Lit en el Add-in.  
metadata:  
  audience: frontend-devs  
  context: office-js  
\---  
\#\# Funcionalidad  
\- Provee plantillas seguras para inicializar componentes Lit.  
\- Define el manejo correcto de \`connectedCallback\` y \`disconnectedCallback\` para evitar fugas de memoria con eventos globales.

\#\# Cuándo utilizarme  
Invoca esta habilidad siempre que se solicite crear un nuevo componente visual, o cuando se requiera refactorizar la lógica reactiva de un componente existente que interactúa con el estado de Excel.

## **5\. División Estratégica: AGENTS.md vs AGENTS.local.md**

El archivo AGENTS.md actual, con sus 290 líneas, sufre de sobrecarga de responsabilidad. Mezcla conocimiento canónico, vital para cualquier colaborador del repositorio, con configuraciones contingentes y efímeras exclusivas de la máquina del desarrollador en Valdivia.  
OpenCode soluciona elegantemente este anti-patrón mediante el campo "instructions" en opencode.json, el cual acepta un arreglo de múltiples archivos Markdown o patrones *glob*. Esto permite combinar módulos de reglas estandarizados y locales en tiempo de ejecución, componiendo un contexto unificado para el modelo13.

### **Estrategia de Refactorización**

La siguiente tabla detalla la migración línea por línea conceptual de los contenidos actuales, estableciendo una frontera clara entre el dominio del proyecto y el entorno local.

| Contenido Actual | Destino Arquitectónico | Justificación y Reglas de Manejo |
| :---- | :---- | :---- |
| Identidad del proyecto (Tasaciones, mercado chileno, fork de pi-for-excel). | AGENTS.md (Canónico, en Git) | Define el conocimiento fundamental del dominio. Es inmutable entre desarrolladores y esencial para el contexto general del LLM. |
| Arquitectura Core (names.ts \-\> registry.ts \-\> capabilities.ts \-\> humanize-params.ts). | AGENTS.md (Canónico, en Git) | El *wiring chain* es infraestructura central del repositorio; dicta cómo se conectan los módulos y es vital para refactorizaciones. |
| Política de TypeScript y *hooks* (Lint, typecheck, pre-push, audit). | AGENTS.md (Canónico, en Git) | Las reglas de *compliance* y CI/CD son universales para el repositorio y deben ser impuestas a todos los colaboradores y agentes. |
| Higiene del *bundle* y reglas estrictas del caché de prompts. | AGENTS.md (Canónico, en Git) | Impacta directamente la economía de la inferencia (costos de API) y la estabilidad del código generado. Es una restricción de ingeniería del proyecto. |
| Rutas locales de Windows (C:\\Users\\gabri\\...). | AGENTS.local.md (Añadido a .gitignore) | Contenido efímero y dependiente de la máquina. Su inclusión en el repositorio genera ruido y puede confundir al modelo en otros sistemas operativos. |
| Comandos de Sideloading y mkcert para Windows 11\. | AGENTS.local.md (Añadido a .gitignore) | Flujos de trabajo dependientes de la topología de red local y del sistema operativo del desarrollador actual. |
| Preset de inicio de sesión de MiniMax-M3. | AGENTS.local.md (Añadido a .gitignore) | Detalles de autenticación o enrutamiento de red de nivel local. |

### **Configuración del Archivo de Orquestación**

Para consolidar esta separación sin perder contexto durante la inferencia, se debe actualizar el archivo de configuración base de OpenCode. Se recomienda utilizar un archivo .opencode/opencode.json (que posee mayor precedencia que los archivos globales y se acopla al proyecto)8.  
**Configuración en .opencode/opencode.json:**

JSON  
{  
  "$schema": "https://opencode.ai/config.json",  
  "instructions": \[  
    "AGENTS.md",  
    "AGENTS.local.md"  
  \]  
}

OpenCode leerá y concatenará silenciosamente ambos archivos al inicializar la sesión13. Dado que AGENTS.local.md estará incluido en .gitignore, el repositorio mantendrá su pureza canónica mientras el entorno local retiene sus optimizaciones específicas.

## **6\. Sincronización con src/skills/catalog.ts: Eliminando la Deriva (Drift)**

La preocupación documentada sobre la mezcla de los dos sistemas de habilidades (las del CLI en .opencode/skills/ y las del Add-in en skills/) es legítima. Mantener carpetas gemelas invita a la deriva (drift), donde una lógica de negocio se actualiza en el CLI pero el Add-in sigue ejecutando una versión obsoleta.  
**La Solución Arquitectónica Recomendada:** La especulación basada en los principios de diseño de monorepositorios y en las capacidades nativas de Vite rechaza el uso de scripts de sincronización externos en bash. Los scripts de sincronización son frágiles, requieren ejecución manual (o *hooks* complejos) y oscurecen la fuente de la verdad.  
En lugar de duplicar los archivos, se debe consagrar .opencode/skills/ como la **única fuente de la verdad** para todo el conocimiento declarativo de habilidades (archivos Markdown, metadatos YAML, descripciones lógicas). Luego, se debe instruir al compilador Vite para que consuma estos recursos directamente en tiempo de compilación.  
**Implementación del Cableado Directo en Vite:** El archivo src/skills/catalog.ts debe reescribirse para apuntar a la carpeta externa mediante el patrón import.meta.glob. Vite es completamente capaz de resolver rutas relativas que escapan del directorio src/.

TypeScript  
// En src/skills/catalog.ts

// Vite empaquetará automáticamente el contenido de los archivos SKILL.md de OpenCode  
const rawSkillFiles \= import.meta.glob('../../.opencode/skills/\*/SKILL.md', { as: 'raw' });

export async function buildRuntimeCatalog() {  
    const catalog \= \[\];  
    for (const filePath in rawSkillFiles) {  
        // Resuelve el contenido en tiempo de compilación/ejecución  
        const markdownContent \= await rawSkillFiles\[filePath\]();  
          
        // Función hipotética para parsear el YAML frontmatter y adaptarlo  
        // al formato de la interfaz de usuario del agente de Excel  
        const skillData \= parseYamlFrontmatter(markdownContent);  
          
        if (skillData.metadata?.target \=== 'excel-addin') {  
            catalog.push(skillData);  
        }  
    }  
    return catalog;  
}

Esta arquitectura garantiza que cualquier mejora en las instrucciones de una habilidad dictada por OpenCode CLI impacte inmediatamente el comportamiento del agente de Excel en el siguiente *build*, cerrando la brecha de sincronización de forma permanente.

## **7\. Higiene del Caché de Prompts con MiniMax-M3**

El modelo MiniMax-M3, particularmente cuando se accede a través del protocolo OpenCode Go, basa su competitividad económica y de latencia en un agresivo sistema de **caché de prefijos (prefix caching)**. Este mecanismo identifica bloques de contexto repetidos (como el *system prompt* y el historial inicial) procesándolos de izquierda a derecha. Posee un umbral mínimo de activación de 512 tokens5.  
**El Comportamiento de Inyección y su Impacto:** OpenCode inyecta de manera estática y determinista las instrucciones base (como AGENTS.md), las descripciones de agentes y la lista inicial de herramientas al comienzo del contexto del sistema. Siempre que este prefijo se mantenga inmutable, MiniMax-M3 puede retenerlo en caché (con un TTL de hasta 24 horas mediante implementaciones óptimas como extensiones de caché), reduciendo dramáticamente la latencia y los costos de inferencia5.  
Sin embargo, el caché de prefijos es frágil: el primer token que difiere entre una petición y la siguiente marca el final del caché efectivo. A partir de ese punto de ruptura, todo el contenido subsiguiente debe ser procesado como tokens de entrada frescos5.  
**Restricciones de Diseño Impuestas por el Caché:**

> 1. **Evitar Comandos Mutacionales Tempranos:** Un anti-patrón severo es diseñar comandos personalizados (/...) que inserten datos altamente volátiles (como la fecha exacta, *timestamps* de logs de sistema, o salidas impredecibles de herramientas de lectura) en las capas superiores del *system prompt*. Si un comando inyecta git log con firmas de tiempo cambiantes temprano en la conversación, se anula el caché masivo subyacente. Los comandos diseñados en la sección 3 inyectan su contenido dinámico en el turno del usuario (*user prompt*), preservando la estabilidad del sistema11.  
> 2. **Carga Dinámica de Habilidades (Cola vs Prefijo):** Podría pensarse que las numerosas habilidades definidas en .opencode/skills/ desestabilizan el sistema. Afortunadamente, OpenCode inyecta el contenido de un archivo SKILL.md en el contexto *solo cuando el modelo llama a la herramienta skill*1. Esto significa que el texto voluminoso de la habilidad se anexa a la "cola" de la conversación, dejando el extenso prefijo fundacional intacto y capitalizando los ahorros del caché.  
> 3. **Estabilidad de la Lista de Herramientas:** Las reglas descritas en AGENTS.md (no reconstruir listas de herramientas con ordenamiento inestable) son una consecuencia directa de la mecánica del caché. Si un agente cambia dinámicamente sus permisos de herramientas (allow, deny) a mitad de un flujo de trabajo, el esquema JSON de herramientas enviado al proveedor cambia, destrozando la firma del prefijo6. Por ende, los agentes deben tener un bloque de permisos estricto y predecible en su *frontmatter* que no requiera alteraciones en tiempo de ejecución.

## **8\. Integración del Protocolo de Contexto de Modelo (MCP)**

El Model Context Protocol (MCP) ha revolucionado la conectividad de los agentes de codificación, permitiéndoles interactuar con bases de datos, APIs de red y herramientas del sistema operativo mediante un estándar unificado18.  
Actualmente, el proyecto Loxos emplea scripts locales (python-bridge, tmux-bridge).  
**¿Vale la pena exponerlos como servidores MCP a OpenCode?Sí, categóricamente.** La exposición de estos puentes vía MCP transforma herramientas locales inertes en capacidades nativas proactivas para el cerebro del CLI de OpenCode. Sin MCP, el agente de terminal solo puede editar el archivo de Python y esperar pasivamente que el usuario lo ejecute. Con MCP, el CLI puede ejecutar el puente de Tmux, inspeccionar las sesiones activas, reiniciar el servidor Vite de forma autónoma si detecta un *crash* de memoria, o enviar comandos de evaluación algorítmica directamente al puente de Python para validar lógicas complejas de tasación.  
**El Anti-Patrón mcp.json y la Configuración Correcta:** Una advertencia arquitectónica crucial: La comunidad a menudo confunde las implementaciones. Claude Code utiliza un archivo separado mcp.json en la raíz del proyecto. **OpenCode rechaza este archivo de manera explícita.** Intentar utilizar un .opencode/mcp.json o un .mcp.json provocará fallos silenciosos de inicialización2.  
En OpenCode, la integración se realiza insertando el objeto "mcp" directamente en el núcleo del archivo opencode.json o opencode.jsonc de nivel de proyecto o nivel global2.  
**Configuración requerida en .opencode/opencode.json:**

JSON  
{  
  "$schema": "https://opencode.ai/config.json",  
  "mcp": {  
    "tmux-bridge": {  
      "type": "local",  
      "command": \["node", "scripts/tmux-bridge-mcp.js"\],  
      "enabled": true  
    },  
    "python-bridge": {  
      "type": "local",  
      "command": \["python", "scripts/python-mcp-server.py"\],  
      "enabled": true  
    }  
  }  
}

Esta configuración local (usando "type": "local") garantiza que el proceso del servidor MCP se ejecute como un subproceso gestionado por OpenCode, heredando los permisos del sistema operativo y comunicándose eficientemente mediante stdio estándar19.

## **9\. Resolviendo la Fricción Dimensional: CLI de OpenCode vs Add-in de Excel**

El desarrollador reporta frustración al desear que el CLI de OpenCode invoque automáticamente herramientas nativas del Add-in, como audit\_ref\_errors o link\_referenciales\_cuadro.  
**El Problema Arquitectónico Central:** El CLI de OpenCode y el Add-in de Excel operan en universos paralelos y aislados.

* **El Agente CLI:** Reside en un proceso de Node.js/Bun en el entorno host. Analiza texto estático, modifica código fuente mediante permisos de sistema de archivos (edit, write), y ejecuta comandos de shell. Desconoce por completo la existencia de la ventana de Microsoft Excel y su estado en memoria.  
* **El Agente del Add-in (pi-for-excel):** Se ejecuta dentro de un control *WebView2* aislado (un entorno de navegador confinado)4. Este ecosistema posee inyección asíncrona de los objetos nativos de Office.js (para leer hojas y celdas) y administra el estado reactivo de Lit. No puede invocar comandos bash en el sistema host, ni el host puede inyectar llamadas a funciones directamente en su hilo principal.

Es debido a este aislamiento que comandos nativos del CLI jamás podrán invocar directamente funciones internas del Add-in. Se requiere una solución de infraestructura que trascienda la barrera del *sandbox*.  
**El Patrón de Solución: La Arquitectura de Puente WebSocket \+ MCP** Para permitir que OpenCode envíe comandos que alteren el estado de Excel, se debe implementar una pasarela de comunicación bidireccional. La arquitectura consta de tres pilares:

> 1. **El Servidor Proxy Local (Node.js):** Se levanta un servidor WebSocket ligero durante la fase de desarrollo (al ejecutar npm run dev).  
> 2. **El Cliente Inyectado (Add-in):** El código frontend del Add-in establece una conexión WebSocket persistente hacia el servidor local. Este cliente expone escuchadores (*listeners*) que pueden disparar funciones nativas (como audit\_ref\_errors()) cuando reciben mensajes formateados específicos.  
> 3. **El Servidor MCP del CLI:** Se configura un servidor MCP local en opencode.json (ej. excel-telemetry-mcp). Las herramientas provistas por este MCP envían solicitudes HTTP/REST o mensajes Socket al Servidor Proxy Local.

**Secuencia de Operación:** Cuando el usuario solicita al CLI de OpenCode analizar el cuadro de referenciales, el agente CLI invoca la herramienta MCP expuesta. El MCP despacha un mensaje a través del WebSocket hacia el WebView activo de Excel. El Add-in procesa el comando, ejecuta la función de Office.js solicitada, consolida el resultado JSON de las celdas y lo emite de vuelta a través del túnel. Finalmente, el servidor MCP entrega los datos al agente de CLI, permitiéndole diagnosticar errores lógicos con conocimiento pleno del contexto vivo de la hoja de cálculo.

## **Riesgos Arquitectónicos y Consideraciones Finales**

La consolidación del entorno OpenCode presenta una vía clara hacia la hiper-productividad, pero acarrea riesgos significativos que deben ser gestionados de forma proactiva.

* **Recursión Infinita de Subagentes (Doom Loop de Tareas):** Como se detalló en el análisis del agente @qa-excel, la herramienta task (utilizada para engendrar subagentes) exhibe un comportamiento peligroso reportado por la comunidad. Si un subagente es provisto con el permiso de invocar a otros subagentes sin una salvaguarda estructural, el LLM puede interpretar peticiones de "análisis profundo" como una justificación para delegar la misma tarea a un clon iterativo de sí mismo. Esto crea una cascada incontrolada de sesiones que agotan drásticamente los créditos de la API e invalidan cualquier avance lógico15. La mitigación obligatoria requiere definir explícitamente action: subagent, effect: deny en los permisos de todos los subagentes, e imponer techos duros utilizando el parámetro steps (por ejemplo, steps: 10\) en sus definiciones Markdown20.  
* **Gestión Ineficiente de Registros (Logs):** Entornos altamente poblados con habilidades y subagentes pueden disparar un defecto de diseño en el demonio de registro de OpenCode. Se ha documentado que, durante evaluaciones complejas de permisos de seguridad, el motor serializa íntegramente el conjunto completo de reglas en cada línea del registro a nivel INFO. En sesiones sostenidas, esto provoca un engrosamiento desmedido de los logs (pudiendo acumular gigabytes de datos en cuestión de horas), degradando el rendimiento de entrada/salida del disco21. Se recomienda vigilar el almacenamiento, e implementar rotación de logs u omitir la captura prolongada en entornos con restricciones de espacio si el comportamiento persiste en futuras actualizaciones.

Al abrazar estas definiciones arquitectónicas, establecer límites estrictos entre dominios y aprovechar la inyección de metadatos guiada por herramientas MCP, "Tasaciones by Loxos" transformará un ecosistema caótico y de mantenimiento complejo en una línea de ensamblaje predictiva, resiliente y altamente integrada.

#### **Fuentes citadas**

> 1. Agent Skills | OpenCode, [https://opencode.ai/docs/skills/](https://opencode.ai/docs/skills/)  
> 2. OpenCode MCP Setup: Configuration, Permissions and Troubleshooting \- DIY AI, [https://diyai.io/ai-tools/code-generation/opencode-mcp-setup/](https://diyai.io/ai-tools/code-generation/opencode-mcp-setup/)  
> 3. GitHub \- tmustier/pi-for-excel: Experimental Excel sidebar agent add-in. Multi-model. Powered by Pi., [https://github.com/tmustier/pi-for-excel](https://github.com/tmustier/pi-for-excel)  
> 4. Debug Office add-in in VS code \- Stack Overflow, [https://stackoverflow.com/questions/72913627/debug-office-add-in-in-vs-code](https://stackoverflow.com/questions/72913627/debug-office-add-in-in-vs-code)  
> 5. Auto cache saves 50-90% $ on your AI model costs without you lifting a finger, [https://timwappat.info/auto-cache-passively-saves-on-you-ai-model-costs/](https://timwappat.info/auto-cache-passively-saves-on-you-ai-model-costs/)  
> 6. Prompt Caching \- Models \- MiniMax API Docs, [https://platform.minimax.io/docs/api-reference/text-prompt-caching](https://platform.minimax.io/docs/api-reference/text-prompt-caching)  
> 7. pi-opencode-go-cache · Packages \- Pi Coding Agent, [https://pi.dev/packages/pi-opencode-go-cache](https://pi.dev/packages/pi-opencode-go-cache)  
> 8. Config | OpenCode, [https://opencode.ai/docs/config/](https://opencode.ai/docs/config/)  
> 9. Configuración \- OpenCode, [https://opencode.ai/docs/es/config/](https://opencode.ai/docs/es/config/)  
> 10. [https://opencode.ai/docs/agents/](https://opencode.ai/docs/agents/)  
> 11. Commands | OpenCode, [https://opencode.ai/docs/commands/](https://opencode.ai/docs/commands/)  
> 12. \[FEATURE\]: Create a package manager for skills, plugins, commands, \#12309 \- GitHub, [https://github.com/anomalyco/opencode/issues/12309](https://github.com/anomalyco/opencode/issues/12309)  
> 13. Rules | OpenCode, [https://opencode.ai/docs/rules/](https://opencode.ai/docs/rules/)  
> 14. Claude Code y OpenCode: un curso acelerado \- The AI Agent Factory \- Panaversity, [https://agentfactory.panaversity.org/spanish/docs/agentic-coding-crash-course](https://agentfactory.panaversity.org/spanish/docs/agentic-coding-crash-course)  
> 15. Subagents can infinitely recurse via Task tool — no max depth limit · Issue \#18100 · anomalyco/opencode \- GitHub, [https://github.com/anomalyco/opencode/issues/18100](https://github.com/anomalyco/opencode/issues/18100)  
> 16. docs: warn about infinite subagent recursion when permission.task is configured globally · Issue \#17721 · anomalyco/opencode \- GitHub, [https://github.com/anomalyco/opencode/issues/17721](https://github.com/anomalyco/opencode/issues/17721)  
> 17. Reglas | OpenCode, [https://opencode.ai/docs/es/rules/](https://opencode.ai/docs/es/rules/)  
> 18. MCP servers \- OpenCode, [https://v2.opencode.ai/mcp-servers](https://v2.opencode.ai/mcp-servers)  
> 19. MCP servers \- OpenCode, [https://opencode.ai/docs/mcp-servers/](https://opencode.ai/docs/mcp-servers/)  
> 20. Agents \- OpenCode, [https://v2.opencode.ai/docs/agents](https://v2.opencode.ai/docs/agents)  
> 21. Permission service logs full ruleset on every tool call, causing 50GB+ log bloat · Issue \#17218 · anomalyco/opencode \- GitHub, [https://github.com/anomalyco/opencode/issues/17218](https://github.com/anomalyco/opencode/issues/17218)