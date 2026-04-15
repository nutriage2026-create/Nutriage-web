from flask import Flask, jsonify
from app.config import settings
from app.routers.availability  import bp as availability_bp
from app.routers.leads         import bp as leads_bp
from app.routers.appointments  import bp as appointments_bp
from app.routers.analysis      import bp as analysis_bp
from app.routers.webhooks      import bp as webhooks_bp

app = Flask(__name__)

app.register_blueprint(availability_bp)
app.register_blueprint(leads_bp)
app.register_blueprint(appointments_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(webhooks_bp)


@app.get("/")
def root():
    return jsonify({
        "app": "NutriAge API",
        "env": settings.APP_ENV,
        "status": "ok",
        "endpoints": {
            "GET  /availability/event-types":     "Tipos de consulta en Cal.com",
            "GET  /availability/slots":            "Horarios disponibles (?eventTypeId&start&end)",
            "POST /leads/":                        "Crear lead en Notion",
            "GET  /leads/":                        "Listar leads (?estatus&temperatura)",
            "PATCH /leads/<id>/status":            "Actualizar temperatura/estatus/resumen",
            "POST /appointments/":                 "Agendar en Cal.com + crear lead en Notion",
            "POST /analysis/leads/<id>":           "Análisis IA + email + historial Notion",
            "POST /webhooks/make":                 "Recibir eventos de Make.com",
        },
    })


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=(settings.APP_ENV == "development"))
