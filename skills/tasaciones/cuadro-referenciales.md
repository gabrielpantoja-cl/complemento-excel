---
name: tasaciones/cuadro-referenciales
description: Vincular y reparar el "Cuadro de Referenciales" (punto 8 del informe de tasación) entre las hojas "referenciales", "fichas VR" y las hojas de lote (81-100). Cubre el caso #REF! y la nomenclatura CBR.
---

# Skill: Cuadro de Referenciales — Reparación y Vinculación

El cuadro de referenciales del punto 8 del informe es **propenso a romperse**
porque depende de fórmulas cross-sheet con offsets fijos. Esta skill documenta
cómo repararlo y cómo evitar errores comunes al reconstruirlo.

## Cuándo invocar

- El usuario dice "vincular", "rellenar", "arreglar", "reparar" o "recomponer"
  la tabla **8.- VALORES REFERENCIALES** de cualquier hoja de lote (81-100).
- Hay celdas `#REF!` en el rango del cuadro (típicamente filas 113-125).
- El usuario pide que el cuadro apunte a "fichas VR" (no a otra hoja de lote).

## Fuente canónica de datos

### Hoja `referenciales` (tabla maestra)

| Col | Campo | Notas |
|---|---|---|
| A | Nº Ficha VR | 1..N |
| B | Foja | CBR (entero) |
| C | N° | CBR (entero) |
| D | Año | CBR (entero) |
| E | Predio | nombre del bien raíz |
| F | ROL SII | formato manzana-predio |
| G | Fecha escritura | texto `dd-mm-aaaa` O número serial Excel |
| H | Valor UF a la fecha escritura | |
| I | Comprador | |
| J | Vendedor | |
| K | Sup. terreno (m²) | entero |
| L | Monto ($) | entero |
| M | VU $/m² sin actualizar | `=L/K` |
| N/O | Lat/Lng | |
| P | Observaciones | pre-selección |

### Hoja `fichas VR` (detalle por ficha)

Cada ficha mide **73 filas**. La ficha N comienza en la fila `1 + (N-1)*73`.

Campos relevantes dentro del bloque de la ficha N:

| Offset desde inicio bloque | Columna | Contenido | Fórmula típica |
|---|---|---|---|
| +3 a +6 | O[+3..+6] | Predio / ROL / Comuna / Región / Tipo | `=+referenciales!E[N+1]` etc. |
| +30 | P[+30] | Calle de referencia (Ruta X-XXX) | **hardcoded** |
| +33 | AV[+33] | Sup. terreno (m²) | `=+referenciales!K[N+1]` |
| +37 | AX[+37] | Fecha de transacción | `=+referenciales!G[N+1]` |
| +38 | AX[+38] | Monto transacción | `=+referenciales!L[N+1]` |
| +39 | AX[+39] | Valor UF a la fecha escritura | `=+referenciales!H[N+1]` |
| +40 | AK[+40] | Vendedor | `=+referenciales!J[N+1]` |
| +46 | V[+46] | Monto transacción actualizado | `=ROUND(AX[+38]/AX[+39],2)*AX[+48]` |
| +52 | U[+52] | VU $/m² actualizado | `=V[+46]/AV[+33]` |

**Offsets relativos a la fila de inicio del bloque (no al inicio del archivo).**
Para la ficha N, fila de inicio = `1 + (N-1)*73`. Ej: ficha 6 → fila 375.

> ⚠️ **NO confundir columna de calle de referencia.** Históricamente la "Ruta"
> vive en **columna P** del bloque (no en Q). Apuntar a Q es la causa #1
> del bug `D118 = 0.0000e+0`.

## Estructura típica del cuadro en la hoja de lote

El cuadro tiene 8 columnas (A–H). Las fórmulas usan offsets dentro del bloque
de la ficha en `fichas VR` — **relativos a la fila de Predio (O)**, NO a la fila
de inicio del bloque. Esto hace que las fórmulas sean estables incluso cuando
los bloques tienen tamaños irregulares (los bloques del workbook tasaciones
varían entre 71 y 75 filas).

| Col | Campo | Formato | Fórmula (relativa a `predio_row`) |
|---|---|---|---|
| **A** | N° referencial | `#,##0` | `='fichas VR'!AT[predio_row - 2]` |
| B | Nombre del Predio | texto | `='fichas VR'!O[predio_row]&". Rol "&'fichas VR'!O[predio_row+1]` |
| C | Comuna | texto | `='fichas VR'!O[predio_row+2]` (hardcoded en la ficha) |
| D | Ubicación | texto | **`='fichas VR'!P[predio_row+26]`** ← columna P, NO Q |
| E | Transacción (CBR) | texto | `="Foja "&'fichas VR'!I[predio_row+44]&" N° "&'fichas VR'!I[predio_row+45]&", año "&'fichas VR'!I[predio_row+46]` |
| F | Fecha Transacción | `m/d/yyyy` | `='fichas VR'!AX[predio_row+32]` |
| G | Superficie (m²) | `#,##0` | `='fichas VR'!AV[predio_row+27]` (refs 9 y 10 usan **AU**) |
| H | Valor Unitario ($/m²) | `#,##0` | `='fichas VR'!U[predio_row+49]` (UF-actualizado) |

### ⚠️ Excepción de columna G (refs 9 y 10)

Los referenciales **9 y 10** almacenan la superficie en **columna AU**, no AV.
Es un bug histórico del template tasaciones. El resto de los refs (1-8, 11-13)
usan AV. La tool `link_referenciales_cuadro` maneja esto automáticamente.

### Dónde encontrar `predio_row`

`predio_row` es la fila absoluta en `fichas VR` donde está el Predio del referencial
(columna O). Para hallarlo:

1. Usar `search_workbook` con query `"REFERENCIAL"` en `fichas VR` → devuelve la
   fila del título (B[N]).
2. `predio_row = title_row + 4` (porque Predio está 4 filas después del título).

Mapa verificado de `predio_row` por ref:

| Ref | Title row | `predio_row` (= title + 4) |
|---|---|---|
| 1 | B2 | O6 |
| 2 | B76 | O80 |
| 3 | B150 | O154 |
| 4 | B225 | O229 |
| 5 | B300 | O304 |
| 6 | B375 | O379 |
| 7 | B447 | O451 |
| 8 | B521 | O525 |
| 9 | B596 | O600 |
| 10 | B671 | O675 |
| 11 | B745 | O749 |
| 12 | B819 | O823 |
| 13 | B893 | O897 |

## Nomenclatura CBR correcta

- **"Foja X, Número Y, Año Z"** — NO "compraventas fojas número y años".
- **"CBR de [comuna]"** — incluir conservador (CBR Coyhaique, CBR Aysén).
- **Fecha de transacción = fecha de escritura**, NO fecha de inscripción CBR
  (la inscripción suele ser 10-60 días posterior).

## Decisión de dominio: VU crudo vs UF-actualizado

| Caso | Usar columna | Razón |
|---|---|---|
| Informe con fecha de tasación = fecha de escritura | `referenciales!M` (crudo) | Coherencia temporal |
| Informe con fecha de tasación > fecha de escritura | `fichas VR!U[inicio+52]` (UF-actualizado) | Standard SAA |
| Cuadro de "ofertas" con 12% descuento (DL art. homologación) | `fichas VR!U[inicio+52]` ya descuenta si la fórmula aplica | Verificar antes |

**Si el usuario no especifica, PREGUNTAR antes de elegir.** Decidir unilateralmente
es un riesgo de tasación.

## Workflow de reparación

### Paso 1 — Auditar antes de tocar

Llamar `audit_ref_errors` con la hoja del lote para mapear todos los `#REF!`.
Esto detecta:
- Filas con concatenación muerta tipo `=#REF!&". Rol "&#REF!` (firma del bug)
- Filas huérfanas (refs que no existen en `referenciales`)
- Bloques contiguos para planificar la reparación por lote

### Paso 2 — Validar layout de la ficha destino

Antes de escribir cualquier fórmula, leer la **estructura del bloque** en `fichas VR`:
- Confirmar que `P[inicio+30]` contiene la calle de referencia (no Q)
- Confirmar que `AV[inicio+33]` tiene la superficie
- Confirmar que `U[inicio+52]` es el VU actualizado

Si el layout difiere del documentado arriba, **preguntar al usuario** antes de
asumir offsets.

### Paso 3 — Vincular fila por fila

Para cada fila R del cuadro y cada ref N, pasar `predio_row` a la tool
`link_referenciales_cuadro` (con `dry_run: true` primero):

```
tool: link_referenciales_cuadro
args:
  target_sheet: "82"
  target_row: 112        # fila en la hoja de lote
  ref_number: 6
  predio_row: 379       # Predio de ref 6 en fichas VR (ver tabla arriba)
  uf_mode: actualizado
  dry_run: true         # PRIMERO dry_run para verificar las fórmulas
```

Si el dry_run muestra las fórmulas correctas, re-llamar con `dry_run` omitido
y `allow_overwrite: true` (porque la fila tiene contenido legacy roto).

### Paso 4 — Verificar post-write

**Siempre** leer de vuelta el rango escrito antes de declarar éxito. Esta regla
es innegociable y se aplica a **toda** escritura de fórmulas cross-sheet.

Criterios de fallo:
- Cualquier celda con valor `#REF!`
- Cualquier celda de texto con valor `0`, `0.0000e+0`, o vacío
- Formato numérico perdido (`m/d/yyyy`, `#,##0`)

Si falla, reescribir la fila específica antes de continuar.

## Anti-patrones (causas #1 de bugs)

1. **Apuntar a columna equivocada por layout A-M vs N-CB.** Las primeras
   lecturas con rango A-M desplazan la posición de las celdas. Usar rango
   N-CB o más amplio para localizar la "Ruta".

2. **Concatenar `#REF!` antes de detectar que la referencia muere.**
   Patrón `=#REF!&". Rol "&#REF!` — la firma exacta del cuadro roto del
   Lote 81 fila 113.

3. **Confundir fecha de escritura con fecha de inscripción CBR.** El cuadro
   pide fecha de escritura (columna G en `referenciales`).

4. **No preservar formatos numéricos.** Sobrescribir `m/d/yyyy` con General
   rompe la presentación del informe final.

5. **Asumir offsets sin verificar.** El layout de `fichas VR` puede variar
   entre lotes (algunos usan bloques de 73 filas, otros más). Siempre leer
   el bloque destino antes de escribir.

## Tool de soporte

`link_referenciales_cuadro` automatiza esta skill: valida que el ref exista
en `referenciales`, calcula los offsets, escribe las 7 fórmulas y verifica
post-write. Usar como entrada del workflow; el fallback manual (read + write)
sigue siendo válido para casos edge.
