# Sideload de Tasaciones en Excel Desktop (Windows)

> **Estado:** probado en Microsoft 365 / Excel Desktop sobre Windows 11, julio 2026.
> **Doc oficial Microsoft Learn:** [create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins) (última revisión 2026-06-09).

Guía para contributors y evaluadores del fork **Tasaciones by Loxos** que necesitan probar el add-in en **Excel Desktop para Windows**. Si solo necesitas probarlo en Excel en la web, esa vía sigue funcionando igual que en el upstream (no requiere esta guía).

---

## Por qué esta guía existe

A la fecha (julio 2026), **Microsoft Excel Desktop en Windows ya no expone un botón "Upload My Add-in"**. Esa UI existe solo en **Office en la web** (excel.office.com / OneDrive / SharePoint). En Excel Desktop, el flujo de sideload oficialmente documentado es vía un **Trusted Add-in Catalog**: registrar una carpeta como catálogo confiable en el registro de Windows y soltar el manifest ahí.

Qué pasa si buscas el botón en Desktop y no aparece:

| Plataforma | Botón "Upload My Add-in" | Lo que ves |
|---|---|---|
| Excel en la web (OneDrive / office.com) | **Sí** — Home → Complementos → Más configuraciones → Cargar mi complemento | File picker para subir el `.xml` |
| Excel Desktop (Microsoft 365, plan personal o empresa) | **No** | El botón "Más complementos" → "Mis complementos" redirige a `pages.store.office.com/...` (la Office Store web). Esa página **no permite subir un manifest personalizado en cuentas de Microsoft 365**; solo es un catálogo de la tienda. |
| Excel LTSC / 2019 | **No** (mismo motivo) | Igual |

Si tu cuenta es Microsoft 365 **business** y el IT bloquea la carga de catálogos personalizados, la salida corporativa es desplegar el manifest vía **Microsoft 365 Admin Center** (ver [Siguiente paso: publicación en Office Store](#siguiente-paso-publicaci%C3%B3n-en-la-office-store)).

---

## Método A — Carpeta confiable (recomendado)

El más simple y persistente. Sin Node, sin certificados locales, sin admin. Solo el script automatiza lo que en Excel se hace vía:

```
Archivo → Opciones → Centro de confianza → Configuración del Centro de confianza
        → Catálogos de complementos de confianza → Agregar catálogo
```

### Requisitos

- Windows 10 o 11.
- Microsoft 365 / Excel Desktop (cualquier SKU con soporte de Office Add-ins).
- Permisos de escritura sobre `HKEY_CURRENT_USER` (usuario estándar, sin admin).
- PowerShell 5.1 (incluido por defecto) o PowerShell 7.
- El bundle debe estar publicado en algún endpoint HTTPS accesible. Si usas el manifest de producción, ese endpoint es `https://complemento-excel.vercel.app/` y ya está desplegado en Vercel.

### Pasos

1. Clona el repo y, si vas a usar el bundle de **producción**, asegúrate de tener `manifest.prod.xml` actualizado:

   ```powershell
   git clone https://github.com/gabrielpantoja-cl/complemento-excel.git
   cd complemento-excel
   # manifest.prod.xml ya apunta a https://complemento-excel.vercel.app/... — nada más que hacer.
   ```

2. Ejecuta el script de sideload:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1
   ```

   > Si tenés PowerShell 7+ instalado, podés usar `pwsh` en lugar de `powershell` — el script es compatible con ambos (verificado con parser de Windows PowerShell 5.1).

   El script:
   - Crea la carpeta `~\Documents\TasacionesManifest\` si no existe.
   - Copia `manifest.prod.xml` ahí.
   - Escribe la entrada de registro en `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{<GUID>}` con `Flags=1` (Show in Menu).
   - Guarda un marker `.sideload.json` dentro de la carpeta para que re-ejecuciones sean idempotentes (mismo GUID, sin duplicados).

3. **Cierra Excel completamente** (todas las ventanas, también procesos en segundo plano — Task Manager → "Finalizar tarea" sobre `EXCEL.EXE` por las dudas) y vuelve a abrirlo.

4. En Excel:
   - Pestaña **Inicio** → **Complementos** (botón al final de la cinta).
   - **Más complementos** → pestaña **CARPETA COMPARTIDA** arriba.
   - Selecciona **Tasaciones** → **Agregar**.

5. Aparece el grupo **Tasaciones** en la cinta Inicio con el botón **Abrir Tasaciones**. Al hacer clic se abre el panel lateral cargando el bundle desde Vercel.

### Verificar que quedó bien

```powershell
# Ver la entrada de registro
reg.exe query "HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs" /s

# Confirmar que el manifest tiene la <SourceLocation> apuntando a HTTPS
Get-Content ~\Documents\TasacionesManifest\manifest.prod.xml |
    Select-String -Pattern "SourceLocation"
```

Si la pestaña **CARPETA COMPARTIDA** no aparece en Excel, lo más probable es que Excel ya estuviera abierto cuando corriste el script. Ciérralo del todo y reintenta.

### Iterar cambios del manifest

El script es **idempotente**: re-ejecutarlo con el manifest actualizado solo copia el nuevo `.xml` encima y refresca la entrada. Para que Excel tome el cambio, **cierra y reabre Excel** cada vez.

Si quieres volver al flujo de dev local (`npm run dev`) sin tocar el catálogo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -ManifestPath .\manifest.xml
# luego:  npm run dev   (en otra terminal)
```

Y al revés, para volver al bundle de producción:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -ManifestPath .\manifest.prod.xml
```

> **Ojo:** `manifest.xml` apunta a `https://localhost:3000`. Necesitas `npm run dev` corriendo y un certificado local confiable (el repo ya documenta `mkcert`). Si solo quieres "verlo funcionar", usa siempre `manifest.prod.xml`.

### Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -Uninstall
```

Borra la entrada de registro y la carpeta. Cierra Excel antes para que tome el cambio.

---

## Método manual (sin script, desde la UI de Excel)

Si prefieres ver exactamente qué pasa debajo, todo se hace desde Excel y el Bloc de notas:

1. **Archivo → Opciones → Centro de confianza → Configuración del Centro de confianza → Catálogos de complementos de confianza**.
2. En **URL del catálogo** pega `\\localhost\C$\Users\<TU_USUARIO>\Documents\TasacionesManifest`. (El `localhost\C$...` es una *admin share* de Windows; no necesitas compartir la carpeta manualmente.)
3. Marca **Mostrar en el menú** → **Aceptar** dos veces.
4. Crea la carpeta `C:\Users\<TU_USUARIO>\Documents\TasacionesManifest\` y copia `manifest.prod.xml` adentro.
5. Cierra y reabre Excel.
6. **Inicio → Complementos → Más complementos → CARPETA COMPARTIDA** → Tasaciones → Agregar.

Para revertir: **Archivo → Opciones → Centro de confianza → Catálogos de complementos de confianza** → selecciona la fila → **Quitar**.

---

## Troubleshooting

### Pestaña **CARPETA COMPARTIDA** no aparece en Excel

- Casi siempre es Excel no cerrado del todo. **Task Manager → busca `EXCEL.EXE`** y finalízalo.
- Confirma que la ruta del catálogo en el registro coincide con la carpeta real:
  ```powershell
  reg.exe query "HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs" /s
  Get-Item ~\Documents\TasacionesManifest
  ```
- Si la ruta del registro usa una forma distinta (e.g. `\\localhost\C$\...` vs `C:\...` y moviste la carpeta), borra la entrada manual y re-ejecuta el script.

### Aparece la pestaña pero Tasaciones no está en la lista

- El manifest dentro de la carpeta está corrupto o no es el correcto:
  ```powershell
  Get-Content ~\Documents\TasacionesManifest\manifest.prod.xml | Select-String -Pattern "<Id>"
  ```
  Debe imprimir `<Id>c93fbbea-7c40-406f-bc5f-f6fa80476c97</Id>`. Si imprime otro GUID, estás con un manifest viejo.
- Vuelve a correr `npm run manifest:prod` y re-ejecuta el script de sideload.

### El panel se abre pero queda en blanco

- Suele ser un problema del bundle, no del sideload. Mira `AGENTS.md` sección **Excel Desktop smoke** para los pasos de inspección con F12.
- Confirma que `https://complemento-excel.vercel.app/src/taskpane.html` responde:
  ```powershell
  Invoke-WebRequest -Uri "https://complemento-excel.vercel.app/src/taskpane.html" -UseBasicParsing |
      Select-Object StatusCode, Headers
  ```
  Debe ser `200` y `Cache-Control: no-store`.

### Microsoft 365 business / empresa: el IT bloquea Add-ins personalizados

- En el Admin Center del tenant: **Configuración → Aplicaciones integradas → Subir aplicación personalizada → Proporcionar vínculo al manifiesto**. Pega `https://complemento-excel.vercel.app/manifest.prod.xml`.
- Mientras el admin no apruebe, el botón "Cargar mi complemento" sigue deshabilitado para todos los usuarios del tenant.

### El manifest abre pero Excel se queja de "HTTPS no confiable"

- El catálogo está bien, pero la URL `<SourceLocation>` del manifest apunta a un origen con cert inválido. Para `manifest.prod.xml` apuntando a Vercel nunca pasa — Vercel sirve cert válido automático.
- Si usas `manifest.xml` apuntando a `https://localhost:3000`, el cert lo emite `mkcert`; reinstálalo en el **Trusted Root Certification Authorities** del usuario (no del equipo) si lo moviste de máquina.

---

## Siguiente paso: publicación en la Office Store

> **No implementado todavía.** Solo esbozo para que se decida el próximo paso.

Una vez validado el sideload vía catálogo confiable, el siguiente nivel es publicar el add-in en la **Office Store** ([Microsoft Commercial Marketplace](https://seller.microsoft.com/)) para que cualquier usuario con Microsoft 365 pueda instalarlo desde **Inicio → Complementos → Obtener complementos** sin tocar archivos `.xml`.

Resumen del flujo (a documentar en detalle en `docs/office-store-publish.md` cuando se implemente):

1. Crear cuenta de **Microsoft Partner Center** y registrar el programa **Commercial Marketplace → Office Add-ins**. Costo: ~$99 USD única vez (reembolso si Microsoft rechaza la app).
2. Preparar paquete:
   - `manifest.prod.xml` (el que ya tenemos).
   - Iconos en `assets/`: `icon-16.png`, `icon-32.png`, `icon-80.png`, y opcionalmente `icon-192.png` para AppSource.
   - Privacy Policy pública (URL).
   - Support URL pública.
   - Listing copy (display name, descripción corta, descripción larga, screenshots 1366×768 o 1920×1080).
3. Empaquetar como `.zip` (solo el manifest + iconos, **no** la carpeta del repo).
4. Subir el paquete vía Partner Center → **Office Add-in** → **New Offer** → paso de revisión técnica (validación automática) → revisión humana.
5. Tiempos típicos: validación automática ~minutos, revisión humana 1–4 semanas.
6. Decisión abierta: **loxo-as-a-service para toda la comunidad** (gratis, distribución amplia) vs. distribución restringida al partner.

Ver también:
- [Publish Office Add-ins to AppSource](https://learn.microsoft.com/en-us/office/dev/add-ins/publish/publish)
- [Validation policies for AppSource submissions](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies)

---

## Referencias oficiales (Microsoft Learn, jul-2026)

- [Test Office Add-ins (índice)](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins)
- [Sideload Office Add-ins to Office on the web](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing)
- [Sideload Office Add-ins on Windows from a network share](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins)
- [Sideload Office Add-ins that use the unified manifest for Microsoft 365](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-add-in-with-unified-manifest)
- [Test and debug Office Add-ins on a non-local server](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-non-local-server)
- [Clear the Office cache on Windows](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/clear-cache)
- [Validate and troubleshoot issues with your manifest](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest)
