import smtplib
import urllib.parse
import httpx
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from app.config import settings


def build_email_message(sender, recipients, subject, body_html, attachments=None):
    """
    Arma un mensaje MIME (con adjuntos opcionales). Separado del envio para
    poder testearlo sin tocar SMTP.
    attachments: lista de (filename, content_bytes, content_type).
    """
    msg = MIMEMultipart("mixed")
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_html, "html", "utf-8"))
    msg.attach(alt)

    for filename, content_bytes, content_type in (attachments or []):
        maintype, _, subtype = (content_type or "application/octet-stream").partition("/")
        part = MIMEBase(maintype or "application", subtype or "octet-stream")
        part.set_payload(content_bytes)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)

    return msg


def send_email(to, subject: str, body_html: str, attachments=None) -> bool:
    """
    Envia email via Gmail SMTP. Acepta string o lista de destinatarios.
    attachments: lista de (filename, content_bytes, content_type) opcional.
    Requiere GMAIL_USER y GMAIL_APP_PASSWORD.
    """
    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        print("[notifications] Gmail no configurado — email no enviado.")
        return False

    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        return False

    msg = build_email_message(settings.GMAIL_USER, recipients, subject, body_html, attachments)

    # Intenta varios puertos/modos. Render bloquea algunos puertos SMTP salientes;
    # probamos 587 (STARTTLS) y 465 (SSL) con timeout corto para no colgar el worker.
    intentos = [
        ("587-starttls", 587),
        ("465-ssl",      465),
    ]
    ultimo_error = None
    for nombre, puerto in intentos:
        try:
            if puerto == 465:
                server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=8)
            else:
                server = smtplib.SMTP("smtp.gmail.com", puerto, timeout=8)
                server.ehlo()
                server.starttls()
                server.ehlo()
            with server:
                server.login(settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD)
                server.sendmail(settings.GMAIL_USER, recipients, msg.as_string())
            print(f"[notifications] email enviado via {nombre}")
            return True
        except Exception as e:
            ultimo_error = e
            print(f"[notifications] fallo SMTP {nombre}: {type(e).__name__}: {e}")

    print(f"[notifications] todos los modos SMTP fallaron — ultimo: {ultimo_error}")
    return False


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


def notify_pago_paciente(nombre: str, email: str, monto: int, cita_iso: str, link: str) -> bool:
    """
    Envía al paciente el correo con el valor de la consulta (definido por la
    nutricionista) y el link para realizar el pago y subir su comprobante.
    """
    if not email:
        print("[notifications] paciente sin email — correo de pago no enviado.")
        return False
    primer_nombre = (nombre or "").split(" ")[0] or "paciente"
    fecha = _fmt_fecha_hora_cl(cita_iso)
    monto_fmt = f"${int(monto):,}".replace(",", ".")
    body = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0f172a">
      <h2 style="color:#3d2459;font-family:Georgia,serif">Hola {primer_nombre} 👋</h2>
      <p>Tu consulta nutricional con <strong>Fernanda Ugarte</strong> está casi lista.
         Para confirmarla, te dejamos el detalle del pago:</p>
      <div style="background:#f0e8fa;border:1px solid #d4bbec;border-radius:12px;padding:16px 18px;margin:18px 0">
        <p style="margin:4px 0"><strong>📅 Cita:</strong> {fecha}</p>
        <p style="margin:4px 0;font-size:1.15rem"><strong>💳 Valor de la consulta:</strong>
           <span style="color:#2d5e34;font-weight:800">{monto_fmt}</span></p>
      </div>
      <p style="text-align:center;margin:26px 0">
        <a href="{link}" style="background:#4a8c54;color:#fff;text-decoration:none;
           padding:13px 28px;border-radius:10px;font-weight:700;display:inline-block">
           Pagar y subir comprobante →</a>
      </p>
      <p style="font-size:.85rem;color:#64748b">Si el botón no funciona, copia este enlace:<br>
         <a href="{link}" style="color:#6b4a9a">{link}</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <small style="color:#999">Correo automático de NutriAge · responde este correo si tienes dudas.</small>
    </div>
    """
    try:
        return send_email(email, "NutriAge · Valor y pago de tu consulta", body)
    except Exception as e:
        print(f"[notifications] correo de pago al paciente falló: {e}")
        return False


def notify_pago_nutricionista(nombre: str, email_paciente: str, monto: int,
                              cita_iso: str, link: str) -> bool:
    """
    Envía a la nutricionista (NUTRICIONISTA_EMAILS) una copia con el link de pago
    y los datos del paciente, para que ella misma pueda reenviárselo si hace falta.
    """
    emails = settings.NUTRICIONISTA_EMAILS
    if not emails:
        return False
    primer_nombre = (nombre or "").split(" ")[0] or "paciente"
    fecha = _fmt_fecha_hora_cl(cita_iso)
    monto_fmt = f"${int(monto):,}".replace(",", ".")
    body = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0f172a">
      <h2 style="color:#3d2459;font-family:Georgia,serif">💳 Link de pago de {primer_nombre}</h2>
      <p>Ya se le envió el correo de pago al paciente. Aquí tienes el mismo
         <strong>link de pago</strong> por si quieres enviárselo tú directo
         (WhatsApp, correo, etc.):</p>
      <div style="background:#f0e8fa;border:1px solid #d4bbec;border-radius:12px;padding:16px 18px;margin:18px 0">
        <p style="margin:4px 0"><strong>👤 Paciente:</strong> {nombre or '—'}</p>
        <p style="margin:4px 0"><strong>✉️ Correo:</strong> {email_paciente or '—'}</p>
        <p style="margin:4px 0"><strong>📅 Cita:</strong> {fecha}</p>
        <p style="margin:4px 0;font-size:1.15rem"><strong>💳 Valor:</strong>
           <span style="color:#2d5e34;font-weight:800">{monto_fmt}</span></p>
      </div>
      <p style="text-align:center;margin:26px 0">
        <a href="{link}" style="background:#4a8c54;color:#fff;text-decoration:none;
           padding:13px 28px;border-radius:10px;font-weight:700;display:inline-block">
           Abrir link de pago →</a>
      </p>
      <p style="font-size:.85rem;color:#64748b">Link para copiar y enviar:<br>
         <a href="{link}" style="color:#6b4a9a">{link}</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <small style="color:#999">Copia automática de NutriAge para la nutricionista.</small>
    </div>
    """
    try:
        return send_email(emails, f"NutriAge · Link de pago de {primer_nombre}", body)
    except Exception as e:
        print(f"[notifications] copia de pago a la nutricionista falló: {e}")
        return False


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
