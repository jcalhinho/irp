"""
IRP SDK Python — Génère des réponses IRP (Intent Rendering Protocol) côté serveur.

Usage:
    from irp_sdk import IRPResponse, intent

    @intent("show_product")
    def my_product(product_id):
        return IRPResponse(
            intent="show_product",
            data={"id": product_id, "name": "Widget", "price": {"amount": 29.99, "currency": "EUR"}},
            constraints={"must_show": ["name", "price"], "priority": "conversion"},
        )

    # Dans un handler HTTP:
    response = my_product("widget-42")
    body = response.to_json()  # → JSON string
    headers = response.headers()  # → {"Content-Type": "application/irp+json; charset=utf-8"}

Ou directement:
    irp = IRPResponse(
        intent="show_error",
        data={"status": "404", "message": "Not found"},
    )
    print(irp.to_dict())
"""

import json
from datetime import datetime, timezone


class IRPResponse:
    """Représente une réponse IRP à renvoyer au client."""

    def __init__(
        self,
        intent: str,
        data: dict,
        constraints: dict | None = None,
        actions: list | None = None,
        context_hints: dict | None = None,
        metadata: dict | None = None,
        version: str = "1.0",
    ):
        self.version = version
        self.intent = intent
        self.data = data
        self.constraints = constraints or {}
        self.actions = actions or []
        self.context_hints = context_hints or {}
        self.metadata = metadata or {}

    def to_dict(self) -> dict:
        """Retourne la réponse sous forme de dictionnaire."""
        irp = {
            "version": self.version,
            "intent": self.intent,
            "data": self.data,
        }
        if self.constraints:
            irp["constraints"] = self.constraints
        if self.actions:
            irp["actions"] = self.actions
        if self.context_hints:
            irp["context_hints"] = self.context_hints
        if self.metadata:
            irp["metadata"] = self.metadata
        return {"irp": irp}

    def to_json(self, indent: int = 2) -> str:
        """Retourne la réponse sous forme de JSON string."""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    def headers(self) -> dict:
        """Retourne les headers HTTP à envoyer avec la réponse."""
        return {
            "Content-Type": "application/irp+json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-IRP-Context",
        }

    def body(self) -> bytes:
        """Retourne le body encodé en UTF-8."""
        return self.to_json().encode("utf-8")


# ─── Constraints presets ─────────────────────────────────────────────────────

CONSTRAINTS = {
    "conversion": {"priority": "conversion", "content_type": "commercial"},
    "readability": {"priority": "readability", "content_type": "editorial"},
    "data_density": {"priority": "data_density", "content_type": "analytical"},
    "engagement": {"priority": "engagement", "content_type": "marketing"},
    "clarity": {"priority": "clarity", "content_type": "interactive"},
    "error": {"priority": "clarity", "content_type": "error"},
}


# ─── Factory helpers ─────────────────────────────────────────────────────────

def show_landing(title: str, tagline: str = "", features: list | None = None,
                 links: list | None = None, **kwargs) -> IRPResponse:
    """Crée un intent show_landing."""
    return IRPResponse(
        intent="show_landing",
        data={"title": title, "tagline": tagline, "features": features or [], "links": links or [], **kwargs},
        constraints=CONSTRAINTS["engagement"],
        context_hints={"cacheable": True, "ttl": 3600},
    )


def show_product(product_id: str, name: str, price: dict, specs: list | None = None,
                 description: str = "", availability: str = "in_stock", **kwargs) -> IRPResponse:
    """Crée un intent show_product."""
    return IRPResponse(
        intent="show_product",
        data={
            "id": product_id, "name": name, "price": price,
            "specs": specs or [], "description": description, "availability": availability, **kwargs
        },
        constraints=CONSTRAINTS["conversion"],
        context_hints={"cacheable": True, "ttl": 3600},
    )


def read_article(article_id: str, title: str, sections: list, author: str = "",
                 date: str = "", tags: list | None = None, **kwargs) -> IRPResponse:
    """Crée un intent read_article."""
    return IRPResponse(
        intent="read_article",
        data={
            "id": article_id, "title": title, "sections": sections,
            "author": author, "date": date, "tags": tags or [], **kwargs
        },
        constraints=CONSTRAINTS["readability"],
        context_hints={"cacheable": True, "ttl": 86400},
    )


def show_dashboard(title: str, kpi_cards: list, user: dict | None = None,
                   chart: dict | None = None, **kwargs) -> IRPResponse:
    """Crée un intent show_dashboard."""
    return IRPResponse(
        intent="show_dashboard",
        data={
            "title": title, "kpi_cards": kpi_cards,
            "user": user or {}, "chart": chart or {},
            "last_updated": datetime.now(timezone.utc).isoformat(), **kwargs
        },
        constraints=CONSTRAINTS["data_density"],
        context_hints={"cacheable": False, "ttl": 0},
    )


def fill_form(form_id: str, title: str, fields: list, submit: dict,
              description: str = "", **kwargs) -> IRPResponse:
    """Crée un intent fill_form."""
    return IRPResponse(
        intent="fill_form",
        data={
            "id": form_id, "title": title, "fields": fields,
            "submit": submit, "description": description, **kwargs
        },
        constraints=CONSTRAINTS["clarity"],
        context_hints={"cacheable": False, "ttl": 0},
    )


def show_error(status: str, message: str, path: str = "",
               links: list | None = None) -> IRPResponse:
    """Crée un intent show_error."""
    return IRPResponse(
        intent="show_error",
        data={
            "status": status, "message": message, "path": path,
            "links": links or [{"label": "Accueil", "href": "/", "type": "primary"}],
        },
        constraints=CONSTRAINTS["error"],
        context_hints={"cacheable": False, "ttl": 0},
    )


def show_pricing(title: str, plans: list, billing_toggle: dict | None = None,
                 faq: list | None = None, **kwargs) -> IRPResponse:
    """Crée un intent show_pricing."""
    return IRPResponse(
        intent="show_pricing",
        data={
            "title": title, "plans": plans,
            "billing_toggle": billing_toggle or {}, "faq": faq or [], **kwargs
        },
        constraints=CONSTRAINTS["conversion"],
        context_hints={"cacheable": True, "ttl": 86400},
    )


def show_chat(chat_id: str, title: str, messages: list, input_config: dict,
              participants: list | None = None, **kwargs) -> IRPResponse:
    """Crée un intent show_chat."""
    return IRPResponse(
        intent="show_chat",
        data={
            "id": chat_id, "title": title, "messages": messages,
            "input": input_config, "participants": participants or [], **kwargs
        },
        constraints=CONSTRAINTS["engagement"],
        context_hints={"cacheable": False, "ttl": 0},
    )


def show_catalog(title: str, products: list, filters: list | None = None,
                 pagination: dict | None = None, **kwargs) -> IRPResponse:
    """Crée un intent show_catalog."""
    return IRPResponse(
        intent="show_catalog",
        data={
            "title": title, "products": products,
            "filters": filters or [], "pagination": pagination or {}, **kwargs
        },
        constraints=CONSTRAINTS["conversion"],
        context_hints={"cacheable": True, "ttl": 300},
    )


def browse_list(title: str, items: list, empty_message: str = "Aucun élément",
                filters: list | None = None, **kwargs) -> IRPResponse:
    """Crée un intent browse_list."""
    return IRPResponse(
        intent="browse_list",
        data={
            "title": title, "items": items,
            "empty_message": empty_message, "filters": filters or [], **kwargs
        },
        constraints=CONSTRAINTS["data_density"],
        context_hints={"cacheable": True, "ttl": 60},
    )


# ─── Décorateur @intent ──────────────────────────────────────────────────────

_intent_registry: dict[str, callable] = {}


def intent(intent_name: str):
    """Décorateur qui enregistre une fonction comme handler d'intent."""
    def decorator(func):
        _intent_registry[intent_name] = func
        return func
    return decorator


def get_intent_handler(name: str) -> callable | None:
    """Retourne le handler enregistré pour un intent, ou None."""
    return _intent_registry.get(name)


def list_intents() -> list[str]:
    """Liste tous les intents enregistrés."""
    return sorted(_intent_registry.keys())


# ─── Validation ──────────────────────────────────────────────────────────────

def validate(irp_response: IRPResponse) -> list[str]:
    """Valide une réponse IRP. Retourne une liste d'erreurs (vide = OK)."""
    errors = []
    if irp_response.version != "1.0":
        errors.append(f"Version non supportée: {irp_response.version}")
    if not irp_response.intent:
        errors.append("intent est requis")
    if not isinstance(irp_response.data, dict):
        errors.append("data doit être un dict")
    if irp_response.constraints:
        valid_priorities = {"conversion", "readability", "data_density", "engagement", "clarity", "normal"}
        if irp_response.constraints.get("priority") and irp_response.constraints["priority"] not in valid_priorities:
            errors.append(f"priority invalide: {irp_response.constraints['priority']}")
    return errors
