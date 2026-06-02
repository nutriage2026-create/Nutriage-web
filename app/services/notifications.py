import smtplib
import urllib.parse
import httpx
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import settings


def send_email(to, subject: str, body_html: str) -> bool:
    """
    Envia email via Gmail SMTP. Acepta string o lista de destinatarios.
    Requiere GMAIL_USER y GMAIL_APP_PASSWORD.
    """
    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        print("[notifications] Gmail no configurado — email no enviado.")
        return False

    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.GMAIL_USER
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD)
        server.sendmail(settings.GMAIL_USER, recipients, msg.as_string())

    return True


def send_whatsapp_callmebot(message: str) -> bool:
    """
    Envia WhatsApp a la nutricionista via CallMeBot (gratuito).
    Requiere NUTRICIONISTA_WHATSAPP + CALLMEBOT_API_KEY configurados.
    """
    phone = settings.NUTRICIONISTA_WHATSAPP
    key = settings.CALLMEBOT_API_KEY
    if not phone or not key:
        print("[notifications] WhatsApp no configurado — mensaje no enviado.")
        return False
    try:
        url = "https://api.callmebot.com/whatsapp.php"
        params = {"phone": phone, "text": message, "apikey": key}
        with httpx.Client(timeout=10) as c:
            r = c.get(url, params=params)
            return r.is_success
    except Exception as e:
        print(f"[notifications] WhatsApp error: {e}")
        return False


def _fmt_fecha_hora_cl(iso_start: str) -> str:
    """Devuelve 'mier. 21 de mayo, 11:45 (hora Chile)' a partir de un ISO UTC."""
    if not iso_start:
        return "—"
    try:
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        dt_utc = datetime.fromisoformat(iso_start.replace("Z", "+00:00"))
        if dt_utc.tzinfo is None:
            dt_utc = dt_utc.replace(tzinfo=timezone.utc)
        # Zona horaria real de Chile: ajusta solo verano (-3) / invierno (-4),
        # igual que el dashboard (timeZone:'America/Santiago' en JS).
        dt_cl  = dt_utc.astimezone(ZoneInfo("America/Santiago"))
        dias  = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
        meses = ["enero","febrero","marzo","abril","mayo","junio",
                 "julio","agosto","septiembre","octubre","noviembre","diciembre"]
        return f"{dias[dt_cl.weekday()]} {dt_cl.day} de {meses[dt_cl.month-1]}, {dt_cl.strftime('%H:%M')} (hora Chile)"
    except Exception:
        return iso_start


def notify_nueva_cita(payload: dict) -> None:
    """
    Envia correo (a todos los NUTRICIONISTA_EMAILS) y WhatsApp con el detalle
    de una cita recien agendada. No bloquea: si falla, se loguea y sigue.
    payload esperado:
      nombre, email, telefono, start, tipo, objetivo, video_url, ficha
    """
    emails = settings.NUTRICIONISTA_EMAILS
    if not emails and not settings.NUTRICIONISTA_WHATSAPP:
        return

    nombre   = payload.get("nombre") or "Paciente"
    email_p  = payload.get("email") or "—"
    tel      = payload.get("telefono") or "—"
    fecha    = _fmt_fecha_hora_cl(payload.get("start") or "")
    tipo     = payload.get("tipo") or "—"
    objetivo = payload.get("objetivo") or "—"
    video    = payload.get("video_url") or ""
    ficha    = payload.get("ficha") or {}

    # ── Correo HTML ───────────────────────────────────────────────
    ficha_rows = ""
    if ficha:
        talla = ""
        if ficha.get("tallaM") and ficha.get("tallaCm"):
            talla = f"{ficha['tallaM']} m {ficha['tallaCm']} cm"
        elif ficha.get("tallaM"):
            talla = f"{ficha['tallaM']} m"
        elif ficha.get("tallaCm"):
            talla = f"{ficha['tallaCm']} cm"
        rows = [
            ("Edad",       f"{ficha['edad']} años" if ficha.get("edad") else ""),
            ("Género",     ficha.get("genero", "")),
            ("Peso",       f"{ficha['peso']} kg" if ficha.get("peso") else ""),
            ("Talla",      talla),
            ("Actividad",  ficha.get("actividad", "")),
            ("Enfermedades",  ficha.get("enfermedades", "")),
            ("Operaciones",   ficha.get("operaciones", "")),
            ("Intolerancias", ficha.get("intolerancias", "")),
        ]
        ficha_rows = "".join(
            f"<tr><td style='padding:4px 8px;color:#64748b;font-size:.85em'>{k}</td>"
            f"<td style='padding:4px 8px;color:#0f172a'>{v}</td></tr>"
            for k, v in rows if v
        )

    video_html = f"<p><strong>Sala virtual:</strong> <a href='{video}'>{video}</a></p>" if video else ""
    ficha_html = (
        f"<h3 style='color:#3d2459;margin-top:18px'>Ficha clinica</h3>"
        f"<table style='border-collapse:collapse'>{ficha_rows}</table>"
    ) if ficha_rows else ""

    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#3d2459">🥗 Nueva reserva en NutriAge</h2>
      <hr>
      <p><strong>Paciente:</strong> {nombre}</p>
      <p><strong>Correo:</strong> {email_p}</p>
      <p><strong>Telefono:</strong> {tel}</p>
      <p><strong>Cuando:</strong> {fecha}</p>
      <p><strong>Tipo de consulta:</strong> {tipo}</p>
      <p><strong>Objetivo:</strong> {objetivo}</p>
      {video_html}
      {ficha_html}
      <hr>
      <small style="color:#999">Aviso automatico desde NutriAge · revisa la ficha completa en el dashboard antes de la consulta</small>
    </div>
    """
    try:
        send_email(emails, f"NutriAge · Nueva reserva: {nombre}", body_html)
    except Exception as e:
        print(f"[notifications] correo nueva_cita fallo: {e}")

    # ── WhatsApp texto plano ──────────────────────────────────────
    # Importante: SOLO datos basicos (nombre + fecha + tipo + link sala).
    # No mandamos telefono, objetivo ni ficha clinica por WhatsApp porque
    # CallMeBot no tiene contrato formal de tratamiento de datos y la
    # Ley 19.628/20.584 trata esa info como dato sensible de salud.
    # La ficha completa va solo por correo (Gmail SMTP con compliance).
    wa_lines = [
        f"🥗 *Nueva reserva NutriAge*",
        f"👤 {nombre}",
        f"📅 {fecha}",
        f"🩺 {tipo}",
    ]
    if video:
        wa_lines.append(f"🎥 {video}")
    wa_lines.append("📋 Revisa la ficha completa en tu dashboard")
    try:
        send_whatsapp_callmebot("\n".join(wa_lines))
    except Exception as e:
        print(f"[notifications] whatsapp nueva_cita fallo: {e}")


def build_lead_email(nombre: str, analysis: dict) -> str:
    score = analysis.get("score", "—")
    temperatura = analysis.get("temperatura", "—")
    resumen = analysis.get("resumen", "")
    recs = analysis.get("recomendaciones", [])
    color = {"Hot": "#e74c3c", "Warm": "#f39c12", "Cold": "#3498db"}.get(temperatura, "#666")
    items = "".join(f"<li>{r}</li>" for r in recs)

    return f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#3d2459">🥗 NutriAge — Nuevo lead analizado por IA</h2>
      <hr>
      <p><strong>Paciente:</strong> {nombre}</p>
      <p><strong>Lead Score:</strong> <span style="font-size:1.4em;font-weight:bold">{score}/10</span></p>
      <p><strong>Temperatura:</strong>
         <span style="background:{color};color:#fff;padding:3px 10px;border-radius:12px">{temperatura}</span>
      </p>
      <p><strong>Resumen:</strong><br>{resumen}</p>
      <p><strong>Recomendaciones:</strong></p>
      <ul>{items}</ul>
      <hr>
      <small style="color:#999">Generado automáticamente por el agente NutriAge IA</small>
    </div>
    """
