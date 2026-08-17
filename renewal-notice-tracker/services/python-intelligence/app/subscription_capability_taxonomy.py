import json
from functools import lru_cache
from pathlib import Path


TAXONOMY_PATH = Path(__file__).resolve().parents[3] / "config" / "subscription-capability-taxonomy.v1.json"


@lru_cache(maxsize=1)
def load_subscription_capability_taxonomy() -> dict:
    with TAXONOMY_PATH.open("r", encoding="utf-8") as handle:
        taxonomy = json.load(handle)
    if not taxonomy.get("version") or not taxonomy.get("capabilities") or not taxonomy.get("products"):
        raise ValueError("invalid_subscription_capability_taxonomy")
    return taxonomy


def product_capabilities(provider: str, product: str) -> list[dict[str, str]]:
    normalized = normalize(product)
    matches: list[dict[str, str]] = []
    for mapping in load_subscription_capability_taxonomy()["products"]:
        if mapping["provider"] != provider:
            continue
        if any(normalize(pattern) in normalized for pattern in mapping["patterns"]):
            matches.extend(
                {
                    "capability": capability,
                    "mapping_specificity": mapping["mappingSpecificity"],
                }
                for capability in mapping["capabilities"]
            )
    return matches


def normalize(value: str) -> str:
    return " ".join(
        value.lower()
        .replace("-", " ")
        .replace("_", " ")
        .replace(".", " ")
        .split()
    )
