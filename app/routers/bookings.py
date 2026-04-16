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
        data = get_bookings(status=status, limit=limit)
        # Normalizar respuesta: extraer attendee principal de cada booking
        bookings = []
        for b in (data.get("data") or []):
            attendees = b.get("attendees") or []
            patient = next((a for a in attendees if a.get("email") != "nutriage-2026-qu8nfk"), attendees[0] if attendees else {})
            bookings.append({
                "id":       b.get("id"),
                "title":    b.get("title", ""),
                "start":    b.get("start", ""),
                "end":      b.get("end", ""),
                "status":   b.get("status", ""),
                "nombre":   patient.get("name", "—"),
                "email":    patient.get("email", ""),
                "metadata": b.get("metadata", {}),
            })
        return jsonify({"total": len(bookings), "bookings": bookings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
