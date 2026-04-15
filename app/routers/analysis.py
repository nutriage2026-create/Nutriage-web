from flask import Blueprint, request, jsonify
from app.services.ai import analyze_lead
from app.services.notion import update_lead_status, save_agent_history
from app.services.notifications import send_email, build_lead_email
from app.config import settings

bp = Blueprint("analysis", __name__, url_prefix="/analysis")


@bp.post("/leads/<page_id>")
def analyze(page_id):
    """
    Análisis post-agendamiento con IA:
    1. Genera resumen + lead score con Claude
    2. Actualiza temperatura y resumen en Notion
    3. Guarda en historial del agente
    4. Envía email a la nutricionista (si está configurado)

    Body JSON:
      - nombre      (str, requerido)
      - email       (str, opcional)  — del paciente
      - objetivo    (str, opcional)
      - notas       (str, opcional)
      - canal       (str, opcional)
      - presupuesto (str, opcional)
      - send_email  (bool, opcional, default true)
    """
    data = request.get_json(silent=True) or {}
    if not data.get("nombre"):
        return jsonify({"error": "El campo 'nombre' es obligatorio"}), 400

    # 1. Análisis IA
    try:
        analysis = analyze_lead(data)
    except Exception as e:
        return jsonify({"error": f"Error IA: {str(e)}"}), 500

    score       = analysis.get("score", 5)
    temperatura = analysis.get("temperatura", "Warm")
    resumen     = analysis.get("resumen", "")
    recs        = analysis.get("recomendaciones", [])

    # 2. Actualizar Notion
    try:
        update_lead_status(page_id, temperatura=temperatura, resumen=resumen)
    except Exception as e:
        return jsonify({"error": f"Notion update error: {str(e)}", "analysis": analysis}), 502

    # 3. Historial del agente
    try:
        save_agent_history(
            titulo=f"Análisis IA — {data['nombre']} (Score {score}/10)",
            tipo="Análisis de ficha",
            paciente=data["nombre"],
            contenido=(
                f"Score: {score}/10\n"
                f"Temperatura: {temperatura}\n\n"
                f"Resumen:\n{resumen}\n\n"
                f"Recomendaciones:\n" + "\n".join(f"- {r}" for r in recs)
            ),
        )
    except Exception:
        pass

    # 4. Email a la nutricionista
    email_sent = False
    if data.get("send_email", True) and settings.GMAIL_USER:
        try:
            html = build_lead_email(data["nombre"], analysis)
            email_sent = send_email(
                to=settings.GMAIL_USER,
                subject=f"[NutriAge] Lead Score {score}/10 — {data['nombre']}",
                body_html=html,
            )
        except Exception as e:
            print(f"[analysis] Email error: {e}")

    return jsonify({
        "score":           score,
        "temperatura":     temperatura,
        "resumen":         resumen,
        "recomendaciones": recs,
        "notion_updated":  True,
        "email_sent":      email_sent,
    })
