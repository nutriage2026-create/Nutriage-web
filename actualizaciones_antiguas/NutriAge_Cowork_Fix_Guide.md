# 🛠️ NutriAge — Guía de Ejecución para Cowork
> **Propósito:** Corregir 4 bugs críticos del sistema NutriAge de manera precisa y en orden estricto.  
> **Archivo principal:** `index.html` (todo el frontend y lógica JS en un solo archivo)  
> **Backend:** Google Apps Script (GAS) accesible desde Google Drive  
> **Ejecutor:** Cowork — seguir cada paso en el orden indicado, sin saltarse ninguno.

---

## 📋 RESUMEN DE PROBLEMAS A CORREGIR

| # | Bug | Gravedad | Archivo a editar |
|---|-----|----------|-----------------|
| 1 | Datos del formulario se guardan en fila incorrecta de Google Sheets (debajo del bloque TOTALES/RESUMEN) | 🔴 Crítico | Google Apps Script |
| 2 | IMC muestra `#ERROR!` en Sheets porque los valores de peso y talla se envían como texto con unidades (`"65 kg"`, `"1.98 m"`) | 🔴 Crítico | `index.html` → función `submitForm()` + GAS |
| 3 | Panel de nutricionista NO sincroniza con GAS al hacer login → datos desactualizados o vacíos en otro dispositivo | 🟠 Alto | `index.html` → función `loginN()` |
| 4 | Sin botón de "Actualizar" en panel nutricionista → obliga a cerrar sesión para ver nuevos pacientes | 🟠 Alto | `index.html` → HTML del panel nutricionista |

---

## ⚙️ PREREQUISITOS ANTES DE COMENZAR

- [ ] Tener abierto el archivo `index.html` en un editor de texto (VS Code recomendado)
- [ ] Tener abierto el Google Apps Script en el navegador:  
  `https://script.google.com` → buscar el proyecto vinculado a NutriAge
- [ ] Tener abierta la hoja de Google Sheets de NutriAge para verificar resultados
- [ ] **NO** hacer cambios fuera de los indicados en esta guía

---

## 🔧 FIX 1 — Quitar unidades de texto en `formData` (index.html)

### Qué buscar
Dentro de la función `submitForm()`, busca el bloque donde se construye el objeto `formData`.  
Localiza estas dos líneas exactas:

```
peso:v('f-peso')+' kg',talla:v('f-talla')+' m',
```

### Qué hacer
Reemplaza esas dos líneas por:

```javascript
peso:v('f-peso'),        // número puro sin unidades — GAS calcula IMC correctamente
talla:v('f-talla'),      // número puro sin unidades — evita #ERROR! en Sheets
```

### Por qué
El GAS recibe `"65 kg"` como string → cuando intenta `65 kg / (1.98 m)^2` → `#ERROR!`.  
Enviando solo el número `65` y `1.98`, el GAS puede hacer la operación matemática sin errores.

### Cómo verificar que está bien
Busca en el mismo bloque `formData` si quedan otras propiedades con `+ ' kg'` o `+ ' m'` y elimínalas también. El resultado debe ser solo el valor del input, sin texto adicional.

---

## 🔧 FIX 2 — Agregar sincronización GAS en `loginN()` (index.html)

### Qué buscar
Localiza la función completa `loginN()`. Se ve así actualmente:

```javascript
function loginN(){
  if(document.getElementById('np').value==='fernanda2026'){
    document.getElementById('nl').style.display='none';
    document.getElementById('nd').style.display='block';
    document.getElementById('ne').style.display='none';
    renderNutriRecords(); renderNutriAppts(); renderNutriCal();
    setTimeout(function(){ renderNutriStats(); },80);
  } else document.getElementById('ne').style.display='block';
}
```

### Qué hacer
Reemplaza la función completa por esta versión corregida:

```javascript
async function loginN(){
  if(document.getElementById('np').value === 'fernanda2026'){
    document.getElementById('nl').style.display = 'none';
    document.getElementById('nd').style.display = 'block';
    document.getElementById('ne').style.display = 'none';

    // NUEVO: Sincronizar con Google Sheets antes de renderizar
    // Garantiza que Fernanda vea datos reales desde cualquier dispositivo
    gasLoading(true, 'Cargando tus pacientes...');
    try {
      var r = await gasGet({ action: 'sincronizarTodo' });
      if(r.ok){
        var db = getDB();
        if(r.patients && r.patients.length > 0)          db.patients     = r.patients;
        if(r.availability && Object.keys(r.availability).length > 0) db.availability = r.availability;
        saveDB(db);
      }
    } catch(e){
      console.warn('[NutriAge] Sync al login falló, usando datos locales:', e);
    }
    gasLoading(false);

    renderNutriRecords();
    renderNutriAppts();
    renderNutriCal();
    setTimeout(function(){ renderNutriStats(); }, 80);

  } else {
    document.getElementById('ne').style.display = 'block';
  }
}
```

### Por qué
La versión anterior solo leía `localStorage` (datos del dispositivo actual).  
Esta versión pide al GAS todos los pacientes registrados en Sheets antes de mostrar el panel.  
Si el GAS falla (sin internet), cae silenciosamente al `catch` y usa los datos locales como respaldo.

---

## 🔧 FIX 3 — Agregar función `sincronizarNutri()` al script (index.html)

### Qué buscar
Localiza la función `sincronizarDesdeGAS()` que ya existe en el código:

```javascript
function sincronizarDesdeGAS(){ _adminSynced=false; renderAdmin(); }
```

### Qué hacer
Inmediatamente DESPUÉS de esa línea, agrega esta nueva función:

```javascript
// Botón de actualización para el panel de la nutricionista
async function sincronizarNutri(){
  gasLoading(true, 'Actualizando datos...');
  try {
    var r = await gasGet({ action: 'sincronizarTodo' });
    if(r.ok){
      var db = getDB();
      if(r.patients && r.patients.length > 0)          db.patients     = r.patients;
      if(r.availability && Object.keys(r.availability).length > 0) db.availability = r.availability;
      saveDB(db);
    }
  } catch(e){
    console.warn('[NutriAge] Sync nutri falló:', e);
  }
  gasLoading(false);
  renderNutriRecords();
  renderNutriAppts();
  renderNutriCal();
  setTimeout(function(){ renderNutriStats(); }, 80);
}
```

---

## 🔧 FIX 4 — Agregar botón "Actualizar" en el HTML del panel nutricionista (index.html)

### Qué buscar
Dentro del HTML del panel nutricionista (`id="nd"`), localiza exactamente este botón:

```html
<button onclick="logoutN()" style="font-size:.78rem;color:var(--g3);background:none;border:none;cursor:pointer">Cerrar sesión</button>
```

### Qué hacer
Reemplaza solo ese botón por este bloque de dos botones:

```html
<div style="display:flex;gap:.6rem;align-items:center">
  <button
    onclick="sincronizarNutri()"
    style="font-size:.78rem;color:var(--s1);background:var(--s5);border:1px solid var(--s4);border-radius:20px;padding:.3rem .85rem;cursor:pointer;font-weight:700;font-family:'Nunito',sans-serif">
    🔄 Actualizar
  </button>
  <button
    onclick="logoutN()"
    style="font-size:.78rem;color:var(--g3);background:none;border:none;cursor:pointer">
    Cerrar sesión
  </button>
</div>
```

### Por qué
Permite a Fernanda refrescar los datos en cualquier momento sin cerrar sesión.  
Usa los mismos colores del sistema (verde `--s1`, `--s5`, `--s4`) para consistencia visual.

---

## 🔧 FIX 5 — Corregir el Google Apps Script (GAS) — EL MÁS IMPORTANTE

> ⚠️ Este fix resuelve el problema principal: datos escribiéndose en la fila equivocada.

### Cómo llegar al GAS
1. Ir a `https://drive.google.com`
2. Buscar el proyecto "NutriAge" o el Apps Script vinculado a la hoja
3. Hacer clic en **Extensiones → Apps Script** desde la hoja de Sheets
4. Se abrirá el editor de código en `https://script.google.com`

### Qué buscar en el GAS
Dentro del archivo principal del GAS (normalmente `Code.gs`), busca el `case 'registerPatient':` dentro de la función `doGet` o `doPost`.

### Qué hacer
Reemplaza el bloque completo del `case 'registerPatient':` con este código:

```javascript
case 'registerPatient': {
  var sheet = ss.getSheetByName('Pacientes') || ss.getActiveSheet();

  // ── PASO 1: Encontrar la fila correcta para insertar ──
  // Busca la fila "TOTALES" para insertar ANTES de ella
  // Esto garantiza que los datos nunca queden debajo del bloque de resumen
  var lastDataRow = 3; // Fila 3 = headers
  var totalRow    = -1;
  var allValues   = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();

  for(var i = 0; i < allValues.length; i++){
    var cellVal = String(allValues[i][0]).trim().toUpperCase();
    if(cellVal === 'TOTALES'){
      totalRow = i + 1; // Fila en notación Sheets (base 1)
      break;
    }
    // Actualizar última fila con datos reales (no vacía)
    if(allValues[i][0] !== '' && i > 2) lastDataRow = i + 1;
  }

  // Si hay fila TOTALES → insertar justo antes
  // Si no hay fila TOTALES → insertar después de la última fila con datos
  var insertRow = (totalRow > 0) ? totalRow : lastDataRow + 1;
  sheet.insertRowBefore(insertRow);

  // ── PASO 2: Calcular IMC en el servidor (nunca en el cliente) ──
  // Ahora peso y talla llegan como números puros gracias al Fix 1
  var pesoNum  = parseFloat(params.peso)  || 0;
  var tallaNum = parseFloat(params.talla) || 0;
  var imc = '';
  if(pesoNum > 0 && tallaNum > 0){
    imc = Math.round((pesoNum / (tallaNum * tallaNum)) * 10) / 10;
  }

  // ── PASO 3: Generar número de ticket único ──
  var fecha     = params.date || Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
  var datePart  = fecha.replace(/-/g, '');
  var ticketBase = 'NA-' + datePart + '-';

  // Contar tickets existentes para ese día y crear el siguiente correlativo
  var existingRows    = sheet.getRange(4, 1, Math.max(1, sheet.getLastRow() - 3), 1).getValues();
  var ticketsDelDia   = existingRows.filter(function(r){
    return String(r[0]).indexOf(ticketBase) === 0;
  }).length;
  var ticket = ticketBase + String(ticketsDelDia + 1).padStart(3, '0');

  // ── PASO 4: Escribir datos en la fila insertada ──
  // Columnas A→R según la estructura de la hoja
  var rowData = [
    ticket,                  // A: Ticket
    params.nombre   || '',   // B: Nombre Completo
    params.email    || '',   // C: Email
    params.telefono || '',   // D: Teléfono
    params.rut      || '',   // E: RUT/ID
    params.edad     || '',   // F: Edad
    params.ocupacion|| '',   // G: Ocupación
    pesoNum         || '',   // H: Peso (kg)  ← número puro
    tallaNum        || '',   // I: Talla (m)  ← número puro
    imc             || '',   // J: IMC        ← calculado en servidor ✓
    params.motivo   || '',   // K: Motivo Consulta
    params.date     || '',   // L: Fecha Cita
    params.time     || '',   // M: Hora Cita
    'Confirmado',            // N: Estado
    'No',                    // O: Comprobante (se actualiza al subir imagen)
    'No',                    // P: WA Notificado
    new Date().toISOString(),// Q: Fecha Registro
    ''                       // R: Notas Internas
  ];

  sheet.getRange(insertRow, 1, 1, rowData.length).setValues([rowData]);

  // ── PASO 5: Devolver respuesta al frontend ──
  var callback = params.callback || 'callback';
  return ContentService
    .createTextOutput(
      callback + '(' + JSON.stringify({ ok: true, ticket: ticket }) + ')'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
```

### Guardar y redesplegar el GAS
Después de pegar el código:
1. Clic en **💾 Guardar** (ícono de disquete o Ctrl+S)
2. Clic en **Implementar → Administrar implementaciones**
3. En la implementación activa → clic en el ícono de lápiz (editar)
4. En "Versión" → seleccionar **"Nueva versión"**
5. Clic en **Implementar**
6. Copiar la nueva URL del script (debe terminar en `/exec`)
7. Verificar que la variable `GAS_URL` en `index.html` tenga esa URL actualizada

---

## 🔧 FIX 6 — Reparar celdas IMC con `#ERROR!` ya existentes en Sheets (opcional pero recomendado)

### Qué hacer en la hoja de Google Sheets
1. Ir a la columna **J** (IMC)
2. Para cada celda que muestre `#ERROR!`, reemplazar el contenido por esta fórmula:
   ```
   =IFERROR(ROUND(H45/(I45^2),1),"—")
   ```
   *(Ajustar el número de fila según corresponda)*
3. Las **nuevas filas** insertadas por el GAS corregido ya tendrán el valor calculado directamente como número, sin fórmula.

---

## ✅ CHECKLIST DE VERIFICACIÓN FINAL

Después de aplicar todos los fixes, verificar cada punto:

### En index.html
- [ ] En `submitForm()`: `peso:v('f-peso')` sin `+ ' kg'`
- [ ] En `submitForm()`: `talla:v('f-talla')` sin `+ ' m'`
- [ ] Función `loginN()` es `async` y tiene el bloque `gasGet({action:'sincronizarTodo'})`
- [ ] Función `sincronizarNutri()` existe en el script
- [ ] El botón "Cerrar sesión" del panel nutri ahora está dentro de un `div` con el botón "🔄 Actualizar"

### En el GAS
- [ ] `case 'registerPatient'` usa `insertRowBefore(insertRow)` en vez de `appendRow()`
- [ ] El GAS calcula IMC con `parseFloat()` de los valores recibidos
- [ ] El GAS fue re-desplegado como **nueva versión**

### Prueba de flujo completo
- [ ] Completar un formulario de prueba desde el navegador
- [ ] Verificar en Google Sheets que la fila nueva aparece en la zona de datos (después de la fila de headers, antes de TOTALES)
- [ ] Verificar que la columna IMC muestra un número (ej: `19.8`) y no `#ERROR!`
- [ ] Iniciar sesión en panel nutricionista → debe aparecer el paciente recién registrado
- [ ] Probar el botón "🔄 Actualizar" → datos deben refrescarse
- [ ] Probar desde el teléfono de Fernanda → panel debe mostrar los mismos datos

---

## 🚨 ERRORES COMUNES Y CÓMO RESOLVERLOS

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| GAS devuelve `{ok: false}` | URL del GAS desactualizada o no re-desplegado | Re-desplegar GAS y actualizar `GAS_URL` en index.html |
| Panel nutri sigue vacío tras login | `loginN()` no fue actualizada a `async function` | Verificar que la función empiece con `async function loginN()` |
| IMC sigue mostrando error | Todavía hay `+ ' kg'` en el código | Buscar en todo el archivo `index.html` la cadena `' kg'` |
| Fila se inserta pero en posición incorrecta | La hoja no tiene exactamente el texto "TOTALES" en la celda | Revisar el texto exacto en la celda y ajustar la condición en el GAS: `cellVal === 'TOTALES'` |
| Error CORS en consola del navegador | GAS no está publicado como "accesible para cualquiera" | En GAS → Implementar → verificar que el acceso sea "Cualquier persona" |

---

## 📁 ARCHIVOS MODIFICADOS EN ESTE FIX

```
proyecto-nutriageV3/
├── index.html              ← Modificado (Fixes 1, 2, 3, 4)
└── [Google Apps Script]    ← Modificado (Fix 5) — acceso vía script.google.com
```

---

*Documento generado para ejecución con Cowork — NutriAge v3 · Abril 2026*
