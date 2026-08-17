from pydantic import BaseModel


class MarkupTiers(BaseModel):
    tier1: float
    tier2: float
    tier3: float
    tier4: float


DEFAULT_MARKUP = MarkupTiers(tier1=1.2, tier2=0.9, tier3=0.7, tier4=0.5)


def select_markup(purchase_price: float, tiers: MarkupTiers = DEFAULT_MARKUP) -> float:
    if purchase_price <= 30:
        return tiers.tier1
    if purchase_price <= 100:
        return tiers.tier2
    if purchase_price <= 300:
        return tiers.tier3
    return tiers.tier4


def to_psychological_price(value: float) -> float:
    if value <= 0:
        return 0

    import math

    whole = math.ceil(value)
    base = math.floor(whole / 10) * 10 + 9
    candidate = base + 0.9
    if candidate < value:
        candidate += 10
    return round(candidate, 2)


class ComputePriceInput(BaseModel):
    purchasePrice: float
    marketAveragePrice: float | None = None
    tiers: MarkupTiers | None = None


class ComputedPrice(BaseModel):
    suggestedPrice: float
    markupApplied: float
    profit: float
    marginPercent: float
    roi: float


def compute_price(input_: ComputePriceInput) -> ComputedPrice:
    purchase_price = input_.purchasePrice
    markup = select_markup(purchase_price, input_.tiers or DEFAULT_MARKUP)
    target = purchase_price * (1 + markup)

    if input_.marketAveragePrice and input_.marketAveragePrice > 0:
        ceiling = input_.marketAveragePrice * 1.1
        target = min(target, ceiling)
        target = max(target, purchase_price * 1.05)

    suggested_price = to_psychological_price(target)
    profit = round(suggested_price - purchase_price, 2)
    margin_percent = round((profit / suggested_price) * 100, 2) if suggested_price else 0
    roi = round((profit / purchase_price) * 100, 2) if purchase_price else 0

    return ComputedPrice(
        suggestedPrice=suggested_price,
        markupApplied=markup,
        profit=profit,
        marginPercent=margin_percent,
        roi=roi,
    )
