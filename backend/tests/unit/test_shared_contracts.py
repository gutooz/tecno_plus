from app.shared.config import PipelineJobData, QueueName
from app.shared.schemas import MarketplaceChannel, Product, ProductStatus, WeightSource
from app.shared.utilities import ComputePriceInput, build_internal_sku, compute_price, slugify


def test_slugify_matches_typescript_contract() -> None:
    assert slugify("Máscara Facial 3 em 1!") == "mascara-facial-3-em-1"


def test_build_internal_sku_matches_typescript_contract() -> None:
    assert build_internal_sku("Beleza", "produto-123456") == "TP-BEL-123456"
    assert build_internal_sku(None, "42") == "TP-GEN-000042"


def test_compute_price_uses_markup_and_psychological_price() -> None:
    result = compute_price(ComputePriceInput(purchasePrice=40, marketAveragePrice=80))

    assert result.suggestedPrice == 79.9
    assert result.markupApplied == 0.9
    assert result.profit == 39.9
    assert result.marginPercent == 49.94
    assert result.roi == 99.75


def test_pipeline_job_data_keeps_from_alias() -> None:
    job = PipelineJobData(productId="p1", ownerId="u1", **{"from": "vision"})

    assert job.from_ == QueueName.VISION
    assert job.model_dump(by_alias=True)["from"] == "vision"


def test_product_accepts_typescript_shaped_payload() -> None:
    product = Product(
        id="p1",
        ownerId="u1",
        internalSku="TP-BEL-123456",
        status="uploaded",
        aiConfidence=0.7,
        vision={
            "name": "Mascara Facial",
            "weightSource": "estimado",
            "shopeeCategoryId": 120039,
        },
        images={"original": "https://cdn.example.com/p1.jpg"},
        market={
            "averagePrice": 50,
            "minPrice": 40,
            "maxPrice": 60,
            "approxListingCount": 12,
            "marketRange": {"from": 39.9, "to": 59.9},
            "similarProducts": [],
            "competition": "medium",
            "sources": ["shopee"],
            "collectedAt": "2026-08-17T00:00:00Z",
        },
        publishedChannels=["shopee"],
        createdAt="2026-08-17T00:00:00Z",
        updatedAt="2026-08-17T00:00:00Z",
    )

    assert product.status == ProductStatus.UPLOADED
    assert product.vision.weightSource == WeightSource.ESTIMADO
    assert product.market is not None
    assert product.market.marketRange.from_ == 39.9
    assert product.publishedChannels == [MarketplaceChannel.SHOPEE]
