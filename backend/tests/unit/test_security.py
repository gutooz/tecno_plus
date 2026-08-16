from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    parse_duration,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("secret-password")

    assert hashed != "secret-password"
    assert verify_password("secret-password", hashed)
    assert not verify_password("wrong", hashed)


def test_jwt_roundtrip() -> None:
    token = create_token(
        {"sub": "user-1", "email": "a@example.com", "role": "seller"},
        "secret-with-at-least-32-characters",
        "15m",
    )

    payload = decode_token(token, "secret-with-at-least-32-characters")

    assert payload["sub"] == "user-1"
    assert payload["email"] == "a@example.com"
    assert payload["role"] == "seller"


def test_parse_duration() -> None:
    assert parse_duration("15m").total_seconds() == 900
    assert parse_duration("7d").days == 7
