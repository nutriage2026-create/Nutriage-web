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
