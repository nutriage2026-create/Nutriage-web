from flask import Blueprint, request, jsonify
from app.services import notion
from app.services.auth import require_auth

bp = Blueprint("ficha360", __name__, url_prefix="/ficha360")

MAX_BYTES = 20 * 1024 * 1024  # 20 MB (límite de subida single-part de Notion)


@bp.get("/<lead_id>")
@require_auth
def get_ficha(lead_id):
    """Devuelve {data, archivos} de la ficha 360° del paciente."""
    try:
        return jsonify(notion.get_ficha360(lead_id))
    except Exception as e:
        return jsonify({"error": f"No se pudo leer la ficha: {e}"}), 502


@bp.put("/<lead_id>")
@require_auth
def put_ficha(lead_id):
    """Guarda los datos estructurados (mediciones, laboratorio, plan, notas)."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Cuerpo inválido"}), 400
    try:
        notion.save_ficha360(lead_id, data)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": f"No se pudo guardar la ficha: {e}"}), 502


@bp.post("/<lead_id>/archivo")
@require_auth
def post_archivo(lead_id):
    """Sube un archivo (PDF/foto) y lo adjunta a la página del paciente."""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No se recibió ningún archivo"}), 400
    section = request.form.get("section", "lab")
    content = f.read()
    if not content:
        return jsonify({"error": "El archivo está vacío"}), 400
    if len(content) > MAX_BYTES:
        return jsonify({"error": "El archivo supera los 20 MB"}), 400
    try:
        res = notion.append_ficha_file(
            lead_id, f.filename or "archivo", content,
            f.mimetype or "application/octet-stream", section)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": f"No se pudo subir el archivo: {e}"}), 502


@bp.delete("/archivo/<block_id>")
@require_auth
def del_archivo(block_id):
    """Elimina un archivo (bloque) de la página del paciente."""
    try:
        notion.delete_block(block_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": f"No se pudo eliminar: {e}"}), 502
