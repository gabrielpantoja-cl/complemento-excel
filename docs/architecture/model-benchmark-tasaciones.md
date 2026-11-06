# Benchmark de modelos para revisión de tasaciones

**Estado:** en curso  
**Última actualización:** 2026-11-06

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

### 2026-11-06: Nemotron 3 Ultra vs. Nemotron 3.5 Super VL (construcción de fichas VR)

**Resultado: gana Nemotron 3.5 Super VL, con reservas.** Tarea de edición, no
de revisión: mismo prompt (construir tres fichas de referenciales en
`Ficha VR` con datos dados, marcando faltantes como "Por confirmar"), mismo
workbook. Ultra corrió con thinking `off`; Super VL con `high`. Se evaluó el
`.xlsx` resultante, no solo el resumen del modelo.

| Criterio | Nemotron 3 Ultra | Nemotron 3.5 Super VL |
|---|---|---|
| Respeto de plantilla | Sobrescribió bloques de 43 filas con un layout propio desalineado; borró fórmulas de encabezado; pisó la fila de firmas de la ficha 2 y rompió la cadena de fórmulas hacia la ficha 4. | Mantuvo la estructura; escribió celda a celda en los campos. |
| Exactitud numérica | Seriales de fecha erróneos en las tres fichas (desfase de días o de año). `#DIV/0!` en las tres fichas. Montos "aprox." como texto. | Seriales correctos. Unitarios $/m2 correctos vía `monto/superficie`. UF de la ficha 1 queda mal (fórmula existente divide por la UF del referencial anterior). |
| Datos residuales | Bloques antiguos completos quedan bajo los nuevos (montos, títulos, observaciones). | Quedan visibles del referencial anterior: fechas, UF de transacción, comprador, vendedor, CBR, foja y observaciones. |
| No inventar | Bien: "Por confirmar" y "aprox." aplicados. Inventó la calle de referencia. | Inventó restricciones ("Ninguna") y calle de referencia; omitió "aprox."; mantuvo UF actual de otra fecha. |
| Honestidad del cierre | Declara las fichas completas; no lo están. | Lista campos pendientes, pero atribuye la falla a "restricción de celda" y declara escritos valores que no persistieron. |

**Fallas de herramienta (registrar aparte, afectaron a ambos):**

- `write_cells` responde "Written to" al escribir en celdas no ancla de un
  rango combinado; Excel descarta el valor sin error. Fue la causa de los
  "no persiste" que ambos modelos persiguieron durante decenas de llamadas.
- `read_range` con `sheet` distinto de la hoja activa devolvió la hoja activa
  con su nombre en el encabezado (sesión Super VL), hasta activar la hoja.
- `execute_office_js` devolvió `null` en todas las llamadas de ambas sesiones:
  los modelos enviaron una función completa y el tool solo la declaraba.

Corregido el 2026-11-06 (guard de celdas combinadas y aviso de valores no
persistidos en `write_cells`, parámetro `sheet` en `read_range`, invocación de
funciones completas en `execute_office_js`). Ensayos anteriores a ese cambio no
son comparables con los posteriores en uso de herramientas.

**Lectura:** Super VL dañó menos y calculó mejor, pero ningún resultado es
utilizable sin revisión manual. El factor dominante fue el manejo de celdas
combinadas, no el razonamiento del modelo.

### 2026-11-06 (2): Nemotron 3 Ultra vs. Nemotron 3.5 Super VL (observaciones de fichas VR)

**Resultado: gana Nemotron 3 Ultra en contenido; Super VL en cautela. Ninguno
es aceptable sin revisión.** Ambos con thinking `high`, mismo prompt (reescribir
las observaciones de los referenciales 1 a 3, que seguían con texto del caso
anterior) y misma copia del workbook, ya con los arreglos de herramientas.
Se verificó el `.xlsx` resultante contra los datos de la propia ficha.

| Criterio | Nemotron 3 Ultra | Nemotron 3.5 Super VL |
|---|---|---|
| Fuente usada | Los datos actuales de cada ficha (predio, $/m2, superficie). | Ignoró los datos de la ficha que sí leyó y reescribió el texto antiguo cambiando topónimos. |
| Exactitud | Predio, valor unitario y superficie correctos en las tres. Inscripción correcta solo en la 1; en la 2 y la 3 escribió foja, número y año que no existen en el workbook (la 3 tomó el año de un campo residual). | Mantuvo lote, superficie y $/m2 del caso anterior en las tres; ubicó las tres en el mismo sector aunque la 3 es de otro; inventó distancias. |
| No inventar | Inventó inscripciones y las presentó como "datos reales". | Inventó distancias y relocalizó transacciones ajenas, aunque dijo no inventar. |
| Cautela | Ninguna advertencia. | Señaló que inscripción y montos deben verificarse y detectó la inconsistencia entre el $/m2 del texto y la celda calculada. |
| Herramientas | Una escritura de 2 filas pisó la celda con el rótulo; la advertencia de "did not persist" le permitió corregir. | Usó `read_range` con `sheet` correctamente. |

**Falla de herramienta detectada:** el bloqueo previo de `write_cells` no vio
el rango combinado de observaciones, porque `getMergedAreasOrNullObject()` sobre
el destino solo devuelve combinados contenidos por completo en él. Corregido el
mismo día leyendo los combinados del rango usado de la hoja.

**Lectura de la serie (1-1):** Super VL es más prudente; Ultra usa mejor los
datos del workbook pero rellena huecos con datos inventados. Para fichas, el
riesgo de Ultra (inscripciones falsas con apariencia de dato) es más grave y
más difícil de detectar que el de Super VL (texto visiblemente desalineado).

## Próximo ensayo

Repetir la pareja con una fuente PDF accesible para ambos modelos. Confirmar que
el documento se puede cargar y leer antes de iniciar la evaluación, usar el
mismo prompt y contexto, y conservar ambas respuestas completas. Si vuelve a
fallar una herramienta, registrar el fallo y dejar esa pareja sin puntuación
documental.
