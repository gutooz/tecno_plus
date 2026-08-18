import pytest

from app.core.config import Settings
from app.core.security import hash_password
from app.modules.auth.exceptions import EmailAlreadyRegisteredError, InvalidCredentialsError
from app.modules.auth.models import User
from app.modules.auth.service import AuthService


class FakeUserRepository:
    def __init__(self) -> None:
        self.users: dict[str, User] = {}

    async def get_by_email(self, email: str) -> User | None:
        return self.users.get(email.lower().strip())

    async def get_by_id(self, user_id: str) -> User | None:
        return next((u for u in self.users.values() if u.id == user_id), None)

    async def create(self, *, email: str, password_hash: str, name: str, role: str) -> User:
        user = User("507f1f77bcf86cd799439011", email, password_hash, name, role)
        self.users[email] = user
        return user


def make_service(repo: FakeUserRepository) -> AuthService:
    settings = Settings(
        JWT_SECRET="test-secret-with-at-least-32-chars",
        JWT_REFRESH_SECRET="test-refresh-secret-with-32-chars",
        JWT_EXPIRES_IN="15m",
        JWT_REFRESH_EXPIRES_IN="7d",
    )
    return AuthService(repo, settings)


@pytest.mark.asyncio
async def test_register_returns_legacy_contract() -> None:
    service = make_service(FakeUserRepository())

    response = await service.register(
        email="Seller@Example.com",
        password="password123",
        name="Seller",
    )

    assert response.accessToken
    assert response.refreshToken
    assert response.user.email == "seller@example.com"
    assert response.user.role == "seller"


@pytest.mark.asyncio
async def test_register_rejects_existing_email() -> None:
    repo = FakeUserRepository()
    repo.users["seller@example.com"] = User(
        "1",
        "seller@example.com",
        hash_password("password123"),
        "Seller",
        "seller",
    )
    service = make_service(repo)

    with pytest.raises(EmailAlreadyRegisteredError):
        await service.register(
            email="seller@example.com",
            password="password123",
            name=None,
        )


@pytest.mark.asyncio
async def test_login_verifies_existing_bcrypt_hash() -> None:
    repo = FakeUserRepository()
    repo.users["seller@example.com"] = User(
        "1",
        "seller@example.com",
        hash_password("password123"),
        "Seller",
        "seller",
    )
    service = make_service(repo)

    response = await service.login(email="seller@example.com", password="password123")

    assert response.user.id == "1"


@pytest.mark.asyncio
async def test_login_rejects_invalid_password() -> None:
    repo = FakeUserRepository()
    repo.users["seller@example.com"] = User(
        "1",
        "seller@example.com",
        hash_password("password123"),
        "Seller",
        "seller",
    )
    service = make_service(repo)

    with pytest.raises(InvalidCredentialsError):
        await service.login(email="seller@example.com", password="wrong")
