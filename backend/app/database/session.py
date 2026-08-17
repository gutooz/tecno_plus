from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings, get_settings

_client: AsyncIOMotorClient[Any] | None = None
_db: AsyncIOMotorDatabase[Any] | None = None


async def connect_mongo(settings: Settings) -> None:
    global _client, _db
    _client = AsyncIOMotorClient(settings.mongo_uri, uuidRepresentation="standard")
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
        _client = AsyncIOMotorClient(settings.mongo_uri, uuidRepresentation="standard")
        _db = _client[settings.mongo_db_name]
    return _db
