import os
from pathlib import Path
from dotenv import load_dotenv

# Ruta absoluta al .env — funciona sin importar el CWD
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)


def _get(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


class Settings:
    @property
    def NOTION_TOKEN(self):             return _get("NOTION_TOKEN")
    @property
    def NOTION_DB_PACIENTES(self):      return _get("NOTION_DB_PACIENTES")
    @property
    def NOTION_DB_LEADS(self):          return _get("NOTION_DB_LEADS")
    @property
    def NOTION_DB_HISTORIAL_AGENTE(self):return _get("NOTION_DB_HISTORIAL_AGENTE")

    @property
    def CALCOM_API_KEY(self):           return _get("CALCOM_API_KEY")
    @property
    def CALCOM_USERNAME(self):          return _get("CALCOM_USERNAME")
    @property
    def CALCOM_EVENT_TYPE_ID(self):     return _get("CALCOM_EVENT_TYPE_ID")

    @property
    def MAKE_API_TOKEN(self):           return _get("MAKE_API_TOKEN")
    @property
    def ANTHROPIC_API_KEY(self):        return _get("ANTHROPIC_API_KEY")

    @property
    def GMAIL_USER(self):               return _get("GMAIL_USER")
    @property
    def GMAIL_APP_PASSWORD(self):       return _get("GMAIL_APP_PASSWORD")

    @property
    def JWT_SECRET(self):               return _get("JWT_SECRET")
    @property
    def FERNANDA_PASSWORD(self):        return _get("FERNANDA_PASSWORD")

    @property
    def APP_ENV(self):                  return _get("APP_ENV", "development")
    @property
    def PUBLIC_BASE_URL(self):
        # URL pública donde se sirve la página de pago (sin slash final).
        return _get("PUBLIC_BASE_URL", "https://nutriage-api.onrender.com").rstrip("/")
    @property
    def TZ(self):                       return _get("TZ", "America/Santiago")

    # Notificaciones a la nutricionista cuando un paciente reserva.
    # NUTRICIONISTA_EMAILS: lista separada por coma. Ej:
    #   "nutricionistafernandaugarte@gmail.com,nutriage2026@gmail.com"
    # NUTRICIONISTA_WHATSAPP: numero con codigo pais sin "+", ej "56971246200"
    # CALLMEBOT_API_KEY: clave que entrega callmebot tras registrar el numero.
    @property
    def NUTRICIONISTA_EMAILS(self):
        raw = _get("NUTRICIONISTA_EMAILS")
        return [e.strip() for e in raw.split(",") if e.strip()]
    @property
    def NUTRICIONISTA_WHATSAPP(self):    return _get("NUTRICIONISTA_WHATSAPP")
    @property
    def CALLMEBOT_API_KEY(self):         return _get("CALLMEBOT_API_KEY")


settings = Settings()
