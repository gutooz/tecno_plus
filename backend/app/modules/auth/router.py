from fastapi import APIRouter, Depends

from app.modules.auth.dependencies import get_auth_service
from app.modules.auth.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.modules.auth.service import AuthService

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    return await service.register(
        email=str(payload.email),
        password=payload.password,
        name=payload.name,
        profile_type=payload.profileType,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    return await service.login(email=str(payload.email), password=payload.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    return await service.refresh(payload.refreshToken)

