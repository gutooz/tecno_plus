from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import Settings


def hash_password(password: str) -> str:
    # Bcrypt is retained for compatibility with users created by the NestJS backend.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))


def parse_duration(value: str) -> timedelta:
    unit = value[-1]
    amount = int(value[:-1])
    if unit == "s":
        return timedelta(seconds=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    if unit == "h":
        return timedelta(hours=amount)
    if unit == "d":
        return timedelta(days=amount)
    raise ValueError(f"Unsupported duration: {value}")


def create_token(payload: dict[str, Any], secret: str, expires_in: str) -> str:
    now = datetime.now(UTC)
    claims = payload | {"iat": now, "exp": now + parse_duration(expires_in)}
    return jwt.encode(claims, secret, algorithm="HS256")


def decode_token(token: str, secret: str) -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=["HS256"])


def issue_access_token(payload: dict[str, Any], settings: Settings) -> str:
    return create_token(payload, settings.jwt_secret, settings.jwt_expires_in)


def issue_refresh_token(payload: dict[str, Any], settings: Settings) -> str:
    return create_token(payload, settings.jwt_refresh_secret, settings.jwt_refresh_expires_in)
