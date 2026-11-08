import hmac
import threading

from flask import Blueprint, jsonify, request

from app.config import settings
from app.services.seguimiento import avisar_error, enviar_seguimiento, vista_previa

bp = Blueprint("cron", __name__, url_prefix="/cron")

_en_curso = threading.Lock()


def _autorizado() -> bool:
    secreto = settings.CRON_SECRET
    recibido = request.headers.get("X-Cron-Secret", "")
    return bool(secreto) and hmac.compare_digest(recibido.encode(), secreto.encode())


def _ejecutar(forzar: bool) -> None:
    try:
        print(f"[cron] seguimiento: {enviar_seguimiento(forzar)}")
    except Exception as e:
        print(f"[cron] seguimiento fallo: {type(e).__name__}: {e}")
        try:
            avisar_error()
        except Exception as e2:
            print(f"[cron] aviso de error fallo: {e2}")
    finally:
        _en_curso.release()


@bp.post("/seguimiento")
def seguimiento():
    """
    Lo llama cron-job.org lunes, miércoles y viernes a las 8:00 (hora Chile).
    Responde al instante y arma el correo en segundo plano, porque revisar
    cada paciente puede tardar más de lo que el servicio externo espera.
    ?dry=1 revisa sin enviar · ?force=1 reenvía aunque ya haya salido hoy.
    """
    if not _autorizado():
        return jsonify({"error": "No autorizado"}), 401

    if request.args.get("dry") == "1":
        try:
            return jsonify(vista_previa())
        except Exception as e:
            return jsonify({"error": str(e)}), 502

    if not _en_curso.acquire(blocking=False):
        return jsonify({"estado": "ya en curso"}), 202
    threading.Thread(target=_ejecutar, args=(request.args.get("force") == "1",),
                     daemon=True).start()
    return jsonify({"estado": "iniciado"}), 202
