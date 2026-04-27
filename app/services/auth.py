import time
from functools import wraps
import jwt
from flask import request, jsonify
from app.config import settings

ALGO = "HS256"
TOKEN_TTL_SECONDS = 24 * 60 * 60  # 24 horas


def generate_token(role: str = "nutricionista") -> str:
    if not settings.JWT_SECRET:
        raise RuntimeError("JWT_SECRET no configurado")
    payload = {
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGO)


def verify_token(token: str) -> dict | None:
    if not settings.JWT_SECRET:
        return None
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Falta token de autenticacion"}), 401
        token = header[7:].strip()
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Token invalido o expirado"}), 401
        request.auth = payload
        return fn(*args, **kwargs)
    return wrapper
