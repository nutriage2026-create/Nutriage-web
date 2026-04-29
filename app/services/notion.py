import httpx
import re
from datetime import date
from app.config import settings

BASE = "https://api.notion.com/v1"


def _h():
    return {
        "Authorization": f"Bearer {settings.NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }


def _post(path: str, body: dict) -> dict:
    with httpx.Client(timeout=20) as c:
        r = c.post(f"{BASE}{path}", headers=_h(), json=body)
        if not r.is_success:
            raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
        return r.json()


def _patch(path: str, body: dict) -> dict:
    with httpx.Client(timeout=20) as c:
        r = c.patch(f"{BASE}{path}", headers=_h(), json=body)
        if not r.is_success:
            raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
        return r.json()


# ── LEADS ─────────────────────────────────────────────────────────────────────

def create_lead(data: dict) -> dict:
    props = {
        "Nombre":          {"title":     [{"text": {"content": data.get("nombre", "Sin nombre")}}]},
        "Temperatura":     {"select":    {"name": data.get("temperatura", "Cold")}},
        "Estatus":         {"select":    {"name": data.get("estatus", "Pendiente de contactar")}},
        "Canal de origen": {"select":    {"name": data.get("canal", "Web")}},
        "Notas":           {"rich_text": [{"text": {"content": data.get("notas", "")}}]},
        "Primer contacto": {"date":      {"start": date.today().isoformat()}},
    }
    if data.get("email"):
        props["Email"] = {"email": data["email"]}
    if data.get("telefono"):
        props["Telefono"] = {"phone_number": data["telefono"]}
    if data.get("edad"):
        props["Edad"] = {"number": int(data["edad"])}
    if data.get("objetivo"):
        props["Objetivo"] = {"select": {"name": data["objetivo"]}}
    if data.get("resumen"):
        props["Resumen del paciente"] = {"rich_text": [{"text": {"content": data["resumen"]}}]}
    if data.get("presupuesto"):
        props["Presupuesto"] = {"select": {"name": data["presupuesto"]}}

    return _post("/pages", {"parent": {"database_id": settings.NOTION_DB_LEADS}, "properties": props})


def update_lead_status(page_id: str, temperatura: str = None,
                       estatus: str = None, resumen: str = None) -> dict:
    props = {}
    if temperatura:
        props["Temperatura"] = {"select": {"name": temperatura}}
    if estatus:
        props["Estatus"] = {"select": {"name": estatus}}
    if resumen:
        props["Resumen del paciente"] = {"rich_text": [{"text": {"content": resumen}}]}
    return _patch(f"/pages/{page_id}", {"properties": props})


def get_leads(estatus: str = None, temperatura: str = None) -> list:
    filters = []
    if estatus:
        filters.append({"property": "Estatus", "select": {"equals": estatus}})
    if temperatura:
        filters.append({"property": "Temperatura", "select": {"equals": temperatura}})

    body = {}
    if len(filters) == 1:
        body["filter"] = filters[0]
    elif len(filters) > 1:
        body["filter"] = {"and": filters}

    with httpx.Client(timeout=20) as c:
        r = c.post(f"{BASE}/databases/{settings.NOTION_DB_LEADS}/query",
                   headers=_h(), json=body)
        r.raise_for_status()
        return r.json().get("results", [])


# ── HISTORIAL DEL AGENTE ──────────────────────────────────────────────────────

# ── CONSULTAS (notas post-sesión, bloques en la página del lead) ─────────────

def find_lead_by_email(email: str) -> dict | None:
    """Busca el primer lead en NOTION_DB_LEADS que coincida con el email dado."""
    if not email:
        return None
    body = {
        "filter": {"property": "Email", "email": {"equals": email}},
        "page_size": 1,
    }
    with httpx.Client(timeout=20) as c:
        r = c.post(f"{BASE}/databases/{settings.NOTION_DB_LEADS}/query",
                   headers=_h(), json=body)
        if not r.is_success:
            raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
        results = r.json().get("results", [])
        return results[0] if results else None


def _paragraph_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": [{"type": "text", "text": {"content": text[:1900]}}]},
    }


def append_consulta_blocks(page_id: str, hablado: str, plan: str = "",
                           seguimiento: str = "", fecha_cierre: str = "") -> dict:
    """
    Appendea al body de la página (lead) un bloque de consulta cerrada:
      ──────────
      📝 Consulta · DD/MM/YYYY
      Qué se habló: ...
      Plan: ...
      Próximo seguimiento: DD/MM/YYYY
    """
    fecha_str = fecha_cierre or date.today().isoformat()
    try:
        y, m, d = fecha_str[:10].split("-")
        fecha_humana = f"{d}/{m}/{y}"
    except Exception:
        fecha_humana = fecha_str

    children = [
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [{"type": "text", "text": {"content": f"📝 Consulta · {fecha_humana}"}}]
            },
        },
        _paragraph_block(f"Qué se habló: {hablado}"),
    ]
    if plan:
        children.append(_paragraph_block(f"Plan: {plan}"))
    if seguimiento:
        try:
            ys, ms, ds = seguimiento[:10].split("-")
            seg_humano = f"{ds}/{ms}/{ys}"
        except Exception:
            seg_humano = seguimiento
        children.append(_paragraph_block(f"Próximo seguimiento: {seg_humano}"))

    with httpx.Client(timeout=20) as c:
        r = c.patch(f"{BASE}/blocks/{page_id}/children",
                    headers=_h(), json={"children": children})
        if not r.is_success:
            raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
        return r.json()


def save_agent_history(titulo: str, tipo: str, paciente: str, contenido: str) -> dict:
    props = {
        "Título":         {"title":     [{"text": {"content": titulo}}]},
        "Tipo de acción": {"select":    {"name": tipo}},
        "Paciente":       {"rich_text": [{"text": {"content": paciente}}]},
        "Contenido":      {"rich_text": [{"text": {"content": contenido[:2000]}}]},
        "Fecha":          {"date":      {"start": date.today().isoformat()}},
        "Estado":         {"select":    {"name": "Nuevo"}},
    }
    return _post("/pages", {
        "parent": {"database_id": settings.NOTION_DB_HISTORIAL_AGENTE},
        "properties": props,
    })
