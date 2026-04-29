from flask import Blueprint, request, jsonify
from app.services.notion import find_lead_by_email, append_consulta_blocks
from app.services.auth import require_auth

bp = Blueprint("consultas", __name__, url_prefix="/consultas")


@bp.post("/cerrar")
@require_auth
def cerrar_consulta():
    """
    Cierra una consulta y appendea bloques al body del lead en Notion.
    Body JSON: email (obl), hablado (obl), plan, seguimiento, cerradaEn,
               bookingId, paciente, fechaCita
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    hablado = (data.get("hablado") or "").strip()
    plan = (data.get("plan") or "").strip()
    seguimiento = (data.get("seguimiento") or "").strip()
    cerrada_en = (data.get("cerradaEn") or "").strip()

    if not email:
        return jsonify({"error": "Falta el email del paciente"}), 400
    if not hablado:
        return jsonify({"error": "El campo 'hablado' es obligatorio"}), 400

    try:
        lead = find_lead_by_email(email)
    except Exception as e:
        return jsonify({"error": f"Error consultando Notion: {e}"}), 502

    if not lead:
        return jsonify({
            "error": f"No se encontró un paciente con email {email} en Notion"
        }), 404

    page_id = lead["id"]
    try:
        append_consulta_blocks(
            page_id=page_id,
            hablado=hablado,
            plan=plan,
            seguimiento=seguimiento,
            fecha_cierre=cerrada_en,
        )
    except Exception as e:
        return jsonify({"error": f"Error escribiendo en Notion: {e}"}), 502

    return jsonify({
        "ok": True,
        "leadId": page_id,
        "leadUrl": lead.get("url"),
    }), 200
