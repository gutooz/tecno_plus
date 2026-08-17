from app.core.exceptions import DomainError


class InvalidCredentialsError(DomainError):
    code = "INVALID_CREDENTIALS"
    status_code = 401


class EmailAlreadyRegisteredError(DomainError):
    code = "EMAIL_ALREADY_REGISTERED"
    status_code = 401


class InvalidRefreshTokenError(DomainError):
    code = "INVALID_REFRESH_TOKEN"
    status_code = 401

