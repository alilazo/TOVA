from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="TOVA_",
        extra="ignore",
    )

    app_name: str = "TOVA API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./tova.db"
    allowed_project_roots: str = ""
    lm_studio_base_url: str = "http://127.0.0.1:1234/v1"
    lm_studio_model: str | None = None
    lm_studio_api_token: str | None = None
    lm_studio_allow_public_host: bool = False
    lm_studio_timeout_seconds: float = 300
    agent_max_iterations: int = 12
    command_output_limit_bytes: int = 1_000_000
    data_dir: str | None = None
    sample_project_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
