import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import settings


def send_email(to: str, subject: str, body_html: str) -> bool:
    """
    Envía email via Gmail SMTP.
    Requiere GMAIL_USER y GMAIL_APP_PASSWORD en .env
    """
    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        print("[notifications] Gmail no configurado — email no enviado.")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.GMAIL_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD)
        server.sendmail(settings.GMAIL_USER, to, msg.as_string())

    return True


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
