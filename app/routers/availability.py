from flask import Blueprint, request, jsonify
from app.services.calcom import get_event_types, get_available_slots, get_schedule, update_schedule

bp = Blueprint("availability", __name__, url_prefix="/availability")


@bp.get("/event-types")
def event_types():
    """Lista los tipos de evento disponibles en Cal.com"""
    try:
        data = get_event_types()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/slots")
def slots():
    """
    Busca horarios disponibles.
    Query params: eventTypeId, start (ISO), end (ISO)
    Ejemplo: /availability/slots?eventTypeId=123&start=2026-05-01T00:00:00Z&end=2026-05-07T23:59:59Z
    """
    event_type_id = request.args.get("eventTypeId")
    start = request.args.get("start")
    end = request.args.get("end")

    if not all([event_type_id, start, end]):
        return jsonify({"error": "Se requieren: eventTypeId, start, end"}), 400

    try:
        data = get_available_slots(event_type_id, start, end)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/schedule")
def schedule_get():
    """Obtiene el horario semanal activo de Cal.com."""
    try:
        return jsonify(get_schedule())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.patch("/schedule")
def schedule_update():
    """
    Actualiza horario semanal y/o bloqueos de fechas.
    Body JSON:
      - id          (int, requerido) — ID del schedule
      - availability (list) — [{days:[...], startTime, endTime}]
      - overrides   (list) — [{date:"YYYY-MM-DD", startTime?, endTime?}]
    """
    data = request.get_json(silent=True) or {}
    sid  = data.get("id")
    if not sid:
        return jsonify({"error": "Se requiere 'id' del schedule"}), 400
    try:
        result = update_schedule(
            schedule_id=int(sid),
            availability=data.get("availability", []),
            overrides=data.get("overrides", []),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
