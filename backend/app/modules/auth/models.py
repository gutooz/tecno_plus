from dataclasses import dataclass


@dataclass(frozen=True)
class User:
    id: str
    email: str
    password_hash: str
    name: str
    role: str
    organization_id: str = ""

