import httpx
import re
import json
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
    if data.get("estado_pago"):
        props["Estado de pago"] = {"select": {"name": data["estado_pago"]}}
    if data.get("valor") not in (None, ""):
        props["Valor consulta"] = {"number": int(data["valor"])}

    return _post("/pages", {"parent": {"database_id": settings.NOTION_DB_LEADS}, "properties": props})


def update_lead_status(page_id: str, temperatura: str = None,
                       estatus: str = None, resumen: str = None,
                       estado_pago: str = None, valor=None) -> dict:
    props = {}
    if temperatura:
        props["Temperatura"] = {"select": {"name": temperatura}}
    if estatus:
        props["Estatus"] = {"select": {"name": estatus}}
    if resumen:
        props["Resumen del paciente"] = {"rich_text": [{"text": {"content": resumen}}]}
    if estado_pago:
        props["Estado de pago"] = {"select": {"name": estado_pago}}
    if valor is not None:
        props["Valor consulta"] = {"number": int(valor)}
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


def get_lead(page_id: str) -> dict:
    """Devuelve la página (lead) completa por su id."""
    with httpx.Client(timeout=20) as c:
        r = c.get(f"{BASE}/pages/{page_id}", headers=_h(), timeout=20)
        if not r.is_success:
            raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
        return r.json()


def upload_file_to_lead(page_id: str, filename: str, content: bytes,
                        content_type: str, prop: str = "Comprobante") -> dict:
    """
    Sube un archivo a Notion (API de file_uploads en 3 pasos) y lo adjunta
    a la propiedad de tipo 'files' indicada del lead.
    """
    # 1. Crear el file upload
    create = _post("/file_uploads", {
        "filename": filename,
        "content_type": content_type,
    })
    upload_id  = create["id"]
    upload_url = create["upload_url"]

    # 2. Enviar el contenido del archivo (multipart, sin Content-Type JSON)
    headers = {
        "Authorization": f"Bearer {settings.NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
    }
    with httpx.Client(timeout=60) as c:
        r = c.post(upload_url, headers=headers,
                   files={"file": (filename, content, content_type)})
        if not r.is_success:
            raise Exception(f"Notion upload {r.status_code}: {r.text[:400]}")

    # 3. Adjuntar el archivo a la propiedad del lead
    return _patch(f"/pages/{page_id}", {"properties": {
        prop: {"files": [{
            "name": filename,
            "type": "file_upload",
            "file_upload": {"id": upload_id},
        }]}
    }})


# ── FICHA 360° (datos como bloque JSON + archivos como bloques de archivo) ────

FICHA_MARKER = "##FICHA360##"


def _list_children(page_id: str) -> list:
    """Lista todos los bloques hijos de una página (con paginación)."""
    out, cursor = [], None
    with httpx.Client(timeout=20) as c:
        while True:
            url = f"{BASE}/blocks/{page_id}/children?page_size=100"
            if cursor:
                url += f"&start_cursor={cursor}"
            r = c.get(url, headers=_h())
            if not r.is_success:
                raise Exception(f"Notion {r.status_code}: {r.text[:400]}")
            j = r.json()
            out += j.get("results", [])
            if not j.get("has_more"):
                break
            cursor = j.get("next_cursor")
    return out


def _block_code_text(b: dict) -> str:
    rt = b.get("code", {}).get("rich_text", [])
    return "".join(x.get("plain_text", "") for x in rt)


def get_ficha360(page_id: str) -> dict:
    """
    Devuelve {data:{...}, archivos:[{section,name,tipo,url,blockId}]}.
    data = JSON guardado en un bloque de código marcado; archivos = bloques file.
    """
    children = _list_children(page_id)
    data, archivos = {}, []
    for b in children:
        t = b.get("type")
        if t == "code":
            txt = _block_code_text(b)
            if txt.startswith(FICHA_MARKER):
                try:
                    data = json.loads(txt[len(FICHA_MARKER):]) or {}
                except Exception:
                    data = {}
        elif t == "file":
            fb = b.get("file", {})
            url = (fb.get("file") or {}).get("url") or (fb.get("external") or {}).get("url")
            cap = "".join(x.get("plain_text", "") for x in fb.get("caption", []))
            parts = cap.split("|", 2)
            section = parts[0] if parts and parts[0] else "lab"
            tipo = parts[1] if len(parts) > 1 else ""
            name = parts[2] if len(parts) > 2 else "archivo"
            archivos.append({"section": section, "name": name, "tipo": tipo,
                             "url": url, "blockId": b.get("id")})
    return {"data": data, "archivos": archivos}


def save_ficha360(page_id: str, data: dict) -> dict:
    """Guarda el JSON de la ficha en un bloque de código marcado (crea o actualiza)."""
    payload = FICHA_MARKER + json.dumps(data, ensure_ascii=False)
    chunks = [payload[i:i + 1900] for i in range(0, len(payload), 1900)] or [FICHA_MARKER]
    rich = [{"type": "text", "text": {"content": ch}} for ch in chunks]
    block_id = None
    for b in _list_children(page_id):
        if b.get("type") == "code" and _block_code_text(b).startswith(FICHA_MARKER):
            block_id = b.get("id")
            break
    if block_id:
        return _patch(f"/blocks/{block_id}", {"code": {"rich_text": rich, "language": "json"}})
    return _patch(f"/blocks/{page_id}/children", {"children": [
        {"object": "block", "type": "code",
         "code": {"rich_text": rich, "language": "json"}}
    ]})


def append_ficha_file(page_id: str, filename: str, content: bytes,
                      content_type: str, section: str) -> dict:
    """Sube un archivo a Notion y lo agrega como bloque file en la página del paciente."""
    create = _post("/file_uploads", {"filename": filename, "content_type": content_type})
    upload_id, upload_url = create["id"], create["upload_url"]
    headers = {"Authorization": f"Bearer {settings.NOTION_TOKEN}",
               "Notion-Version": "2022-06-28"}
    with httpx.Client(timeout=60) as c:
        r = c.post(upload_url, headers=headers,
                   files={"file": (filename, content, content_type)})
        if not r.is_success:
            raise Exception(f"Notion upload {r.status_code}: {r.text[:400]}")
    cap = f"{section}|{content_type}|{filename}"
    res = _patch(f"/blocks/{page_id}/children", {"children": [
        {"object": "block", "type": "file",
         "file": {"type": "file_upload", "file_upload": {"id": upload_id},
                  "caption": [{"type": "text", "text": {"content": cap}}]}}
    ]})
    nb = (res.get("results") or [{}])[0]
    url = ((nb.get("file") or {}).get("file") or {}).get("url")
    return {"blockId": nb.get("id"), "name": filename, "tipo": content_type,
            "url": url, "section": section}


def delete_block(block_id: str) -> dict:
    with httpx.Client(timeout=20) as c:
        r = c.delete(f"{BASE}/blocks/{block_id}", headers=_h())
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
