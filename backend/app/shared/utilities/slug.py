import re
import unicodedata


def slugify(input_: str) -> str:
    normalized = unicodedata.normalize("NFD", input_)
    without_accents = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    lowered = without_accents.lower().strip()
    safe = re.sub(r"[^a-z0-9\s-]", "", lowered)
    dashed = re.sub(r"\s+", "-", safe)
    collapsed = re.sub(r"-+", "-", dashed)
    return collapsed.strip("-")


def build_internal_sku(category: str | None, seed: str) -> str:
    raw_category = (category or "GEN")[:3].upper()
    cat = re.sub(r"[^A-Z]", "X", raw_category)
    suffix = re.sub(r"[^a-zA-Z0-9]", "", seed)[-6:].upper().rjust(6, "0")
    return f"TP-{cat}-{suffix}"
