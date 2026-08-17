from enum import StrEnum


class ProductStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    NEEDS_REVIEW = "needs_review"
    READY = "ready"
    PUBLISHED = "published"
    HIDDEN = "hidden"
    DRAFT = "draft"
    ERROR = "error"


class CompetitionLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AIProviderName(StrEnum):
    OPENAI = "openai"
    CLAUDE = "claude"
    GEMINI = "gemini"


class MarketplaceChannel(StrEnum):
    WEBSITE = "website"
    SHOPEE = "shopee"
    MERCADO_LIVRE = "mercado_livre"
    AMAZON = "amazon"
    GOOGLE_SHOPPING = "google_shopping"
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"


class JobStatus(StrEnum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    DELAYED = "delayed"
