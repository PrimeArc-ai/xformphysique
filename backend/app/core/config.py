from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime settings. Environment variables override safe local defaults."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="XFORM_",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'xform.db'}"
    storage_dir: Path = BACKEND_DIR / "data" / "progress-photos"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    demo_client_id: str = "cl_001"
    max_photo_bytes: int = 10 * 1024 * 1024
    max_profile_photo_bytes: int = 2 * 1024 * 1024
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    # Supabase secret keys are server-only and are required exclusively for
    # privileged provisioning actions such as inviting a new client.
    supabase_secret_key: str | None = None
    supabase_service_role_key: str | None = None
    client_invite_redirect_url: str = "http://127.0.0.1:5173"
    checkin_reminder_job_token: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str | None = None
    twilio_whatsapp_reminder_template_sid: str | None = None
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    r2_endpoint_url: str | None = None

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_publishable_key)

    @property
    def supabase_admin_key(self) -> str | None:
        """Prefer current secret keys while accepting legacy service-role keys locally."""

        return self.supabase_secret_key or self.supabase_service_role_key

    @property
    def supabase_admin_enabled(self) -> bool:
        return bool(self.supabase_enabled and self.supabase_admin_key)

    @property
    def twilio_whatsapp_enabled(self) -> bool:
        return bool(
            self.twilio_account_sid
            and self.twilio_auth_token
            and self.twilio_whatsapp_from
            and self.twilio_whatsapp_reminder_template_sid
        )

    @property
    def r2_enabled(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
        )

    @property
    def r2_effective_endpoint_url(self) -> str | None:
        if self.r2_endpoint_url:
            return self.r2_endpoint_url.rstrip("/")
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return None

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
