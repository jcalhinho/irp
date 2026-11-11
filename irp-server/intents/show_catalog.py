"""Intent: show_catalog — Liste/grille de produits avec filtres et tri."""

import json
import os

_DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/data"

def build():
    """Construit un intent show_catalog avec tous les produits."""
    with open(f"{_DATA_DIR}/products.json", encoding="utf-8") as f:
        products = json.load(f)

    # Extraire les catégories uniques pour les filtres
    categories = sorted(set(p["category"] for p in products))

    return {
        "irp": {
            "version": "1.0",
            "intent": "show_catalog",
            "data": {
                "title": "Catalogue produits",
                "products": [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "price": p["price"],
                        "category": p["category"],
                        "availability": p.get("availability", "in_stock"),
                        "rating": p.get("rating", {}),
                    }
                    for p in products
                ],
                "filters": [
                    {"id": "category", "label": "Catégorie", "options": categories},
                    {"id": "price", "label": "Prix", "options": ["< 500€", "500€ - 1000€", "> 1000€"]},
                ],
                "sort_options": [
                    {"id": "name", "label": "Nom (A-Z)"},
                    {"id": "price_asc", "label": "Prix croissant"},
                    {"id": "price_desc", "label": "Prix décroissant"},
                    {"id": "rating", "label": "Mieux notés"},
                ],
                "pagination": {"page": 1, "total_pages": 1, "per_page": len(products)},
                "total_count": len(products),
            },
            "constraints": {
                "must_show": ["products"],
                "priority": "conversion",
                "content_type": "commercial",
            },
            "actions": [
                {"id": "view_product", "label": "Voir le produit", "type": "primary", "href": "/product/{id}", "method": "GET", "irp": True},
            ],
            "context_hints": {"cacheable": True, "ttl": 300},
            "metadata": {"title": "Catalogue — IRP Demo", "lang": "fr"},
        }
    }
