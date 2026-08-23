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
    mongodb_uri: str = Field(default="", alias="MONGODB_URI")
    mongodb_database: str = Field(default="", alias="MONGODB_DATABASE")
    legacy_mongo_uri: str = Field(default="", alias="MONGO_URI")
    legacy_mongo_db_name: str = Field(default="", alias="MONGO_DB_NAME")
    mongodb_min_pool_size: int = Field(default=0, alias="MONGODB_MIN_POOL_SIZE")
    mongodb_max_pool_size: int = Field(default=10, alias="MONGODB_MAX_POOL_SIZE")
    mongodb_server_selection_timeout_ms: int = Field(
        default=10000,
        alias="MONGODB_SERVER_SELECTION_TIMEOUT_MS",
    )
    mongodb_connect_timeout_ms: int = Field(default=10000, alias="MONGODB_CONNECT_TIMEOUT_MS")
    mongodb_socket_timeout_ms: int = Field(default=45000, alias="MONGODB_SOCKET_TIMEOUT_MS")

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

    @property
    def mongo_uri(self) -> str:
        return self.mongodb_uri or self.legacy_mongo_uri

    @property
    def mongo_db_name(self) -> str:
        return self.mongodb_database or self.legacy_mongo_db_name or "tecnoplus"


@lru_cache
def get_settings() -> Settings:
    return Settings()
