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
    def APP_ENV(self):                  return _get("APP_ENV", "development")
    @property
    def TZ(self):                       return _get("TZ", "America/Santiago")


settings = Settings()
