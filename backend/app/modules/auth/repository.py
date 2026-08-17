from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.modules.auth.models import User


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self.collection = db["users"]

    async def get_by_email(self, email: str) -> User | None:
        doc = await self.collection.find_one({"email": email.lower().strip()})
        return self._to_user(doc)

    async def get_by_id(self, user_id: str) -> User | None:
        query: dict[str, Any]
        if ObjectId.is_valid(user_id):
            query = {"_id": ObjectId(user_id)}
        else:
            query = {"_id": user_id}
        doc = await self.collection.find_one(query)
        return self._to_user(doc)

    async def create(
        self,
        *,
        email: str,
        password_hash: str,
        name: str,
        role: str,
    ) -> User:
        payload = {
            "email": email.lower().strip(),
            "passwordHash": password_hash,
            "name": name,
            "role": role,
            "organizationId": "",
            "refreshTokenHashes": [],
        }
        result = await self.collection.insert_one(payload)
        doc = await self.collection.find_one({"_id": result.inserted_id})
        user = self._to_user(doc)
        if user is None:
            raise RuntimeError("Created user could not be loaded")
        return user

    def _to_user(self, doc: dict[str, Any] | None) -> User | None:
        if not doc:
            return None
        return User(
            id=str(doc["_id"]),
            email=str(doc.get("email", "")),
            password_hash=str(doc.get("passwordHash", "")),
            name=str(doc.get("name", "")),
            role=str(doc.get("role", "seller")),
            organization_id=str(doc.get("organizationId", "")),
        )
