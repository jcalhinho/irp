"""Intent: show_dashboard — tableau de bord avec widgets."""

from typing import Any


def build(dashboard: dict[str, Any]) -> dict[str, Any]:
    """Construit un IRP pour un dashboard.

    Args:
        dashboard: dict avec title, user, last_updated, kpi_cards, chart,
                   recent_activity, model_usage

    Returns:
        IRP au format standardisé.
    """
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_dashboard",
            "data": {
                "title": dashboard["title"],
                "user": dashboard.get("user", {}),
                "last_updated": dashboard.get("last_updated", ""),
                "kpi_cards": dashboard.get("kpi_cards", []),
                "chart": dashboard.get("chart", {}),
                "recent_activity": dashboard.get("recent_activity", []),
                "model_usage": dashboard.get("model_usage", []),
            },
            "constraints": {
                "must_show": ["title", "kpi_cards", "chart"],
                "priority": "data_density",
                "content_type": "analytical",
            },
            "context_hints": {
                "requires_auth": True,
                "cacheable": False,
                "ttl": 0,
            },
        }
    }
