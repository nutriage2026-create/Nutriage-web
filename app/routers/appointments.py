from flask import Blueprint, request, jsonify
from app.services.calcom import create_booking
from app.services.notion import create_lead, save_agent_history, get_valores_consulta
from app.services.notifications import notify_nueva_cita
from app.routers.config import monto_a_pagar

bp = Blueprint("appointments", __name__, url_prefix="/appointments")


@bp.post("/")
def book_appointment():
    """
    Agenda una reunión en Cal.com y crea el lead en Notion automáticamente.
    Body JSON:
      - eventTypeId (str, requerido)
      - start       (ISO-8601, requerido)  ej: "2026-05-10T10:00:00Z"
      - name        (str, requerido)
      - email       (str, requerido)
      - telefono    (str, opcional)
      - objetivo    (str, opcional)
      - canal       (str, opcional)  ej: "Instagram"
      - notes       (str, opcional)
      - telefono    (str)  WhatsApp del paciente
      - modalidad   (str)  "virtual" (online) | "presencial"
    """
    data = request.get_json(silent=True) or {}
    required = ["eventTypeId", "start", "name", "email", "telefono", "modalidad"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Faltan campos: {', '.join(missing)}"}), 400

    if data["modalidad"] not in ("presencial", "virtual"):
        return jsonify({"error": "Elige la modalidad: presencial u online"}), 400
    modalidad = data["modalidad"]
    modalidad_txt = "Presencial" if modalidad == "presencial" else "Online"

    # 1. Agendar en Cal.com
    try:
        booking = create_booking(
            event_type_id=data["eventTypeId"],
            start=data["start"],
            name=data["name"],
            email=data["email"],
            notes=data.get("notes", ""),
            modalidad=modalidad,
        )
    except Exception as e:
        return jsonify({"error": f"Cal.com error: {str(e)}"}), 502

    booking_id = booking.get("data", {}).get("id", "")
    booking_url = booking.get("data", {}).get("meetingUrl", "") if modalidad == "virtual" else ""

    # Precio vigente al momento de reservar. Queda congelado en la cita: si la
    # nutricionista sube la tarifa despues, esta cita mantiene lo que el
    # paciente vio al agendar.
    valor = get_valores_consulta()[modalidad]

    # 2. Crear lead en Notion con estatus "Cita agendada"
    try:
        lead = create_lead({
            "nombre":      data["name"],
            "email":       data["email"],
            "telefono":    data.get("telefono", ""),
            "objetivo":    data.get("objetivo", ""),
            "canal":       data.get("canal", "Web"),
            "estatus":     "Cita agendada",
            "estado_pago": "Pendiente",
            "valor":       valor,
            "temperatura": "Warm",
            "notas":       f"Cita: {data['start']} | Booking ID: {booking_id} | Modalidad: {modalidad_txt} | {data.get('notes','')}",
        })
    except Exception as e:
        return jsonify({"error": f"Notion error: {str(e)}", "booking": booking}), 502

    # 3. Registrar en historial del agente
    try:
        save_agent_history(
            titulo=f"Cita agendada — {data['name']}",
            tipo="Seguimiento sugerido",
            paciente=data["name"],
            contenido=(
                f"Reserva creada en Cal.com.\n"
                f"Fecha: {data['start']}\n"
                f"Booking ID: {booking_id}\n"
                f"Meeting URL: {booking_url}\n"
                f"Lead creado en Notion: {lead.get('id','')}"
            ),
        )
    except Exception:
        pass  # historial no debe bloquear la respuesta

    # 4. Notificar a la nutricionista (correo + WhatsApp). No bloquea la respuesta.
    try:
        notify_nueva_cita({
            "nombre":    data["name"],
            "email":     data["email"],
            "telefono":  data.get("telefono", ""),
            "start":     data["start"],
            "tipo":      "Primera consulta" if data.get("ficha") else "Seguimiento",
            "objetivo":  data.get("objetivo", ""),
            "video_url": booking_url,
            "modalidad": modalidad_txt,
            "ficha":     data.get("ficha") or {},
        })
    except Exception as e:
        print(f"[appointments] notificacion fallo: {e}")

    return jsonify({
        "booking": {
            "id": booking_id,
            "start": data["start"],
            "meetingUrl": booking_url,
        },
        "lead": {
            "id": lead.get("id"),
            "url": lead.get("url"),
        },
        "pago": {
            "valor": valor,
            "monto": monto_a_pagar(valor, modalidad),
            "estado": "Pendiente",
        },
    }), 201
