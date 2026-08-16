from app.core.config import get_settings
from app.database.session import get_database
from app.modules.auth.repository import UserRepository
from app.modules.auth.service import AuthService


def get_auth_service() -> AuthService:
    return AuthService(UserRepository(get_database()), get_settings())

