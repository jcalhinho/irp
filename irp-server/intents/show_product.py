"""Intent: show_product — fiche produit e-commerce."""

from typing import Any


def build(product: dict[str, Any]) -> dict[str, Any]:
    """Construit un IRP pour un produit.

    Args:
        product: dict avec id, name, price, specs, description, actions, rating, availability

    Returns:
        IRP au format standardisé.
    """
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_product",
            "data": {
                "id": product["id"],
                "name": product["name"],
                "price": product["price"],
                "category": product.get("category", ""),
                "specs": product.get("specs", []),
                "description": product.get("description", ""),
                "images": product.get("images", []),
                "actions": product.get("actions", []),
                "rating": product.get("rating"),
                "availability": product.get("availability", "unknown"),
            },
            "constraints": {
                "must_show": ["name", "price"],
                "priority": "conversion",
                "content_type": "commercial",
            },
            "context_hints": {
                "requires_auth": False,
                "cacheable": True,
                "ttl": 3600,
            },
        }
    }
