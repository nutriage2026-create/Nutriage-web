from flask import Blueprint, request, jsonify
from app.services.calcom import get_bookings, reschedule_booking, cancel_booking
from app.services.auth import require_auth

bp = Blueprint("bookings", __name__, url_prefix="/bookings")


@bp.get("/")
@require_auth
def list_bookings():
    """
    Lista citas agendadas desde Cal.com.
    Query params: status (upcoming | past | cancelled | all), limit
    """
    status = request.args.get("status", "upcoming")
    limit  = int(request.args.get("limit", 20))
    try:
        raw = get_bookings(status=status, limit=limit)
        # Cal.com v2 structure: raw.data.bookings
        inner   = raw.get("data") or {}
        bk_list = inner.get("bookings") or [] if isinstance(inner, dict) else []

        bookings = []
        for b in bk_list:
            resp  = b.get("responses") or {}
            nombre = resp.get("name") or (b.get("attendees") or [{}])[0].get("name", "—")
            email  = resp.get("email") or (b.get("attendees") or [{}])[0].get("email", "")
            bookings.append({
                "id":          b.get("id"),
                "uid":         b.get("uid", ""),
                "eventTypeId": b.get("eventTypeId") or (b.get("eventType") or {}).get("id", ""),
                "title":       b.get("title", ""),
                "start":       b.get("startTime", ""),
                "end":         b.get("endTime", ""),
                "status":      b.get("status", ""),
                "nombre":      nombre,
                "email":       email,
                "videoUrl":    (b.get("metadata") or {}).get("videoCallUrl", ""),
            })
        return jsonify({"total": len(bookings), "bookings": bookings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/<uid>/reschedule")
@require_auth
def reschedule(uid):
    """
    Reagenda una cita existente. Solo la nutricionista (token JWT).
    Body JSON:
      - start  (ISO-8601, requerido)  ej "2026-05-22T14:00:00Z"
      - reason (str, opcional)
    """
    data = request.get_json(silent=True) or {}
    new_start = data.get("start")
    if not new_start:
        return jsonify({"error": "Se requiere 'start' (ISO-8601)"}), 400
    try:
        result = reschedule_booking(uid=uid, new_start=new_start, reason=data.get("reason", ""))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@bp.post("/<uid>/cancel")
@require_auth
def cancel(uid):
    """
    Cancela una cita. Cal.com libera el slot automaticamente, asi que vuelve
    a estar disponible en /availability/slots para nuevas reservas.
    Body JSON: reason (str, opcional)
    """
    data = request.get_json(silent=True) or {}
    try:
        result = cancel_booking(uid=uid, reason=data.get("reason", ""))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 502
