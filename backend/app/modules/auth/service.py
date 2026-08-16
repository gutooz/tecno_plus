import jwt
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.security import (
    decode_token,
    hash_password,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from app.modules.auth.exceptions import (
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
)
from app.modules.auth.models import User
from app.modules.auth.repository import UserRepository
from app.modules.auth.schemas import TokenResponse


class AuthService:
    def __init__(self, users: UserRepository, settings: Settings) -> None:
        self.users = users
        self.settings = settings

    async def register(
        self,
        *,
        email: str,
        password: str,
        name: str | None,
        profile_type: str | None,
    ) -> TokenResponse:
        normalized_email = email.lower().strip()
        if await self.users.get_by_email(normalized_email):
            raise EmailAlreadyRegisteredError("E-mail já cadastrado")

        try:
            user = await self.users.create(
                email=normalized_email,
                password_hash=hash_password(password),
                name=name or "",
                role=profile_type or "seller",
            )
        except DuplicateKeyError as exc:
            raise EmailAlreadyRegisteredError("E-mail já cadastrado") from exc
        return self._issue_tokens(user)

    async def login(self, *, email: str, password: str) -> TokenResponse:
        user = await self.users.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError("Credenciais inválidas")
        return self._issue_tokens(user)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = decode_token(refresh_token, self.settings.jwt_refresh_secret)
        except jwt.PyJWTError as exc:
            raise InvalidRefreshTokenError("Refresh token inválido") from exc

        user_id = str(payload.get("sub", ""))
        user = await self.users.get_by_id(user_id)
        if not user:
            raise InvalidRefreshTokenError("Refresh token inválido")
        return self._issue_tokens(user)

    def _issue_tokens(self, user: User) -> TokenResponse:
        payload = {"sub": user.id, "email": user.email, "role": user.role}
        return TokenResponse(
            accessToken=issue_access_token(payload, self.settings),
            refreshToken=issue_refresh_token(payload, self.settings),
            user={"id": user.id, "email": user.email, "name": user.name, "role": user.role},
        )
