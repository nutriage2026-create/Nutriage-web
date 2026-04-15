from flask import Blueprint, jsonify
from app.services.notion import get_notion_client
from app.config import settings

bp = Blueprint("patients", __name__, url_prefix="/patients")


@bp.get("/")
def list_patients():
    if not settings.NOTION_DB_PACIENTES:
        return jsonify({"message": "NOTION_DB_PACIENTES no configurado aún"})

    notion = get_notion_client()
    results = notion.databases.query(database_id=settings.NOTION_DB_PACIENTES)
    return jsonify({"total": len(results["results"]), "patients": results["results"]})
