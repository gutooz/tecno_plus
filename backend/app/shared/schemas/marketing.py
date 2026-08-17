from enum import StrEnum

from pydantic import BaseModel


class MarketingChannel(StrEnum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TIKTOK = "tiktok"
    YOUTUBE_SHORTS = "youtube_shorts"
    PINTEREST = "pinterest"
    GOOGLE_BUSINESS = "google_business"


class MarketingContentType(StrEnum):
    FEED = "feed"
    STORY = "story"
    REEL = "reel"
    CAROUSEL = "carousel"
    OFFER = "offer"


class MarketingTheme(StrEnum):
    PROMOTIONAL = "promotional"
    EDUCATIONAL = "educational"
    CURIOSITY = "curiosity"
    COMPARISON = "comparison"
    NEW_ARRIVAL = "new_arrival"
    REVIEW = "review"
    UNBOXING = "unboxing"
    BEHIND_THE_SCENES = "behind_the_scenes"
    TESTIMONIAL = "testimonial"
    SEASONAL = "seasonal"


class MarketingPostStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    CANCELED = "canceled"
    FAILED = "failed"


class MarketingCampaignType(StrEnum):
    LAUNCH = "launch"
    PROMOTIONAL = "promotional"
    CLEARANCE = "clearance"
    COUPON = "coupon"
    FREE_SHIPPING = "free_shipping"
    FLASH_SALE = "flash_sale"
    BUNDLE = "bundle"
    BLACK_FRIDAY = "black_friday"
    SEASONAL = "seasonal"


class TrendScore(BaseModel):
    productId: str
    score: float
    reasons: list[str]
    seasonalEvent: str | None = None
    suggestedHashtags: list[str]
    suggestedKeywords: list[str]
    calculatedAt: str


class MarketingPostContent(BaseModel):
    caption: str
    hashtags: list[str]
    cta: str
    mediaUrls: list[str]


class MarketingPost(BaseModel):
    id: str
    ownerId: str
    productId: str
    channel: MarketingChannel
    type: MarketingContentType
    theme: MarketingTheme
    campaignType: MarketingCampaignType
    status: MarketingPostStatus
    scheduledFor: str
    content: MarketingPostContent
    trendScore: float | None = None
    publishedAt: str | None = None
    externalId: str | None = None
    lastError: str | None = None
    createdAt: str
    updatedAt: str


class MarketingInsight(BaseModel):
    id: str
    summary: str
    metric: str
    confidence: float
    sampleSize: int
    createdAt: str


class MarketingAnalytics(BaseModel):
    postId: str
    likes: int
    comments: int
    shares: int
    saves: int
    reach: int
    impressions: int
    clicks: int
    collectedAt: str


class MarketingCampaignPlan(BaseModel):
    productId: str
    campaignType: MarketingCampaignType
    objective: str
    targetAudience: str
    strategy: str
    idealPostingHour: int
    trendScore: float
    reasoning: str


class SeasonalEvent(BaseModel):
    name: str
    month: int
    day: int
    windowDays: int


SEASONAL_EVENTS: tuple[SeasonalEvent, ...] = (
    SeasonalEvent(name="Dia das Maes", month=5, day=11, windowDays=14),
    SeasonalEvent(name="Dia dos Namorados", month=6, day=12, windowDays=14),
    SeasonalEvent(name="Dia dos Pais", month=8, day=10, windowDays=14),
    SeasonalEvent(name="Dia das Criancas", month=10, day=12, windowDays=14),
    SeasonalEvent(name="Black Friday", month=11, day=29, windowDays=21),
    SeasonalEvent(name="Cyber Monday", month=12, day=2, windowDays=5),
    SeasonalEvent(name="Natal", month=12, day=25, windowDays=30),
    SeasonalEvent(name="Volta as Aulas", month=1, day=20, windowDays=20),
)
