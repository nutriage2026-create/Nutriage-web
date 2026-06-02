import re
from flask import Blueprint, request, jsonify
from app.services.notion import get_lead, upload_file_to_lead, update_lead_status
from app.services.notifications import (
    send_email, send_whatsapp_callmebot, _fmt_fecha_hora_cl,
)
from app.config import settings

bp = Blueprint("pago", __name__, url_prefix="/pago")

PRECIO_CONSULTA = 15000
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


def _prop(props, name, default=""):
    return props.get(name, {}) or {}


def _cita_desde_notas(notas: str) -> str:
    """Extrae el ISO de la cita guardado como 'Cita: <iso> | ...' en las notas."""
    if not notas:
        return ""
    m = re.search(r"Cita:\s*(\S+)", notas)
    return m.group(1) if m else ""


@bp.get("/<lead_id>")
def info_pago(lead_id):
    """
    Datos públicos para la página de pago del paciente:
    nombre, fecha de la cita, monto y estado de pago.
    """
    try:
        page = get_lead(lead_id)
    except Exception:
        return jsonify({"error": "Consulta no encontrada"}), 404

    props   = page.get("properties", {})
    titulo  = (_prop(props, "Nombre").get("title") or [])
    nombre  = titulo[0].get("plain_text", "") if titulo else ""
    notas_rt = _prop(props, "Notas").get("rich_text") or []
    notas    = notas_rt[0].get("plain_text", "") if notas_rt else ""
    estado   = (_prop(props, "Estado de pago").get("select") or {}).get("name", "")

    return jsonify({
        "nombre":     nombre,
        "cita":       _cita_desde_notas(notas),
        "monto":      PRECIO_CONSULTA,
        "estadoPago": estado,
    })


@bp.post("/<lead_id>/comprobante")
def subir_comprobante(lead_id):
    """
    Recibe el comprobante (multipart 'file'), lo adjunta al lead en Notion,
    marca 'Por verificar' y avisa a la nutricionista.
    """
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No se recibió ningún archivo"}), 400

    content = f.read()
    if len(content) > MAX_BYTES:
        return jsonify({"error": "El archivo supera los 8 MB"}), 400
    if not content:
        return jsonify({"error": "El archivo está vacío"}), 400

    filename = f.filename or "comprobante"
    ctype = f.mimetype or "application/octet-stream"

    # 1. Subir el comprobante a Notion + marcar "Por verificar"
    try:
        upload_file_to_lead(lead_id, filename, content, ctype)
        update_lead_status(lead_id, estado_pago="Por verificar")
    except Exception as e:
        return jsonify({"error": f"No se pudo guardar el comprobante: {e}"}), 502

    # 2. Avisar a la nutricionista (no bloquea la respuesta)
    try:
        page = get_lead(lead_id)
        props = page.get("properties", {})
        titulo = (_prop(props, "Nombre").get("title") or [])
        nombre = titulo[0].get("plain_text", "Paciente") if titulo else "Paciente"
        notas_rt = _prop(props, "Notas").get("rich_text") or []
        notas = notas_rt[0].get("plain_text", "") if notas_rt else ""
        fecha = _fmt_fecha_hora_cl(_cita_desde_notas(notas))

        body = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#3d2459">🧾 Comprobante de pago recibido</h2>
          <hr>
          <p><strong>Paciente:</strong> {nombre}</p>
          <p><strong>Consulta:</strong> {fecha}</p>
          <p>El paciente subió su comprobante de transferencia. Revísalo en tu
             dashboard y, si está todo bien, marca el pago como
             <strong>Pagado</strong> para enviarle el link de la sala.</p>
          <hr>
          <small style="color:#999">Aviso automático desde NutriAge</small>
        </div>
        """
        if settings.NUTRICIONISTA_EMAILS:
            send_email(settings.NUTRICIONISTA_EMAILS,
                       f"NutriAge · Comprobante de {nombre}", body)
        send_whatsapp_callmebot(
            f"🧾 *Comprobante recibido*\n👤 {nombre}\n📅 {fecha}\n"
            f"Revísalo en tu dashboard y marca 'Pagado' para enviar el link."
        )
    except Exception as e:
        print(f"[pago] aviso nutricionista falló: {e}")

    return jsonify({"ok": True, "estadoPago": "Por verificar"}), 201
