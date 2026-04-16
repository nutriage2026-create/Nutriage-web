from flask import Blueprint, request, jsonify
from app.services.calcom import get_bookings

bp = Blueprint("bookings", __name__, url_prefix="/bookings")


@bp.get("/")
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
                "id":       b.get("id"),
                "title":    b.get("title", ""),
                "start":    b.get("startTime", ""),
                "end":      b.get("endTime", ""),
                "status":   b.get("status", ""),
                "nombre":   nombre,
                "email":    email,
                "videoUrl": (b.get("metadata") or {}).get("videoCallUrl", ""),
            })
        return jsonify({"total": len(bookings), "bookings": bookings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
