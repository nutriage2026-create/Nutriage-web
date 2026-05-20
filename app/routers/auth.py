import hmac
from flask import Blueprint, request, jsonify
from app.config import settings
from app.services.auth import generate_token, require_auth

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.get("/notify-config")
@require_auth
def notify_config():
    """
    Devuelve si los avisos de nueva reserva estan configurados.
    Solo lectura — la edicion se hace en las env vars de Render.
    """
    emails = settings.NUTRICIONISTA_EMAILS
    return jsonify({
        "emails":         emails,
        "whatsapp":       settings.NUTRICIONISTA_WHATSAPP or "",
        "whatsapp_ready": bool(settings.NUTRICIONISTA_WHATSAPP and settings.CALLMEBOT_API_KEY),
        "email_ready":    bool(emails and settings.GMAIL_USER and settings.GMAIL_APP_PASSWORD),
    })


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")

    if not settings.FERNANDA_PASSWORD:
        return jsonify({"error": "Servicio de autenticacion no configurado"}), 500

    if not hmac.compare_digest(password, settings.FERNANDA_PASSWORD):
        return jsonify({"error": "Credenciales invalidas"}), 401

    token = generate_token(role="nutricionista")
    return jsonify({"token": token, "role": "nutricionista", "expires_in": 24 * 60 * 60})


@bp.get("/verify")
@require_auth
def verify():
    return jsonify({"valid": True, "role": request.auth.get("role")})
