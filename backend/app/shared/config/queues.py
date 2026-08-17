from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class QueueName(StrEnum):
    UPLOAD = "upload"
    VISION = "vision"
    MARKET = "market"
    CONTENT = "content"
    IMAGE = "image"
    PRICING = "pricing"
    PUBLISH = "publish"
    RETRY = "retry"
    DEAD_LETTER = "dead-letter"


PIPELINE_ORDER: tuple[QueueName, ...] = (
    QueueName.VISION,
    QueueName.MARKET,
    QueueName.CONTENT,
    QueueName.IMAGE,
    QueueName.PRICING,
    QueueName.PUBLISH,
)


class BackoffOptions(BaseModel):
    type: str
    delay: int


class JobCleanupOptions(BaseModel):
    count: int


class JobOptions(BaseModel):
    attempts: int
    backoff: BackoffOptions
    removeOnComplete: JobCleanupOptions
    removeOnFail: bool


DEFAULT_JOB_OPTIONS = JobOptions(
    attempts=3,
    backoff=BackoffOptions(type="exponential", delay=5000),
    removeOnComplete=JobCleanupOptions(count=1000),
    removeOnFail=False,
)


class PipelineJobData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    productId: str
    ownerId: str
    from_: QueueName | None = Field(default=None, alias="from")
    attempt: int | None = None
