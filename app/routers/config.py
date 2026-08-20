from flask import Blueprint, request, jsonify
from app.services.notion import get_valor_consulta, set_valor_consulta
from app.services.auth import require_auth

bp = Blueprint("config", __name__, url_prefix="/config")

VALOR_MIN = 1000
VALOR_MAX = 500000


@bp.get("/valor-consulta")
def valor_consulta_get():
    """Valor vigente de la consulta. Publico: lo necesita booking.html."""
    return jsonify({"valor": get_valor_consulta()})


@bp.patch("/valor-consulta")
@require_auth
def valor_consulta_set():
    """
    Cambia el valor de la consulta.
    Body JSON: { "valor": 20000 }
    """
    data = request.get_json(silent=True) or {}
    raw = data.get("valor")
    try:
        valor = int(float(raw))
    except (TypeError, ValueError):
        return jsonify({"error": "El campo 'valor' debe ser un numero"}), 400
    if not (VALOR_MIN <= valor <= VALOR_MAX):
        return jsonify({
            "error": f"El valor debe estar entre ${VALOR_MIN:,} y ${VALOR_MAX:,}".replace(",", ".")
        }), 400
    try:
        return jsonify({"valor": set_valor_consulta(valor)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
