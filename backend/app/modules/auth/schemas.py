from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = None
    profileType: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class SessionUserResponse(BaseModel):
    id: str
    email: EmailStr | str
    name: str
    role: str


class TokenResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: SessionUserResponse
