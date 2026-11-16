from flask import Blueprint, request, jsonify
from app.services.notion import (
    get_valor_consulta, set_valor_consulta, get_datos_banco,
    get_valores_consulta, set_valor_modalidad, get_historial_precios,
    get_herramientas, set_herramientas,
)
from app.services.auth import require_auth

bp = Blueprint("config", __name__, url_prefix="/config")

VALOR_MIN = 1000
VALOR_MAX = 500000

# Porcentaje del valor que se cobra por adelantado segun la modalidad.
PORCENTAJE_PAGO = {"presencial": 50, "virtual": 100}


def monto_a_pagar(valor: int, modalidad: str) -> int:
    """50% del valor presencial (abono) o 100% del valor online."""
    return round(int(valor or 0) * PORCENTAJE_PAGO.get(modalidad, 100) / 100)


def _leer_valor(raw):
    try:
        valor = int(float(raw))
    except (TypeError, ValueError):
        return None, "El valor debe ser un numero"
    if not (VALOR_MIN <= valor <= VALOR_MAX):
        return None, f"El valor debe estar entre ${VALOR_MIN:,} y ${VALOR_MAX:,}".replace(",", ".")
    return valor, None


@bp.get("/valor-consulta")
def valor_consulta_get():
    """Valor unico antiguo. Se mantiene por compatibilidad."""
    return jsonify({"valor": get_valor_consulta()})


@bp.get("/valores")
def valores_get():
    """
    Precio vigente por modalidad y cuanto se paga por adelantado.
    Publico: lo necesita booking.html.
    """
    v = get_valores_consulta()
    return jsonify({
        "presencial": {"valor": v["presencial"], "porcentaje": PORCENTAJE_PAGO["presencial"],
                       "monto": monto_a_pagar(v["presencial"], "presencial")},
        "virtual":    {"valor": v["virtual"], "porcentaje": PORCENTAJE_PAGO["virtual"],
                       "monto": monto_a_pagar(v["virtual"], "virtual")},
    })


@bp.patch("/valores")
@require_auth
def valores_set():
    """
    Cambia el precio de una modalidad.
    Body JSON: { "modalidad": "presencial" | "virtual", "valor": 35000 }
    """
    data = request.get_json(silent=True) or {}
    modalidad = data.get("modalidad")
    if modalidad not in PORCENTAJE_PAGO:
        return jsonify({"error": "Modalidad invalida"}), 400
    valor, err = _leer_valor(data.get("valor"))
    if err:
        return jsonify({"error": err}), 400
    try:
        return jsonify({"modalidad": modalidad, "valor": set_valor_modalidad(modalidad, valor)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/historial-precios")
@require_auth
def historial_precios_get():
    try:
        return jsonify({"historial": get_historial_precios()})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@bp.get("/datos-pago")
def datos_pago_get():
    """Datos de la cuenta para transferir. Publico: lo consume pago.html."""
    return jsonify({"banco": get_datos_banco()})


@bp.patch("/valor-consulta")
@require_auth
def valor_consulta_set():
    """Valor unico antiguo. Body JSON: { "valor": 20000 }"""
    data = request.get_json(silent=True) or {}
    valor, err = _leer_valor(data.get("valor"))
    if err:
        return jsonify({"error": err}), 400
    try:
        return jsonify({"valor": set_valor_consulta(valor)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


MAX_HERRAMIENTAS = 30


def _limpiar_herramienta(h):
    if not isinstance(h, dict):
        return None
    nombre = str(h.get("nombre") or "").strip()[:40]
    url = str(h.get("url") or "").strip()[:500]
    icono = str(h.get("icono") or "🔧").strip()[:4] or "🔧"
    if not nombre or not url.startswith(("https://", "http://")):
        return None
    return {"nombre": nombre, "url": url, "icono": icono}


@bp.get("/herramientas")
@require_auth
def herramientas_get():
    try:
        return jsonify({"herramientas": get_herramientas()})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@bp.put("/herramientas")
@require_auth
def herramientas_set():
    """Body JSON: { "herramientas": [ {"nombre", "url", "icono"} ] }"""
    data = request.get_json(silent=True) or {}
    lista = data.get("herramientas")
    if not isinstance(lista, list):
        return jsonify({"error": "Formato invalido"}), 400
    if len(lista) > MAX_HERRAMIENTAS:
        return jsonify({"error": f"Maximo {MAX_HERRAMIENTAS} herramientas"}), 400
    limpias = [h for h in (_limpiar_herramienta(x) for x in lista) if h]
    if len(limpias) != len(lista):
        return jsonify({"error": "Cada herramienta necesita nombre y un link que empiece con https://"}), 400
    try:
        return jsonify({"herramientas": set_herramientas(limpias)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
