// ═══════════════════════════════════════════════════════════════════════
//  NutriAge GAS v5 — Google Apps Script Backend API
//  Autor: Desarrollado para Fernanda Ugarte · nutriage2026@gmail.com
//  Descripción: Backend completo con soporte JSONP, registra pacientes
//               en 4 hojas, maneja disponibilidad, envía emails y
//               responde tanto a fetch() como a etiquetas <script> JSONP.
// ═══════════════════════════════════════════════════════════════════════

// ─── CONFIGURACIÓN GLOBAL ───────────────────────────────────────────────
var SPREADSHEET_ID   = '1oAqHjZqkaoIrwkPyh4qjN32dUs_wKt7oEnJYPh_CrGs';
var DATA_START_ROW   = 4;   // Fila 1=título, 2=vacía, 3=encabezados, 4+=datos
var NUTRI_EMAIL      = 'nutriage2026@gmail.com';
var NUTRI_WA         = '56971246200';
var PRECIO_CONSULTA  = 15000;
var TIMEZONE         = 'America/Santiago';
var VERSION          = 5;

// ─── NOMBRES DE HOJAS ───────────────────────────────────────────────────
var SHEET_PACIENTES         = 'PACIENTES';
var SHEET_FORMULARIO        = 'FORMULARIO_CLINICO';
var SHEET_CITAS             = 'CITAS';
var SHEET_PAGOS             = 'PAGOS';
var SHEET_DISPONIBILIDAD    = 'DISPONIBILIDAD';
var SHEET_VIDEOLLAMADAS     = 'VIDEOLLAMADAS';

// ═══════════════════════════════════════════════════════════════════════
//  ENTRY POINT — doGet
//  Maneja todas las peticiones GET/JSONP desde la web
// ═══════════════════════════════════════════════════════════════════════

/**
 * Punto de entrada principal del Web App.
 * Lee el parámetro 'action' y despacha a la función correspondiente.
 * Si viene el parámetro 'callback', envuelve la respuesta en JSONP.
 *
 * @param {Object} e - Evento HTTP con e.parameter y e.queryString
 * @returns {TextOutput} Respuesta JSON o JSONP
 */
function doGet(e) {
  var cb     = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;
  var action = (e && e.parameter && e.parameter.action)   ? e.parameter.action   : '';

  try {
    var result;

    switch (action) {

      // ── Ping de verificación ──────────────────────────────────────────
      case 'ping':
        result = jsonOk_({ message: 'NutriAge GAS v5 activo', version: VERSION }, cb);
        break;

      // ── Cargar disponibilidad para el calendario ──────────────────────
      case 'getAvailability':
        result = handleGetAvailability_(e, cb);
        break;

      // ── Registrar paciente en las 4 hojas ────────────────────────────
      case 'registerPatient':
        result = handleRegisterPatient_(e, cb);
        break;

      // ── Subir comprobante de pago a Google Drive ──────────────────────
      case 'uploadComprobante':
        result = handleUploadComprobante_(e, cb);
        break;

      // ── Guardar horarios de la nutricionista ──────────────────────────
      case 'saveNutriTimes':
        result = handleSaveNutriTimes_(e, cb);
        break;

      // ── Sincronizar todo (pacientes + disponibilidad) para Admin ──────
      case 'sincronizarTodo':
        result = handleSincronizarTodo_(e, cb);
        break;

      // ── Buscar paciente por ticket (login con ticket) ─────────────────
      case 'getPatientByTicket':
        result = handleGetPatientByTicket_(e, cb);
        break;

      // ── Marcar WA notificado ──────────────────────────────────────────
      case 'markWaNotificado':
        result = handleMarkWaNotificado_(e, cb);
        break;

      // ── Acción desconocida ────────────────────────────────────────────
      default:
        result = jsonError_('Acción no reconocida: ' + action, 400, cb);
        break;
    }

    return result;

  } catch (err) {
    Logger.log('doGet ERROR: ' + err.message + ' | action=' + action);
    return jsonError_('Error interno: ' + err.message, 500, cb);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HANDLERS — Una función por acción
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna toda la disponibilidad desde la hoja DISPONIBILIDAD.
 * Formato: { ok: true, availability: { "YYYY-MM-DD": ["09:00","10:00",...] } }
 */
function handleGetAvailability_(e, cb) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return jsonError_('Hoja DISPONIBILIDAD no encontrada', 404, cb);

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return jsonOk_({ availability: {} }, cb);

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();
  // Columnas: Fecha | Día | Hora | Disponible | TicketReservado | NombrePaciente
  // Índices:    0      1     2        3               4                5

  var availability = {};

  data.forEach(function(row) {
    var dateKey   = toDateKey_(row[0]);
    var hora      = String(row[2] || '').trim();
    var disponible = String(row[3] || '').trim().toLowerCase();

    if (!dateKey || !hora) return;

    // Solo incluir slots disponibles (sin reserva)
    if (disponible === 'sí' || disponible === 'si' || disponible === 'true' || disponible === '1') {
      if (!availability[dateKey]) availability[dateKey] = [];
      if (availability[dateKey].indexOf(hora) < 0) {
        availability[dateKey].push(hora);
      }
    }
  });

  // Ordenar horarios dentro de cada día
  Object.keys(availability).forEach(function(k) {
    availability[k].sort();
  });

  return jsonOk_({ availability: availability }, cb);
}

/**
 * Registra un paciente nuevo en 4 hojas: PACIENTES, FORMULARIO_CLINICO, CITAS, PAGOS.
 * Marca el slot como reservado en DISPONIBILIDAD.
 * Genera ticket único NA-YYYYMMDD-NNN.
 * Envía email de confirmación al paciente y aviso a Fernanda.
 *
 * @returns { ok: true, ticket: "NA-YYYYMMDD-NNN" }
 */
function handleRegisterPatient_(e, cb) {
  var p = e.parameter;

  // Validar campos mínimos
  if (!p.nombre || !p.email || !p.date || !p.time) {
    return jsonError_('Faltan campos obligatorios: nombre, email, date, time', 400, cb);
  }

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var now     = new Date();
  var ticket  = generarTicket_(p.date, ss);

  // ── 1. Hoja PACIENTES (18 columnas) ──────────────────────────────────
  // Ticket|Nombre|Email|Teléfono|RUT|Edad|Ocupación|Peso|Talla|IMC|Motivo|
  // FechaCita|HoraCita|Estado|Comprobante|WANotificado|FechaRegistro|NotasInternas
  var shPac = ss.getSheetByName(SHEET_PACIENTES);
  if (shPac) {
    var imc = calcularIMC_(p.peso, p.talla);
    shPac.appendRow([
      ticket,
      p.nombre || '',
      p.email  || '',
      p.telefono || '',
      p.rut || '',
      p.edad || '',
      p.ocupacion || '',
      p.peso || '',
      p.talla || '',
      imc,
      p.motivo || '',
      p.date || '',
      p.time || '',
      'Confirmado',
      '',            // Comprobante (URL Drive — se actualiza después)
      'No',          // WANotificado
      Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      ''             // NotasInternas
    ]);
  }

  // ── 2. Hoja FORMULARIO_CLINICO (38 columnas) ──────────────────────────
  var shForm = ss.getSheetByName(SHEET_FORMULARIO);
  if (shForm) {
    shForm.appendRow([
      ticket, p.nombre||'', p.email||'', p.telefono||'', p.rut||'',
      p.edad||'', p.ocupacion||'', p.peso||'', p.talla||'', calcularIMC_(p.peso,p.talla),
      p.motivo||'', p.date||'', p.time||'',
      // Historial médico
      p.enfermedad||'', p.lesion||'', p.familiar||'', p.cirugia||'',
      // Estilo de vida
      p.convivencia||'', p.actividad||'', p.horario||'', p.sueno||'',
      // Hábitos alimentarios
      p.nodislike||'', p.almuerzo||'', p.horcomida||'', p.alergias||'',
      p.suplemento||'', p.alcohol||'', p.tabaco||'', p.gastro||'',
      // Frecuencia de consumo
      p.cereales||'', p.legumbres||'', p.pescado||'', p.fruta||'',
      p.verduras||'', p.dulces||'', p.lacteos||'',
      // Registro 24h
      p.registro24||'',
      // Fecha registro
      Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
    ]);
  }

  // ── 3. Hoja CITAS (13 columnas) ───────────────────────────────────────
  // Ticket|Nombre|Email|Tel|Fecha|Hora|Duración|Modalidad|Estado|SalaJitsi|WAP|WAN|Notas
  var shCitas = ss.getSheetByName(SHEET_CITAS);
  if (shCitas) {
    var jitsiSeed = String(p.telefono || ticket).replace(/[^0-9a-zA-Z]/g, '');
    shCitas.appendRow([
      ticket,
      p.nombre||'', p.email||'', p.telefono||'',
      p.date||'', p.time||'',
      '45 min', 'Online',
      'Confirmada',
      'NutriAge_' + jitsiSeed,
      'Pendiente',   // WAP (WhatsApp Paciente)
      'Pendiente',   // WAN (WhatsApp Nutricionista)
      ''
    ]);
  }

  // ── 4. Hoja PAGOS (12 columnas) ───────────────────────────────────────
  // Ticket|Nombre|FechaCita|Monto|Método|Estado|FechaTransf|CompRecib|UrlArchivo|RUTTitular|Banco|Notas
  var shPagos = ss.getSheetByName(SHEET_PAGOS);
  if (shPagos) {
    shPagos.appendRow([
      ticket,
      p.nombre||'', p.date||'',
      PRECIO_CONSULTA,
      'Transferencia', 'Pendiente verificación',
      '', 'No', '',  // FechaTransf, CompRecib, UrlArchivo
      '', '',        // RUTTitular, Banco
      ''
    ]);
  }

  // ── 5. Marcar slot como reservado en DISPONIBILIDAD ───────────────────
  marcarSlotReservado_(ss, p.date, p.time, ticket, p.nombre);

  // ── 6. Enviar emails de confirmación ──────────────────────────────────
  try { enviarEmailConfirmacion_(p, ticket); } catch(eErr) { Logger.log('Email error: '+eErr.message); }
  try { enviarEmailNutri_(p, ticket); }       catch(eErr) { Logger.log('Email Nutri error: '+eErr.message); }

  return jsonOk_({ ticket: ticket, message: 'Paciente registrado exitosamente' }, cb);
}

/**
 * Sube un comprobante de pago a Google Drive y actualiza la URL en PACIENTES y PAGOS.
 *
 * @returns { ok: true, url: "https://drive.google.com/..." }
 */
function handleUploadComprobante_(e, cb) {
  var p = e.parameter;
  if (!p.ticket || !p.comprobanteBase64) {
    return jsonError_('Faltan parámetros: ticket, comprobanteBase64', 400, cb);
  }

  try {
    // Decodificar base64 (puede venir como data:image/jpeg;base64,/9j/...)
    var b64 = p.comprobanteBase64;
    if (b64.indexOf(',') > -1) b64 = b64.split(',')[1];

    var mime     = p.mimeType || 'image/jpeg';
    var filename = p.nombreArchivo || ('comprobante_' + p.ticket + '.jpg');
    var decoded  = Utilities.base64Decode(b64);
    var blob     = Utilities.newBlob(decoded, mime, filename);

    // Guardar en la carpeta raíz del Drive del script
    var file    = DriveApp.createFile(blob);
    file.setName(filename);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = file.getUrl();

    // Actualizar URL en hoja PACIENTES
    var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 15, url); // col 15 = Comprobante
    actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 8, 'Sí'); // col 8  = CompRecib en PAGOS no en PACIENTES

    // Actualizar URL en hoja PAGOS
    actualizarCeldaPorTicket_(ss, SHEET_PAGOS, p.ticket, 8, 'Sí');    // col 8 = CompRecib
    actualizarCeldaPorTicket_(ss, SHEET_PAGOS, p.ticket, 9, url);     // col 9 = UrlArchivo

    return jsonOk_({ url: url }, cb);

  } catch (err) {
    return jsonError_('Error subiendo comprobante: ' + err.message, 500, cb);
  }
}

/**
 * Guarda/reemplaza los horarios de disponibilidad de un día en la hoja DISPONIBILIDAD.
 * Recibe: { action, date: 'YYYY-MM-DD', times: ['09:00','10:00',...] }
 *
 * @returns { ok: true }
 */
function handleSaveNutriTimes_(e, cb) {
  var p = e.parameter;
  if (!p.date) return jsonError_('Falta parámetro: date', 400, cb);

  var times = [];
  try {
    times = p.times ? JSON.parse(p.times) : [];
  } catch(err) {
    // Si viene como string plano, intentar split
    times = p.times ? p.times.split(',') : [];
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return jsonError_('Hoja DISPONIBILIDAD no encontrada', 404, cb);

  var dateKey = p.date;
  var dayName = getDayName_(dateKey);

  // Eliminar filas existentes para esa fecha
  var lastRow = sheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
    // Recorrer desde abajo para no afectar índices al borrar
    for (var i = data.length - 1; i >= 0; i--) {
      var rowDateKey = toDateKey_(data[i][0]);
      if (rowDateKey === dateKey) {
        sheet.deleteRow(DATA_START_ROW + i);
      }
    }
  }

  // Insertar nuevas filas para cada horario
  var ALL_TIMES = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
  ALL_TIMES.forEach(function(t) {
    var esDispo = (times.indexOf(t) >= 0) ? 'Sí' : 'No';
    sheet.appendRow([dateKey, dayName, t, esDispo, '', '']);
  });

  return jsonOk_({ message: 'Horarios guardados para ' + dateKey }, cb);
}

/**
 * Sincroniza todo el sistema para el panel Admin.
 * Retorna: { ok:true, patients: [...], availability: {...} }
 */
function handleSincronizarTodo_(e, cb) {
  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var patients  = getPatientsFromSheet_(ss);
  var avail     = getAvailabilityFromSheet_(ss);
  return jsonOk_({ patients: patients, availability: avail }, cb);
}

/**
 * Busca un paciente por su número de ticket.
 * @returns { ok:true, found:true, ticket, nombre, telefono, fecha, time, dateFormatted }
 */
function handleGetPatientByTicket_(e, cb) {
  var p = e.parameter;
  if (!p.ticket) return jsonError_('Falta parámetro: ticket', 400, cb);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_PACIENTES);
  if (!sheet) return jsonOk_({ found: false }, cb);

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return jsonOk_({ found: false }, cb);

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 18).getValues();
  // Columnas: Ticket(0)|Nombre(1)|Email(2)|Teléfono(3)|RUT(4)|Edad(5)|Ocupación(6)|
  //           Peso(7)|Talla(8)|IMC(9)|Motivo(10)|FechaCita(11)|HoraCita(12)|Estado(13)|...

  var ticket = p.ticket.trim().toUpperCase();

  for (var i = 0; i < data.length; i++) {
    var rowTicket = String(data[i][0] || '').trim().toUpperCase();
    if (rowTicket === ticket) {
      var fechaKey = toDateKey_(data[i][11]);
      return jsonOk_({
        found         : true,
        ticket        : String(data[i][0]),
        nombre        : String(data[i][1]),
        email         : String(data[i][2]),
        telefono      : String(data[i][3]),
        fecha         : fechaKey,
        dateFormatted : formatDateES_(fechaKey),
        time          : String(data[i][12]),
        estado        : String(data[i][13])
      }, cb);
    }
  }

  return jsonOk_({ found: false }, cb);
}

/**
 * Marca el campo WANotificado = 'Sí' para un ticket dado.
 * @returns { ok:true }
 */
function handleMarkWaNotificado_(e, cb) {
  var p = e.parameter;
  if (!p.ticket) return jsonError_('Falta parámetro: ticket', 400, cb);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 16, 'Sí'); // col 16 = WANotificado
  return jsonOk_({ message: 'WA notificado marcado' }, cb);
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lee todos los pacientes de la hoja PACIENTES y los devuelve como array de objetos.
 */
function getPatientsFromSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_PACIENTES);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 18).getValues();
  var patients = [];

  data.forEach(function(row) {
    var ticket = String(row[0] || '').trim();
    if (!ticket) return;

    var fechaKey = toDateKey_(row[11]);
    patients.push({
      id            : ticket,
      ticket        : ticket,
      nombre        : String(row[1]  || ''),
      email         : String(row[2]  || ''),
      telefono      : String(row[3]  || ''),
      rut           : String(row[4]  || ''),
      edad          : String(row[5]  || ''),
      ocupacion     : String(row[6]  || ''),
      peso          : String(row[7]  || ''),
      talla         : String(row[8]  || ''),
      motivo        : String(row[10] || ''),
      date          : fechaKey,
      dateFormatted : formatDateES_(fechaKey),
      time          : String(row[12] || ''),
      status        : String(row[13] || 'Activo'),
      comprobante   : null,    // No enviamos base64 desde el servidor
      waNotificado  : String(row[15] || 'No'),
      nutricionista : 'Fernanda Ugarte',
      consultations : 1
    });
  });

  return patients;
}

/**
 * Lee la disponibilidad de la hoja DISPONIBILIDAD y la devuelve como objeto.
 */
function getAvailabilityFromSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return {};

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();
  var avail = {};

  data.forEach(function(row) {
    var dateKey   = toDateKey_(row[0]);
    var hora      = String(row[2] || '').trim();
    var disponible = String(row[3] || '').trim().toLowerCase();
    if (!dateKey || !hora) return;

    if (disponible === 'sí' || disponible === 'si' || disponible === 'true' || disponible === '1') {
      if (!avail[dateKey]) avail[dateKey] = [];
      if (avail[dateKey].indexOf(hora) < 0) avail[dateKey].push(hora);
    }
  });

  Object.keys(avail).forEach(function(k) { avail[k].sort(); });
  return avail;
}

/**
 * Genera un ticket único con formato NA-YYYYMMDD-NNN.
 * Busca cuántos tickets del mismo día existen en PACIENTES.
 */
function generarTicket_(dateKey, ss) {
  var datePart = (dateKey || '').replace(/-/g, '');
  var sheet    = ss.getSheetByName(SHEET_PACIENTES);
  var count    = 1;

  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= DATA_START_ROW) {
      var tickets = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
      tickets.forEach(function(r) {
        var t = String(r[0] || '');
        if (t.indexOf('NA-' + datePart) === 0) count++;
      });
    }
  }

  return 'NA-' + datePart + '-' + String(count).padStart(3, '0');
}

/**
 * Marca un slot como reservado en la hoja DISPONIBILIDAD.
 * Cambia Disponible de 'Sí' a 'No' y anota el ticket y nombre.
 */
function marcarSlotReservado_(ss, dateKey, hora, ticket, nombre) {
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowDate = toDateKey_(data[i][0]);
    var rowHora = String(data[i][2] || '').trim();
    if (rowDate === dateKey && rowHora === hora) {
      var rowNum = DATA_START_ROW + i;
      sheet.getRange(rowNum, 4).setValue('No');     // Disponible = No
      sheet.getRange(rowNum, 5).setValue(ticket);   // TicketReservado
      sheet.getRange(rowNum, 6).setValue(nombre);   // NombrePaciente
      return;
    }
  }

  // Si no existe la fila (slot no estaba precargado), agregarla como reservada
  var dayName = getDayName_(dateKey);
  sheet.appendRow([dateKey, dayName, hora, 'No', ticket, nombre || '']);
}

/**
 * Actualiza una celda específica buscando por ticket en la columna 1 de una hoja.
 *
 * @param {Spreadsheet} ss - El spreadsheet abierto
 * @param {string} sheetName - Nombre de la hoja
 * @param {string} ticket - Ticket a buscar
 * @param {number} colNum - Número de columna (1-indexado) a actualizar
 * @param {*} value - Valor a escribir
 */
function actualizarCeldaPorTicket_(ss, sheetName, ticket, colNum, value) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
  var ticketUp = String(ticket || '').trim().toUpperCase();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === ticketUp) {
      sheet.getRange(DATA_START_ROW + i, colNum).setValue(value);
      return;
    }
  }
}

/**
 * Envía email de confirmación al paciente.
 */
function enviarEmailConfirmacion_(p, ticket) {
  var subject = '✅ Confirmación de cita — NutriAge · ' + ticket;
  var body = [
    'Hola ' + (p.nombre || 'Paciente') + ',',
    '',
    'Tu cita con Fernanda Ugarte ha sido confirmada exitosamente.',
    '',
    '📅 Fecha: ' + formatDateES_(p.date),
    '⏰ Hora: ' + p.time + ' hrs',
    '🎫 Tu ticket: ' + ticket,
    '💰 Monto: $15.000 CLP',
    '',
    'Modalidad: Videollamada online (recibirás el enlace antes de la consulta)',
    '',
    'Si tienes preguntas, escribe a: ' + NUTRI_EMAIL,
    'O por WhatsApp: wa.me/' + NUTRI_WA,
    '',
    'Hasta pronto,',
    'Fernanda Ugarte — Nutricionista',
    'NutriAge 🌿'
  ].join('\n');

  MailApp.sendEmail({
    to      : p.email,
    subject : subject,
    body    : body
  });
}

/**
 * Envía aviso a Fernanda cuando llega un nuevo paciente.
 */
function enviarEmailNutri_(p, ticket) {
  var subject = '🌱 Nueva cita agendada — ' + (p.nombre || '') + ' · ' + ticket;
  var body = [
    'Nueva reserva recibida en NutriAge.',
    '',
    '🎫 Ticket: ' + ticket,
    '👤 Paciente: ' + (p.nombre || '—'),
    '📧 Email: ' + (p.email || '—'),
    '📱 Teléfono: ' + (p.telefono || '—'),
    '📅 Fecha: ' + formatDateES_(p.date),
    '⏰ Hora: ' + p.time + ' hrs',
    '🎯 Motivo: ' + (p.motivo || '—'),
    '⚖️ Peso: ' + (p.peso || '—') + ' | Talla: ' + (p.talla || '—'),
    '',
    'Revisa la hoja de cálculo para más detalles.',
    '',
    '— Sistema NutriAge v5'
  ].join('\n');

  MailApp.sendEmail({
    to      : NUTRI_EMAIL,
    subject : subject,
    body    : body
  });
}

/**
 * Calcula el IMC a partir del peso (kg) y la talla (m).
 * Acepta strings como "65 kg" o "65" y "1.68 m" o "1.68".
 *
 * @param {string|number} peso - Peso en kg
 * @param {string|number} talla - Talla en metros
 * @returns {string} IMC formateado o vacío si no se puede calcular
 */
function calcularIMC_(peso, talla) {
  var p = parseFloat(String(peso  || '').replace(/[^0-9.]/g, ''));
  var t = parseFloat(String(talla || '').replace(/[^0-9.]/g, ''));
  if (!p || !t || t < 0.5 || t > 3) return '';
  // Si la talla viene en cm (ej: 168) convertir a metros
  if (t > 3) t = t / 100;
  return (p / (t * t)).toFixed(1);
}

/**
 * Convierte un valor de celda de Google Sheets a clave de fecha "YYYY-MM-DD".
 * Maneja tanto objetos Date como strings en varios formatos.
 *
 * @param {Date|string|number} cellValue - Valor de la celda
 * @returns {string} Fecha en formato YYYY-MM-DD o vacío si no se puede convertir
 */
function toDateKey_(cellValue) {
  if (!cellValue) return '';

  // Si ya es un objeto Date
  if (cellValue instanceof Date) {
    if (isNaN(cellValue.getTime())) return '';
    return Utilities.formatDate(cellValue, TIMEZONE, 'yyyy-MM-dd');
  }

  var s = String(cellValue).trim();

  // Si ya tiene formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Intentar parsear como fecha
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }

  // Formato DD/MM/YYYY
  var parts = s.split('/');
  if (parts.length === 3) {
    var dd = parts[0], mm = parts[1], yyyy = parts[2];
    if (mm.length <= 2 && dd.length <= 2) {
      // Podría ser DD/MM/YYYY o MM/DD/YYYY — asumir DD/MM/YYYY (Chile)
      var d2 = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!isNaN(d2.getTime())) {
        return Utilities.formatDate(d2, TIMEZONE, 'yyyy-MM-dd');
      }
    }
  }

  return s; // Devolver tal cual como último recurso
}

/**
 * Retorna el nombre del día en español para una fecha "YYYY-MM-DD".
 */
function getDayName_(dateKey) {
  if (!dateKey) return '';
  var parts = dateKey.split('-');
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return names[d.getDay()] || '';
}

/**
 * Formatea una fecha "YYYY-MM-DD" en español: "lunes 14 de abril de 2026"
 */
function formatDateES_(dateKey) {
  if (!dateKey) return '';
  var parts = dateKey.split('-');
  if (parts.length < 3) return dateKey;

  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  return days[d.getDay()] + ' ' + parts[2] + ' de ' + months[Number(parts[1]) - 1] + ' de ' + parts[0];
}

// ═══════════════════════════════════════════════════════════════════════
//  RESPUESTAS JSON / JSONP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Respuesta exitosa. Si hay callback, devuelve JSONP; si no, JSON puro.
 *
 * @param {Object} data - Datos a incluir en la respuesta
 * @param {string|null} cb - Nombre de la función callback JSONP (o null)
 * @returns {TextOutput}
 */
function jsonOk_(data, cb) {
  var payload = JSON.stringify(Object.assign({ ok: true }, data));
  return wrapCb_(payload, cb);
}

/**
 * Respuesta de error. Si hay callback, devuelve JSONP; si no, JSON puro.
 *
 * @param {string} msg - Mensaje de error
 * @param {number} code - Código HTTP (no se puede cambiar en GAS, es informativo)
 * @param {string|null} cb - Nombre de la función callback JSONP (o null)
 * @returns {TextOutput}
 */
function jsonError_(msg, code, cb) {
  var payload = JSON.stringify({ ok: false, error: msg, code: code || 500 });
  return wrapCb_(payload, cb);
}

/**
 * Envuelve un payload JSON en una función JSONP si hay callback.
 * Si no hay callback, devuelve JSON puro (para fetch() normal).
 *
 * @param {string} jsonText - El JSON ya serializado
 * @param {string|null} cb - Nombre de la función callback (puede ser undefined/null/'')
 * @returns {TextOutput}
 */
function wrapCb_(jsonText, cb) {
  if (cb) {
    // JSONP — el navegador lo ejecuta directamente desde una etiqueta <script>
    return ContentService
      .createTextOutput(cb + '(' + jsonText + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  // JSON puro — para fetch() con CORS habilitado
  return ContentService
    .createTextOutput(jsonText)
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════
//  SETUP — Verifica y crea las 6 hojas si no existen
//  Ejecutar manualmente UNA vez después de desplegar el script
// ═══════════════════════════════════════════════════════════════════════

/**
 * Función de configuración inicial.
 * Verifica que las 6 hojas existan con sus encabezados correctos.
 * Precarga disponibilidad para los próximos 60 días hábiles.
 * Ejecutar desde el editor de GAS: Ejecutar → setup
 */
function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── Verificar / crear hoja PACIENTES ─────────────────────────────────
  ensureSheet_(ss, SHEET_PACIENTES, [
    'Ticket','Nombre','Email','Teléfono','RUT','Edad','Ocupación',
    'Peso','Talla','IMC','Motivo','FechaCita','HoraCita','Estado',
    'Comprobante','WANotificado','FechaRegistro','NotasInternas'
  ]);

  // ── Verificar / crear hoja FORMULARIO_CLINICO ─────────────────────────
  ensureSheet_(ss, SHEET_FORMULARIO, [
    'Ticket','Nombre','Email','Teléfono','RUT','Edad','Ocupación','Peso','Talla','IMC',
    'Motivo','FechaCita','HoraCita',
    'Enfermedades','Lesiones','AntecedFamiliar','Cirugias',
    'Convivencia','ActFisica','HorarioLaboral','HorarioSueno',
    'NoLeGustan','AlmuerzFrecuente','HorariosComida','Alergias',
    'Suplementos','Alcohol','TabacoDrogas','SintomasGastro',
    'Cereales','Legumbres','Pescado','Fruta','Verduras','Dulces','Lacteos',
    'Registro24h','FechaRegistro'
  ]);

  // ── Verificar / crear hoja CITAS ──────────────────────────────────────
  ensureSheet_(ss, SHEET_CITAS, [
    'Ticket','Nombre','Email','Tel','Fecha','Hora','Duración',
    'Modalidad','Estado','SalaJitsi','WAP','WAN','Notas'
  ]);

  // ── Verificar / crear hoja PAGOS ──────────────────────────────────────
  ensureSheet_(ss, SHEET_PAGOS, [
    'Ticket','Nombre','FechaCita','Monto','Método','Estado',
    'FechaTransf','CompRecib','UrlArchivo','RUTTitular','Banco','Notas'
  ]);

  // ── Verificar / crear hoja DISPONIBILIDAD ────────────────────────────
  ensureSheet_(ss, SHEET_DISPONIBILIDAD, [
    'Fecha','Día','Hora','Disponible','TicketReservado','NombrePaciente'
  ]);

  // ── Verificar / crear hoja VIDEOLLAMADAS ──────────────────────────────
  ensureSheet_(ss, SHEET_VIDEOLLAMADAS, [
    'Ticket','Nombre','Fecha','HoraInicio','HoraFin','Duración',
    'Sala','Estado','Grabación','Calidad','Notas'
  ]);

  // ── Precargar disponibilidad para los próximos 60 días hábiles ────────
  precargarDisponibilidad_(ss);

  Logger.log('✅ Setup completado. Hojas verificadas y disponibilidad precargada.');
  SpreadsheetApp.getUi().alert('✅ Setup NutriAge v5 completado correctamente.\nHojas verificadas: 6\nDisponibilidad precargada para los próximos 60 días hábiles.');
}

/**
 * Verifica que una hoja exista; si no, la crea con título en fila 1
 * y encabezados en fila 3 (DATA_START_ROW - 1).
 */
function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Hoja creada: ' + name);
  }

  // Escribir título en fila 1
  sheet.getRange(1, 1).setValue('NutriAge — ' + name);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);

  // Escribir encabezados en fila 3
  var headRow = DATA_START_ROW - 1;
  for (var i = 0; i < headers.length; i++) {
    var cell = sheet.getRange(headRow, i + 1);
    cell.setValue(headers[i]);
    cell.setFontWeight('bold');
    cell.setBackground('#3d2459');
    cell.setFontColor('#ffffff');
  }
}

/**
 * Precarga disponibilidad para los próximos 60 días hábiles (lunes a viernes)
 * con horarios de 09:00 a 21:00, si la hoja está vacía.
 */
function precargarDisponibilidad_(ss) {
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return;

  // Solo precargar si está vacía (no sobrescribir data existente)
  if (sheet.getLastRow() >= DATA_START_ROW) {
    Logger.log('DISPONIBILIDAD ya tiene datos — omitiendo precarga');
    return;
  }

  var ALL_TIMES = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
  var today = new Date();
  var rows  = [];

  for (var i = 1; i <= 90; i++) {
    var d   = new Date(today);
    d.setDate(today.getDate() + i);
    var dow = d.getDay();
    if (dow < 1 || dow > 5) continue; // Solo lunes–viernes

    var dateKey = Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
    var dayName = getDayName_(dateKey);

    ALL_TIMES.forEach(function(t) {
      rows.push([dateKey, dayName, t, 'Sí', '', '']);
    });

    if (rows.length >= 60 * ALL_TIMES.length) break;
  }

  if (rows.length > 0) {
    sheet.getRange(DATA_START_ROW, 1, rows.length, 6).setValues(rows);
    Logger.log('Precargadas ' + rows.length + ' filas de disponibilidad');
  }
}
