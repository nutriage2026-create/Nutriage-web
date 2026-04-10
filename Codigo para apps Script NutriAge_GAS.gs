// ============================================================
//  NutriAge · Google Apps Script — Backend completo
//  Autor: generado para Fernanda Ugarte · NutriAge
//  Versión: 2.0
//  Descripción: API REST sobre Google Sheets. Recibe datos
//  desde el sitio web y los sirve de vuelta en tiempo real.
// ============================================================

// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN GLOBAL  (editar sólo esta sección)
// ─────────────────────────────────────────────────────────────
var CONFIG = {
  SPREADSHEET_ID    : "PEGAR_ID_DE_TU_GOOGLE_SHEET_AQUI",   // ← OBLIGATORIO
  NUTRI_EMAIL       : "fernanda@tucorreo.cl",                // ← OBLIGATORIO
  NUTRI_WA          : "56912345678",                         // ← sin + ni espacios
  PRECIO_CONSULTA   : 15000,                                 // CLP
  TICKET_PREFIX     : "NA",
  DURACION_SLOT_MIN : 45,
  CORS_ORIGIN       : "*",                                   // En producción pon tu dominio

  // Nombres exactos de las hojas (deben coincidir con el Excel)
  SH_PACIENTES      : "PACIENTES",
  SH_FORM           : "FORMULARIO_CLINICO",
  SH_CITAS          : "CITAS",
  SH_PAGOS          : "PAGOS",
  SH_DISPONIBILIDAD : "DISPONIBILIDAD",
  SH_VIDEO          : "VIDEOLLAMADAS",

  // Fila donde empiezan los datos (la 3 es el encabezado en el Excel)
  DATA_START_ROW    : 4
};

// ─────────────────────────────────────────────────────────────
//  CORS · respuesta estándar OPTIONS
// ─────────────────────────────────────────────────────────────
function setCORSHeaders_(output) {
  output.setHeader("Access-Control-Allow-Origin",  CONFIG.CORS_ORIGIN);
  output.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  output.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return output;
}

function doOptions() {
  var output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  return setCORSHeaders_(output);
}

// ─────────────────────────────────────────────────────────────
//  UTILIDADES GENERALES
// ─────────────────────────────────────────────────────────────

/** Devuelve el Spreadsheet abierto */
function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** Devuelve una hoja por nombre */
function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Hoja no encontrada: " + name);
  return sh;
}

/** Respuesta JSON con CORS */
function jsonResponse_(data) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return setCORSHeaders_(output);
}

/** Respuesta de error JSON */
function errorResponse_(msg, code) {
  return jsonResponse_({ ok: false, error: msg, code: code || 400 });
}

/** Fecha actual en zona horaria Chile como string YYYY-MM-DD */
function todayKey_() {
  var d = new Date();
  var tz = "America/Santiago";
  var fmt = Utilities.formatDate(d, tz, "yyyy-MM-dd");
  return fmt;
}

/** Formatea una fecha YYYY-MM-DD a texto legible en español */
function formatDateES_(key) {
  if (!key) return "";
  var parts = key.split("-");
  if (parts.length !== 3) return key;
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var days  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var months= ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
               "septiembre","octubre","noviembre","diciembre"];
  return days[d.getDay()] + " " + parts[2] + " de " + months[Number(parts[1])-1] + " de " + parts[0];
}

/** Genera ticket al estilo NA-YYYYMMDD-NNN */
function generarTicket_(dateKey) {
  var sh = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  var datePart = dateKey.replace(/-/g, "");
  var prefix   = CONFIG.TICKET_PREFIX + "-" + datePart + "-";
  var count = 0;

  if (lastRow >= CONFIG.DATA_START_ROW) {
    var tickets = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
    tickets.forEach(function(row) {
      if (String(row[0]).indexOf(prefix) === 0) count++;
    });
  }
  count++;
  return prefix + String(count).padStart(3, "0");
}

/** Busca un paciente por ticket. Retorna {rowIndex, data} o null */
function findPatientByTicket_(ticket) {
  var sh = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return null;

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 18).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(ticket)) {
      return { rowIndex: i + CONFIG.DATA_START_ROW, data: data[i] };
    }
  }
  return null;
}

/** Valida que los campos requeridos existan en el objeto */
function validateRequired_(obj, fields) {
  var missing = [];
  fields.forEach(function(f) {
    if (!obj[f] || String(obj[f]).trim() === "") missing.push(f);
  });
  return missing;
}

// ─────────────────────────────────────────────────────────────
//  doGET · enrutador principal
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var action = e.parameter.action || "";

    switch (action) {

      case "getAvailability":
        return handleGetAvailability_(e);

      case "getAvailabilityByDate":
        return handleGetAvailabilityByDate_(e);

      case "getPatientByTicket":
        return handleGetPatientByTicket_(e);

      case "getDashboard":
        return handleGetDashboard_(e);

      case "getAppointments":
        return handleGetAppointments_(e);

      case "getAllPatients":
        return handleGetAllPatients_(e);

      case "ping":
        return jsonResponse_({ ok: true, message: "NutriAge GAS activo", ts: new Date().toISOString() });

      default:
        return errorResponse_("Acción GET no reconocida: " + action);
    }
  } catch (err) {
    Logger.log("doGet error: " + err.message);
    return errorResponse_("Error interno: " + err.message, 500);
  }
}

// ─────────────────────────────────────────────────────────────
//  doPost · enrutador principal
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || e.parameter.action || "";

    switch (action) {

      case "registerPatient":
        return handleRegisterPatient_(body);

      case "uploadComprobante":
        return handleUploadComprobante_(body);

      case "updateCitaStatus":
        return handleUpdateCitaStatus_(body);

      case "blockSlot":
        return handleBlockSlot_(body);

      case "unblockSlot":
        return handleUnblockSlot_(body);

      case "saveNutriTimes":
        return handleSaveNutriTimes_(body);

      case "logVideollamada":
        return handleLogVideollamada_(body);

      case "markWaNotificado":
        return handleMarkWaNotificado_(body);

      default:
        return errorResponse_("Acción POST no reconocida: " + action);
    }
  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return errorResponse_("Error interno: " + err.message, 500);
  }
}

// ═════════════════════════════════════════════════════════════
//  HANDLERS GET
// ═════════════════════════════════════════════════════════════

/**
 * GET ?action=getAvailability
 * Retorna todas las fechas y horarios disponibles (sin reservar).
 * La web usa esto para pintar el calendario del paciente.
 */
function handleGetAvailability_(e) {
  var sh = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();

  if (lastRow < CONFIG.DATA_START_ROW) {
    return jsonResponse_({ ok: true, availability: {} });
  }

  // Columnas: A=Fecha, B=Día, C=Hora, D=Disponible, E=Ticket(si reservado)
  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 5).getValues();
  var today = todayKey_();
  var result = {};

  data.forEach(function(row) {
    var fecha     = row[0] ? Utilities.formatDate(new Date(row[0]), "America/Santiago", "yyyy-MM-dd") : "";
    var hora      = String(row[2] || "").trim();
    var disponible= String(row[3] || "").trim().toLowerCase();
    var reservado = String(row[4] || "").trim();

    // Solo fechas futuras o de hoy, disponibles y no reservadas
    if (fecha && fecha >= today && disponible === "sí" && !reservado) {
      if (!result[fecha]) result[fecha] = [];
      if (hora && result[fecha].indexOf(hora) === -1) {
        result[fecha].push(hora);
      }
    }
  });

  // Ordenar horarios dentro de cada día
  Object.keys(result).forEach(function(k) {
    result[k].sort();
  });

  return jsonResponse_({ ok: true, availability: result });
}

/**
 * GET ?action=getAvailabilityByDate&date=YYYY-MM-DD
 * Retorna solo los slots disponibles de una fecha específica.
 */
function handleGetAvailabilityByDate_(e) {
  var date = e.parameter.date || "";
  if (!date) return errorResponse_("Parámetro 'date' requerido");

  var sh = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonResponse_({ ok: true, slots: [] });

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 5).getValues();
  var slots = [];

  data.forEach(function(row) {
    var fecha     = row[0] ? Utilities.formatDate(new Date(row[0]), "America/Santiago", "yyyy-MM-dd") : "";
    var hora      = String(row[2] || "").trim();
    var disponible= String(row[3] || "").trim().toLowerCase();
    var reservado = String(row[4] || "").trim();

    if (fecha === date && disponible === "sí" && !reservado && hora) {
      slots.push(hora);
    }
  });

  slots.sort();
  return jsonResponse_({ ok: true, date: date, slots: slots });
}

/**
 * GET ?action=getPatientByTicket&ticket=NA-20260410-001
 * Busca un paciente por su número de ticket.
 * Usado en "Ya tengo ticket" para la videollamada.
 */
function handleGetPatientByTicket_(e) {
  var ticket = String(e.parameter.ticket || "").trim().toUpperCase();
  if (!ticket) return errorResponse_("Parámetro 'ticket' requerido");

  var found = findPatientByTicket_(ticket);
  if (!found) return jsonResponse_({ ok: false, found: false, message: "Ticket no encontrado" });

  var d = found.data;
  // Columnas PACIENTES: 0=Ticket,1=Nombre,2=Email,3=Tel,4=RUT,5=Edad,
  // 6=Ocupación,7=Peso,8=Talla,9=IMC,10=Motivo,11=Fecha,12=Hora,
  // 13=Estado,14=Comprobante,15=WA,16=FechaRegistro,17=Notas
  var fechaKey = d[11] ? Utilities.formatDate(new Date(d[11]), "America/Santiago", "yyyy-MM-dd") : "";

  return jsonResponse_({
    ok       : true,
    found    : true,
    ticket   : d[0],
    nombre   : d[1],
    email    : d[2],
    telefono : d[3],
    fecha    : fechaKey,
    dateFormatted: formatDateES_(fechaKey),
    time     : d[12],
    estado   : d[13],
    motivo   : d[10],
    isToday  : (fechaKey === todayKey_())
  });
}

/**
 * GET ?action=getDashboard
 * Retorna métricas en tiempo real para el panel admin/nutri.
 */
function handleGetDashboard_(e) {
  var shP = getSheet_(CONFIG.SH_PACIENTES);
  var shC = getSheet_(CONFIG.SH_CITAS);
  var shPa= getSheet_(CONFIG.SH_PAGOS);

  var today    = todayKey_();
  var thisMonth= today.substring(0, 7); // "YYYY-MM"

  var totalPacientes  = 0;
  var citasHoy        = 0;
  var citasMes        = 0;
  var ingresosVerif   = 0;
  var ingresosRecib   = 0;
  var pendientePago   = 0;
  var completadas     = 0;

  // PACIENTES
  var lastRowP = shP.getLastRow();
  if (lastRowP >= CONFIG.DATA_START_ROW) {
    var pData = shP.getRange(CONFIG.DATA_START_ROW, 1, lastRowP - CONFIG.DATA_START_ROW + 1, 14).getValues();
    pData.forEach(function(row) {
      if (!row[0]) return;
      totalPacientes++;
      var fechaKey = row[11] ? Utilities.formatDate(new Date(row[11]), "America/Santiago", "yyyy-MM-dd") : "";
      if (fechaKey === today)                           citasHoy++;
      if (fechaKey.substring(0,7) === thisMonth)        citasMes++;
      if (String(row[13]) === "Completado")             completadas++;
    });
  }

  // PAGOS
  var lastRowPa = shPa.getLastRow();
  if (lastRowPa >= CONFIG.DATA_START_ROW) {
    var paData = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 12).getValues();
    paData.forEach(function(row) {
      if (!row[0]) return;
      var monto  = Number(row[3]) || 0;
      var estado = String(row[5] || "").trim();
      if (estado === "Verificado") ingresosVerif += monto;
      if (estado === "Recibido")   ingresosRecib += monto;
      if (estado === "Pendiente")  pendientePago += monto;
    });
  }

  return jsonResponse_({
    ok: true,
    dashboard: {
      totalPacientes  : totalPacientes,
      citasHoy        : citasHoy,
      citasMes        : citasMes,
      completadas     : completadas,
      ingresosVerificados: ingresosVerif,
      ingresosRecibidos  : ingresosRecib,
      pendienteCobro     : pendientePago,
      updatedAt          : new Date().toISOString()
    }
  });
}

/**
 * GET ?action=getAppointments&date=YYYY-MM-DD   (opcional filtrar por fecha)
 * Retorna citas para el panel de la nutricionista.
 */
function handleGetAppointments_(e) {
  var filterDate = e.parameter.date || "";
  var sh = getSheet_(CONFIG.SH_CITAS);
  var lastRow = sh.getLastRow();

  if (lastRow < CONFIG.DATA_START_ROW) return jsonResponse_({ ok: true, appointments: [] });

  // Columnas CITAS: 0=Ticket,1=Nombre,2=Email,3=Tel,4=Fecha,5=Hora,
  // 6=Duración,7=Modalidad,8=Estado,9=Sala,10=WAP,11=WAN,12=Notas
  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 13).getValues();
  var appts = [];

  data.forEach(function(row) {
    if (!row[0]) return;
    var fechaKey = row[4] ? Utilities.formatDate(new Date(row[4]), "America/Santiago", "yyyy-MM-dd") : "";
    if (filterDate && fechaKey !== filterDate) return;

    appts.push({
      ticket    : row[0],
      nombre    : row[1],
      email     : row[2],
      telefono  : row[3],
      fecha     : fechaKey,
      fechaFmt  : formatDateES_(fechaKey),
      hora      : row[5],
      duracion  : row[6],
      modalidad : row[7],
      estado    : row[8],
      salaJitsi : row[9],
      notas     : row[12]
    });
  });

  // Ordenar por fecha y hora
  appts.sort(function(a, b) {
    var k1 = a.fecha + " " + (a.hora || "");
    var k2 = b.fecha + " " + (b.hora || "");
    return k1.localeCompare(k2);
  });

  return jsonResponse_({ ok: true, appointments: appts });
}

/**
 * GET ?action=getAllPatients
 * Retorna lista resumida de todos los pacientes (para panel admin).
 */
function handleGetAllPatients_(e) {
  var sh = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonResponse_({ ok: true, patients: [] });

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 18).getValues();
  var patients = [];

  data.forEach(function(row) {
    if (!row[0]) return;
    var fechaKey = row[11] ? Utilities.formatDate(new Date(row[11]), "America/Santiago", "yyyy-MM-dd") : "";
    patients.push({
      ticket       : row[0],
      nombre       : row[1],
      email        : row[2],
      telefono     : row[3],
      rut          : row[4],
      edad         : row[5],
      fecha        : fechaKey,
      fechaFmt     : formatDateES_(fechaKey),
      time         : row[12],
      motivo       : row[10],
      estado       : row[13],
      comprobante  : row[14] ? "Sí" : "No",
      waNotificado : row[15],
      fechaRegistro: row[16] ? Utilities.formatDate(new Date(row[16]), "America/Santiago", "yyyy-MM-dd HH:mm") : ""
    });
  });

  patients.sort(function(a, b) {
    return String(b.fechaRegistro).localeCompare(String(a.fechaRegistro));
  });

  return jsonResponse_({ ok: true, patients: patients, total: patients.length });
}

// ═════════════════════════════════════════════════════════════
//  HANDLERS POST
// ═════════════════════════════════════════════════════════════

/**
 * POST { action:"registerPatient", date, time, nombre, email,
 *         telefono, edad, rut, ocupacion, peso, talla, motivo,
 *         enfermedad, lesion, familiar, cirugia, convivencia,
 *         actividad, horario, sueno, nodislike, almuerzo,
 *         horcomida, alergias, suplemento, alcohol, tabaco,
 *         gastro, cereales, legumbres, pescado, fruta, verduras,
 *         dulces, lacteos, registro24 }
 *
 * 1. Genera ticket
 * 2. Escribe en PACIENTES
 * 3. Escribe en FORMULARIO_CLINICO
 * 4. Escribe en CITAS
 * 5. Escribe en PAGOS
 * 6. Marca slot en DISPONIBILIDAD como reservado
 * 7. Envía email de confirmación al paciente
 * 8. Envía email de aviso a Fernanda
 * Retorna { ok, ticket, dateFormatted }
 */
function handleRegisterPatient_(body) {
  // ── Validación ──────────────────────────────────────────
  var required = ["date","time","nombre","email","telefono","motivo","peso","talla","registro24"];
  var missing  = validateRequired_(body, required);
  if (missing.length > 0) {
    return errorResponse_("Campos requeridos faltantes: " + missing.join(", "));
  }

  var date   = String(body.date).trim();
  var time   = String(body.time).trim();
  var nombre = String(body.nombre).trim();

  // ── Verificar que el slot sigue disponible ───────────────
  var slotLibre = isSlotAvailable_(date, time);
  if (!slotLibre) {
    return errorResponse_("El horario " + date + " " + time + " ya no está disponible.", 409);
  }

  // ── Generar ticket único ─────────────────────────────────
  var ticket = generarTicket_(date);
  var now    = new Date();
  var salaJitsi = "NutriAge_" + String(body.telefono || "").replace(/[^0-9]/g, "");

  // ── 1. HOJA PACIENTES ────────────────────────────────────
  // Columnas: Ticket|Nombre|Email|Tel|RUT|Edad|Ocupación|Peso|Talla|IMC(formula)|Motivo|Fecha|Hora|Estado|Comprobante|WA|FechaReg|Notas
  var shP     = getSheet_(CONFIG.SH_PACIENTES);
  var nextRowP = shP.getLastRow() + 1;
  if (nextRowP < CONFIG.DATA_START_ROW) nextRowP = CONFIG.DATA_START_ROW;

  var imc_formula = "=IF(AND(H" + nextRowP + "<>\"\",I" + nextRowP + "<>\"\"),ROUND(H" + nextRowP + "/(I" + nextRowP + "^2),1),\"\")";

  shP.getRange(nextRowP, 1, 1, 18).setValues([[
    ticket,
    nombre,
    body.email    || "",
    body.telefono || "",
    body.rut      || "",
    body.edad     || "",
    body.ocupacion|| "",
    body.peso     || "",
    body.talla    || "",
    imc_formula,
    body.motivo   || "",
    date,
    time,
    "Confirmado",
    "",                         // Comprobante (se actualiza luego)
    "No",                       // WA Notificado
    now,
    ""                          // Notas internas
  ]]);

  // Formato de fecha en col L
  shP.getRange(nextRowP, 12).setNumberFormat("yyyy-mm-dd");
  shP.getRange(nextRowP, 17).setNumberFormat("yyyy-mm-dd hh:mm");

  // ── 2. HOJA FORMULARIO_CLINICO ───────────────────────────
  // Columnas en orden: los 9 de identificación + 5 anamnesis + 6 estilo vida +
  // 2 alergias + 2 consumo + 1 digestión + 7 frecuencia + 1 registro24 + 5 cita = 38 cols
  var shF     = getSheet_(CONFIG.SH_FORM);
  var nextRowF = shF.getLastRow() + 1;
  if (nextRowF < CONFIG.DATA_START_ROW) nextRowF = CONFIG.DATA_START_ROW;

  shF.getRange(nextRowF, 1, 1, 38).setValues([[
    // IDENTIFICACIÓN (9)
    ticket, nombre, body.email||"", body.telefono||"", body.rut||"",
    body.edad||"", body.ocupacion||"", body.peso||"", body.talla||"",
    // ANAMNESIS MÉDICA (5)
    body.enfermedad||"", body.lesion||"", body.familiar||"",
    body.cirugia||"", body.convivencia||"",
    // ESTILO DE VIDA (6)
    body.actividad||"", body.horario||"", body.sueno||"",
    body.nodislike||"", body.almuerzo||"", body.horcomida||"",
    // ALERGIAS Y SUPLEMENTOS (2)
    body.alergias||"", body.suplemento||"",
    // CONSUMO (2)
    body.alcohol||"", body.tabaco||"",
    // DIGESTIÓN (1)
    body.gastro||"",
    // FRECUENCIA SEMANAL (7)
    body.cereales||"", body.legumbres||"", body.pescado||"",
    body.fruta||"", body.verduras||"", body.dulces||"", body.lacteos||"",
    // REGISTRO 24H (1)
    body.registro24||"",
    // CITA (5)
    body.motivo||"", date, time, "Confirmado", "No"
  ]]);

  // Formato fechas en formulario col 36 (fecha cita)
  shF.getRange(nextRowF, 36).setNumberFormat("yyyy-mm-dd");

  // ── 3. HOJA CITAS ────────────────────────────────────────
  // Columnas: Ticket|Nombre|Email|Tel|Fecha|Hora|Duración|Modalidad|Estado|Sala|WAP|WAN|Notas
  var shC     = getSheet_(CONFIG.SH_CITAS);
  var nextRowC = shC.getLastRow() + 1;
  if (nextRowC < CONFIG.DATA_START_ROW) nextRowC = CONFIG.DATA_START_ROW;

  shC.getRange(nextRowC, 1, 1, 13).setValues([[
    ticket, nombre, body.email||"", body.telefono||"",
    date, time, CONFIG.DURACION_SLOT_MIN, "Videollamada",
    "Confirmado", salaJitsi, "No", "No", ""
  ]]);
  shC.getRange(nextRowC, 5).setNumberFormat("yyyy-mm-dd");

  // ── 4. HOJA PAGOS ────────────────────────────────────────
  // Columnas: Ticket|Nombre|FechaCita|Monto|Método|Estado|FechaTransf|CompRecib|NombreArchivo|RUTTitular|Banco|Notas
  var shPa     = getSheet_(CONFIG.SH_PAGOS);
  var nextRowPa = shPa.getLastRow() + 1;
  if (nextRowPa < CONFIG.DATA_START_ROW) nextRowPa = CONFIG.DATA_START_ROW;

  shPa.getRange(nextRowPa, 1, 1, 12).setValues([[
    ticket, nombre, date, CONFIG.PRECIO_CONSULTA,
    "Transferencia", "Pendiente", "", "No", "", "", "Banco Estado", ""
  ]]);
  shPa.getRange(nextRowPa, 3).setNumberFormat("yyyy-mm-dd");
  shPa.getRange(nextRowPa, 4).setNumberFormat('"$"#,##0');

  // ── 5. Marcar slot como RESERVADO en DISPONIBILIDAD ──────
  markSlotReserved_(date, time, ticket, nombre);

  // ── 6. Emails de notificación ─────────────────────────────
  try { sendConfirmationEmail_(ticket, nombre, body.email, date, time); }
  catch(err) { Logger.log("Email paciente error: " + err.message); }

  try { sendNutriNotification_(ticket, nombre, body.email, body.telefono, date, time, body.motivo); }
  catch(err) { Logger.log("Email nutri error: " + err.message); }

  return jsonResponse_({
    ok            : true,
    ticket        : ticket,
    date          : date,
    time          : time,
    dateFormatted : formatDateES_(date),
    salaJitsi     : salaJitsi,
    message       : "Registro exitoso"
  });
}

/**
 * POST { action:"uploadComprobante", ticket, comprobanteBase64, nombreArchivo, mimeType }
 * Guarda el comprobante en Google Drive y actualiza las hojas.
 */
function handleUploadComprobante_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket) return errorResponse_("ticket requerido");
  if (!body.comprobanteBase64) return errorResponse_("comprobanteBase64 requerido");

  // ── Guardar imagen en Drive ─────────────────────────────
  var nombreArchivo = body.nombreArchivo || ("comprobante_" + ticket + ".jpg");
  var mimeType      = body.mimeType || "image/jpeg";
  var carpetaNombre = "NutriAge_Comprobantes";

  // Buscar o crear carpeta en Drive
  var folders = DriveApp.getFoldersByName(carpetaNombre);
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(carpetaNombre);
  }

  // Decodificar base64 y subir
  var blob = Utilities.newBlob(
    Utilities.base64Decode(body.comprobanteBase64.replace(/^data:.+;base64,/, "")),
    mimeType,
    nombreArchivo
  );
  var file      = folder.createFile(blob);
  var fileUrl   = file.getUrl();
  var fileId    = file.getId();

  // ── Actualizar PACIENTES col O (comprobante) y P (WA = sin cambio) ──
  var foundP = findPatientByTicket_(ticket);
  if (foundP) {
    getSheet_(CONFIG.SH_PACIENTES)
      .getRange(foundP.rowIndex, 15)
      .setValue(fileUrl);
  }

  // ── Actualizar PAGOS: CompRecib=Sí, NombreArchivo=fileUrl ──
  var shPa     = getSheet_(CONFIG.SH_PAGOS);
  var lastRowPa = shPa.getLastRow();
  if (lastRowPa >= CONFIG.DATA_START_ROW) {
    var pagos = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 9).getValues();
    for (var i = 0; i < pagos.length; i++) {
      if (String(pagos[i][0]) === ticket) {
        var r = CONFIG.DATA_START_ROW + i;
        shPa.getRange(r, 7).setValue(new Date());   // Fecha Transferencia
        shPa.getRange(r, 8).setValue("Sí");          // Comprobante Recibido
        shPa.getRange(r, 9).setValue(fileUrl);       // Nombre/URL Archivo
        shPa.getRange(r, 6).setValue("Recibido");    // Estado Pago
        break;
      }
    }
  }

  // ── Actualizar CITAS estado si aplica ──
  // (queda en "Confirmado", el pago lo verifica Fernanda manualmente)

  // ── Notificar a Fernanda que llegó comprobante ───────────
  try {
    MailApp.sendEmail({
      to      : CONFIG.NUTRI_EMAIL,
      subject : "📎 Comprobante recibido — " + ticket,
      htmlBody:
        "<h3 style='color:#3d2459'>Nuevo comprobante de pago</h3>" +
        "<p><b>Ticket:</b> " + ticket + "</p>" +
        "<p><b>Archivo:</b> " + nombreArchivo + "</p>" +
        "<p><a href='" + fileUrl + "' target='_blank'>Ver comprobante en Drive</a></p>" +
        "<p style='color:#888;font-size:12px'>NutriAge · Sistema automático</p>"
    });
  } catch(err) { Logger.log("Email comprobante error: " + err.message); }

  return jsonResponse_({
    ok        : true,
    ticket    : ticket,
    fileUrl   : fileUrl,
    fileId    : fileId,
    message   : "Comprobante guardado correctamente"
  });
}

/**
 * POST { action:"updateCitaStatus", ticket, estado, notas }
 * Actualiza el estado de la cita en CITAS y en PACIENTES.
 * Estados válidos: Pendiente | Confirmado | En curso | Completado | Cancelado | No asistió
 */
function handleUpdateCitaStatus_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  var estado = String(body.estado || "").trim();
  var notas  = String(body.notas  || "").trim();

  if (!ticket) return errorResponse_("ticket requerido");
  if (!estado) return errorResponse_("estado requerido");

  var estadosValidos = ["Pendiente","Confirmado","En curso","Completado","Cancelado","No asistió"];
  if (estadosValidos.indexOf(estado) === -1) {
    return errorResponse_("Estado no válido. Opciones: " + estadosValidos.join(", "));
  }

  // Actualizar PACIENTES col N
  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return errorResponse_("Ticket no encontrado: " + ticket, 404);
  var shP = getSheet_(CONFIG.SH_PACIENTES);
  shP.getRange(foundP.rowIndex, 14).setValue(estado);
  if (notas) shP.getRange(foundP.rowIndex, 18).setValue(notas);

  // Actualizar CITAS col I
  var shC     = getSheet_(CONFIG.SH_CITAS);
  var lastRowC = shC.getLastRow();
  if (lastRowC >= CONFIG.DATA_START_ROW) {
    var citas = shC.getRange(CONFIG.DATA_START_ROW, 1, lastRowC - CONFIG.DATA_START_ROW + 1, 13).getValues();
    for (var i = 0; i < citas.length; i++) {
      if (String(citas[i][0]) === ticket) {
        var r = CONFIG.DATA_START_ROW + i;
        shC.getRange(r, 9).setValue(estado);
        if (notas) shC.getRange(r, 13).setValue(notas);
        break;
      }
    }
  }

  // Si se marca Completado, también actualizar PAGOS a Verificado
  if (estado === "Completado") {
    var shPa     = getSheet_(CONFIG.SH_PAGOS);
    var lastRowPa = shPa.getLastRow();
    if (lastRowPa >= CONFIG.DATA_START_ROW) {
      var pagos = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 6).getValues();
      for (var j = 0; j < pagos.length; j++) {
        if (String(pagos[j][0]) === ticket) {
          var rp = CONFIG.DATA_START_ROW + j;
          var estadoPago = String(pagos[j][5]);
          // Solo cambiar si era Recibido (no si ya era Verificado)
          if (estadoPago === "Recibido") {
            shPa.getRange(rp, 6).setValue("Verificado");
          }
          break;
        }
      }
    }
  }

  return jsonResponse_({ ok: true, ticket: ticket, newEstado: estado, message: "Estado actualizado" });
}

/**
 * POST { action:"blockSlot", date, time, motivo, tipoBloqueo }
 * Bloquea un horario en la hoja DISPONIBILIDAD.
 * Usado desde el panel de la nutricionista.
 */
function handleBlockSlot_(body) {
  var date  = String(body.date  || "").trim();
  var time  = String(body.time  || "").trim();
  var motivo= String(body.motivo|| "Personal").trim();
  var tipo  = String(body.tipoBloqueo || "Personal").trim();

  if (!date || !time) return errorResponse_("date y time son requeridos");

  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();

  if (lastRow >= CONFIG.DATA_START_ROW) {
    var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 4).getValues();
    for (var i = 0; i < data.length; i++) {
      var rowDate = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "America/Santiago", "yyyy-MM-dd") : "";
      var rowTime = String(data[i][2] || "").trim();
      if (rowDate === date && rowTime === time) {
        var r = CONFIG.DATA_START_ROW + i;
        sh.getRange(r, 4).setValue("No");
        sh.getRange(r, 7).setValue(tipo);
        sh.getRange(r, 8).setValue(motivo);
        return jsonResponse_({ ok: true, message: "Slot bloqueado: " + date + " " + time });
      }
    }
  }

  // Si no existe el slot en la hoja, lo agrega como bloqueado
  var newRow = sh.getLastRow() + 1;
  var days_es = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var d = new Date(date + "T12:00:00");
  sh.getRange(newRow, 1, 1, 9).setValues([[
    date, days_es[d.getDay()], time, "No", "", "", tipo, motivo, ""
  ]]);
  sh.getRange(newRow, 1).setNumberFormat("yyyy-mm-dd");

  return jsonResponse_({ ok: true, message: "Slot bloqueado (nuevo): " + date + " " + time });
}

/**
 * POST { action:"unblockSlot", date, time }
 * Desbloquea un horario previamente bloqueado (sin reserva).
 */
function handleUnblockSlot_(body) {
  var date = String(body.date || "").trim();
  var time = String(body.time || "").trim();
  if (!date || !time) return errorResponse_("date y time son requeridos");

  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return errorResponse_("No hay datos en DISPONIBILIDAD");

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "America/Santiago", "yyyy-MM-dd") : "";
    var rowTime = String(data[i][2] || "").trim();
    var reservado = String(data[i][4] || "").trim(); // Ticket reservado
    if (rowDate === date && rowTime === time) {
      if (reservado) {
        return errorResponse_("No se puede desbloquear: tiene reserva " + reservado, 409);
      }
      var r = CONFIG.DATA_START_ROW + i;
      sh.getRange(r, 4).setValue("Sí");
      sh.getRange(r, 7).setValue("");
      sh.getRange(r, 8).setValue("");
      return jsonResponse_({ ok: true, message: "Slot desbloqueado: " + date + " " + time });
    }
  }

  return errorResponse_("Slot no encontrado: " + date + " " + time, 404);
}

/**
 * POST { action:"saveNutriTimes", date, times:[...] }
 * Guarda/actualiza los horarios disponibles de un día completo.
 * Equivalente a saveNutriTimes() en el frontend.
 */
function handleSaveNutriTimes_(body) {
  var date  = String(body.date  || "").trim();
  var times = Array.isArray(body.times) ? body.times : [];
  if (!date) return errorResponse_("date es requerido");

  var ALL_SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"];
  var sh        = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow   = sh.getLastRow();
  var days_es   = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var d         = new Date(date + "T12:00:00");
  var diaStr    = days_es[d.getDay()];

  // Recopilar filas existentes de esa fecha con sus reservas
  var existingReservations = {}; // hora -> ticket
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 6).getValues();
    for (var i = 0; i < data.length; i++) {
      var rowDate = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "America/Santiago", "yyyy-MM-dd") : "";
      var rowTime = String(data[i][2] || "").trim();
      if (rowDate === date && rowTime) {
        existingReservations[rowTime] = String(data[i][4] || "");
      }
    }
  }

  // Eliminar filas existentes del día (las reescribimos)
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var rowsToDelete = [];
    var checkData = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
    for (var k = checkData.length - 1; k >= 0; k--) {
      var rd = checkData[k][0] ? Utilities.formatDate(new Date(checkData[k][0]), "America/Santiago", "yyyy-MM-dd") : "";
      if (rd === date) rowsToDelete.push(CONFIG.DATA_START_ROW + k);
    }
    rowsToDelete.forEach(function(rowIdx) { sh.deleteRow(rowIdx); });
  }

  // Insertar todos los slots del día con su estado correcto
  ALL_SLOTS.forEach(function(slot) {
    var newRow    = sh.getLastRow() + 1;
    var isEnabled = times.indexOf(slot) !== -1;
    var ticket    = existingReservations[slot] || "";
    // Si tiene reserva, siempre disponible=Sí y ticket puesto
    var dispVal   = (ticket || isEnabled) ? "Sí" : "No";
    sh.getRange(newRow, 1, 1, 6).setValues([[date, diaStr, slot, dispVal, ticket, ""]]);
    sh.getRange(newRow, 1).setNumberFormat("yyyy-mm-dd");
  });

  return jsonResponse_({ ok: true, date: date, timesEnabled: times, message: "Horarios guardados" });
}

/**
 * POST { action:"logVideollamada", ticket, horaInicio, horaFin,
 *        estadoLlamada, calidadConexion, notas }
 * Registra o actualiza la sesión de videollamada.
 */
function handleLogVideollamada_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket) return errorResponse_("ticket requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return errorResponse_("Ticket no encontrado: " + ticket, 404);

  var d        = foundP.data;
  var nombre   = d[1];
  var fechaKey = d[11] ? Utilities.formatDate(new Date(d[11]), "America/Santiago", "yyyy-MM-dd") : "";
  var hora     = d[12];

  var sh      = getSheet_(CONFIG.SH_VIDEO);
  var lastRow = sh.getLastRow();

  // Buscar si ya existe una fila para este ticket (actualizar)
  var existingRow = -1;
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var vData = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
    for (var i = 0; i < vData.length; i++) {
      if (String(vData[i][0]) === ticket) { existingRow = CONFIG.DATA_START_ROW + i; break; }
    }
  }

  var targetRow = existingRow > 0 ? existingRow : sh.getLastRow() + 1;
  if (targetRow < CONFIG.DATA_START_ROW) targetRow = CONFIG.DATA_START_ROW;

  // Sala al estilo del frontend
  var salaJitsi = "NutriAge_" + String(d[3] || "").replace(/[^0-9]/g, "");

  sh.getRange(targetRow, 1, 1, 11).setValues([[
    ticket, nombre, fechaKey, body.horaInicio || hora, body.horaFin || "",
    "",                                   // Duración (fórmula)
    salaJitsi, body.estadoLlamada || "Exitosa",
    "No", body.calidadConexion || "", body.notas || ""
  ]]);

  // Poner fórmula de duración en col F
  sh.getRange(targetRow, 6).setValue(
    "=IF(AND(D" + targetRow + "<>\"\",E" + targetRow + "<>\"\"),ROUND((E" + targetRow + "-D" + targetRow + ")*1440,0),\"\")"
  );
  sh.getRange(targetRow, 3).setNumberFormat("yyyy-mm-dd");

  return jsonResponse_({ ok: true, ticket: ticket, message: "Videollamada registrada" });
}

/**
 * POST { action:"markWaNotificado", ticket }
 * Marca el campo WA Notificado = Sí en PACIENTES y FORMULARIO_CLINICO.
 */
function handleMarkWaNotificado_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket) return errorResponse_("ticket requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return errorResponse_("Ticket no encontrado: " + ticket, 404);

  // PACIENTES col P (16)
  getSheet_(CONFIG.SH_PACIENTES).getRange(foundP.rowIndex, 16).setValue("Sí");

  // FORMULARIO col 40 (WA en sección CITA al final) = col 40
  // La col de WA en FORMULARIO es la última col de la sección CITA = posición 40
  var shF     = getSheet_(CONFIG.SH_FORM);
  var lastRowF = shF.getLastRow();
  if (lastRowF >= CONFIG.DATA_START_ROW) {
    var fData = shF.getRange(CONFIG.DATA_START_ROW, 1, lastRowF - CONFIG.DATA_START_ROW + 1, 1).getValues();
    for (var i = 0; i < fData.length; i++) {
      if (String(fData[i][0]) === ticket) {
        shF.getRange(CONFIG.DATA_START_ROW + i, 38).setValue("Sí");
        break;
      }
    }
  }

  return jsonResponse_({ ok: true, ticket: ticket, message: "WA marcado como notificado" });
}

// ═════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ═════════════════════════════════════════════════════════════

/** Verifica si un slot está disponible (sin reserva y marcado Sí) */
function isSlotAvailable_(date, time) {
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return false;

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate    = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "America/Santiago", "yyyy-MM-dd") : "";
    var rowTime    = String(data[i][2] || "").trim();
    var disponible = String(data[i][3] || "").trim().toLowerCase();
    var reservado  = String(data[i][4] || "").trim();
    if (rowDate === date && rowTime === time) {
      return disponible === "sí" && !reservado;
    }
  }
  return false; // No existe el slot
}

/** Marca un slot como reservado (col E=ticket, F=nombre) en DISPONIBILIDAD */
function markSlotReserved_(date, time, ticket, nombre) {
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return;

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), "America/Santiago", "yyyy-MM-dd") : "";
    var rowTime = String(data[i][2] || "").trim();
    if (rowDate === date && rowTime === time) {
      var r = CONFIG.DATA_START_ROW + i;
      sh.getRange(r, 5).setValue(ticket);
      sh.getRange(r, 6).setValue(nombre);
      return;
    }
  }
  // No encontró el slot: registrarlo de todas formas como reservado
  Logger.log("markSlotReserved_: slot no encontrado " + date + " " + time + ". Se omite marcado en Disponibilidad.");
}

/** Envía email de confirmación al paciente */
function sendConfirmationEmail_(ticket, nombre, email, date, time) {
  if (!email) return;
  var dateStr  = formatDateES_(date);
  var salaLink = "https://meet.jit.si/NutriAge_" + String(ticket).replace(/[^a-zA-Z0-9]/g, "");

  MailApp.sendEmail({
    to      : email,
    subject : "✅ Tu reserva NutriAge está confirmada — " + ticket,
    htmlBody:
      "<div style='font-family:Arial,sans-serif;max-width:520px;margin:0 auto'>" +
      "<div style='background:#3d2459;padding:24px;border-radius:12px 12px 0 0;text-align:center'>" +
        "<h1 style='color:#fff;font-size:22px;margin:0'>🌿 NutriAge</h1>" +
        "<p style='color:rgba(255,255,255,.7);font-size:13px;margin:4px 0 0'>Fernanda Ugarte · Nutricionista</p>" +
      "</div>" +
      "<div style='background:#fff;padding:28px;border:1px solid #e8e0f0;border-top:none'>" +
        "<p style='color:#2a1a3e;font-size:16px'>Hola <strong>" + nombre + "</strong>,</p>" +
        "<p style='color:#5a4a6e;font-size:14px'>Tu consulta fue confirmada exitosamente:</p>" +
        "<div style='background:#f0e8fa;border-radius:10px;padding:18px;margin:16px 0'>" +
          "<p style='margin:6px 0;color:#3d2459'><b>📅 Fecha:</b> " + dateStr + "</p>" +
          "<p style='margin:6px 0;color:#3d2459'><b>🕐 Hora:</b> " + time + " hrs</p>" +
          "<p style='margin:6px 0;color:#3d2459'><b>👩‍⚕️ Nutricionista:</b> Fernanda Ugarte</p>" +
          "<p style='margin:6px 0;color:#3d2459'><b>🎫 Ticket:</b> <strong style='font-size:16px'>" + ticket + "</strong></p>" +
        "</div>" +
        "<p style='color:#5a4a6e;font-size:13px'>Recuerda transferir <strong>$15.000 CLP</strong> al Banco Estado (Cuenta RUT 20726694-9) y adjuntar tu comprobante.</p>" +
        "<p style='color:#5a4a6e;font-size:13px'>El día de tu consulta, ingresa con tu ticket en el sitio para unirte a la videollamada.</p>" +
        "<div style='background:#edf6ee;border-radius:8px;padding:14px;margin:16px 0'>" +
          "<p style='margin:0;color:#2d5e34;font-size:13px'>💡 Guarda tu ticket <strong>" + ticket + "</strong>. Lo necesitarás para unirte a la videollamada.</p>" +
        "</div>" +
      "</div>" +
      "<div style='background:#f8f5fc;padding:14px;border-radius:0 0 12px 12px;text-align:center'>" +
        "<p style='color:#9882b0;font-size:11px;margin:0'>NutriAge · Sistema automático · No responder este correo</p>" +
      "</div>" +
      "</div>"
  });
}

/** Envía email de aviso a Fernanda con el resumen del nuevo paciente */
function sendNutriNotification_(ticket, nombre, email, telefono, date, time, motivo) {
  var dateStr = formatDateES_(date);
  MailApp.sendEmail({
    to      : CONFIG.NUTRI_EMAIL,
    subject : "🌱 Nueva reserva — " + nombre + " (" + ticket + ")",
    htmlBody:
      "<div style='font-family:Arial,sans-serif;max-width:520px'>" +
      "<div style='background:#3d2459;padding:20px;border-radius:10px 10px 0 0'>" +
        "<h2 style='color:#fff;margin:0'>🌱 Nueva cita agendada</h2>" +
      "</div>" +
      "<div style='background:#fff;padding:20px;border:1px solid #e8e0f0;border-top:none'>" +
        "<table style='width:100%;border-collapse:collapse;font-size:14px'>" +
          "<tr><td style='padding:8px;color:#888;width:140px'>Ticket</td><td style='padding:8px;font-weight:bold;color:#3d2459'>" + ticket + "</td></tr>" +
          "<tr style='background:#f8f5fc'><td style='padding:8px;color:#888'>Paciente</td><td style='padding:8px;font-weight:bold'>" + nombre + "</td></tr>" +
          "<tr><td style='padding:8px;color:#888'>Email</td><td style='padding:8px'>" + (email||"—") + "</td></tr>" +
          "<tr style='background:#f8f5fc'><td style='padding:8px;color:#888'>Teléfono</td><td style='padding:8px'>" + (telefono||"—") + "</td></tr>" +
          "<tr><td style='padding:8px;color:#888'>Fecha</td><td style='padding:8px;font-weight:bold;color:#2d5e34'>" + dateStr + "</td></tr>" +
          "<tr style='background:#f8f5fc'><td style='padding:8px;color:#888'>Hora</td><td style='padding:8px;font-weight:bold'>" + time + " hrs</td></tr>" +
          "<tr><td style='padding:8px;color:#888'>Motivo</td><td style='padding:8px'>" + (motivo||"—") + "</td></tr>" +
        "</table>" +
        "<p style='font-size:12px;color:#aaa;margin-top:16px'>El paciente debe enviar comprobante para completar la reserva. Verifica en tu Google Sheets.</p>" +
      "</div>" +
      "</div>"
  });
}

// ═════════════════════════════════════════════════════════════
//  TRIGGER DIARIO · Recordatorios automáticos
//  Crear en GAS: Editar → Triggers → Añadir → recordatoriosDiarios
//  → Cada día a las 08:00 → hora del sistema
// ═════════════════════════════════════════════════════════════

/**
 * Envía recordatorio por email a los pacientes que tienen cita mañana.
 * Configura el trigger en Apps Script para que se ejecute cada mañana a las 08:00.
 */
function recordatoriosDiarios() {
  var sh      = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return;

  // Calcular "mañana" en zona Chile
  var now     = new Date();
  var tz      = "America/Santiago";
  var manana  = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var mananaKey = Utilities.formatDate(manana, tz, "yyyy-MM-dd");

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 14).getValues();

  data.forEach(function(row) {
    if (!row[0]) return;
    var ticket = row[0], nombre = row[1], email = row[2];
    var fechaKey = row[11] ? Utilities.formatDate(new Date(row[11]), tz, "yyyy-MM-dd") : "";
    var time     = row[12];
    var estado   = String(row[13] || "").trim();

    if (fechaKey === mananaKey && estado === "Confirmado" && email) {
      try {
        MailApp.sendEmail({
          to      : email,
          subject : "⏰ Recordatorio — Tu consulta NutriAge es mañana",
          htmlBody:
            "<div style='font-family:Arial,sans-serif;max-width:500px'>" +
            "<div style='background:#3d2459;padding:20px;border-radius:10px 10px 0 0;text-align:center'>" +
              "<h2 style='color:#fff;margin:0'>🌿 Tu consulta es mañana</h2>" +
            "</div>" +
            "<div style='background:#fff;padding:20px;border:1px solid #e8e0f0;border-top:none'>" +
              "<p>Hola <strong>" + nombre + "</strong>, te recordamos que mañana tienes consulta con Fernanda Ugarte.</p>" +
              "<div style='background:#f0e8fa;border-radius:8px;padding:14px;margin:12px 0'>" +
                "<p style='margin:4px 0'><b>Fecha:</b> " + formatDateES_(fechaKey) + "</p>" +
                "<p style='margin:4px 0'><b>Hora:</b> " + time + " hrs</p>" +
                "<p style='margin:4px 0'><b>Ticket:</b> " + ticket + "</p>" +
              "</div>" +
              "<p style='font-size:13px;color:#555'>Para unirte a la videollamada, usa tu ticket en el sitio de NutriAge el día de tu consulta.</p>" +
            "</div>" +
            "</div>"
        });
        Logger.log("Recordatorio enviado a " + email + " para mañana " + mananaKey);
      } catch(err) {
        Logger.log("Error recordatorio " + ticket + ": " + err.message);
      }
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  FUNCIÓN DE INICIALIZACIÓN · Ejecutar 1 vez al configurar
// ═════════════════════════════════════════════════════════════

/**
 * Ejecuta esta función UNA VEZ desde el editor GAS para:
 * 1. Verificar que el SPREADSHEET_ID sea correcto
 * 2. Verificar que todas las hojas existan
 * 3. Registrar el trigger diario de recordatorios
 * Verás el resultado en Ver → Registro de ejecución
 */
function setup() {
  Logger.log("=== NutriAge GAS Setup ===");

  // 1. Verificar Spreadsheet
  try {
    var ss = getSpreadsheet_();
    Logger.log("✅ Spreadsheet encontrado: " + ss.getName());
  } catch(err) {
    Logger.log("❌ ERROR Spreadsheet: " + err.message);
    Logger.log("   → Verifica SPREADSHEET_ID en CONFIG");
    return;
  }

  // 2. Verificar hojas
  var sheetsRequired = [
    CONFIG.SH_PACIENTES, CONFIG.SH_FORM, CONFIG.SH_CITAS,
    CONFIG.SH_PAGOS, CONFIG.SH_DISPONIBILIDAD, CONFIG.SH_VIDEO
  ];
  sheetsRequired.forEach(function(name) {
    try {
      getSheet_(name);
      Logger.log("✅ Hoja OK: " + name);
    } catch(err) {
      Logger.log("❌ Hoja no encontrada: " + name + " — Créala en Google Sheets");
    }
  });

  // 3. Registrar trigger diario de recordatorios (si no existe)
  var triggers  = ScriptApp.getProjectTriggers();
  var hasTrigger = triggers.some(function(t) {
    return t.getHandlerFunction() === "recordatoriosDiarios";
  });
  if (!hasTrigger) {
    ScriptApp.newTrigger("recordatoriosDiarios")
      .timeBased()
      .atHour(8)
      .everyDays(1)
      .inTimezone("America/Santiago")
      .create();
    Logger.log("✅ Trigger diario de recordatorios creado (08:00 Santiago)");
  } else {
    Logger.log("ℹ️ Trigger ya existía — sin cambios");
  }

  Logger.log("=== Setup completo ===");
  Logger.log("Publica el script como Web App y copia la URL en CONFIG_GAS de tu Excel.");
}
