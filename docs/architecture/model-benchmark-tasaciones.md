# Benchmark de modelos para revisión de tasaciones

**Estado:** en curso  
**Última actualización:** 2026-11-05

## Objetivo

Comparar modelos disponibles para revisar informes de tasación frente a sus
antecedentes documentales y el workbook, con foco en la confiabilidad de los
hallazgos y no solo en la fluidez de la respuesta.

## Protocolo

Cada comparación de pares debe usar el mismo prompt, los mismos antecedentes y
el mismo workbook, sin editar el workbook durante la primera revisión. Se deben
guardar respuestas completas y registrar cualquier error de herramientas o de
carga de documentos. Si un modelo no puede acceder a una fuente necesaria, el
resultado de esa pareja se marca como **no concluyente**, no como derrota en
precisión.

Evaluar cada respuesta según estos criterios:

1. **Precisión:** afirmaciones respaldadas por una celda, hoja o antecedente
   identificable; separar hechos, inferencias y dudas.
2. **Omisiones:** hallazgos materiales que estaban disponibles y no se
   detectaron.
3. **Distinción de fuentes:** diferenciar datos SII, observación de terreno y
   permisos o antecedentes DOM; no tratarlos como intercambiables.
4. **Trazabilidad:** citar hoja/celda o página del documento y explicar el
   cotejo efectuado.
5. **Uso de herramientas:** elegir y completar correctamente las herramientas
   para leer workbook y antecedentes; registrar fallas técnicas aparte.
6. **Claridad y cautela:** comunicar discrepancias sin presentar hipótesis como
   hechos confirmados y explicitar límites de acceso o lectura.

No incorporar al registro nombres, RUT, direcciones u otros identificadores del
workbook. Los extractos de respuestas deben anonimizarse antes de compartirse.

## Orden de comparación

1. Nemotron 3 Ultra vs. Nemotron 3.5 Super VL.
2. El ganador de la primera pareja vs. Gemma 4 31B.
3. El ganador de la segunda pareja vs. Nemotron 3.5 Lightning.

Este orden es una hipótesis de trabajo, no un ranking. No asignar ganador hasta
contar con respuestas completas y comparables.

## Ensayos

### 2026-11-05: Nemotron 3 Ultra vs. Nemotron 3.5 Super VL

**Resultado: no concluyente. No se declara ganador.**

- **Nemotron 3 Ultra:** el registro de sesión disponible contiene el prompt
  inicial, pero no una respuesta visible que permita puntuarlo.
- **Nemotron 3.5 Super VL:** la sesión reportó un error al cargar el módulo del
  motor PDF. Después inspeccionó repetidamente el workbook, pero no pudo
  cotejar sus datos con el PDF escaneado.
  La respuesta hizo afirmaciones sobre posibles discrepancias sin verificación
  documental suficiente.
- **Lectura del ensayo:** esto evidencia una limitación de comparabilidad y de
  acceso a la fuente, no permite concluir cuál modelo tiene mayor precisión.
  Las observaciones no verificadas de esa sesión no se consideran hallazgos del
  benchmark.

No se registran datos del workbook ni extractos que puedan identificar a las
personas involucradas.

## Próximo ensayo

Repetir la pareja con una fuente PDF accesible para ambos modelos. Confirmar que
el documento se puede cargar y leer antes de iniciar la evaluación, usar el
mismo prompt y contexto, y conservar ambas respuestas completas. Si vuelve a
fallar una herramienta, registrar el fallo y dejar esa pareja sin puntuación
documental.
