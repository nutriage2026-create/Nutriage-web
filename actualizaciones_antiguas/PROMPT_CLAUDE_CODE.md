# PROMPT PARA CLAUDE CODE — NutriAge · Conexión GAS + Google Sheets

## Contexto del proyecto

Eres un desarrollador full-stack senior trabajando en **NutriAge**, un sistema de agendamiento de consultas nutricionales online para la nutricionista **Fernanda Ugarte**. El sistema ya está construido y funcionando visualmente, pero necesita conectarse en tiempo real con Google Sheets como base de datos usando Google Apps Script (GAS) como backend API.

---

## Stack tecnológico del proyecto

- **Frontend:** HTML + CSS + JavaScript vanilla — un solo archivo `index.html`
- **Hosting:** Google Sites — `https://sites.google.com/view/nutriageweb/inicio`
- **Base de datos:** Google Sheets (ID: `1oAqHjZqkaoIrwkPyh4qjN32dUs_wKt7oEnJYPh_CrGs`)
- **Backend API:** Google Apps Script Web App
- **URL del GAS (nueva):** `https://script.google.com/macros/s/AKfycbzlCsw2qUDwcfcqWiV0hVbWxeTA9BRW8nJCSaU1yFySCA618hVuL0PtLZxmUL_WuRDUWA/exec`
- **Repositorio GitHub:** `https://github.com/nutriage2026-create/Nutriage-web`
- **Email:** nutriage2026@gmail.com
- **WhatsApp:** 56971246200
- **Precio consulta:** $15.000 CLP

---

## Estructura del Google Sheet (6 hojas)

El Google Sheet tiene estas 6 hojas con datos empezando en la **fila 4** (fila 1=título, fila 2=vacía, fila 3=encabezados):

**PACIENTES** — 18 columnas: Ticket | Nombre | Email | Teléfono | RUT | Edad | Ocupación | Peso | Talla | IMC | Motivo | FechaCita | HoraCita | Estado | Comprobante | WANotificado | FechaRegistro | NotasInternas

**FORMULARIO_CLINICO** — 38 columnas con anamnesis completa del paciente

**CITAS** — 13 columnas: Ticket | Nombre | Email | Tel | Fecha | Hora | Duración | Modalidad | Estado | SalaJitsi | WAP | WAN | Notas

**PAGOS** — 12 columnas: Ticket | Nombre | FechaCita | Monto | Método | Estado | FechaTransf | CompRecib | UrlArchivo | RUTTitular | Banco | Notas

**DISPONIBILIDAD** — 6 columnas: Fecha | Día | Hora | Disponible(Sí/No) | TicketReservado | NombrePaciente

**VIDEOLLAMADAS** — 11 columnas: Ticket | Nombre | Fecha | HoraInicio | HoraFin | Duración | Sala | Estado | Grabación | Calidad | Notas

---

## El problema central que debes resolver

La web está alojada en **Google Sites** y necesita comunicarse con el **Google Apps Script**. El problema es CORS — los navegadores bloquean las llamadas `fetch()` desde dominios externos hacia GAS. La solución correcta es **JSONP** (cargar el GAS como una etiqueta `<script>` dinámica con un parámetro `callback`), que funciona sin restricciones CORS.

### Cómo funciona JSONP en este contexto

En vez de `fetch(GAS_URL)`, el código crea dinámicamente `<script src="GAS_URL?callback=_gasCb_123&action=...">`. El GAS responde envolviendo el JSON en la función callback: `_gasCb_123({"ok":true, "ticket":"NA-..."})`. El navegador ejecuta esa función automáticamente y obtenemos los datos sin bloqueo CORS.

---

## Tareas específicas que debes completar

### Tarea 1 — Actualizar el index.html

Modifica el archivo `index.html` para que:

**1a. La constante GAS_URL tenga la URL correcta:**
```javascript
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzlCsw2qUDwcfcqWiV0hVbWxeTA9BRW8nJCSaU1yFySCA618hVuL0PtLZxmUL_WuRDUWA/exec';
```

**1b. La función gasCall use JSONP correctamente** (etiqueta script dinámica con timeout de 25 segundos y limpieza automática del DOM).

**1c. La función `initAvail()` sea async** y cargue la disponibilidad desde GAS al abrir la página, con fallback a disponibilidad local si GAS no responde.

**1d. La función `finalizarReserva()` sea async** y envíe todos los datos del formulario al GAS via `gasGet()`. El comprobante de pago NO debe incluirse en la llamada principal (las imágenes en base64 son demasiado grandes para una URL). Después del registro exitoso, enviar el comprobante en una segunda llamada separada.

**1e. La función `saveNutriTimes()` sea async** y sincronice los horarios con GAS enviando `{action:'saveNutriTimes', date:'YYYY-MM-DD', times:['09:00','10:00',...]}`.

**1f. La función `loginConTicket()` sea async** y busque el ticket primero en GAS y luego en localStorage como fallback.

**1g. La función `renderAdmin()` sea async** y sincronice pacientes y disponibilidad desde GAS al abrir el panel Admin. Agregar un botón "🔄 Sincronizar" que fuerce una nueva sincronización.

**1h. `DOMContentLoaded`** debe llamar a `initAvail()` automáticamente al cargar la página.

**1i. Un spinner visual** `gasLoading(show, msg)` que aparece fijo arriba en la pantalla mientras se comunica con GAS.

### Tarea 2 — Actualizar el NutriAge_GAS.gs

El Google Apps Script debe tener soporte JSONP completo:

**2a. `doGet(e)` debe extraer el parámetro `callback`** de la query string y envolver todas las respuestas en esa función si está presente.

**2b. `jsonOk_(data, cb)` y `jsonError_(msg, code, cb)`** deben aceptar el parámetro callback y retornar `ContentService.MimeType.JAVASCRIPT` cuando hay callback.

**2c. Una función `wrapCb_(textOutput, cb)`** que convierte cualquier respuesta existente en JSONP.

**2d. El `SPREADSHEET_ID` debe ser** `1oAqHjZqkaoIrwkPyh4qjN32dUs_wKt7oEnJYPh_CrGs`.

**2e. El `doGet` debe manejar TODAS las acciones** tanto de lectura como de escritura, recibiendo los parámetros del formulario directamente de `e.parameter`.

**2f. La función `toDateKey_(cellValue)`** debe manejar correctamente tanto objetos Date como strings de Google Sheets.

**2g. `DATA_START_ROW` debe ser 4** para coincidir con la estructura del Sheet.

### Tarea 3 — Verificar la conexión

Después de hacer los cambios, verificar que esta URL retorna datos correctos en el navegador:
```
https://script.google.com/macros/s/AKfycbzlCsw2qUDwcfcqWiV0hVbWxeTA9BRW8nJCSaU1yFySCA618hVuL0PtLZxmUL_WuRDUWA/exec?action=ping&callback=test
```
La respuesta esperada es: `test({"ok":true,"message":"NutriAge GAS v5 activo","version":5})`

---

## Flujo completo que debe funcionar al terminar

El flujo del paciente es: abrir la web → el calendario carga horarios reales desde Google Sheets → seleccionar fecha y hora → completar formulario clínico → adjuntar comprobante de pago → hacer clic en "Finalizar reserva" → el GAS registra al paciente en 4 hojas simultáneamente (PACIENTES, FORMULARIO_CLINICO, CITAS, PAGOS) → el GAS marca el slot como reservado en DISPONIBILIDAD → el GAS envía email de confirmación al paciente y aviso a Fernanda → el paciente recibe su ticket NA-YYYYMMDD-NNN en pantalla.

---

## Credenciales y configuración

```
Email nutricionista: nutriage2026@gmail.com
WhatsApp: 56971246200
Password panel nutricionista: fernanda2026
Password panel admin: admin2026
Banco transferencia: Banco Estado
RUT Fernanda: 20.726.694-9
Precio consulta: $15.000 CLP
Duración slot: 45 minutos
Prefijo tickets: NA (ej: NA-20260414-001)
Zona horaria: America/Santiago
```

---

## Entregables esperados

Al terminar debes entregar dos archivos listos para usar sin modificaciones adicionales:

El primero es `index.html` completo y funcional con toda la integración GAS vía JSONP, sin errores de sintaxis, con el HTML completo desde `<!DOCTYPE html>` hasta `</html>`, con la URL del GAS correcta, y con `initAvail()` llamado en `DOMContentLoaded`.

El segundo es `NutriAge_GAS_v5_FINAL.gs` completo con soporte JSONP, con el SPREADSHEET_ID correcto, con todas las funciones de lectura y escritura, y con la función `setup()` que verifica las 6 hojas y precarga la disponibilidad.

---

## Reglas de calidad

No hacer suposiciones — si algo no está claro, revisar el código adjunto. No romper funcionalidades existentes como el calendario, el modal de ficha clínica, los gráficos o Jitsi. Mantener el diseño visual exactamente igual. Agregar comentarios en el código explicando cada función GAS. Manejar todos los errores con try/catch y fallback a localStorage cuando GAS no responde. El sistema debe funcionar aunque GAS esté caído — el paciente siempre puede completar su reserva localmente.
