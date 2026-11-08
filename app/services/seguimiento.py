import html
import re
import time
from datetime import date, datetime, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.services.calcom import get_bookings
from app.services.notifications import send_email
from app.services.notion import (
    BASE, _h, _find_config_row, _list_children, _patch, _post,
)

CLAVE_ULTIMO_ENVIO = "Seguimiento ultimo envio"
MIN_DIAS = 7
MAX_DIAS = 56  # a las 8 semanas el paciente deja de aparecer

_RE_CONSULTA = re.compile(r"Consulta\s*·\s*(\d{2})/(\d{2})/(\d{4})")
_RE_FECHA = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
_RE_EDAD = re.compile(r"Edad:\s*(\d{1,3})")
_RE_PESO = re.compile(r"Peso:\s*(\d+(?:[.,]\d+)?)")

_COLORES = {
    "verde":    ("🟢", "#4a8c54"),
    "amarillo": ("🟡", "#d9a520"),
    "rojo":     ("🔴", "#c0483f"),
}


def hoy_chile() -> date:
    return datetime.now(ZoneInfo("America/Santiago")).date()


# ── Lectura de datos ──────────────────────────────────────────────────────────

def _texto(items: list) -> str:
    return "".join(x.get("plain_text", "") for x in items or [])


def _fecha_ddmmyyyy(match) -> date | None:
    try:
        d, m, y = match.groups()
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def extraer_consultas(bloques: list) -> list:
    """Lee los bloques que deja /consultas/cerrar en la página del paciente."""
    consultas, actual = [], None
    for b in bloques:
        tipo = b.get("type")
        if tipo == "divider":
            actual = None
        elif tipo == "heading_3":
            fecha = _fecha_ddmmyyyy(_RE_CONSULTA.search(_texto(b["heading_3"].get("rich_text"))))
            actual = {"fecha": fecha, "hablado": "", "plan": "", "seguimiento": None} if fecha else None
            if actual:
                consultas.append(actual)
        elif tipo == "paragraph" and actual is not None:
            txt = _texto(b["paragraph"].get("rich_text"))
            if txt.startswith("Qué se habló:"):
                actual["hablado"] = txt.split(":", 1)[1].strip()
            elif txt.startswith("Plan:"):
                actual["plan"] = txt.split(":", 1)[1].strip()
            elif txt.startswith("Próximo seguimiento:"):
                actual["seguimiento"] = _fecha_ddmmyyyy(_RE_FECHA.search(txt))
    return consultas


def resumir_paciente(email: str, leads: list, consultas: list) -> dict:
    """Une todas las reservas de un mismo correo en un solo paciente."""
    leads = sorted(leads, key=lambda l: l.get("created_time", ""))
    nombre = telefono = objetivo = ""
    edad = peso = None
    for lead in leads:
        p = lead.get("properties", {})
        notas = _texto(p.get("Notas", {}).get("rich_text"))
        nombre = _texto(p.get("Nombre", {}).get("title")) or nombre
        telefono = p.get("Telefono", {}).get("phone_number") or telefono
        objetivo = (p.get("Objetivo", {}).get("select") or {}).get("name") or objetivo
        if edad is None:
            m = _RE_EDAD.search(notas)
            edad = p.get("Edad", {}).get("number") or (int(m.group(1)) if m else None)
        if peso is None:
            m = _RE_PESO.search(notas)
            peso = m.group(1).replace(",", ".") if m else None
    ultima = sorted(consultas, key=lambda c: c["fecha"])[-1]
    return {"email": email, "nombre": nombre or "Paciente", "telefono": telefono,
            "objetivo": objetivo, "edad": edad, "peso": peso, **ultima}


def _todos_los_leads() -> list:
    out, cursor = [], None
    with httpx.Client(timeout=20) as c:
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            r = c.post(f"{BASE}/databases/{settings.NOTION_DB_LEADS}/query",
                       headers=_h(), json=body)
            if not r.is_success:
                raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
            j = r.json()
            out += j.get("results", [])
            if not j.get("has_more"):
                return out
            cursor = j.get("next_cursor")


def _bloques(page_id: str) -> list:
    try:
        return _list_children(page_id)
    except Exception:
        time.sleep(1.5)  # Notion limita las peticiones por segundo
        return _list_children(page_id)


def _emails_con_hora_futura() -> set:
    raw = get_bookings(status="upcoming", limit=100)
    inner = raw.get("data") or {}
    bookings = inner.get("bookings") or [] if isinstance(inner, dict) else []
    emails = set()
    for b in bookings:
        for a in b.get("attendees") or []:
            emails.add((a.get("email") or "").strip().lower())
        emails.add(((b.get("responses") or {}).get("email") or "").strip().lower())
    emails.discard("")
    return emails


def recolectar(hoy: date) -> tuple:
    """Devuelve (items para el correo, avisos para la nutricionista)."""
    por_email = {}
    for lead in _todos_los_leads():
        email = (lead.get("properties", {}).get("Email", {}).get("email") or "").strip().lower()
        if email:
            por_email.setdefault(email, []).append(lead)

    avisos = []
    try:
        con_hora = _emails_con_hora_futura()
    except Exception as e:
        print(f"[seguimiento] Cal.com fallo: {e}")
        con_hora = set()
        avisos.append("No se pudo revisar la agenda: puede aparecer alguien que ya tiene hora.")

    pacientes, fallidos = [], 0
    for email, leads in por_email.items():
        if email in con_hora:
            continue
        consultas = []
        for lead in leads:
            try:
                consultas += extraer_consultas(_bloques(lead["id"]))
            except Exception as e:
                print(f"[seguimiento] no se pudo leer un paciente: {e}")
                fallidos += 1
        if consultas:
            pacientes.append(resumir_paciente(email, leads, consultas))
    if fallidos:
        avisos.append(f"No se pudieron revisar {fallidos} registro(s): la lista puede estar incompleta.")
    return armar_items(pacientes, hoy), avisos


# ── Reglas del seguimiento ────────────────────────────────────────────────────

def armar_items(pacientes: list, hoy: date) -> list:
    items = []
    for p in pacientes:
        dias = (hoy - p["fecha"]).days
        seg = p.get("seguimiento")
        toca = seg is not None and hoy - timedelta(days=14) <= seg <= hoy + timedelta(days=2)
        if not (MIN_DIAS <= dias <= MAX_DIAS or toca):
            continue
        semanas = dias // 7
        color = "verde" if semanas <= 2 else "amarillo" if semanas <= 4 else "rojo"
        items.append({**p, "dias": dias, "semanas": semanas, "color": color, "toca": toca})
    return sorted(items, key=lambda i: (not i["toca"], -i["dias"]))


def tiempo_texto(dias: int) -> str:
    if dias < 7:
        return "Hace menos de 1 semana"
    semanas = dias // 7
    return "Hace 1 semana" if semanas == 1 else f"Hace {semanas} semanas"


def _texto_control(seg: date, hoy: date) -> str:
    if seg < hoy:
        return f"📅 Control pendiente desde el {seg:%d/%m}"
    if seg == hoy:
        return "📅 Le toca control hoy"
    return f"📅 Le toca control el {seg:%d/%m}"


def mensaje_whatsapp(item: dict) -> str:
    primer_nombre = item["nombre"].split(" ")[0]
    reserva = f"{settings.PUBLIC_BASE_URL}/booking"
    semanas = item["semanas"]
    inicio = f"Hola {primer_nombre}! 🌿 Soy Fernanda, tu nutricionista."
    if item["toca"]:
        return f"{inicio} Ya nos toca control para ver cómo vas. Puedes reservar tu hora aquí: {reserva}"
    if semanas <= 1:
        return f"{inicio} Ya pasó una semana desde nuestra consulta. ¿Cómo te has sentido con el plan?"
    if semanas == 2:
        return f"{inicio} Ya van 2 semanas desde nuestra consulta. ¿Has tenido alguna dificultad con el plan? Cuéntame y lo ajustamos."
    if semanas <= 4:
        return f"{inicio} Ya van {semanas} semanas desde nuestra consulta. ¿Cómo vas con tu objetivo? Si quieres, agendamos un control aquí: {reserva}"
    return f"{inicio} Hace un tiempo que no conversamos y quería saber cómo estás. Cuando quieras retomamos: {reserva}"


def digitos_telefono(telefono: str) -> str:
    digitos = re.sub(r"\D", "", telefono or "")
    if len(digitos) == 9 and digitos.startswith("9"):
        digitos = "56" + digitos
    return digitos


def link_whatsapp(telefono: str, mensaje: str) -> str:
    digitos = digitos_telefono(telefono)
    return f"https://wa.me/{digitos}?text={quote(mensaje)}" if digitos else ""


# ── Correo ────────────────────────────────────────────────────────────────────

def _e(valor) -> str:
    return html.escape(str(valor), quote=True)


def _recortar(texto: str, largo: int = 180) -> str:
    return texto if len(texto) <= largo else texto[:largo].rstrip() + "…"


def _boton(url: str, texto: str, fondo: str, color: str) -> str:
    return (f'<a href="{_e(url)}" style="display:inline-block;background:{fondo};color:{color};'
            f'text-decoration:none;font-weight:700;font-size:13px;padding:8px 12px;'
            f'border-radius:8px;margin:0 6px 6px 0">{texto}</a>')


def _linea_telefono(telefono: str) -> str:
    digitos = digitos_telefono(telefono)
    if not digitos:
        return '<div style="font-size:14px;color:#94a3b8;margin:6px 0 0">📞 Sin número registrado</div>'
    return (f'<div style="font-size:15px;font-weight:700;margin:6px 0 0">📞 '
            f'<a href="tel:+{_e(digitos)}" style="color:#3d2459;text-decoration:none">'
            f'{_e(telefono)}</a></div>')


def _tarjeta(item: dict, hoy: date) -> str:
    icono, borde = _COLORES[item["color"]]
    datos = []
    if item.get("edad"):
        datos.append(f"{_e(item['edad'])} años")
    if item.get("peso"):
        datos.append(f"Peso inicial: {_e(item['peso'])} kg")
    datos.append(f"Objetivo: {_e(item.get('objetivo') or 'Sin registrar')}")

    control = ""
    if item["toca"]:
        control = (f'<div style="background:#f0e8fa;color:#3d2459;font-weight:700;font-size:13px;'
                   f'padding:6px 10px;border-radius:8px;margin:8px 0">'
                   f'{_texto_control(item["seguimiento"], hoy)}</div>')

    notas = ""
    if item.get("hablado"):
        notas += f'<p style="margin:6px 0;font-size:13px"><strong>Última nota:</strong> {_e(_recortar(item["hablado"]))}</p>'
    if item.get("plan"):
        notas += f'<p style="margin:6px 0;font-size:13px"><strong>Plan:</strong> {_e(_recortar(item["plan"]))}</p>'

    wa = link_whatsapp(item.get("telefono", ""), mensaje_whatsapp(item))
    contacto = (_boton(wa, "💬 Escribirle", "#e3f1e5", "#2d5e34") if wa
                else _boton(f"mailto:{item['email']}", "✉️ Escribirle", "#e3f1e5", "#2d5e34"))
    panel = _boton(f"{settings.PUBLIC_BASE_URL}/dashboard", "📋 Abrir panel", "#f0e8fa", "#3d2459")

    return f"""
    <div style="border:1px solid #e8e2d9;border-left:5px solid {borde};border-radius:10px;
                padding:14px 16px;margin:0 0 12px;background:#ffffff">
      <div style="font-size:16px;font-weight:700;color:#3d2459">{icono} {_e(item['nombre'])}</div>
      <div style="font-size:13px;color:#64748b;margin:2px 0 8px">
        {tiempo_texto(item['dias'])} · consulta del {item['fecha']:%d/%m/%Y}
      </div>
      <div style="font-size:14px;color:#0f172a">{' · '.join(datos)}</div>
      {_linea_telefono(item.get('telefono', ''))}
      {control}{notas}
      <div style="margin-top:10px">{contacto}{panel}</div>
    </div>"""


def construir_correo(items: list, avisos: list, hoy: date) -> tuple:
    total = len(items)
    if total == 0:
        asunto = "🌿 Seguimiento: hoy no hay pacientes por contactar"
        cuerpo = '<p style="font-size:15px">Hoy no hay pacientes por contactar. ¡Vas al día!</p>'
    else:
        palabra = "paciente" if total == 1 else "pacientes"
        asunto = f"🌿 Seguimiento: {total} {palabra} por contactar"
        cuerpo = "".join(_tarjeta(i, hoy) for i in items)

    bloque_avisos = "".join(
        f'<p style="background:#fdf3d7;border-radius:8px;padding:8px 12px;font-size:13px">⚠️ {_e(a)}</p>'
        for a in avisos
    )
    html_correo = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;
                background:#faf7f2;color:#0f172a">
      <h2 style="color:#3d2459;font-family:Georgia,serif;margin:0 0 4px">🌿 Seguimiento de pacientes</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px">{hoy:%d/%m/%Y} · 🟢 1-2 semanas · 🟡 3-4 semanas · 🔴 5 o más</p>
      {bloque_avisos}{cuerpo}
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">Aviso automático de NutriAge.
      Incluye consultas cerradas con notas, de 1 a 8 semanas atrás y sin hora futura agendada.</p>
    </div>"""
    return asunto, html_correo


# ── Envío ─────────────────────────────────────────────────────────────────────

def _ultimo_envio() -> str:
    fila = _find_config_row(CLAVE_ULTIMO_ENVIO)
    if not fila:
        return ""
    return _texto(fila.get("properties", {}).get("Texto", {}).get("rich_text")).strip()


def _marcar_envio(hoy: date) -> None:
    props = {"Texto": {"rich_text": [{"text": {"content": hoy.isoformat()}}]}}
    fila = _find_config_row(CLAVE_ULTIMO_ENVIO)
    if fila:
        _patch(f"/pages/{fila['id']}", {"properties": props})
        return
    props["Clave"] = {"title": [{"text": {"content": CLAVE_ULTIMO_ENVIO}}]}
    _post("/pages", {"parent": {"database_id": settings.NOTION_DB_CONFIG}, "properties": props})


def enviar_seguimiento(forzar: bool = False) -> dict:
    hoy = hoy_chile()
    if not forzar and _ultimo_envio() == hoy.isoformat():
        return {"enviado": False, "motivo": "ya se envió hoy"}

    items, avisos = recolectar(hoy)
    asunto, cuerpo = construir_correo(items, avisos, hoy)
    if not send_email(settings.NUTRICIONISTA_EMAILS, asunto, cuerpo):
        raise Exception("El proveedor de correo no aceptó el envío")
    try:
        _marcar_envio(hoy)
    except Exception as e:
        print(f"[seguimiento] no se pudo registrar el envío: {e}")
    return {"enviado": True, "total": len(items)}


def avisar_error() -> None:
    cuerpo = ("<p>El correo de seguimiento de hoy no se pudo generar. "
              "No se perdió ningún dato; hay que revisar el servidor.</p>")
    send_email(settings.NUTRICIONISTA_EMAILS, "⚠️ NutriAge: falló el correo de seguimiento", cuerpo)


def vista_previa() -> dict:
    items, avisos = recolectar(hoy_chile())
    return {"total": len(items), "avisos": avisos,
            "pacientes": [{"nombre": i["nombre"], "dias": i["dias"], "toca": i["toca"]} for i in items]}
