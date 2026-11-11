"""
IRP-Doc côté serveur : convertit les intents en documents de composants (JSON) lisibles
par les humains (rendu déterministe côté client) ET par les agents IA (Markdown compact,
JSON-LD, /llms.txt, /.well-known/irp.json). Une seule source de vérité, trois publics.
"""

from __future__ import annotations

from typing import Any

VERSION = "1.0"


def _price(p: Any) -> str:
    if isinstance(p, dict) and p.get("amount") is not None:
        amt = p["amount"]
        s = f"{amt:,.2f}".replace(",", " ").replace(".", ",") if isinstance(amt, float) and amt != int(amt) else f"{int(amt):,}".replace(",", " ")
        return f"{s} {'€' if p.get('currency', 'EUR') == 'EUR' else p.get('currency', '')}".strip()
    return "" if p in (None, "") else str(p)


def _action_items(actions: list[dict]) -> list[dict]:
    return [{"label": a["label"], "href": a["href"], "primary": a.get("type") == "primary"}
            for a in actions or [] if a.get("label") and a.get("href")]


def _cell(v: Any) -> str:
    return "" if v is None else str(v)


def _from_product(d: dict) -> dict:
    price = _price(d.get("price"))
    blocks: list[dict] = []
    facts = [{"label": "Prix", "value": price}] if price else []
    avail = {"in_stock": "En stock", "out_of_stock": "Rupture de stock", "preorder": "Précommande"}.get(d.get("availability", ""), d.get("availability", ""))
    if avail:
        facts.append({"label": "Disponibilité", "value": avail})
    r = d.get("rating") or {}
    if r.get("score") is not None:
        facts.append({"label": "Note", "value": f"{r['score']}/5 ({r.get('count', 0)} avis)"})
    if d.get("category"):
        facts.append({"label": "Catégorie", "value": d["category"]})
    if facts:
        blocks.append({"type": "facts", "items": facts})
    if d.get("description"):
        blocks.append({"type": "text", "text": d["description"]})
    if d.get("specs"):
        blocks.append({"type": "table", "caption": "Caractéristiques", "headers": ["Caractéristique", "Valeur"],
                       "rows": [[s["label"], s["value"]] for s in d["specs"]]})
    acts = _action_items(d.get("actions", []))
    if acts:
        blocks.append({"type": "actions", "items": acts})
    structured = {"@context": "https://schema.org", "@type": "Product", "name": d["name"], "description": d.get("description", ""),
                  "category": d.get("category", "")}
    if isinstance(d.get("price"), dict):
        structured["offers"] = {"@type": "Offer", "price": d["price"].get("amount"), "priceCurrency": d["price"].get("currency", "EUR"),
                                "availability": "https://schema.org/" + ("InStock" if d.get("availability") == "in_stock" else "OutOfStock")}
    if r.get("score") is not None:
        structured["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": r["score"], "reviewCount": r.get("count", 0)}
    return {"title": d["name"], "blocks": blocks, "must_show": [d["name"], price] if price else [d["name"]], "structured": structured}


def _from_article(d: dict) -> dict:
    blocks: list[dict] = []
    meta = " · ".join(x for x in (d.get("author"), d.get("date"), d.get("reading_time")) if x)
    if meta:
        blocks.append({"type": "text", "text": meta})
    for s in d.get("sections", []):
        blocks.append({"type": "heading", "level": 2, "text": s.get("heading", "")})
        blocks.append({"type": "text", "text": s.get("content", "")})
    structured = {"@context": "https://schema.org", "@type": "Article", "headline": d["title"], "author": d.get("author", ""),
                  "datePublished": d.get("date", ""), "keywords": ", ".join(d.get("tags", []))}
    ms = [d["title"]] + ([d["date"]] if d.get("date") else [])
    return {"title": d["title"], "description": d.get("excerpt", ""), "blocks": blocks, "must_show": ms, "structured": structured}


def _from_landing(d: dict) -> dict:
    blocks: list[dict] = [{"type": "text", "text": d.get("description", "")}]
    blocks.append({"type": "list", "items": [f"{f['title']} — {f['description']}" for f in d.get("features", [])]})
    if d.get("models"):
        blocks.append({"type": "table", "caption": "Moteurs de rendu", "headers": ["Nom", "Latence", "Type"],
                       "rows": [[m["name"], m["latency"], m["type"]] for m in d["models"]]})
    blocks.append({"type": "actions", "items": [{"label": l["label"], "href": l["href"], "primary": l.get("type") == "primary"} for l in d.get("links", [])]})
    return {"title": d["title"], "description": d.get("tagline", ""), "blocks": blocks, "must_show": [d["title"]]}


def _from_dashboard(d: dict) -> dict:
    blocks: list[dict] = [{"type": "facts", "items": [{"label": k["label"], "value": f"{k['value']} ({k.get('change', '')})".replace(" ()", "")} for k in d.get("kpi_cards", [])]}]
    ch = d.get("chart") or {}
    if ch.get("data"):
        blocks.append({"type": "table", "caption": ch.get("title", "Graphique"), "headers": ["Jour", "Valeur"], "rows": [[x.get("day", ""), _cell(x.get("value"))] for x in ch["data"]]})
    if d.get("model_usage"):
        blocks.append({"type": "table", "caption": "Usage des moteurs", "headers": ["Moteur", "Nombre", "Part (%)"],
                       "rows": [[m["model"], _cell(m["count"]), _cell(m["percentage"])] for m in d["model_usage"]]})
    act = d.get("recent_activity") or []
    if act and isinstance(act[0], dict):
        keys = list(act[0].keys())
        blocks.append({"type": "table", "caption": "Activité récente", "headers": keys, "rows": [[_cell(a.get(k)) for k in keys] for a in act]})
    return {"title": d["title"], "blocks": blocks, "must_show": [k["value"] for k in d.get("kpi_cards", [])][:4]}


def _from_catalog(d: dict) -> dict:
    rows = [[p["name"], _price(p.get("price")), p.get("category", ""), p.get("availability", "")] for p in d.get("products", [])]
    return {"title": d["title"], "blocks": [
        {"type": "text", "text": f"{d.get('total_count', len(rows))} produits."},
        {"type": "table", "caption": "Produits", "headers": ["Produit", "Prix", "Catégorie", "Disponibilité"], "rows": rows},
        {"type": "list", "items": [[{"t": "a", "href": f"/product/{p['id']}", "text": p["name"]}] for p in d.get("products", [])]},
    ], "must_show": [r[0] for r in rows] + [r[1] for r in rows if r[1]]}


def _from_pricing(d: dict) -> dict:
    blocks: list[dict] = []
    ms: list[str] = []
    for p in d.get("plans", []):
        price = "Sur devis" if p.get("price") is None else ("Gratuit" if p["price"] == 0 else f"{p['price']} € / mois")
        ms.append(price)
        blocks.append({"type": "section", "title": f"{p['name']} — {price}", "blocks": [
            {"type": "list", "items": p.get("features", [])},
            {"type": "actions", "items": [{"label": p["cta"]["label"], "href": p["cta"]["href"], "primary": bool(p.get("highlighted"))}]},
        ]})
    for q in d.get("faq", []):
        blocks.append({"type": "heading", "level": 2, "text": q["question"]})
        blocks.append({"type": "text", "text": q["answer"]})
    return {"title": d["title"], "blocks": blocks, "must_show": ms}


def _from_error(d: dict) -> dict:
    return {"title": f"Erreur {d.get('status', '')}".strip(), "blocks": [
        {"type": "callout", "kind": "danger", "title": "Page introuvable" if str(d.get("status")) == "404" else "Erreur", "text": d.get("message", "")},
        {"type": "actions", "items": [{"label": l["label"], "href": l["href"]} for l in d.get("links", [])]}], "must_show": [d.get("message", "")]}


def _generic(intent: str, d: dict) -> dict:
    title = d.get("title") or intent
    return {"title": str(title), "blocks": [{"type": "callout", "kind": "info", "title": "Contenu interactif",
            "text": f"Cette page ({intent}) est interactive : utilisez le client IRP pour l'afficher complètement."}], "must_show": [str(title)]}


_CONVERTERS = {"show_product": _from_product, "read_article": _from_article, "show_landing": _from_landing,
               "show_dashboard": _from_dashboard, "show_catalog": _from_catalog, "show_pricing": _from_pricing, "show_error": _from_error}


def irp_to_doc(irp_envelope: dict, url: str = "") -> dict:
    """Convertit {'irp': {...}} en IRP-Doc."""
    irp = irp_envelope["irp"]
    intent, data = irp["intent"], irp.get("data", {})
    conv = _CONVERTERS.get(intent)
    part = conv(data) if conv else _generic(intent, data)
    doc = {"irp_doc": VERSION, "lang": (irp.get("metadata") or {}).get("lang", "fr"), **part}
    doc["must_show"] = [m for m in doc.get("must_show", []) if m]
    if url:
        doc["url"] = url
    doc["source"] = {"origin": "intent", "intent": intent}
    return doc


# ── Markdown pour agents ─────────────────────────────────────────────────────

def _md(t: Any) -> str:
    if isinstance(t, str):
        return t
    out = []
    for r in t or []:
        if isinstance(r, str):
            out.append(r)
        elif r.get("t") == "a":
            out.append(f"[{r['text']}]({r['href']})")
        elif r.get("t") == "b":
            out.append(f"**{r['text']}**")
        else:
            out.append(f"*{r['text']}*")
    return "".join(out)


def to_markdown(doc: dict) -> str:
    out = [f"# {doc['title']}"]
    if doc.get("description"):
        out.extend(["", f"> {doc['description']}"])

    def blk(b: dict, depth: int) -> None:
        t = b["type"]
        if t == "heading":
            out.extend(["", f"{'#' * min(6, max(2, b['level']))} {_md(b['text'])}"])
        elif t == "text":
            out.extend(["", _md(b["text"])])
        elif t == "list":
            out.append("")
            out.extend([f"{n + 1}. {_md(i)}" if b.get("ordered") else f"- {_md(i)}" for n, i in enumerate(b["items"])])
        elif t == "facts":
            out.append("")
            out.extend([f"- **{i['label']}** : {i['value']}" for i in b["items"]])
        elif t == "actions":
            out.append("")
            out.extend([f"- [{i['label']}]({i['href']})" for i in b["items"]])
        elif t == "callout":
            out.extend(["", f"> **{b.get('kind', 'info').upper()}** {b.get('title', '')} : {_md(b['text'])}"])
        elif t == "table":
            out.append("")
            if b.get("caption"):
                out.extend([f"**{b['caption']}**", ""])
            h = b.get("headers") or [f"Col {i + 1}" for i in range(len(b["rows"][0]) if b["rows"] else 0)]
            out.extend(["| " + " | ".join(_md(x).replace("|", "\\|") for x in h) + " |", "| " + " | ".join("---" for _ in h) + " |"])
            out.extend(["| " + " | ".join(_md(c).replace("|", "\\|") for c in r) + " |" for r in b["rows"]])
        elif t == "section":
            if b.get("title"):
                out.extend(["", f"{'#' * min(6, depth + 2)} {b['title']}"])
            for x in b["blocks"]:
                blk(x, depth + 1)

    for b in doc["blocks"]:
        blk(b, 0)
    return "\n".join(out).strip() + "\n"


def llms_txt(site_name: str, entries: list[tuple[str, str, str]]) -> str:
    """Index /llms.txt (convention llmstxt.org) : [(titre, href, description)]."""
    lines = [f"# {site_name}", "", "> Pages disponibles en Markdown (ajouter `.md` ou `Accept: text/markdown`) et en IRP-Doc (`Accept: application/irp-doc+json`).", "", "## Pages"]
    lines += [f"- [{t}]({h}){': ' + d if d else ''}" for t, h, d in entries]
    return "\n".join(lines) + "\n"
