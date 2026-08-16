from fastapi import APIRouter

from app.database.session import get_database

root_router = APIRouter(tags=["health"])
api_router = APIRouter()


async def health_payload() -> dict[str, str]:
    db = get_database()
    mongo_status = "up"
    try:
        await db.command("ping")
    except Exception:
        mongo_status = "down"
    return {"status": "ok" if mongo_status == "up" else "degraded", "mongo": mongo_status}


@root_router.get("/health")
async def health() -> dict[str, str]:
    return await health_payload()


@root_router.get("/ready")
async def ready() -> dict[str, str]:
    payload = await health_payload()
    payload["status"] = "ready" if payload["mongo"] == "up" else "not_ready"
    return payload


@api_router.get("")
async def api_health() -> dict[str, str]:
    return await health_payload()

