from flask import Flask, jsonify, send_file
import os
from flask_cors import CORS
from app.config import settings
from app.routers.availability  import bp as availability_bp
from app.routers.leads         import bp as leads_bp
from app.routers.appointments  import bp as appointments_bp
from app.routers.analysis      import bp as analysis_bp
from app.routers.webhooks      import bp as webhooks_bp
from app.routers.bookings      import bp as bookings_bp
from app.routers.auth          import bp as auth_bp
from app.routers.consultas     import bp as consultas_bp
from app.routers.pago          import bp as pago_bp
from app.routers.ficha360      import bp as ficha360_bp
from app.routers.config        import bp as config_bp
from app.routers.cron          import bp as cron_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(availability_bp)
app.register_blueprint(leads_bp)
app.register_blueprint(appointments_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(webhooks_bp)
app.register_blueprint(bookings_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(consultas_bp)
app.register_blueprint(pago_bp)
app.register_blueprint(ficha360_bp)
app.register_blueprint(config_bp)
app.register_blueprint(cron_bp)


@app.get("/pago-pagina")
def pago_pagina():
    path = os.path.join(os.path.dirname(__file__), "pago.html")
    return send_file(path)


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
            "POST /consultas/cerrar":              "Cerrar consulta + appendear bloques en lead",
            "GET  /config/valor-consulta":         "Valor vigente de la consulta",
            "PATCH /config/valor-consulta":        "Cambiar el valor de la consulta",
        },
    })


@app.get("/dashboard")
def dashboard():
    path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    return send_file(path)


@app.get("/booking")
def booking():
    path = os.path.join(os.path.dirname(__file__), "booking.html")
    return send_file(path)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=(settings.APP_ENV == "development"))
