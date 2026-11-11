"""
seo.py — Prerender HTML statique pour les bots de recherche
=============================================================
Détecte les bots (Googlebot, Bingbot, etc.) via User-Agent et sert
du HTML statique généré à partir des intents IRP.

Ce module résout le problème SEO d'IRP : les bots voient du JSON,
pas du HTML. On génère donc une version HTML minimale mais indexable.
"""

import json
import re

# User-Agents des bots de recherche
BOT_PATTERNS = [
    r"Googlebot",
    r"Bingbot",
    r"Slurp",          # Yahoo
    r"DuckDuckBot",    # DuckDuckGo
    r"Baiduspider",
    r"YandexBot",
    r"Sogou",
    r"Exabot",
    r"facebot",        # Facebook
    r"ia_archiver",    # Alexa
    r"bot",
    r"crawl",
    r"spider",
    r"Google-Structured-Data-Testing-Tool",
    r"Googlebot-Image",
    r"AdsBot-Google",
]

_BOT_REGEX = re.compile("|".join(BOT_PATTERNS), re.IGNORECASE)


def is_bot(user_agent: str) -> bool:
    """Détecte si la requête vient d'un bot de recherche."""
    if not user_agent:
        return False
    return bool(_BOT_REGEX.search(user_agent))


def prerender(irp_data: dict) -> str:
    """
    Génère du HTML statique SEO-friendly à partir d'un objet IRP.

    Le HTML est minimal mais contient:
    - <title> et <meta description>
    - Open Graph tags
    - Structured data (JSON-LD)
    - Contenu textuel structuré (h1, h2, p, ul)
    - Liens internes

    Args:
        irp_data: L'objet IRP complet { irp: { intent, data, ... } }

    Returns:
        HTML statique string
    """
    irp = irp_data.get("irp", irp_data)
    intent = irp.get("intent", "unknown")
    data = irp.get("data", {})
    constraints = irp.get("constraints", {})
    metadata = irp.get("metadata", {})
    actions = irp.get("actions", [])

    # Titre et description
    title = metadata.get("title") or data.get("title") or data.get("name") or f"IRP — {intent}"
    description = (
        metadata.get("description")
        or data.get("description")
        or data.get("tagline")
        or data.get("excerpt")
        or f"Page IRP: {intent}"
    )

    # Tronquer la description pour SEO (max 160 chars)
    if len(description) > 160:
        description = description[:157] + "..."

    # Langue
    lang = metadata.get("lang", "fr")

    # Générer le contenu HTML selon l'intent
    body_html = _render_body(intent, data, actions)

    # Structured data JSON-LD
    json_ld = _build_json_ld(intent, data, title, description)

    # Open Graph
    og_type = "article" if intent == "read_article" else "website"

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_escape(title)}</title>
<meta name="description" content="{_escape(description)}">
<meta name="robots" content="index, follow">
<meta name="generator" content="IRP Server — Intent Rendering Protocol">

<!-- Open Graph -->
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{_escape(title)}">
<meta property="og:description" content="{_escape(description)}">
<meta property="og:locale" content="{lang}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_escape(title)}">
<meta name="twitter:description" content="{_escape(description)}">

<!-- Structured Data -->
<script type="application/ld+json">
{json.dumps(json_ld, ensure_ascii=False, indent=2)}
</script>

<style>
body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.7; color: #1a1a2e; }}
h1 {{ font-size: 1.8rem; margin-bottom: 8px; }}
h2 {{ font-size: 1.3rem; margin-top: 24px; }}
.price {{ font-size: 1.5rem; font-weight: 700; color: #00B0FF; }}
.specs {{ border-collapse: collapse; width: 100%; }}
.specs td, .specs th {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
.specs th {{ background: #f5f5f5; }}
.cta {{ display: inline-block; padding: 12px 24px; background: #00E676; color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0; }}
.features {{ list-style: none; padding: 0; }}
.features li {{ padding: 8px 0; border-bottom: 1px solid #eee; }}
.meta {{ color: #666; font-size: 0.9rem; margin-bottom: 16px; }}
</style>
</head>
<body>
{body_html}
</body>
</html>"""


# ─── Renderers par intent ────────────────────────────────────────────────────

def _render_body(intent: str, data: dict, actions: list) -> str:
    """Génère le <body> HTML selon l'intent."""
    renderer = _INTENT_RENDERERS.get(intent, _render_default)
    return renderer(data, actions)


def _render_landing(data: dict, actions: list) -> str:
    title = data.get("title", "")
    tagline = data.get("tagline", "")
    description = data.get("description", "")
    features = data.get("features", [])
    links = data.get("links", [])

    features_html = ""
    if features:
        items = "".join(
            f'<li><strong>{_escape(f.get("title", ""))}</strong>: {_escape(f.get("description", ""))}</li>'
            for f in features
        )
        features_html = f'<h2>Fonctionnalités</h2><ul class="features">{items}</ul>'

    links_html = ""
    if links:
        links_html = "<h2>Liens</h2><ul>" + "".join(
            f'<li><a href="{_escape(l.get("href", "#"))}">{_escape(l.get("label", ""))}</a></li>'
            for l in links
        ) + "</ul>"

    return f"""<h1>{_escape(title)}</h1>
<p class="meta">{_escape(tagline)}</p>
<p>{_escape(description)}</p>
{features_html}
{links_html}"""


def _render_product(data: dict, actions: list) -> str:
    name = data.get("name", "")
    price = data.get("price", {})
    price_str = f'{price.get("amount", "")} {price.get("currency", "")}' if price else ""
    specs = data.get("specs", [])
    description = data.get("description", "")
    badges = data.get("badges", [])

    badges_html = " ".join(f'<span>{_escape(b)}</span>' for b in badges) if badges else ""

    specs_html = ""
    if specs:
        rows = "".join(
            f'<tr><th>{_escape(s.get("label", ""))}</th><td>{_escape(s.get("value", ""))}</td></tr>'
            for s in specs
        )
        specs_html = f'<h2>Spécifications</h2><table class="specs">{rows}</table>'

    actions_html = ""
    if actions:
        actions_html = "".join(
            f'<a href="{_escape(a.get("href", "#"))}" class="cta">{_escape(a.get("label", ""))}</a>'
            for a in actions if a.get("type") == "primary"
        )

    return f"""<h1>{_escape(name)}</h1>
{f'<p>{badges_html}</p>' if badges_html else ''}
{f'<p class="price">{_escape(price_str)}</p>' if price_str else ''}
<p>{_escape(description)}</p>
{specs_html}
{actions_html}"""


def _render_article(data: dict, actions: list) -> str:
    title = data.get("title", "")
    author = data.get("author", "")
    date = data.get("date", "")
    read_time = data.get("read_time", "")
    excerpt = data.get("excerpt", "")
    content = data.get("content", "")

    meta_parts = [p for p in [author, date, read_time] if p]
    meta_html = f'<p class="meta">{" · ".join(meta_parts)}</p>' if meta_parts else ""

    # Convertir le contenu simple en HTML (paragraphes)
    content_html = ""
    if content:
        if isinstance(content, list):
            content_html = "".join(f"<p>{_escape(p)}</p>" for p in content)
        else:
            paragraphs = str(content).split("\n\n")
            content_html = "".join(f"<p>{_escape(p)}</p>" for p in paragraphs if p.strip())

    return f"""<article>
<h1>{_escape(title)}</h1>
{meta_html}
<p><em>{_escape(excerpt)}</em></p>
{content_html}
</article>"""


def _render_dashboard(data: dict, actions: list) -> str:
    title = data.get("title", "Dashboard")
    kpis = data.get("kpis", [])

    kpis_html = ""
    if kpis:
        items = "".join(
            f'<li><strong>{_escape(k.get("label", ""))}</strong>: {_escape(str(k.get("value", "")))} ({_escape(k.get("change", ""))})</li>'
            for k in kpis
        )
        kpis_html = f'<h2>Indicateurs</h2><ul>{items}</ul>'

    return f"""<h1>{_escape(title)}</h1>
{kpis_html}"""


def _render_catalog(data: dict, actions: list) -> str:
    title = data.get("title", "Catalogue")
    products = data.get("products", [])

    products_html = ""
    if products:
        items = "".join(
            f'<li><a href="/product/{_escape(p.get("id", ""))}">{_escape(p.get("name", ""))}</a> — {_escape(str(p.get("price", "")))}</li>'
            for p in products
        )
        products_html = f'<h2>Produits</h2><ul>{items}</ul>'

    return f"""<h1>{_escape(title)}</h1>
{products_html}"""


def _render_form(data: dict, actions: list) -> str:
    title = data.get("title", "Formulaire")
    fields = data.get("fields", [])
    description = data.get("description", "")

    fields_html = ""
    if fields:
        items = "".join(
            f'<li><label>{_escape(f.get("label", ""))}</label>: <input type="{_escape(f.get("type", "text"))}" name="{_escape(f.get("name", ""))}" {"required" if f.get("required") else ""}></li>'
            for f in fields
        )
        fields_html = f'<ul>{items}</ul>'

    return f"""<h1>{_escape(title)}</h1>
<p>{_escape(description)}</p>
{fields_html}
<button type="submit">Envoyer</button>"""


def _render_list(data: dict, actions: list) -> str:
    title = data.get("title", "Liste")
    items = data.get("items", [])

    items_html = ""
    if items:
        lis = "".join(f"<li>{_escape(i.get('label', i.get('title', str(i))))}</li>" for i in items)
        items_html = f'<ul>{lis}</ul>'

    return f"""<h1>{_escape(title)}</h1>
{items_html}"""


def _render_pricing(data: dict, actions: list) -> str:
    title = data.get("title", "Tarifs")
    plans = data.get("plans", [])

    plans_html = ""
    if plans:
        items = "".join(
            f'<li><strong>{_escape(p.get("name", ""))}</strong>: {_escape(str(p.get("price", "")))} — {_escape(", ".join(p.get("features", [])))}</li>'
            for p in plans
        )
        plans_html = f'<h2>Plans</h2><ul>{items}</ul>'

    return f"""<h1>{_escape(title)}</h1>
{plans_html}"""


def _render_chat(data: dict, actions: list) -> str:
    title = data.get("title", "Chat")
    return f"<h1>{_escape(title)}</h1><p>Interface de conversation IRP.</p>"


def _render_error(data: dict, actions: list) -> str:
    status = data.get("status", "Erreur")
    message = data.get("message", "")
    links = data.get("links", [])

    links_html = ""
    if links:
        links_html = "<ul>" + "".join(
            f'<li><a href="{_escape(l.get("href", "/"))}">{_escape(l.get("label", "Accueil"))}</a></li>'
            for l in links
        ) + "</ul>"

    return f"""<h1>{_escape(status)}</h1>
<p>{_escape(message)}</p>
{links_html}"""


def _render_default(data: dict, actions: list) -> str:
    """Renderer par défaut: affiche les données en JSON formaté."""
    title = data.get("title", data.get("name", "IRP"))
    return f"""<h1>{_escape(title)}</h1>
<pre>{_escape(json.dumps(data, ensure_ascii=False, indent=2))}</pre>"""


# ─── Table des renderers ─────────────────────────────────────────────────────

_INTENT_RENDERERS = {
    "show_landing": _render_landing,
    "show_product": _render_product,
    "read_article": _render_article,
    "show_dashboard": _render_dashboard,
    "show_catalog": _render_catalog,
    "fill_form": _render_form,
    "browse_list": _render_list,
    "show_pricing": _render_pricing,
    "show_chat": _render_chat,
    "show_error": _render_error,
}


# ─── Structured Data (JSON-LD) ───────────────────────────────────────────────

def _build_json_ld(intent: str, data: dict, title: str, description: str) -> dict:
    """Construit un objet JSON-LD pour le SEO structuré."""
    base = {
        "@context": "https://schema.org",
        "name": title,
        "description": description,
    }

    if intent == "show_product":
        price = data.get("price", {})
        base["@type"] = "Product"
        base["name"] = data.get("name", title)
        if price:
            base["offers"] = {
                "@type": "Offer",
                "price": str(price.get("amount", "")),
                "priceCurrency": price.get("currency", "EUR"),
                "availability": "https://schema.org/InStock",
            }
        specs = data.get("specs", [])
        if specs:
            base["additionalProperty"] = [
                {"@type": "PropertyValue", "name": s.get("label"), "value": s.get("value")}
                for s in specs
            ]

    elif intent == "read_article":
        base["@type"] = "Article"
        base["headline"] = title
        base["author"] = {"@type": "Person", "name": data.get("author", "")}
        base["datePublished"] = data.get("date", "")
        base["articleBody"] = data.get("excerpt", description)

    elif intent == "show_pricing":
        base["@type"] = "OfferCatalog"
        plans = data.get("plans", [])
        base["offers"] = [
            {
                "@type": "Offer",
                "name": p.get("name", ""),
                "price": str(p.get("price", "")),
                "description": ", ".join(p.get("features", [])),
            }
            for p in plans
        ]

    else:
        base["@type"] = "WebPage"

    return base


# ─── Utils ───────────────────────────────────────────────────────────────────

def _escape(text: str) -> str:
    """Échappe le HTML pour éviter les injections."""
    if not isinstance(text, str):
        text = str(text)
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
