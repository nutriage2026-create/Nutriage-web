from flask import Blueprint, request, jsonify
import logging

bp = Blueprint("webhooks", __name__, url_prefix="/webhooks")
logger = logging.getLogger(__name__)


@bp.post("/make")
def receive_make_webhook():
    """Endpoint que Make.com llama cuando se dispara una automatización."""
    payload = request.get_json(silent=True) or {}
    logger.info(f"Webhook recibido desde Make.com: {payload}")
    return jsonify({"status": "ok", "received": payload})
