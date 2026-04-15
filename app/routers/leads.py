from flask import Blueprint, request, jsonify
from app.services.notion import create_lead, update_lead_status, get_leads

bp = Blueprint("leads", __name__, url_prefix="/leads")


@bp.post("/")
def new_lead():
    """
    Crea un nuevo lead en Notion CRM.
    Body JSON: nombre, email, telefono, objetivo, canal, temperatura, estatus, notas, edad, presupuesto
    """
    data = request.get_json(silent=True)
    if not data or not data.get("nombre"):
        return jsonify({"error": "El campo 'nombre' es obligatorio"}), 400
    try:
        result = create_lead(data)
        return jsonify({"id": result["id"], "url": result.get("url")}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/")
def list_leads():
    """
    Lista leads con filtros opcionales.
    Query params: estatus, temperatura
    """
    estatus = request.args.get("estatus")
    temperatura = request.args.get("temperatura")
    try:
        results = get_leads(estatus=estatus, temperatura=temperatura)
        leads = []
        for r in results:
            props = r.get("properties", {})
            leads.append({
                "id": r["id"],
                "nombre": props.get("Nombre", {}).get("title", [{}])[0].get("plain_text", ""),
                "temperatura": props.get("Temperatura", {}).get("select", {}).get("name", ""),
                "estatus": props.get("Estatus", {}).get("select", {}).get("name", ""),
                "email": props.get("Email", {}).get("email", ""),
            })
        return jsonify({"total": len(leads), "leads": leads})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.patch("/<page_id>/status")
def update_status(page_id):
    """
    Actualiza temperatura, estatus y/o resumen de un lead.
    Body JSON: temperatura, estatus, resumen (todos opcionales)
    """
    data = request.get_json(silent=True) or {}
    try:
        result = update_lead_status(
            page_id,
            temperatura=data.get("temperatura"),
            estatus=data.get("estatus"),
            resumen=data.get("resumen"),
        )
        return jsonify({"id": result["id"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
