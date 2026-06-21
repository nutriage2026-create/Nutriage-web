import re
from flask import Blueprint, request, jsonify
from app.services.notion import get_lead, upload_file_to_lead, update_lead_status
from app.services.notifications import (
    send_email, send_whatsapp_callmebot, _fmt_fecha_hora_cl,
    notify_pago_paciente, notify_pago_nutricionista,
)
from app.config import settings

bp = Blueprint("pago", __name__, url_prefix="/pago")

PRECIO_CONSULTA = 15000          # valor por defecto si la nutricionista no definió uno
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


def _monto_lead(props) -> int:
    """Valor de la consulta definido por la nutricionista; cae al precio base."""
    v = props.get("Valor consulta", {}).get("number")
    return int(v) if v else PRECIO_CONSULTA


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
        "monto":      _monto_lead(props),
        "estadoPago": estado,
    })


@bp.post("/<lead_id>/enviar")
def enviar_pago(lead_id):
    """
    La nutricionista define el valor de la consulta y dispara el correo al
    paciente con ese monto + el link para pagar y subir su comprobante.
    Body JSON (opcional): { "valor": 18000 }
    """
    try:
        return _enviar_pago_impl(lead_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "diag", "tipo": type(e).__name__, "detalle": str(e)}), 500


def _enviar_pago_impl(lead_id):
    data = request.get_json(silent=True) or {}
    valor = data.get("valor")

    try:
        page = get_lead(lead_id)
    except Exception:
        return jsonify({"error": "Consulta no encontrada"}), 404

    props = page.get("properties", {})

    # Si llega un valor nuevo, lo guardamos y dejamos el pago en "Pendiente".
    if valor not in (None, ""):
        try:
            update_lead_status(lead_id, valor=int(valor), estado_pago="Pendiente")
            props["Valor consulta"] = {"number": int(valor)}
        except Exception as e:
            return jsonify({"error": f"No se pudo guardar el valor: {e}"}), 502

    monto = _monto_lead(props)
    if monto <= 0:
        return jsonify({"error": "Define un valor de consulta antes de enviar"}), 400

    titulo  = (_prop(props, "Nombre").get("title") or [])
    nombre  = titulo[0].get("plain_text", "") if titulo else ""
    email   = _prop(props, "Email").get("email") or ""
    notas_rt = _prop(props, "Notas").get("rich_text") or []
    notas    = notas_rt[0].get("plain_text", "") if notas_rt else ""
    cita_iso = _cita_desde_notas(notas)

    if not email:
        return jsonify({"error": "El paciente no tiene correo registrado"}), 400

    link = f"{settings.PUBLIC_BASE_URL}/pago-pagina?id={lead_id}"
    enviado = notify_pago_paciente(nombre, email, monto, cita_iso, link)
    if not enviado:
        return jsonify({"error": "No se pudo enviar el correo (revisa Gmail)"}), 502

    # Copia a la nutricionista con el mismo link, por si quiere enviarlo ella.
    try:
        notify_pago_nutricionista(nombre, email, monto, cita_iso, link)
    except Exception as e:
        print(f"[pago] copia a nutricionista falló: {e}")

    return jsonify({"ok": True, "email": email, "monto": monto}), 200


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
          <p>El paciente subió su comprobante de transferencia (adjunto en este
             correo). Revísalo en tu dashboard y, si está todo bien, marca el
             pago como <strong>Pagado</strong> para enviarle el link de la sala.</p>
          <hr>
          <small style="color:#999">Aviso automático desde NutriAge · el comprobante va adjunto</small>
        </div>
        """
        if settings.NUTRICIONISTA_EMAILS:
            send_email(settings.NUTRICIONISTA_EMAILS,
                       f"NutriAge · Comprobante de {nombre}", body,
                       attachments=[(filename, content, ctype)])
        send_whatsapp_callmebot(
            f"🧾 *Comprobante recibido*\n👤 {nombre}\n📅 {fecha}\n"
            f"Revísalo en tu dashboard y marca 'Pagado' para enviar el link."
        )
    except Exception as e:
        print(f"[pago] aviso nutricionista falló: {e}")

    return jsonify({"ok": True, "estadoPago": "Por verificar"}), 201
