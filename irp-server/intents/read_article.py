"""Intent: read_article — article de blog/presse."""

from typing import Any


def build(article: dict[str, Any]) -> dict[str, Any]:
    """Construit un IRP pour un article.

    Args:
        article: dict avec id, title, author, date, reading_time, tags, excerpt, sections

    Returns:
        IRP au format standardisé.
    """
    return {
        "irp": {
            "version": "1.0",
            "intent": "read_article",
            "data": {
                "id": article["id"],
                "title": article["title"],
                "author": article.get("author", ""),
                "date": article.get("date", ""),
                "reading_time": article.get("reading_time", ""),
                "tags": article.get("tags", []),
                "excerpt": article.get("excerpt", ""),
                "sections": article.get("sections", []),
            },
            "constraints": {
                "must_show": ["title", "sections"],
                "priority": "readability",
                "content_type": "editorial",
            },
            "context_hints": {
                "requires_auth": False,
                "cacheable": True,
                "ttl": 86400,
            },
        }
    }
