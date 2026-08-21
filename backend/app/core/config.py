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
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    # Supabase secret keys are server-only and are required exclusively for
    # privileged provisioning actions such as inviting a new client.
    supabase_secret_key: str | None = None
    supabase_service_role_key: str | None = None
    client_invite_redirect_url: str = "http://127.0.0.1:5173"

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
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
