from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.shared.schemas.enums import CompetitionLevel, MarketplaceChannel, ProductStatus
from app.shared.schemas.marketing import MarketingCampaignPlan, TrendScore


class WeightSource(StrEnum):
    ETIQUETA = "etiqueta"
    ESTIMADO = "estimado"


class ProductVisionAttributes(BaseModel):
    name: str | None = None
    brand: str | None = None
    model: str | None = None
    category: str | None = None
    subcategory: str | None = None
    color: str | None = None
    material: str | None = None
    size: str | None = None
    barcode: str | None = None
    ean: str | None = None
    sku: str | None = None
    packageText: str | None = None
    quantity: int | None = None
    supplier: str | None = None
    labelPrice: float | None = None
    shortDescription: str | None = None
    features: list[str] | None = None
    weight: float | None = None
    length: float | None = None
    width: float | None = None
    height: float | None = None
    weightSource: WeightSource | None = None
    shopeeCategoryId: int | None = None
    mercadoLivreCategoryId: str | None = None
    mercadoLivreListingTypeId: str | None = None


class SimilarProduct(BaseModel):
    title: str
    price: float
    source: str
    url: str | None = None


class MarketRange(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: float = Field(alias="from")
    to: float


class MarketResearchResult(BaseModel):
    averagePrice: float
    minPrice: float
    maxPrice: float
    approxListingCount: int
    marketRange: MarketRange
    similarProducts: list[SimilarProduct]
    competition: CompetitionLevel
    sources: list[str]
    collectedAt: str


class SeoContent(BaseModel):
    metaDescription: str
    slug: str
    keywords: list[str]
    tags: list[str]


class GeneratedContent(BaseModel):
    title: str
    description: str
    longDescription: str
    summary: str
    bulletPoints: list[str]
    seo: SeoContent
    category: str
    technicalSpecs: dict[str, str]
    marketplaceDescription: str


class PricingResult(BaseModel):
    purchasePrice: float
    suggestedPrice: float
    markupApplied: float
    profit: float
    marginPercent: float
    roi: float


class ProductImageSet(BaseModel):
    original: str
    hd: str | None = None
    square: str | None = None
    webp: str | None = None
    thumbnail: str | None = None
    backgroundRemoved: str | None = None
    isManufacturerProvided: bool | None = None
    shopee: list[str] | None = None


class SocialApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    POSTED = "posted"


class SocialApproval(BaseModel):
    status: SocialApprovalStatus
    caption: str
    telegramChatId: str
    telegramMessageId: int
    scheduledAt: str
    postedAt: str | None = None


class ProductMarketing(BaseModel):
    trend: TrendScore | None = None
    plan: MarketingCampaignPlan | None = None


class Product(BaseModel):
    id: str
    ownerId: str
    internalSku: str
    status: ProductStatus
    aiConfidence: float
    vision: ProductVisionAttributes
    market: MarketResearchResult | None = None
    content: GeneratedContent | None = None
    pricing: PricingResult | None = None
    images: ProductImageSet
    multipleProductsDetected: bool | None = None
    publishedChannels: list[MarketplaceChannel]
    externalIds: dict[MarketplaceChannel, str] | None = None
    socialApproval: SocialApproval | None = None
    marketing: ProductMarketing | None = None
    createdAt: str
    updatedAt: str
