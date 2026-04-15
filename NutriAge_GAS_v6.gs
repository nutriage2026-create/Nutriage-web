// ═══════════════════════════════════════════════════════════════════════
//  NutriAge GAS v6 — Google Apps Script Backend API
//  Autor: Desarrollado para Fernanda Ugarte · nutriage2026@gmail.com
//  Descripción: Backend con JSONP, PAGOS cruzados, stats en tiempo real,
//               saveProfile, updateEstadoPago y sincronizarTodo completo.
//  Cambios v6:
//    - getPatientsFromSheet_ cruza PAGOS → retorna pagoEstado + comprobanteUrl
//    - sincronizarTodo retorna stats{total,hoy,mes,ingresosHoy,ingresosMes,pendientePago}
//    - Nueva acción: updateEstadoPago
//    - Nueva acción: saveProfile
//    - Nueva acción: updateCitaEstado
// ═══════════════════════════════════════════════════════════════════════

// ─── CONFIGURACIÓN GLOBAL ───────────────────────────────────────────────
var SPREADSHEET_ID   = '1oAqHjZqkaoIrwkPyh4qjN32dUs_wKt7oEnJYPh_CrGs';
var DATA_START_ROW   = 4;   // Fila 1=título, 2=vacía, 3=encabezados, 4+=datos
var NUTRI_EMAIL      = 'nutriage2026@gmail.com';
var NUTRI_WA         = '56971246200';
var PRECIO_CONSULTA  = 15000;
var TIMEZONE         = 'America/Santiago';
var VERSION          = 6;

// ─── NOMBRES DE HOJAS ───────────────────────────────────────────────────
var SHEET_PACIENTES         = 'PACIENTES';
var SHEET_FORMULARIO        = 'FORMULARIO_CLINICO';
var SHEET_CITAS             = 'CITAS';
var SHEET_PAGOS             = 'PAGOS';
var SHEET_DISPONIBILIDAD    = 'DISPONIBILIDAD';
var SHEET_VIDEOLLAMADAS     = 'VIDEOLLAMADAS';

// ═══════════════════════════════════════════════════════════════════════
//  ENTRY POINT — doGet
// ═══════════════════════════════════════════════════════════════════════
function doGet(e) {
  var cb     = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;
  var action = (e && e.parameter && e.parameter.action)   ? e.parameter.action   : '';

  try {
    var result;
    switch (action) {
      case 'ping':                result = jsonOk_({ message: 'NutriAge GAS v6 activo', version: VERSION }, cb); break;
      case 'getAvailability':     result = handleGetAvailability_(e, cb);    break;
      case 'registerPatient':     result = handleRegisterPatient_(e, cb);    break;
      case 'uploadComprobante':   result = handleUploadComprobante_(e, cb);  break;
      case 'saveNutriTimes':      result = handleSaveNutriTimes_(e, cb);     break;
      case 'sincronizarTodo':     result = handleSincronizarTodo_(e, cb);    break;
      case 'getPatientByTicket':  result = handleGetPatientByTicket_(e, cb); break;
      case 'markWaNotificado':    result = handleMarkWaNotificado_(e, cb);   break;
      case 'updateEstadoPago':    result = handleUpdateEstadoPago_(e, cb);   break;
      case 'updateCitaEstado':    result = handleUpdateCitaEstado_(e, cb);   break;
      case 'saveProfile':         result = handleSaveProfile_(e, cb);        break;
      default:                    result = jsonError_('Acción no reconocida: ' + action, 400, cb); break;
    }
    return result;
  } catch (err) {
    Logger.log('doGet ERROR: ' + err.message + ' | action=' + action);
    return jsonError_('Error interno: ' + err.message, 500, cb);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HANDLERS
// ═══════════════════════════════════════════════════════════════════════

function handleGetAvailability_(e, cb) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return jsonError_('Hoja DISPONIBILIDAD no encontrada', 404, cb);

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return jsonOk_({ availability: {} }, cb);

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();
  var availability = {};

  data.forEach(function(row) {
    var dateKey    = toDateKey_(row[0]);
    var hora       = String(row[2] || '').trim();
    var disponible = String(row[3] || '').trim().toLowerCase();
    if (!dateKey || !hora) return;
    if (disponible === 'sí' || disponible === 'si' || disponible === 'true' || disponible === '1') {
      if (!availability[dateKey]) availability[dateKey] = [];
      if (availability[dateKey].indexOf(hora) < 0) availability[dateKey].push(hora);
    }
  });

  Object.keys(availability).forEach(function(k) { availability[k].sort(); });
  return jsonOk_({ availability: availability }, cb);
}

function handleRegisterPatient_(e, cb) {
  var p = e.parameter;
  if (!p.nombre || !p.email || !p.date || !p.time) {
    return jsonError_('Faltan campos obligatorios: nombre, email, date, time', 400, cb);
  }

  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var now    = new Date();
  var ticket = generarTicket_(p.date, ss);

  // 1. PACIENTES (18 cols)
  var shPac = ss.getSheetByName(SHEET_PACIENTES);
  if (shPac) {
    var imc = calcularIMC_(p.peso, p.talla);
    shPac.appendRow([
      ticket, p.nombre||'', p.email||'', p.telefono||'', p.rut||'', p.edad||'',
      p.ocupacion||'', p.peso||'', p.talla||'', imc, p.motivo||'',
      p.date||'', p.time||'', 'Confirmado', '', 'No',
      Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'), ''
    ]);
  }

  // 2. FORMULARIO_CLINICO (38 cols)
  var shForm = ss.getSheetByName(SHEET_FORMULARIO);
  if (shForm) {
    shForm.appendRow([
      ticket, p.nombre||'', p.email||'', p.telefono||'', p.rut||'',
      p.edad||'', p.ocupacion||'', p.peso||'', p.talla||'', calcularIMC_(p.peso,p.talla),
      p.motivo||'', p.date||'', p.time||'',
      p.enfermedad||'', p.lesion||'', p.familiar||'', p.cirugia||'',
      p.convivencia||'', p.actividad||'', p.horario||'', p.sueno||'',
      p.nodislike||'', p.almuerzo||'', p.horcomida||'', p.alergias||'',
      p.suplemento||'', p.alcohol||'', p.tabaco||'', p.gastro||'',
      p.cereales||'', p.legumbres||'', p.pescado||'', p.fruta||'',
      p.verduras||'', p.dulces||'', p.lacteos||'', p.registro24||'',
      Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
    ]);
  }

  // 3. CITAS (13 cols)
  var shCitas = ss.getSheetByName(SHEET_CITAS);
  if (shCitas) {
    var jitsiSeed = String(p.telefono || ticket).replace(/[^0-9a-zA-Z]/g, '');
    shCitas.appendRow([
      ticket, p.nombre||'', p.email||'', p.telefono||'',
      p.date||'', p.time||'', '45 min', 'Online', 'Confirmada',
      'NutriAge_' + jitsiSeed, 'Pendiente', 'Pendiente', ''
    ]);
  }

  // 4. PAGOS (12 cols)
  var shPagos = ss.getSheetByName(SHEET_PAGOS);
  if (shPagos) {
    shPagos.appendRow([
      ticket, p.nombre||'', p.date||'', PRECIO_CONSULTA,
      'Transferencia', 'Pendiente verificación',
      '', 'No', '', '', '', ''
    ]);
  }

  // 5. Marcar slot reservado
  marcarSlotReservado_(ss, p.date, p.time, ticket, p.nombre);

  // 6. Emails
  try { enviarEmailConfirmacion_(p, ticket); } catch(eErr) { Logger.log('Email error: '+eErr.message); }
  try { enviarEmailNutri_(p, ticket); }       catch(eErr) { Logger.log('Email Nutri error: '+eErr.message); }

  return jsonOk_({ ticket: ticket, message: 'Paciente registrado exitosamente' }, cb);
}

function handleUploadComprobante_(e, cb) {
  var p = e.parameter;
  if (!p.ticket || !p.comprobanteBase64) {
    return jsonError_('Faltan parámetros: ticket, comprobanteBase64', 400, cb);
  }
  try {
    var b64 = p.comprobanteBase64;
    if (b64.indexOf(',') > -1) b64 = b64.split(',')[1];
    var mime     = p.mimeType || 'image/jpeg';
    var filename = p.nombreArchivo || ('comprobante_' + p.ticket + '.jpg');
    var decoded  = Utilities.base64Decode(b64);
    var blob     = Utilities.newBlob(decoded, mime, filename);
    var file     = DriveApp.createFile(blob);
    file.setName(filename);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = file.getUrl();

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 15, url); // Comprobante
    actualizarCeldaPorTicket_(ss, SHEET_PAGOS,     p.ticket, 8,  'Sí'); // CompRecib
    actualizarCeldaPorTicket_(ss, SHEET_PAGOS,     p.ticket, 9,  url);  // UrlArchivo
    actualizarCeldaPorTicket_(ss, SHEET_PAGOS,     p.ticket, 6,  Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss')); // FechaTransf

    return jsonOk_({ url: url }, cb);
  } catch (err) {
    return jsonError_('Error subiendo comprobante: ' + err.message, 500, cb);
  }
}

function handleSaveNutriTimes_(e, cb) {
  var p = e.parameter;
  if (!p.date) return jsonError_('Falta parámetro: date', 400, cb);

  var times = [];
  try { times = p.times ? JSON.parse(p.times) : []; }
  catch(err) { times = p.times ? p.times.split(',') : []; }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return jsonError_('Hoja DISPONIBILIDAD no encontrada', 404, cb);

  var dateKey = p.date;
  var dayName = getDayName_(dateKey);

  // Eliminar filas existentes para esa fecha
  var lastRow = sheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (toDateKey_(data[i][0]) === dateKey) sheet.deleteRow(DATA_START_ROW + i);
    }
  }

  // Insertar nuevas filas
  var ALL_TIMES = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
  ALL_TIMES.forEach(function(t) {
    sheet.appendRow([dateKey, dayName, t, (times.indexOf(t) >= 0) ? 'Sí' : 'No', '', '']);
  });

  return jsonOk_({ message: 'Horarios guardados para ' + dateKey }, cb);
}

/**
 * Sincroniza todo el sistema. Retorna patients (con datos de PAGOS cruzados),
 * availability y estadísticas calculadas en tiempo real.
 */
function handleSincronizarTodo_(e, cb) {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var patients = getPatientsFromSheet_(ss);
  var avail    = getAvailabilityFromSheet_(ss);

  // Calcular stats en tiempo real
  var now             = new Date();
  var todayKey        = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  var thisMonthPrefix = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM');

  var todayCount     = 0;
  var monthCount     = 0;
  var pendientePago  = 0;
  var compRecibidos  = 0;

  patients.forEach(function(p) {
    if (p.date === todayKey)                                    todayCount++;
    if ((p.date || '').indexOf(thisMonthPrefix) === 0)          monthCount++;
    if ((p.pagoEstado || '').toLowerCase().indexOf('pendiente') >= 0) pendientePago++;
    if (p.compRecib === 'Sí' || p.compRecib === 'Si')           compRecibidos++;
  });

  return jsonOk_({
    patients     : patients,
    availability : avail,
    stats: {
      total             : patients.length,
      hoy               : todayCount,
      mes               : monthCount,
      ingresosHoy       : todayCount  * PRECIO_CONSULTA,
      ingresosMes       : monthCount  * PRECIO_CONSULTA,
      ingresosTotal     : patients.length * PRECIO_CONSULTA,
      pendientePago     : pendientePago,
      compRecibidos     : compRecibidos
    }
  }, cb);
}

function handleGetPatientByTicket_(e, cb) {
  var p = e.parameter;
  if (!p.ticket) return jsonError_('Falta parámetro: ticket', 400, cb);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_PACIENTES);
  if (!sheet) return jsonOk_({ found: false }, cb);

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return jsonOk_({ found: false }, cb);

  var data   = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 18).getValues();
  var ticket = p.ticket.trim().toUpperCase();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === ticket) {
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

function handleMarkWaNotificado_(e, cb) {
  var p = e.parameter;
  if (!p.ticket) return jsonError_('Falta parámetro: ticket', 400, cb);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 16, 'Sí');
  return jsonOk_({ message: 'WA notificado marcado' }, cb);
}

/**
 * Actualiza el estado de pago de un ticket en la hoja PAGOS.
 * Parámetros: ticket, estado ('Pendiente verificación' | 'Verificado' | 'Rechazado')
 */
function handleUpdateEstadoPago_(e, cb) {
  var p = e.parameter;
  if (!p.ticket || !p.estado) return jsonError_('Faltan: ticket, estado', 400, cb);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  actualizarCeldaPorTicket_(ss, SHEET_PAGOS, p.ticket, 6, p.estado); // col 6 = Estado
  return jsonOk_({ message: 'Estado de pago actualizado' }, cb);
}

/**
 * Actualiza el estado de una cita en la hoja CITAS.
 * Parámetros: ticket, estado ('Confirmada' | 'Atendida' | 'Cancelada')
 */
function handleUpdateCitaEstado_(e, cb) {
  var p = e.parameter;
  if (!p.ticket || !p.estado) return jsonError_('Faltan: ticket, estado', 400, cb);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  actualizarCeldaPorTicket_(ss, SHEET_CITAS, p.ticket, 9, p.estado); // col 9 = Estado
  // Si la cita es atendida, actualizar también en PACIENTES
  if (p.estado === 'Atendida') {
    actualizarCeldaPorTicket_(ss, SHEET_PACIENTES, p.ticket, 14, 'Atendido');
  }
  return jsonOk_({ message: 'Estado de cita actualizado' }, cb);
}

/**
 * Guarda el perfil de la nutricionista en una hoja de configuración.
 * Parámetros: nombre, email, telefono, rut
 */
function handleSaveProfile_(e, cb) {
  var p  = e.parameter;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Guardar en la hoja PACIENTES fila especial de configuración (fuera del rango de datos)
  // Para simplicidad, registramos en el Logger — la configuración vive en localStorage
  Logger.log('saveProfile: ' + JSON.stringify({ nombre: p.nombre, email: p.email, telefono: p.telefono, rut: p.rut }));
  return jsonOk_({ message: 'Perfil recibido', nombre: p.nombre || '' }, cb);
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lee todos los pacientes de PACIENTES y cruza con PAGOS para obtener
 * pagoEstado, compRecib y comprobanteUrl en tiempo real.
 */
function getPatientsFromSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_PACIENTES);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 18).getValues();

  // ── Cruzar con PAGOS para obtener estado de pago y URL del comprobante ──
  var pagosMap = {};
  var shPagos  = ss.getSheetByName(SHEET_PAGOS);
  if (shPagos) {
    var pagosLastRow = shPagos.getLastRow();
    if (pagosLastRow >= DATA_START_ROW) {
      var pagosData = shPagos.getRange(DATA_START_ROW, 1, pagosLastRow - DATA_START_ROW + 1, 12).getValues();
      // Columnas PAGOS: Ticket(0)|Nombre(1)|FechaCita(2)|Monto(3)|Método(4)|Estado(5)|
      //                FechaTransf(6)|CompRecib(7)|UrlArchivo(8)|RUTTitular(9)|Banco(10)|Notas(11)
      pagosData.forEach(function(row) {
        var t = String(row[0] || '').trim().toUpperCase();
        if (!t) return;
        pagosMap[t] = {
          pagoEstado     : String(row[5] || 'Pendiente verificación'),
          compRecib      : String(row[7] || 'No'),
          comprobanteUrl : String(row[8] || '')
        };
      });
    }
  }

  var patients = [];
  data.forEach(function(row) {
    var ticket = String(row[0] || '').trim();
    if (!ticket) return;

    var fechaKey = toDateKey_(row[11]);
    var pago     = pagosMap[ticket.toUpperCase()] || { pagoEstado: 'Pendiente', compRecib: 'No', comprobanteUrl: '' };

    patients.push({
      id             : ticket,
      ticket         : ticket,
      nombre         : String(row[1]  || ''),
      email          : String(row[2]  || ''),
      telefono       : String(row[3]  || ''),
      rut            : String(row[4]  || ''),
      edad           : String(row[5]  || ''),
      ocupacion      : String(row[6]  || ''),
      peso           : String(row[7]  || ''),
      talla          : String(row[8]  || ''),
      imc            : String(row[9]  || ''),
      motivo         : String(row[10] || ''),
      date           : fechaKey,
      dateFormatted  : formatDateES_(fechaKey),
      time           : String(row[12] || ''),
      status         : String(row[13] || 'Activo'),
      // Datos de pago desde PAGOS (tiempo real)
      pagoEstado     : pago.pagoEstado,
      compRecib      : pago.compRecib,
      comprobante    : pago.comprobanteUrl || null,  // URL del comprobante en Drive
      comprobanteUrl : pago.comprobanteUrl || null,
      waNotificado   : String(row[15] || 'No'),
      nutricionista  : 'Fernanda Ugarte',
      consultations  : 1
    });
  });

  return patients;
}

function getAvailabilityFromSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return {};

  var data  = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();
  var avail = {};

  data.forEach(function(row) {
    var dateKey    = toDateKey_(row[0]);
    var hora       = String(row[2] || '').trim();
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

function generarTicket_(dateKey, ss) {
  var datePart = (dateKey || '').replace(/-/g, '');
  var sheet    = ss.getSheetByName(SHEET_PACIENTES);
  var count    = 1;
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= DATA_START_ROW) {
      var tickets = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
      tickets.forEach(function(r) { if (String(r[0]||'').indexOf('NA-'+datePart) === 0) count++; });
    }
  }
  return 'NA-' + datePart + '-' + String(count).padStart(3, '0');
}

function marcarSlotReservado_(ss, dateKey, hora, ticket, nombre) {
  var sheet = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;
  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (toDateKey_(data[i][0]) === dateKey && String(data[i][2]||'').trim() === hora) {
      var rowNum = DATA_START_ROW + i;
      sheet.getRange(rowNum, 4).setValue('No');
      sheet.getRange(rowNum, 5).setValue(ticket);
      sheet.getRange(rowNum, 6).setValue(nombre);
      return;
    }
  }
  sheet.appendRow([dateKey, getDayName_(dateKey), hora, 'No', ticket, nombre || '']);
}

function actualizarCeldaPorTicket_(ss, sheetName, ticket, colNum, value) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;
  var data    = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 1).getValues();
  var ticketUp = String(ticket || '').trim().toUpperCase();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === ticketUp) {
      sheet.getRange(DATA_START_ROW + i, colNum).setValue(value);
      return;
    }
  }
}

function enviarEmailConfirmacion_(p, ticket) {
  var subject = '✅ Confirmación de cita — NutriAge · ' + ticket;
  var body = [
    'Hola ' + (p.nombre || 'Paciente') + ',',
    '', 'Tu cita con Fernanda Ugarte ha sido confirmada exitosamente.',
    '', '📅 Fecha: ' + formatDateES_(p.date),
    '⏰ Hora: ' + p.time + ' hrs',
    '🎫 Tu ticket: ' + ticket,
    '💰 Monto: $15.000 CLP',
    '', 'Modalidad: Videollamada online (recibirás el enlace antes de la consulta)',
    '', 'Si tienes preguntas, escribe a: ' + NUTRI_EMAIL,
    'O por WhatsApp: wa.me/' + NUTRI_WA,
    '', 'Hasta pronto,', 'Fernanda Ugarte — Nutricionista', 'NutriAge 🌿'
  ].join('\n');
  MailApp.sendEmail({ to: p.email, subject: subject, body: body });
}

function enviarEmailNutri_(p, ticket) {
  var subject = '🌱 Nueva cita agendada — ' + (p.nombre || '') + ' · ' + ticket;
  var body = [
    'Nueva reserva recibida en NutriAge.',
    '', '🎫 Ticket: ' + ticket,
    '👤 Paciente: ' + (p.nombre || '—'),
    '📧 Email: ' + (p.email || '—'),
    '📱 Teléfono: ' + (p.telefono || '—'),
    '📅 Fecha: ' + formatDateES_(p.date),
    '⏰ Hora: ' + p.time + ' hrs',
    '🎯 Motivo: ' + (p.motivo || '—'),
    '⚖️ Peso: ' + (p.peso || '—') + ' | Talla: ' + (p.talla || '—'),
    '', 'Revisa la hoja de cálculo para más detalles.',
    '', '— Sistema NutriAge v6'
  ].join('\n');
  MailApp.sendEmail({ to: NUTRI_EMAIL, subject: subject, body: body });
}

function calcularIMC_(peso, talla) {
  var p = parseFloat(String(peso  || '').replace(/[^0-9.]/g, ''));
  var t = parseFloat(String(talla || '').replace(/[^0-9.]/g, ''));
  if (!p || !t || t < 0.5) return '';
  if (t > 3) t = t / 100;
  return (p / (t * t)).toFixed(1);
}

function toDateKey_(cellValue) {
  if (!cellValue) return '';
  if (cellValue instanceof Date) {
    if (isNaN(cellValue.getTime())) return '';
    return Utilities.formatDate(cellValue, TIMEZONE, 'yyyy-MM-dd');
  }
  var s = String(cellValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  var parts = s.split('/');
  if (parts.length === 3) {
    var d2 = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, TIMEZONE, 'yyyy-MM-dd');
  }
  return s;
}

function getDayName_(dateKey) {
  if (!dateKey) return '';
  var parts = dateKey.split('-');
  var d     = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getDay()] || '';
}

function formatDateES_(dateKey) {
  if (!dateKey) return '';
  var parts = dateKey.split('-');
  if (parts.length < 3) return dateKey;
  var d      = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return days[d.getDay()] + ' ' + parts[2] + ' de ' + months[Number(parts[1]) - 1] + ' de ' + parts[0];
}

// ─── JSONP / JSON ───────────────────────────────────────────────────────
function jsonOk_(data, cb) {
  return wrapCb_(JSON.stringify(Object.assign({ ok: true }, data)), cb);
}
function jsonError_(msg, code, cb) {
  return wrapCb_(JSON.stringify({ ok: false, error: msg, code: code || 500 }), cb);
}
function wrapCb_(jsonText, cb) {
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + jsonText + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(jsonText)
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════
//  SETUP — Ejecutar UNA vez desde el editor GAS
// ═══════════════════════════════════════════════════════════════════════
function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  ensureSheet_(ss, SHEET_PACIENTES, [
    'Ticket','Nombre','Email','Teléfono','RUT','Edad','Ocupación',
    'Peso','Talla','IMC','Motivo','FechaCita','HoraCita','Estado',
    'Comprobante','WANotificado','FechaRegistro','NotasInternas'
  ]);

  ensureSheet_(ss, SHEET_FORMULARIO, [
    'Ticket','Nombre','Email','Teléfono','RUT','Edad','Ocupación','Peso','Talla','IMC',
    'Motivo','FechaCita','HoraCita',
    'Enfermedades','Lesiones','AntecedFamiliar','Cirugias',
    'Convivencia','ActividadFisica','HorarioLaboral','Sueno',
    'AlimNoGusta','Almuerzo','HorarioComida','Alergias',
    'Suplementos','Alcohol','TabacoDrogas','Gastro',
    'Cereales','Legumbres','Pescado','Fruta','Verduras','Dulces','Lacteos',
    'Registro24h','FechaRegistro'
  ]);

  ensureSheet_(ss, SHEET_CITAS, [
    'Ticket','Nombre','Email','Teléfono','FechaCita','HoraCita',
    'Duración','Modalidad','Estado','SalaJitsi','WAPaciente','WANutri','Notas'
  ]);

  ensureSheet_(ss, SHEET_PAGOS, [
    'Ticket','Nombre','FechaCita','Monto','Método','Estado',
    'FechaTransf','CompRecib','UrlArchivo','RUTTitular','Banco','Notas'
  ]);

  ensureSheet_(ss, SHEET_DISPONIBILIDAD, [
    'Fecha','Día','Hora','Disponible','TicketReservado','NombrePaciente'
  ]);

  ensureSheet_(ss, SHEET_VIDEOLLAMADAS, [
    'Ticket','Nombre','FechaCita','HoraCita','SalaJitsi',
    'InicioLlamada','FinLlamada','Duración','Estado','URLGrabacion','Notas'
  ]);

  // Precargar disponibilidad para los próximos 30 días hábiles
  var shDisp = ss.getSheetByName(SHEET_DISPONIBILIDAD);
  var today  = new Date();
  var added  = 0;
  var day    = new Date(today);
  day.setDate(day.getDate() + 1);
  var ALL_TIMES = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

  while (added < 30) {
    var dow = day.getDay();
    if (dow >= 1 && dow <= 5) { // lunes-viernes
      var dk = Utilities.formatDate(day, TIMEZONE, 'yyyy-MM-dd');
      var dn = getDayName_(dk);
      ALL_TIMES.forEach(function(t) {
        shDisp.appendRow([dk, dn, t, 'Sí', '', '']);
      });
      added++;
    }
    day.setDate(day.getDate() + 1);
  }

  Logger.log('✅ Setup NutriAge v6 completo. Hojas verificadas, disponibilidad precargada.');
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Hoja creada: ' + name);
  }
  // Fila 3 = encabezados
  if (sheet.getLastRow() < 3) {
    sheet.getRange(3, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(3, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#3d2459')
      .setFontColor('#ffffff');
  }
  return sheet;
}
