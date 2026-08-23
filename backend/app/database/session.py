from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings, get_settings

_client: AsyncIOMotorClient[Any] | None = None
_db: AsyncIOMotorDatabase[Any] | None = None


def _require_mongo_uri(settings: Settings) -> str:
    if not settings.mongo_uri:
        raise RuntimeError("MONGODB_URI is required. Use the MongoDB Atlas connection string.")
    return settings.mongo_uri


def _client_options(settings: Settings) -> dict[str, Any]:
    return {
        "uuidRepresentation": "standard",
        "minPoolSize": settings.mongodb_min_pool_size,
        "maxPoolSize": settings.mongodb_max_pool_size,
        "serverSelectionTimeoutMS": settings.mongodb_server_selection_timeout_ms,
        "connectTimeoutMS": settings.mongodb_connect_timeout_ms,
        "socketTimeoutMS": settings.mongodb_socket_timeout_ms,
    }


async def connect_mongo(settings: Settings) -> None:
    global _client, _db
    _client = AsyncIOMotorClient(_require_mongo_uri(settings), **_client_options(settings))
    _db = _client[settings.mongo_db_name]


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


def get_database() -> AsyncIOMotorDatabase[Any]:
    global _client, _db
    if _db is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(_require_mongo_uri(settings), **_client_options(settings))
        _db = _client[settings.mongo_db_name]
    return _db
