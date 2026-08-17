from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="NODE_ENV")
    port: int = Field(default=8000, alias="PY_BACKEND_PORT")
    mongo_uri: str = Field(default="mongodb://localhost:27017/tecnoplus", alias="MONGO_URI")
    mongo_db_name: str = Field(default="tecnoplus", alias="MONGO_DB_NAME")

    jwt_secret: str = Field(default="dev-secret-change-me", alias="JWT_SECRET")
    jwt_expires_in: str = Field(default="15m", alias="JWT_EXPIRES_IN")
    jwt_refresh_secret: str = Field(
        default="dev-refresh-secret-change-me",
        alias="JWT_REFRESH_SECRET",
    )
    jwt_refresh_expires_in: str = Field(default="7d", alias="JWT_REFRESH_EXPIRES_IN")

    cors_origin: str = Field(default="http://localhost:3000", alias="CORS_ORIGIN")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origin.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

