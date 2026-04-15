from flask import Blueprint, request, jsonify
from app.services.calcom import get_event_types, get_available_slots

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
