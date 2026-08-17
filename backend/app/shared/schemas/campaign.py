from enum import StrEnum

from pydantic import BaseModel

from app.shared.schemas.enums import MarketplaceChannel


class CampaignStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class OrganicCampaignItemStatus(StrEnum):
    QUEUED = "queued"
    SENT_FOR_APPROVAL = "sent_for_approval"
    POSTED = "posted"
    SKIPPED = "skipped"


class OrganicCampaignItem(BaseModel):
    productId: str
    scheduledFor: str
    status: OrganicCampaignItemStatus


class OrganicCampaignConfig(BaseModel):
    channels: list[MarketplaceChannel]
    intervalDays: int
    startDate: str
    items: list[OrganicCampaignItem]


class PaidCampaignGender(StrEnum):
    MALE = "male"
    FEMALE = "female"


class PaidCampaignObjective(StrEnum):
    POST_ENGAGEMENT = "POST_ENGAGEMENT"
    REACH = "REACH"
    TRAFFIC = "TRAFFIC"


class PaidCampaignTargeting(BaseModel):
    countries: list[str]
    ageMin: int
    ageMax: int
    genders: list[PaidCampaignGender] | None = None


class PaidCampaignExternalIds(BaseModel):
    campaignId: str | None = None
    adSetId: str | None = None
    adId: str | None = None
    creativeId: str | None = None


class PaidCampaignConfig(BaseModel):
    objective: PaidCampaignObjective
    dailyBudgetCents: int
    currency: str
    targeting: PaidCampaignTargeting
    productId: str
    channel: MarketplaceChannel
    external: PaidCampaignExternalIds
    startDate: str | None = None
    endDate: str | None = None
    lastError: str | None = None


class CampaignType(StrEnum):
    ORGANIC = "organic"
    PAID = "paid"


class Campaign(BaseModel):
    id: str
    ownerId: str
    type: CampaignType
    name: str
    status: CampaignStatus
    organic: OrganicCampaignConfig | None = None
    paid: PaidCampaignConfig | None = None
    createdAt: str
    updatedAt: str
