import json
import httpx
from app.config import settings

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def _call_claude(prompt: str, max_tokens: int = 1024) -> str:
    if not settings.ANTHROPIC_API_KEY:
        return ""
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    with httpx.Client(timeout=30) as c:
        r = c.post(ANTHROPIC_URL, headers=headers, json=payload)
        r.raise_for_status()
        return r.json()["content"][0]["text"].strip()


def analyze_lead(lead_data: dict) -> dict:
    """
    Recibe datos del lead y devuelve:
    { resumen, score (1-10), temperatura (Hot|Warm|Cold), recomendaciones [] }
    """
    if not settings.ANTHROPIC_API_KEY:
        return {
            "resumen": "ANTHROPIC_API_KEY no configurada en .env.",
            "score": 5,
            "temperatura": "Warm",
            "recomendaciones": ["Agregar ANTHROPIC_API_KEY al .env para activar análisis IA"],
        }

    prompt = f"""Eres un asistente especializado en análisis de leads para una nutricionista.
Analiza los datos del siguiente paciente y responde SOLO con un objeto JSON válido, sin texto adicional.

Datos:
{json.dumps(lead_data, ensure_ascii=False, indent=2)}

Devuelve exactamente este JSON:
{{
  "resumen": "resumen profesional en 2-3 oraciones sobre el perfil y motivación del paciente",
  "score": <entero 1-10, donde 10 es máxima probabilidad de cierre>,
  "temperatura": "<Hot si score>=7, Warm si score 4-6, Cold si score<=3>",
  "recomendaciones": [
    "primera acción concreta",
    "segunda acción concreta",
    "tercera acción concreta"
  ]
}}"""

    raw = _call_claude(prompt)
    start = raw.find("{")
    end = raw.rfind("}") + 1
    return json.loads(raw[start:end])
