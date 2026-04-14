// ============================================================
//  NutriAge · Google Apps Script — Backend v4.0 COMPLETO
//  Autor: generado para Fernanda Ugarte · NutriAge
//  Versión: 4.0 — Revisado y mejorado sin errores
//  Descripción: API REST sobre Google Sheets.
//  Recibe datos desde el sitio web, los guarda en tiempo real
//  y los sirve de vuelta al frontend via JSON.
// ============================================================

// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN GLOBAL  (editar sólo esta sección)
// ─────────────────────────────────────────────────────────────
var CONFIG = {
  SPREADSHEET_ID    : "1FkuqP-MSeFkvDSAjFfCehtWXmireMwVQ",
  NUTRI_EMAIL       : "nutriage2026@gmail.com",
  NUTRI_WA          : "56971246200",
  PRECIO_CONSULTA   : 15000,
  TICKET_PREFIX     : "NA",
  DURACION_SLOT_MIN : 45,
  WEB_URL           : "https://nutriage2026-create.github.io/Nutriage-web/",

  // Nombres exactos de las hojas (deben coincidir con el Google Sheet)
  SH_PACIENTES      : "PACIENTES",
  SH_FORM           : "FORMULARIO_CLINICO",
  SH_CITAS          : "CITAS",
  SH_PAGOS          : "PAGOS",
  SH_DISPONIBILIDAD : "DISPONIBILIDAD",
  SH_VIDEO          : "VIDEOLLAMADAS",

  // Fila donde empiezan los datos (fila 4: 1=título, 2=vacía, 3=encabezado, 4=datos)
  DATA_START_ROW    : 4,

  // Zona horaria de Chile
  TZ                : "America/Santiago"
};

// ─────────────────────────────────────────────────────────────
//  UTILIDADES GENERALES
// ─────────────────────────────────────────────────────────────

/** Abre el Spreadsheet configurado */
function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** Obtiene una hoja por nombre, lanza error si no existe */
function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Hoja no encontrada: '" + name + "'. Verifica el nombre exacto en tu Google Sheet.");
  return sh;
}

/** Retorna respuesta JSON estándar */
function jsonOk_(data) {
  data.ok = true;
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Retorna respuesta de error JSON */
function jsonError_(msg, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg, code: code || 400 }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Fecha de hoy como string YYYY-MM-DD en zona Chile */
function todayKey_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, "yyyy-MM-dd");
}

/**
 * Convierte un valor de celda de fecha a string YYYY-MM-DD.
 * Las celdas de Sheets pueden contener un objeto Date o ya un string.
 */
function toDateKey_(cellValue) {
  if (!cellValue) return "";
  if (cellValue instanceof Date) {
    return Utilities.formatDate(cellValue, CONFIG.TZ, "yyyy-MM-dd");
  }
  var s = String(cellValue).trim();
  // Si ya tiene formato correcto, retornar
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Intentar parsear
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, CONFIG.TZ, "yyyy-MM-dd");
  } catch(e) {}
  return s;
}

/** Formatea YYYY-MM-DD a texto español: "lunes 14 de abril de 2026" */
function formatDateES_(key) {
  if (!key) return "";
  var parts = key.split("-");
  if (parts.length !== 3) return key;
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var days  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
                "septiembre","octubre","noviembre","diciembre"];
  return days[d.getDay()] + " " + parts[2] + " de " + months[Number(parts[1])-1] + " de " + parts[0];
}

/** Valida que los campos requeridos no estén vacíos en un objeto */
function validateRequired_(obj, fields) {
  var missing = [];
  fields.forEach(function(f) {
    if (!obj[f] || String(obj[f]).trim() === "") missing.push(f);
  });
  return missing;
}

/** Genera ticket único al estilo NA-YYYYMMDD-NNN */
function generarTicket_(dateKey) {
  var sh      = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  var datePart = dateKey.replace(/-/g, "");
  var prefix   = CONFIG.TICKET_PREFIX + "-" + datePart + "-";
  var count    = 0;

  if (lastRow >= CONFIG.DATA_START_ROW) {
    var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
    var tickets = sh.getRange(CONFIG.DATA_START_ROW, 1, numRows, 1).getValues();
    tickets.forEach(function(row) {
      if (String(row[0]).indexOf(prefix) === 0) count++;
    });
  }
  count++;
  return prefix + String(count).padStart(3, "0");
}

/** Busca paciente por ticket. Retorna {rowIndex, data} o null */
function findPatientByTicket_(ticket) {
  var sh      = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return null;

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var data    = sh.getRange(CONFIG.DATA_START_ROW, 1, numRows, 18).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === String(ticket).trim().toUpperCase()) {
      return { rowIndex: i + CONFIG.DATA_START_ROW, data: data[i] };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  CORS · Google lo maneja automáticamente
//  Solo se necesita doOptions() para preflight requests
// ─────────────────────────────────────────────────────────────
function doOptions(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════════════════════
//  doGet — ENRUTADOR PRINCIPAL GET
// ═════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    // Blindaje total contra ejecución manual desde el editor GAS
    if (!e || !e.parameter) {
      return jsonOk_({ message: "NutriAge GAS v4 activo — llamar con ?action=ping", version: 4 });
    }

    var action = String(e.parameter.action || "").trim();

    if (action === "" || action === "ping") {
      return jsonOk_({ message: "NutriAge GAS v4 activo", ts: new Date().toISOString(), version: 4 });
    }
    if (action === "getAvailability")         return handleGetAvailability_(e);
    if (action === "getAvailabilityByDate")   return handleGetAvailabilityByDate_(e);
    if (action === "getPatientByTicket")      return handleGetPatientByTicket_(e);
    if (action === "getDashboard")            return handleGetDashboard_(e);
    if (action === "getAppointments")         return handleGetAppointments_(e);
    if (action === "getAllPatients")          return handleGetAllPatients_(e);
    if (action === "getFormularioClinco")    return handleGetFormularioClinco_(e);
    if (action === "sincronizarTodo")         return handleSincronizarTodo_(e);

    return jsonError_("Acción GET no reconocida: " + action);

  } catch (err) {
    Logger.log("doGet ERROR: " + err.message + " — Stack: " + err.stack);
    return jsonError_("Error interno GET: " + err.message, 500);
  }
}

// ═════════════════════════════════════════════════════════════
//  doPost — ENRUTADOR PRINCIPAL POST
// ═════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    if (!e) return jsonError_("Sin datos de petición");

    var body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch(pe) {
        return jsonError_("JSON inválido en el body: " + pe.message);
      }
    }

    // Soporte action tanto en body como en query params
    var params = e.parameter || {};
    var action = String(body.action || params.action || "").trim();

    if (action === "registerPatient")    return handleRegisterPatient_(body);
    if (action === "uploadComprobante")  return handleUploadComprobante_(body);
    if (action === "updateCitaStatus")   return handleUpdateCitaStatus_(body);
    if (action === "blockSlot")          return handleBlockSlot_(body);
    if (action === "unblockSlot")        return handleUnblockSlot_(body);
    if (action === "saveNutriTimes")     return handleSaveNutriTimes_(body);
    if (action === "logVideollamada")    return handleLogVideollamada_(body);
    if (action === "markWaNotificado")   return handleMarkWaNotificado_(body);
    if (action === "updateNota")         return handleUpdateNota_(body);

    return jsonError_("Acción POST no reconocida: " + action);

  } catch (err) {
    Logger.log("doPost ERROR: " + err.message + " — Stack: " + err.stack);
    return jsonError_("Error interno POST: " + err.message, 500);
  }
}

// ═════════════════════════════════════════════════════════════
//  HANDLERS GET
// ═════════════════════════════════════════════════════════════

/**
 * GET ?action=getAvailability
 * Retorna todos los slots disponibles (sin reservar, fecha >= hoy).
 * Formato: { availability: { "YYYY-MM-DD": ["09:00","10:00",...], ... } }
 */
function handleGetAvailability_(e) {
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();

  if (lastRow < CONFIG.DATA_START_ROW) {
    return jsonOk_({ availability: {} });
  }

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  // Columnas: A=Fecha, B=Día, C=Hora, D=Disponible(Sí/No), E=TicketReservado, F=NombrePac
  var data    = sh.getRange(CONFIG.DATA_START_ROW, 1, numRows, 6).getValues();
  var today   = todayKey_();
  var result  = {};

  data.forEach(function(row) {
    var fecha      = toDateKey_(row[0]);
    var hora       = String(row[2] || "").trim();
    var disponible = String(row[3] || "").trim().toLowerCase();
    var reservado  = String(row[4] || "").trim();

    if (!fecha || fecha < today) return;         // Fechas pasadas
    if (disponible !== "sí" && disponible !== "si") return; // No disponible
    if (reservado) return;                       // Ya reservado

    if (!result[fecha]) result[fecha] = [];
    if (hora && result[fecha].indexOf(hora) === -1) {
      result[fecha].push(hora);
    }
  });

  // Ordenar horarios dentro de cada fecha
  Object.keys(result).forEach(function(k) { result[k].sort(); });

  return jsonOk_({ availability: result });
}

/**
 * GET ?action=getAvailabilityByDate&date=YYYY-MM-DD
 * Slots disponibles de un día específico.
 */
function handleGetAvailabilityByDate_(e) {
  var date = String(e.parameter.date || "").trim();
  if (!date) return jsonError_("Parámetro 'date' requerido");

  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonOk_({ date: date, slots: [] });

  var numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  var data    = sh.getRange(CONFIG.DATA_START_ROW, 1, numRows, 6).getValues();
  var slots   = [];

  data.forEach(function(row) {
    var fecha      = toDateKey_(row[0]);
    var hora       = String(row[2] || "").trim();
    var disponible = String(row[3] || "").trim().toLowerCase();
    var reservado  = String(row[4] || "").trim();

    if (fecha === date && (disponible === "sí" || disponible === "si") && !reservado && hora) {
      slots.push(hora);
    }
  });

  slots.sort();
  return jsonOk_({ date: date, slots: slots });
}

/**
 * GET ?action=getPatientByTicket&ticket=NA-20260410-001
 * Busca paciente por ticket. Usado en "Ya tengo ticket" para videollamada.
 */
function handleGetPatientByTicket_(e) {
  var ticket = String(e.parameter.ticket || "").trim().toUpperCase();
  if (!ticket) return jsonError_("Parámetro 'ticket' requerido");

  var found = findPatientByTicket_(ticket);
  if (!found) return jsonOk_({ found: false, message: "Ticket no encontrado" });

  var d        = found.data;
  var fechaKey = toDateKey_(d[11]);

  return jsonOk_({
    found         : true,
    ticket        : String(d[0] || ""),
    nombre        : String(d[1] || ""),
    email         : String(d[2] || ""),
    telefono      : String(d[3] || ""),
    rut           : String(d[4] || ""),
    edad          : String(d[5] || ""),
    fecha         : fechaKey,
    dateFormatted : formatDateES_(fechaKey),
    time          : String(d[12] || ""),
    estado        : String(d[13] || ""),
    motivo        : String(d[10] || ""),
    isToday       : (fechaKey === todayKey_())
  });
}

/**
 * GET ?action=getDashboard
 * Métricas en tiempo real para los paneles.
 */
function handleGetDashboard_(e) {
  var today     = todayKey_();
  var thisMonth = today.substring(0, 7);

  var totalPacientes  = 0, citasHoy = 0, citasMes = 0;
  var completadas     = 0;
  var ingresosVerif   = 0, ingresosRecib = 0, pendientePago = 0;

  // PACIENTES
  try {
    var shP     = getSheet_(CONFIG.SH_PACIENTES);
    var lastRowP = shP.getLastRow();
    if (lastRowP >= CONFIG.DATA_START_ROW) {
      var pData = shP.getRange(CONFIG.DATA_START_ROW, 1, lastRowP - CONFIG.DATA_START_ROW + 1, 14).getValues();
      pData.forEach(function(row) {
        if (!row[0]) return;
        totalPacientes++;
        var fechaKey = toDateKey_(row[11]);
        if (fechaKey === today)              citasHoy++;
        if (fechaKey.substring(0,7) === thisMonth) citasMes++;
        if (String(row[13]) === "Completado") completadas++;
      });
    }
  } catch(e) { Logger.log("getDashboard PACIENTES error: " + e.message); }

  // PAGOS
  try {
    var shPa     = getSheet_(CONFIG.SH_PAGOS);
    var lastRowPa = shPa.getLastRow();
    if (lastRowPa >= CONFIG.DATA_START_ROW) {
      var paData = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 12).getValues();
      paData.forEach(function(row) {
        if (!row[0]) return;
        var monto  = Number(row[3]) || 0;
        var estado = String(row[5] || "").trim();
        if (estado === "Verificado") ingresosVerif  += monto;
        if (estado === "Recibido")   ingresosRecib  += monto;
        if (estado === "Pendiente")  pendientePago  += monto;
      });
    }
  } catch(e) { Logger.log("getDashboard PAGOS error: " + e.message); }

  return jsonOk_({
    dashboard: {
      totalPacientes      : totalPacientes,
      citasHoy            : citasHoy,
      citasMes            : citasMes,
      completadas         : completadas,
      ingresosVerificados : ingresosVerif,
      ingresosRecibidos   : ingresosRecib,
      pendienteCobro      : pendientePago,
      ingresosHoy         : citasHoy * CONFIG.PRECIO_CONSULTA,
      updatedAt           : new Date().toISOString()
    }
  });
}

/**
 * GET ?action=getAppointments[&date=YYYY-MM-DD]
 * Lista de citas para el panel de la nutricionista.
 */
function handleGetAppointments_(e) {
  var filterDate = String((e.parameter && e.parameter.date) ? e.parameter.date : "").trim();
  var sh         = getSheet_(CONFIG.SH_CITAS);
  var lastRow    = sh.getLastRow();

  if (lastRow < CONFIG.DATA_START_ROW) return jsonOk_({ appointments: [] });

  // Columnas CITAS: 0=Ticket,1=Nombre,2=Email,3=Tel,4=Fecha,5=Hora,
  // 6=Duración,7=Modalidad,8=Estado,9=SalaJitsi,10=WAP,11=WAN,12=Notas
  var data  = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 13).getValues();
  var appts = [];

  data.forEach(function(row) {
    if (!row[0]) return;
    var fechaKey = toDateKey_(row[4]);
    if (filterDate && fechaKey !== filterDate) return;

    appts.push({
      ticket    : String(row[0] || ""),
      nombre    : String(row[1] || ""),
      email     : String(row[2] || ""),
      telefono  : String(row[3] || ""),
      fecha     : fechaKey,
      fechaFmt  : formatDateES_(fechaKey),
      hora      : String(row[5] || ""),
      duracion  : String(row[6] || ""),
      modalidad : String(row[7] || ""),
      estado    : String(row[8] || ""),
      salaJitsi : String(row[9] || ""),
      notas     : String(row[12] || "")
    });
  });

  appts.sort(function(a, b) {
    var k1 = (a.fecha || "") + " " + (a.hora || "");
    var k2 = (b.fecha || "") + " " + (b.hora || "");
    return k1.localeCompare(k2);
  });

  return jsonOk_({ appointments: appts });
}

/**
 * GET ?action=getAllPatients
 * Lista resumida de todos los pacientes para el panel admin.
 */
function handleGetAllPatients_(e) {
  var sh      = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonOk_({ patients: [], total: 0 });

  var data     = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 18).getValues();
  var patients = [];

  data.forEach(function(row, idx) {
    if (!row[0]) return;
    var fechaKey = toDateKey_(row[11]);
    var regAt    = row[16] ? Utilities.formatDate(new Date(row[16]), CONFIG.TZ, "yyyy-MM-dd HH:mm") : "";

    patients.push({
      id            : idx + CONFIG.DATA_START_ROW,   // rowIndex como id
      ticket        : String(row[0]  || ""),
      nombre        : String(row[1]  || ""),
      email         : String(row[2]  || ""),
      telefono      : String(row[3]  || ""),
      rut           : String(row[4]  || ""),
      edad          : String(row[5]  || ""),
      ocupacion     : String(row[6]  || ""),
      peso          : String(row[7]  || ""),
      talla         : String(row[8]  || ""),
      imc           : String(row[9]  || ""),
      motivo        : String(row[10] || ""),
      date          : fechaKey,
      dateFormatted : formatDateES_(fechaKey),
      time          : String(row[12] || ""),
      status        : String(row[13] || ""),
      comprobante   : row[14] ? String(row[14]) : "",
      waNotificado  : String(row[15] || ""),
      registeredAt  : regAt,
      nutricionista : "Fernanda Ugarte"
    });
  });

  // Más reciente primero
  patients.sort(function(a, b) {
    return String(b.registeredAt).localeCompare(String(a.registeredAt));
  });

  return jsonOk_({ patients: patients, total: patients.length });
}

/**
 * GET ?action=getFormularioClinco&ticket=NA-XXXX
 * Formulario clínico completo de un paciente para la nutricionista.
 */
function handleGetFormularioClinco_(e) {
  var ticket = String((e.parameter && e.parameter.ticket) ? e.parameter.ticket : "").trim().toUpperCase();
  if (!ticket) return jsonError_("Parámetro 'ticket' requerido");

  var sh      = getSheet_(CONFIG.SH_FORM);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonOk_({ found: false });

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 38).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === ticket) {
      var r = data[i];
      return jsonOk_({
        found: true,
        // IDENTIFICACIÓN (cols 0-8)
        ticket:r[0], nombre:r[1], email:r[2], telefono:r[3], rut:r[4],
        edad:r[5], ocupacion:r[6], peso:r[7], talla:r[8],
        // ANAMNESIS MÉDICA (cols 9-13)
        enfermedad:r[9], lesion:r[10], familiar:r[11], cirugia:r[12], convivencia:r[13],
        // ESTILO DE VIDA (cols 14-19)
        actividad:r[14], horario:r[15], sueno:r[16], nodislike:r[17], almuerzo:r[18], horcomida:r[19],
        // ALERGIAS Y SUPLEMENTOS (cols 20-21)
        alergias:r[20], suplemento:r[21],
        // CONSUMO (cols 22-23)
        alcohol:r[22], tabaco:r[23],
        // DIGESTIÓN (col 24)
        gastro:r[24],
        // FRECUENCIA SEMANAL (cols 25-31)
        cereales:r[25], legumbres:r[26], pescado:r[27], fruta:r[28], verduras:r[29], dulces:r[30], lacteos:r[31],
        // REGISTRO 24H (col 32)
        registro24:r[32],
        // CITA (cols 33-37)
        motivo:r[33], fecha:toDateKey_(r[34]), hora:r[35], estadoCita:r[36], waNotificado:r[37]
      });
    }
  }
  return jsonOk_({ found: false, message: "Ticket no encontrado en formulario" });
}

/**
 * GET ?action=sincronizarTodo
 * Retorna PACIENTES + DISPONIBILIDAD en un solo request.
 * Usado por el frontend para sync completo.
 */
function handleSincronizarTodo_(e) {
  var pResult   = handleGetAllPatients_(e);
  var aResult   = handleGetAvailability_(e);
  var dResult   = handleGetDashboard_(e);

  var pData = JSON.parse(pResult.getContent());
  var aData = JSON.parse(aResult.getContent());
  var dData = JSON.parse(dResult.getContent());

  return jsonOk_({
    patients     : pData.patients     || [],
    availability : aData.availability || {},
    dashboard    : dData.dashboard    || {},
    syncedAt     : new Date().toISOString()
  });
}

// ═════════════════════════════════════════════════════════════
//  HANDLERS POST
// ═════════════════════════════════════════════════════════════

/**
 * POST { action:"registerPatient", date, time, nombre, email,
 *        telefono, edad, rut, ocupacion, peso, talla, motivo,
 *        enfermedad, lesion, familiar, cirugia, convivencia,
 *        actividad, horario, sueno, nodislike, almuerzo, horcomida,
 *        alergias, suplemento, alcohol, tabaco, gastro,
 *        cereales, legumbres, pescado, fruta, verduras, dulces, lacteos,
 *        registro24, comprobanteBase64, comprobanteNombre, comprobanteMime }
 *
 * Proceso:
 * 1. Valida campos requeridos
 * 2. Verifica que el slot sigue disponible
 * 3. Genera ticket único
 * 4. Escribe en 4 hojas: PACIENTES, FORMULARIO_CLINICO, CITAS, PAGOS
 * 5. Marca slot como reservado en DISPONIBILIDAD
 * 6. Si viene comprobante en base64, lo sube a Drive
 * 7. Envía email confirmación al paciente
 * 8. Envía email aviso a Fernanda
 */
function handleRegisterPatient_(body) {
  // ── 1. Validación ──────────────────────────────────────
  var required = ["date","time","nombre","email","telefono","motivo","peso","talla","registro24"];
  var missing  = validateRequired_(body, required);
  if (missing.length > 0) {
    return jsonError_("Campos requeridos faltantes: " + missing.join(", "));
  }

  var date      = String(body.date).trim();
  var time      = String(body.time).trim();
  var nombre    = String(body.nombre).trim();
  var email     = String(body.email || "").trim();
  var telefono  = String(body.telefono || "").trim();

  // Validar formato de fecha
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError_("Formato de fecha inválido. Usar YYYY-MM-DD");
  }

  // ── 2. Verificar disponibilidad del slot ───────────────
  var slotLibre = isSlotAvailable_(date, time);
  if (!slotLibre) {
    return jsonError_("El horario " + date + " " + time + " ya no está disponible. Selecciona otro horario.", 409);
  }

  // ── 3. Generar ticket ──────────────────────────────────
  var ticket    = generarTicket_(date);
  var now       = new Date();
  var salaJitsi = "NutriAge_" + telefono.replace(/[^0-9]/g, "");

  // ── 4a. HOJA PACIENTES ─────────────────────────────────
  // Cols: A=Ticket, B=Nombre, C=Email, D=Teléfono, E=RUT, F=Edad,
  // G=Ocupación, H=Peso, I=Talla, J=IMC(fórmula), K=Motivo,
  // L=FechaCita, M=HoraCita, N=Estado, O=Comprobante,
  // P=WANotificado, Q=FechaRegistro, R=NotasInternas
  var shP      = getSheet_(CONFIG.SH_PACIENTES);
  var rowP     = Math.max(shP.getLastRow() + 1, CONFIG.DATA_START_ROW);
  var imcFmt   = '=IF(AND(H' + rowP + '<>"",I' + rowP + '<>""),ROUND(H' + rowP + '/(I' + rowP + '^2),1),"")';

  shP.getRange(rowP, 1, 1, 18).setValues([[
    ticket,
    nombre,
    email,
    telefono,
    String(body.rut       || ""),
    String(body.edad      || ""),
    String(body.ocupacion || ""),
    String(body.peso      || ""),
    String(body.talla     || ""),
    imcFmt,
    String(body.motivo    || ""),
    date,
    time,
    "Confirmado",
    "",          // Comprobante URL (se actualiza luego)
    "No",        // WA Notificado
    now,
    ""           // Notas internas
  ]]);
  shP.getRange(rowP, 12).setNumberFormat("yyyy-mm-dd");
  shP.getRange(rowP, 17).setNumberFormat("yyyy-mm-dd hh:mm");

  // ── 4b. HOJA FORMULARIO_CLINICO (38 cols) ──────────────
  var shF  = getSheet_(CONFIG.SH_FORM);
  var rowF = Math.max(shF.getLastRow() + 1, CONFIG.DATA_START_ROW);

  shF.getRange(rowF, 1, 1, 38).setValues([[
    // IDENTIFICACIÓN (9)
    ticket, nombre, email, telefono,
    String(body.rut       || ""), String(body.edad      || ""),
    String(body.ocupacion || ""), String(body.peso      || ""),
    String(body.talla     || ""),
    // ANAMNESIS MÉDICA (5)
    String(body.enfermedad  || ""), String(body.lesion   || ""),
    String(body.familiar    || ""), String(body.cirugia  || ""),
    String(body.convivencia || ""),
    // ESTILO DE VIDA (6)
    String(body.actividad  || ""), String(body.horario   || ""),
    String(body.sueno      || ""), String(body.nodislike || ""),
    String(body.almuerzo   || ""), String(body.horcomida || ""),
    // ALERGIAS Y SUPLEMENTOS (2)
    String(body.alergias    || ""), String(body.suplemento || ""),
    // CONSUMO (2)
    String(body.alcohol || ""), String(body.tabaco || ""),
    // DIGESTIÓN (1)
    String(body.gastro || ""),
    // FRECUENCIA SEMANAL (7)
    String(body.cereales  || ""), String(body.legumbres || ""),
    String(body.pescado   || ""), String(body.fruta     || ""),
    String(body.verduras  || ""), String(body.dulces    || ""),
    String(body.lacteos   || ""),
    // REGISTRO 24H (1)
    String(body.registro24 || ""),
    // CITA (5)
    String(body.motivo || ""), date, time, "Confirmado", "No"
  ]]);
  shF.getRange(rowF, 35).setNumberFormat("yyyy-mm-dd");

  // ── 4c. HOJA CITAS ─────────────────────────────────────
  // Cols: Ticket|Nombre|Email|Tel|Fecha|Hora|Duración|Modalidad|Estado|Sala|WAP|WAN|Notas
  var shC  = getSheet_(CONFIG.SH_CITAS);
  var rowC = Math.max(shC.getLastRow() + 1, CONFIG.DATA_START_ROW);

  shC.getRange(rowC, 1, 1, 13).setValues([[
    ticket, nombre, email, telefono,
    date, time, CONFIG.DURACION_SLOT_MIN, "Videollamada",
    "Confirmado", salaJitsi, "No", "No", ""
  ]]);
  shC.getRange(rowC, 5).setNumberFormat("yyyy-mm-dd");

  // ── 4d. HOJA PAGOS ─────────────────────────────────────
  // Cols: Ticket|Nombre|FechaCita|Monto|Método|Estado|FechaTransf|CompRecib|UrlArchivo|RUTTitular|Banco|Notas
  var shPa  = getSheet_(CONFIG.SH_PAGOS);
  var rowPa = Math.max(shPa.getLastRow() + 1, CONFIG.DATA_START_ROW);

  shPa.getRange(rowPa, 1, 1, 12).setValues([[
    ticket, nombre, date, CONFIG.PRECIO_CONSULTA,
    "Transferencia", "Pendiente", "", "No", "", "",
    "Banco Estado", ""
  ]]);
  shPa.getRange(rowPa, 3).setNumberFormat("yyyy-mm-dd");
  shPa.getRange(rowPa, 4).setNumberFormat('"$"#,##0');

  // ── 5. Marcar slot como reservado ─────────────────────
  markSlotReserved_(date, time, ticket, nombre);

  // ── 6. Subir comprobante si viene en base64 ────────────
  var comprobanteUrl = "";
  if (body.comprobanteBase64) {
    try {
      var uploadResult = subirComprobanteADrive_(
        body.comprobanteBase64,
        body.comprobanteNombre || ("comprobante_" + ticket + ".jpg"),
        body.comprobanteMime   || "image/jpeg",
        ticket
      );
      comprobanteUrl = uploadResult.fileUrl;

      // Actualizar URL en PACIENTES col O y PAGOS
      shP.getRange(rowP, 15).setValue(comprobanteUrl);
      shPa.getRange(rowPa, 7).setValue(now);          // Fecha transferencia
      shPa.getRange(rowPa, 8).setValue("Sí");         // Comprobante recibido
      shPa.getRange(rowPa, 9).setValue(comprobanteUrl);
      shPa.getRange(rowPa, 6).setValue("Recibido");   // Estado pago
    } catch(errComp) {
      Logger.log("Error subiendo comprobante: " + errComp.message);
      // No fallar el registro completo por esto
    }
  }

  // ── 7. Emails de notificación ─────────────────────────
  try { sendConfirmationEmail_(ticket, nombre, email, date, time); }
  catch(err) { Logger.log("Email paciente error: " + err.message); }

  try { sendNutriNotification_(ticket, nombre, email, telefono, date, time, body.motivo); }
  catch(err) { Logger.log("Email nutri error: " + err.message); }

  return jsonOk_({
    ticket        : ticket,
    date          : date,
    time          : time,
    dateFormatted : formatDateES_(date),
    salaJitsi     : salaJitsi,
    comprobanteUrl: comprobanteUrl,
    message       : "Registro exitoso"
  });
}

/**
 * POST { action:"uploadComprobante", ticket, comprobanteBase64, nombreArchivo, mimeType }
 * Sube comprobante a Drive y actualiza estado en PACIENTES y PAGOS.
 */
function handleUploadComprobante_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket)                  return jsonError_("Campo 'ticket' requerido");
  if (!body.comprobanteBase64)  return jsonError_("Campo 'comprobanteBase64' requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return jsonError_("Ticket no encontrado: " + ticket, 404);

  var nombreArchivo = body.nombreArchivo || ("comprobante_" + ticket + ".jpg");
  var mimeType      = body.mimeType      || "image/jpeg";

  var uploadResult = subirComprobanteADrive_(body.comprobanteBase64, nombreArchivo, mimeType, ticket);
  var fileUrl      = uploadResult.fileUrl;
  var fileId       = uploadResult.fileId;

  // Actualizar PACIENTES col O (Comprobante URL)
  getSheet_(CONFIG.SH_PACIENTES).getRange(foundP.rowIndex, 15).setValue(fileUrl);

  // Actualizar PAGOS
  var shPa     = getSheet_(CONFIG.SH_PAGOS);
  var lastRowPa = shPa.getLastRow();
  if (lastRowPa >= CONFIG.DATA_START_ROW) {
    var pagos = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 9).getValues();
    for (var i = 0; i < pagos.length; i++) {
      if (String(pagos[i][0]).trim().toUpperCase() === ticket) {
        var rp = CONFIG.DATA_START_ROW + i;
        shPa.getRange(rp, 6).setValue("Recibido");
        shPa.getRange(rp, 7).setValue(new Date());
        shPa.getRange(rp, 8).setValue("Sí");
        shPa.getRange(rp, 9).setValue(fileUrl);
        break;
      }
    }
  }

  // Notificar a Fernanda
  try {
    MailApp.sendEmail({
      to      : CONFIG.NUTRI_EMAIL,
      subject : "📎 Comprobante recibido — " + ticket,
      htmlBody:
        "<div style='font-family:Arial,sans-serif;max-width:480px'>" +
        "<div style='background:#3d2459;padding:18px;border-radius:10px 10px 0 0'>" +
          "<h2 style='color:#fff;margin:0'>📎 Comprobante recibido</h2></div>" +
        "<div style='background:#fff;padding:18px;border:1px solid #e8e0f0;border-top:none'>" +
          "<p><b>Ticket:</b> " + ticket + "</p>" +
          "<p><b>Archivo:</b> " + nombreArchivo + "</p>" +
          "<p><a href='" + fileUrl + "' target='_blank' style='color:#6b4a9a'>Ver comprobante en Drive →</a></p>" +
        "</div></div>"
    });
  } catch(err) { Logger.log("Email comprobante error: " + err.message); }

  return jsonOk_({ ticket: ticket, fileUrl: fileUrl, fileId: fileId, message: "Comprobante guardado" });
}

/**
 * POST { action:"updateCitaStatus", ticket, estado, notas }
 * Actualiza estado en CITAS, PACIENTES y (si Completado) en PAGOS.
 * Estados válidos: Pendiente | Confirmado | En curso | Completado | Cancelado | No asistió
 */
function handleUpdateCitaStatus_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  var estado = String(body.estado || "").trim();
  var notas  = String(body.notas  || "").trim();

  if (!ticket) return jsonError_("Campo 'ticket' requerido");
  if (!estado) return jsonError_("Campo 'estado' requerido");

  var estadosValidos = ["Pendiente","Confirmado","En curso","Completado","Cancelado","No asistió"];
  if (estadosValidos.indexOf(estado) === -1) {
    return jsonError_("Estado no válido. Opciones: " + estadosValidos.join(", "));
  }

  // Actualizar PACIENTES col N (14) y R (18 = notas)
  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return jsonError_("Ticket no encontrado: " + ticket, 404);

  var shP = getSheet_(CONFIG.SH_PACIENTES);
  shP.getRange(foundP.rowIndex, 14).setValue(estado);
  if (notas) shP.getRange(foundP.rowIndex, 18).setValue(notas);

  // Actualizar CITAS col I (9) y M (13 = notas)
  var shC      = getSheet_(CONFIG.SH_CITAS);
  var lastRowC = shC.getLastRow();
  if (lastRowC >= CONFIG.DATA_START_ROW) {
    var citas = shC.getRange(CONFIG.DATA_START_ROW, 1, lastRowC - CONFIG.DATA_START_ROW + 1, 13).getValues();
    for (var i = 0; i < citas.length; i++) {
      if (String(citas[i][0]).trim().toUpperCase() === ticket) {
        var rc = CONFIG.DATA_START_ROW + i;
        shC.getRange(rc, 9).setValue(estado);
        if (notas) shC.getRange(rc, 13).setValue(notas);
        break;
      }
    }
  }

  // Si Completado → marcar PAGOS como Verificado (solo si estaba Recibido)
  if (estado === "Completado") {
    var shPa     = getSheet_(CONFIG.SH_PAGOS);
    var lastRowPa = shPa.getLastRow();
    if (lastRowPa >= CONFIG.DATA_START_ROW) {
      var pagos = shPa.getRange(CONFIG.DATA_START_ROW, 1, lastRowPa - CONFIG.DATA_START_ROW + 1, 6).getValues();
      for (var j = 0; j < pagos.length; j++) {
        if (String(pagos[j][0]).trim().toUpperCase() === ticket) {
          var rpago = CONFIG.DATA_START_ROW + j;
          if (String(pagos[j][5]).trim() === "Recibido") {
            shPa.getRange(rpago, 6).setValue("Verificado");
          }
          break;
        }
      }
    }
  }

  // Si Cancelado → liberar el slot
  if (estado === "Cancelado") {
    try {
      var d = foundP.data;
      liberarSlot_(toDateKey_(d[11]), String(d[12] || ""));
    } catch(err) { Logger.log("liberarSlot error: " + err.message); }
  }

  return jsonOk_({ ticket: ticket, newEstado: estado, message: "Estado actualizado correctamente" });
}

/**
 * POST { action:"blockSlot", date, time, motivo, tipoBloqueo }
 * Bloquea un horario desde el panel de la nutricionista.
 */
function handleBlockSlot_(body) {
  var date   = String(body.date  || "").trim();
  var time   = String(body.time  || "").trim();
  var motivo = String(body.motivo || "Personal").trim();
  var tipo   = String(body.tipoBloqueo || "Personal").trim();

  if (!date || !time) return jsonError_("Campos 'date' y 'time' son requeridos");

  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();

  if (lastRow >= CONFIG.DATA_START_ROW) {
    var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 6).getValues();
    for (var i = 0; i < data.length; i++) {
      var rowDate    = toDateKey_(data[i][0]);
      var rowTime    = String(data[i][2] || "").trim();
      var reservado  = String(data[i][4] || "").trim();
      if (rowDate === date && rowTime === time) {
        if (reservado) return jsonError_("No se puede bloquear: tiene reserva " + reservado, 409);
        var r = CONFIG.DATA_START_ROW + i;
        sh.getRange(r, 4).setValue("No");
        sh.getRange(r, 7).setValue(tipo);
        sh.getRange(r, 8).setValue(motivo);
        return jsonOk_({ message: "Slot bloqueado: " + date + " " + time });
      }
    }
  }

  // Slot no existe → agregarlo como bloqueado
  var days_es = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var dObj    = new Date(date + "T12:00:00");
  var newRow  = sh.getLastRow() + 1;
  sh.getRange(newRow, 1, 1, 9).setValues([[
    date, days_es[dObj.getDay()], time, "No", "", "", tipo, motivo, ""
  ]]);
  sh.getRange(newRow, 1).setNumberFormat("yyyy-mm-dd");

  return jsonOk_({ message: "Slot bloqueado (nuevo): " + date + " " + time });
}

/**
 * POST { action:"unblockSlot", date, time }
 * Desbloquea un horario sin reserva activa.
 */
function handleUnblockSlot_(body) {
  var date = String(body.date || "").trim();
  var time = String(body.time || "").trim();
  if (!date || !time) return jsonError_("Campos 'date' y 'time' son requeridos");

  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return jsonError_("No hay datos en DISPONIBILIDAD");

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate   = toDateKey_(data[i][0]);
    var rowTime   = String(data[i][2] || "").trim();
    var reservado = String(data[i][4] || "").trim();
    if (rowDate === date && rowTime === time) {
      if (reservado) return jsonError_("No se puede desbloquear: tiene reserva activa " + reservado, 409);
      var r = CONFIG.DATA_START_ROW + i;
      sh.getRange(r, 4).setValue("Sí");
      sh.getRange(r, 7).setValue("");
      sh.getRange(r, 8).setValue("");
      return jsonOk_({ message: "Slot desbloqueado: " + date + " " + time });
    }
  }
  return jsonError_("Slot no encontrado: " + date + " " + time, 404);
}

/**
 * POST { action:"saveNutriTimes", date, times:["09:00","10:00",...] }
 * Guarda los horarios habilitados para un día completo desde el panel de la nutri.
 * Preserva las reservas existentes aunque el slot se "deshabilite" en la UI.
 */
function handleSaveNutriTimes_(body) {
  var date  = String(body.date  || "").trim();
  var times = Array.isArray(body.times) ? body.times : [];
  if (!date) return jsonError_("Campo 'date' es requerido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError_("Formato de fecha inválido. Usar YYYY-MM-DD");

  // Todos los slots posibles (acordes al frontend)
  var ALL_SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"];
  var sh        = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow   = sh.getLastRow();
  var days_es   = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var dObj      = new Date(date + "T12:00:00");
  var diaStr    = days_es[dObj.getDay()];

  // ── Recopilar reservas existentes para este día ──────────
  var reservas = {}; // hora → { ticket, nombre }
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var raw = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 6).getValues();
    raw.forEach(function(row) {
      var rd = toDateKey_(row[0]);
      var rt = String(row[2] || "").trim();
      if (rd === date && rt) {
        reservas[rt] = { ticket: String(row[4] || ""), nombre: String(row[5] || "") };
      }
    });
  }

  // ── Eliminar filas existentes de ese día (de abajo hacia arriba) ──
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var checkData = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
    var toDelete  = [];
    for (var k = checkData.length - 1; k >= 0; k--) {
      if (toDateKey_(checkData[k][0]) === date) {
        toDelete.push(CONFIG.DATA_START_ROW + k);
      }
    }
    toDelete.forEach(function(rowIdx) { sh.deleteRow(rowIdx); });
  }

  // ── Insertar todos los slots con estado correcto ──────────
  ALL_SLOTS.forEach(function(slot) {
    var newRow    = sh.getLastRow() + 1;
    var tieneRes  = reservas[slot] && reservas[slot].ticket;
    var habilitado = times.indexOf(slot) !== -1;

    // Si tiene reserva activa, SIEMPRE disponible=Sí (para que aparezca en panel)
    var dispVal = (tieneRes || habilitado) ? "Sí" : "No";

    sh.getRange(newRow, 1, 1, 6).setValues([[
      date, diaStr, slot, dispVal,
      tieneRes ? reservas[slot].ticket : "",
      tieneRes ? reservas[slot].nombre : ""
    ]]);
    sh.getRange(newRow, 1).setNumberFormat("yyyy-mm-dd");
  });

  return jsonOk_({
    date         : date,
    timesEnabled : times,
    totalSlots   : ALL_SLOTS.length,
    message      : "Horarios del " + date + " guardados correctamente"
  });
}

/**
 * POST { action:"logVideollamada", ticket, horaInicio, horaFin,
 *        estadoLlamada, calidadConexion, notas }
 * Registra o actualiza la sesión de videollamada en VIDEOLLAMADAS.
 */
function handleLogVideollamada_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket) return jsonError_("Campo 'ticket' requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return jsonError_("Ticket no encontrado: " + ticket, 404);

  var d        = foundP.data;
  var nombre   = String(d[1] || "");
  var telefono = String(d[3] || "").replace(/[^0-9]/g, "");
  var fechaKey = toDateKey_(d[11]);
  var hora     = String(d[12] || "");
  var salaJitsi = "NutriAge_" + telefono;

  var sh      = getSheet_(CONFIG.SH_VIDEO);
  var lastRow = sh.getLastRow();

  // Buscar fila existente para actualizar (en lugar de duplicar)
  var targetRow = -1;
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var vData = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
    for (var i = 0; i < vData.length; i++) {
      if (String(vData[i][0]).trim().toUpperCase() === ticket) {
        targetRow = CONFIG.DATA_START_ROW + i;
        break;
      }
    }
  }

  if (targetRow === -1) {
    targetRow = Math.max(sh.getLastRow() + 1, CONFIG.DATA_START_ROW);
  }

  // Cols: Ticket|Nombre|Fecha|HoraInicio|HoraFin|Duración(fórmula)|Sala|Estado|Grabación|Calidad|Notas
  sh.getRange(targetRow, 1, 1, 11).setValues([[
    ticket,
    nombre,
    fechaKey,
    body.horaInicio    || hora,
    body.horaFin       || "",
    "",              // Duración — se pondrá fórmula abajo
    salaJitsi,
    body.estadoLlamada   || "Exitosa",
    "No",            // Grabación
    body.calidadConexion || "",
    body.notas         || ""
  ]]);

  // Fórmula de duración en minutos (col F = 6)
  sh.getRange(targetRow, 6).setFormula(
    "=IF(AND(D" + targetRow + "<>\"\",E" + targetRow + "<>\"\"),ROUND((TIMEVALUE(E" + targetRow + ")-TIMEVALUE(D" + targetRow + "))*1440,0),\"\")"
  );
  sh.getRange(targetRow, 3).setNumberFormat("yyyy-mm-dd");

  // También actualizar estado de la cita a "Completado" si se registra la llamada
  if (body.marcarCompletado) {
    try { handleUpdateCitaStatus_({ ticket: ticket, estado: "Completado", notas: "Videollamada completada" }); }
    catch(err) { Logger.log("marcarCompletado error: " + err.message); }
  }

  return jsonOk_({ ticket: ticket, salaJitsi: salaJitsi, message: "Videollamada registrada" });
}

/**
 * POST { action:"markWaNotificado", ticket }
 * Marca WA como notificado en PACIENTES y FORMULARIO_CLINICO.
 */
function handleMarkWaNotificado_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  if (!ticket) return jsonError_("Campo 'ticket' requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return jsonError_("Ticket no encontrado: " + ticket, 404);

  // PACIENTES col P (16)
  getSheet_(CONFIG.SH_PACIENTES).getRange(foundP.rowIndex, 16).setValue("Sí");

  // FORMULARIO col 38 (WA Notificado en sección CITA)
  var shF     = getSheet_(CONFIG.SH_FORM);
  var lastRowF = shF.getLastRow();
  if (lastRowF >= CONFIG.DATA_START_ROW) {
    var fData = shF.getRange(CONFIG.DATA_START_ROW, 1, lastRowF - CONFIG.DATA_START_ROW + 1, 1).getValues();
    for (var i = 0; i < fData.length; i++) {
      if (String(fData[i][0]).trim().toUpperCase() === ticket) {
        shF.getRange(CONFIG.DATA_START_ROW + i, 38).setValue("Sí");
        break;
      }
    }
  }

  return jsonOk_({ ticket: ticket, message: "WA marcado como notificado" });
}

/**
 * POST { action:"updateNota", ticket, nota }
 * Actualiza las notas internas de un paciente (col R en PACIENTES).
 */
function handleUpdateNota_(body) {
  var ticket = String(body.ticket || "").trim().toUpperCase();
  var nota   = String(body.nota   || "").trim();
  if (!ticket) return jsonError_("Campo 'ticket' requerido");

  var foundP = findPatientByTicket_(ticket);
  if (!foundP) return jsonError_("Ticket no encontrado: " + ticket, 404);

  getSheet_(CONFIG.SH_PACIENTES).getRange(foundP.rowIndex, 18).setValue(nota);

  return jsonOk_({ ticket: ticket, message: "Nota actualizada" });
}

// ═════════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ═════════════════════════════════════════════════════════════

/**
 * Verifica si un slot está disponible (existe, marcado Sí, sin reserva).
 */
function isSlotAvailable_(date, time) {
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return false;

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate    = toDateKey_(data[i][0]);
    var rowTime    = String(data[i][2] || "").trim();
    var disponible = String(data[i][3] || "").trim().toLowerCase();
    var reservado  = String(data[i][4] || "").trim();

    if (rowDate === date && rowTime === time) {
      return (disponible === "sí" || disponible === "si") && !reservado;
    }
  }
  return false; // Slot no existe en la hoja
}

/**
 * Marca un slot como reservado (cols E=ticket, F=nombre) en DISPONIBILIDAD.
 */
function markSlotReserved_(date, time, ticket, nombre) {
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    Logger.log("markSlotReserved_: DISPONIBILIDAD vacía para " + date + " " + time);
    return;
  }

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate = toDateKey_(data[i][0]);
    var rowTime = String(data[i][2] || "").trim();
    if (rowDate === date && rowTime === time) {
      var r = CONFIG.DATA_START_ROW + i;
      sh.getRange(r, 5).setValue(ticket);
      sh.getRange(r, 6).setValue(nombre);
      return;
    }
  }
  Logger.log("markSlotReserved_: slot no encontrado " + date + " " + time + " — no se puede marcar en DISPONIBILIDAD.");
}

/**
 * Libera un slot (elimina ticket/nombre y pone disponible=Sí) en DISPONIBILIDAD.
 * Se llama cuando se cancela una cita.
 */
function liberarSlot_(date, time) {
  if (!date || !time) return;
  var sh      = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return;

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate = toDateKey_(data[i][0]);
    var rowTime = String(data[i][2] || "").trim();
    if (rowDate === date && rowTime === time) {
      var r = CONFIG.DATA_START_ROW + i;
      sh.getRange(r, 4).setValue("Sí");  // Disponible = Sí
      sh.getRange(r, 5).setValue("");    // Limpiar ticket
      sh.getRange(r, 6).setValue("");    // Limpiar nombre
      return;
    }
  }
}

/**
 * Sube un archivo base64 a la carpeta NutriAge_Comprobantes en Drive.
 * Retorna { fileUrl, fileId }.
 */
function subirComprobanteADrive_(base64Data, nombreArchivo, mimeType, ticket) {
  var carpetaNombre = "NutriAge_Comprobantes";

  // Buscar o crear carpeta
  var folders = DriveApp.getFoldersByName(carpetaNombre);
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(carpetaNombre);

  // Limpiar prefijo data URI si existe
  var cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, "");

  var blob    = Utilities.newBlob(Utilities.base64Decode(cleanB64), mimeType, nombreArchivo);
  var file    = folder.createFile(blob);

  // Hacer el archivo accesible con enlace
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { fileUrl: file.getUrl(), fileId: file.getId() };
}

// ═════════════════════════════════════════════════════════════
//  EMAILS AUTOMÁTICOS
// ═════════════════════════════════════════════════════════════

/** Email de confirmación al paciente */
function sendConfirmationEmail_(ticket, nombre, email, date, time) {
  if (!email) return;
  var dateStr = formatDateES_(date);

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
        "<p style='color:#5a4a6e;font-size:13px'>Recuerda transferir <strong>$15.000 CLP</strong> a:<br>" +
          "Banco Estado · Cuenta RUT/Vista · RUT: 20.726.694-9 · Nombre: Fernanda Ugarte</p>" +
        "<p style='color:#5a4a6e;font-size:13px'>Adjunta el comprobante en el sitio web con tu ticket.</p>" +
        "<div style='background:#edf6ee;border-radius:8px;padding:14px;margin:16px 0'>" +
          "<p style='margin:0;color:#2d5e34;font-size:13px'>💡 Guarda tu ticket <strong>" + ticket + "</strong>. " +
          "Lo necesitarás para unirte a la videollamada el día de tu consulta.</p>" +
        "</div>" +
        "<p style='text-align:center;margin-top:16px'>" +
          "<a href='" + CONFIG.WEB_URL + "' style='background:#6b4a9a;color:#fff;padding:10px 24px;border-radius:20px;text-decoration:none;font-weight:700;font-size:13px'>Ir al sitio NutriAge →</a>" +
        "</p>" +
      "</div>" +
      "<div style='background:#f8f5fc;padding:14px;border-radius:0 0 12px 12px;text-align:center'>" +
        "<p style='color:#9882b0;font-size:11px;margin:0'>NutriAge · Sistema automático · No responder este correo</p>" +
      "</div>" +
      "</div>"
  });
}

/** Email de aviso a Fernanda con resumen del nuevo paciente */
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
        "<p style='margin-top:16px;font-size:12px;color:#aaa'>El paciente debe enviar comprobante de transferencia ($15.000) para completar la reserva.</p>" +
      "</div>" +
      "</div>"
  });
}

// ═════════════════════════════════════════════════════════════
//  TRIGGER DIARIO — Recordatorios automáticos 08:00 Santiago
//  Configurar en GAS: Triggers → recordatoriosDiarios → cada día → 08:00
// ═════════════════════════════════════════════════════════════

/**
 * Envía recordatorio a pacientes con cita MAÑANA y estado "Confirmado".
 * Ejecutar como trigger diario a las 08:00.
 */
function recordatoriosDiarios() {
  var sh      = getSheet_(CONFIG.SH_PACIENTES);
  var lastRow = sh.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) return;

  var manana    = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
  var mananaKey = Utilities.formatDate(manana, CONFIG.TZ, "yyyy-MM-dd");

  var data = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 14).getValues();

  data.forEach(function(row) {
    if (!row[0]) return;
    var ticket   = row[0], nombre = row[1], email = row[2];
    var fechaKey = toDateKey_(row[11]);
    var time     = String(row[12] || "");
    var estado   = String(row[13] || "").trim();

    if (fechaKey !== mananaKey || estado !== "Confirmado" || !email) return;

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
              "<p style='margin:4px 0'><b>📅 Fecha:</b> " + formatDateES_(fechaKey) + "</p>" +
              "<p style='margin:4px 0'><b>🕐 Hora:</b> " + time + " hrs</p>" +
              "<p style='margin:4px 0'><b>🎫 Ticket:</b> " + ticket + "</p>" +
            "</div>" +
            "<p style='font-size:13px;color:#555'>Para unirte ingresa con tu ticket en el sitio NutriAge.</p>" +
            "<p style='text-align:center;margin-top:14px'>" +
              "<a href='" + CONFIG.WEB_URL + "' style='background:#6b4a9a;color:#fff;padding:10px 22px;border-radius:20px;text-decoration:none;font-weight:700;font-size:13px'>Ir al sitio →</a>" +
            "</p>" +
          "</div>" +
          "</div>"
      });
      Logger.log("Recordatorio enviado: " + email + " para " + mananaKey);
    } catch(err) {
      Logger.log("Error recordatorio " + ticket + ": " + err.message);
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  SETUP INICIAL — Ejecutar UNA SOLA VEZ desde el editor GAS
// ═════════════════════════════════════════════════════════════

/**
 * Ejecuta esta función UNA VEZ para:
 * 1. Verificar que el Spreadsheet existe
 * 2. Verificar que todas las hojas existen
 * 3. Crear el trigger diario de recordatorios
 * 4. Precargar disponibilidad para los próximos 60 días (lunes-viernes)
 *
 * Ver resultado en: Ver → Registro de ejecución (Logs)
 */
function setup() {
  Logger.log("=== NutriAge GAS v4 — Setup ===");

  // 1. Verificar Spreadsheet
  try {
    var ss = getSpreadsheet_();
    Logger.log("✅ Spreadsheet: " + ss.getName() + " (" + CONFIG.SPREADSHEET_ID + ")");
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
  var allOk = true;
  sheetsRequired.forEach(function(name) {
    try {
      getSheet_(name);
      Logger.log("✅ Hoja OK: " + name);
    } catch(err) {
      Logger.log("❌ Hoja no encontrada: '" + name + "' — Créala manualmente en Google Sheets con ese nombre exacto.");
      allOk = false;
    }
  });
  if (!allOk) {
    Logger.log("❌ Crea las hojas faltantes y ejecuta setup() de nuevo.");
    return;
  }

  // 3. Precargar disponibilidad (60 días futuros, lunes-viernes)
  precargarDisponibilidad_();

  // 4. Crear trigger diario de recordatorios
  var triggers   = ScriptApp.getProjectTriggers();
  var hasTrigger = triggers.some(function(t) {
    return t.getHandlerFunction() === "recordatoriosDiarios";
  });
  if (!hasTrigger) {
    ScriptApp.newTrigger("recordatoriosDiarios")
      .timeBased()
      .atHour(8)
      .everyDays(1)
      .inTimezone(CONFIG.TZ)
      .create();
    Logger.log("✅ Trigger diario de recordatorios creado (08:00 Santiago)");
  } else {
    Logger.log("ℹ️  Trigger ya existía — sin cambios");
  }

  Logger.log("=== Setup completo ✅ ===");
  Logger.log("Próximo paso: Implementar → Administrar implementaciones → Nueva versión → Implementar");
  Logger.log("Copia la URL generada y pégala en el index.html como GAS_URL");
}

/**
 * Precarga la hoja DISPONIBILIDAD con horarios de lunes a viernes
 * para los próximos 60 días. Solo agrega fechas que no existan ya.
 * Los horarios habilitados por defecto: 09:00 a 21:00 (hora en hora).
 */
function precargarDisponibilidad_() {
  var sh        = getSheet_(CONFIG.SH_DISPONIBILIDAD);
  var ALL_SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"];
  var days_es   = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

  // Recopilar fechas ya existentes en la hoja
  var lastRow   = sh.getLastRow();
  var existing  = {};
  if (lastRow >= CONFIG.DATA_START_ROW) {
    var existData = sh.getRange(CONFIG.DATA_START_ROW, 1, lastRow - CONFIG.DATA_START_ROW + 1, 3).getValues();
    existData.forEach(function(row) {
      var fk = toDateKey_(row[0]);
      var ht = String(row[2] || "").trim();
      if (fk && ht) existing[fk + "_" + ht] = true;
    });
  }

  var today    = new Date();
  var agregados = 0;

  for (var i = 1; i <= 60; i++) {
    var d   = new Date(today);
    d.setDate(today.getDate() + i);
    var dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // Solo lunes a viernes

    var dateKey = Utilities.formatDate(d, CONFIG.TZ, "yyyy-MM-dd");
    var diaStr  = days_es[dow];

    ALL_SLOTS.forEach(function(slot) {
      var key = dateKey + "_" + slot;
      if (!existing[key]) {
        var newRow = sh.getLastRow() + 1;
        sh.getRange(newRow, 1, 1, 4).setValues([[dateKey, diaStr, slot, "Sí"]]);
        sh.getRange(newRow, 1).setNumberFormat("yyyy-mm-dd");
        agregados++;
      }
    });
  }

  Logger.log("✅ Disponibilidad precargada: " + agregados + " slots nuevos agregados");
}

// ─────────────────────────────────────────────────────────────
//  FIN DEL SCRIPT — NutriAge GAS v4
//  Desarrollado para: Fernanda Ugarte · nutriage2026@gmail.com
//  Web: https://nutriage2026-create.github.io/Nutriage-web/
// ─────────────────────────────────────────────────────────────
