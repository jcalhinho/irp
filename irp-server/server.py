#!/usr/bin/env python3
"""
IRP Server — Intent Rendering Protocol
=======================================
Serveur qui sert des intents JSON (Content-Type: application/irp+json)
au lieu de HTML. Le client (navigateur) reçoit les intents et génère
l'interface via un agent IA local.

Usage:
    python3 server.py [--port 8000] [--host localhost]

Routes:
    GET /                        → intent show_landing (page d'accueil du projet)
    GET /product/<id>            → intent show_product
    GET /article/<id>            → intent read_article
    GET /dashboard               → intent show_dashboard
    GET /__intents               → liste tous les intents disponibles (debug)
    GET /__health                → healthcheck
    GET /__data/products         → liste tous les produits (debug)
    GET /__data/articles         → liste tous les articles (debug)
"""

import argparse
import json
import os
import re
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote, parse_qs

# SEO: prerender HTML pour les bots
from seo import is_bot, prerender

# Proxy LLM durci (auth, CORS en liste blanche, limites) — voir proxy.py
import proxy as _proxy

# IRP-Doc : même contenu pour humains (rendu déterministe) et agents (Markdown, JSON-LD, llms.txt)
import irpdoc as _irpdoc

# Outil « colle une URL » : récupération de pages publiques, anti-SSRF — voir fetcher.py
import fetcher as _fetcher

# ─── Chargement des données ──────────────────────────────────────────────────

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _load_json(filename: str) -> list | dict:
    path = os.path.join(_DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


_PRODUCTS = _load_json("products.json")
_ARTICLES = _load_json("articles.json")
_DASHBOARD = _load_json("dashboard.json")

# Index pour accès rapide par ID
_PRODUCTS_BY_ID = {p["id"]: p for p in _PRODUCTS}
_ARTICLES_BY_ID = {a["id"]: a for a in _ARTICLES}


# ─── Intents ─────────────────────────────────────────────────────────────────

# Import relatif des modules d'intents
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from intents import show_product, read_article, show_dashboard, show_catalog, fill_form, browse_list, show_pricing, show_chat  # noqa: E402


def _build_landing() -> dict:
    """Intent show_landing — page d'accueil du projet IRP."""
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_landing",
            "data": {
                "title": "IRP — Intent Rendering Protocol",
                "tagline": "Le web qui se code lui-même dans le navigateur",
                "description": (
                    "IRP inverse le modèle web : le serveur envoie des intentions, "
                    "pas du HTML. Le navigateur génère l'interface via un agent IA local. "
                    "50x moins de bande passante, accessibilité native, personnalisation totale."
                ),
                "features": [
                    {
                        "icon": "⚡",
                        "title": "50x moins de bande passante",
                        "description": "2-10KB d'IRP vs 500KB de HTML/CSS/JS"
                    },
                    {
                        "icon": "♿",
                        "title": "Accessibilité native",
                        "description": "L'IA adapte l'interface au handicap en temps réel"
                    },
                    {
                        "icon": "🎨",
                        "title": "Personnalisation totale",
                        "description": "Même URL, interface différente selon qui visite"
                    },
                    {
                        "icon": "🔧",
                        "title": "Pas de build, pas de framework",
                        "description": "L'IA locale fait tout — fini webpack, vite, React"
                    }
                ],
                "links": [
                    { "label": "Voir un produit", "href": "/product/macbook-pro-16", "type": "primary" },
                    { "label": "Lire un article", "href": "/article/irp-intro", "type": "secondary" },
                    { "label": "Dashboard", "href": "/dashboard", "type": "secondary" },
                ],
                "models": [
                    { "name": "Chrome Prompt API", "latency": "~200ms", "type": "native" },
                    { "name": "WebLLM (Qwen 0.5B)", "latency": "~2-5s", "type": "local" },
                    { "name": "LFM3-1.7B (Liquid AI)", "latency": "~2-5s", "type": "local" },
                    { "name": "SGP API (claude-qwen)", "latency": "~5-30s", "type": "remote" },
                ],
            },
            "constraints": {
                "must_show": ["title", "tagline", "features", "links"],
                "priority": "engagement",
                "content_type": "marketing",
            },
            "context_hints": {
                "requires_auth": False,
                "cacheable": True,
                "ttl": 3600,
            },
        }
    }


def _build_error(status: str, message: str, path: str) -> dict:
    """Intent show_error — page d'erreur."""
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_error",
            "data": {
                "status": status,
                "message": message,
                "path": path,
                "links": [
                    { "label": "Accueil", "href": "/", "type": "primary" },
                ],
            },
            "constraints": {
                "must_show": ["status", "message"],
                "priority": "clarity",
                "content_type": "error",
            },
            "context_hints": {
                "requires_auth": False,
                "cacheable": False,
                "ttl": 0,
            },
        }
    }


# ─── Catalogue d'intents (utilisé par /__health et /__intents) ───────────────

def _intent_catalog() -> list[dict]:
    """Liste de tous les intents servis, avec leurs routes."""
    return [
        {"name": "show_landing", "description": "Page d'accueil marketing", "routes": ["GET /"]},
        {"name": "show_product", "description": "Fiche produit e-commerce", "routes": ["GET /product/<id>"],
         "available_ids": list(_PRODUCTS_BY_ID.keys())},
        {"name": "read_article", "description": "Article de blog/presse", "routes": ["GET /article/<id>"],
         "available_ids": list(_ARTICLES_BY_ID.keys())},
        {"name": "show_dashboard", "description": "Tableau de bord avec widgets", "routes": ["GET /dashboard"]},
        {"name": "show_catalog", "description": "Catalogue produits avec filtres", "routes": ["GET /catalog"]},
        {"name": "fill_form", "description": "Formulaire (contact, inscription)",
         "routes": ["GET /contact", "GET /signup", "GET /form/<id>"]},
        {"name": "browse_list", "description": "Liste générique (tâches, favoris)",
         "routes": ["GET /tasks", "GET /favorites"]},
        {"name": "show_pricing", "description": "Tableau de tarifs", "routes": ["GET /pricing"]},
        {"name": "show_chat", "description": "Interface de conversation", "routes": ["GET /chat"]},
    ]


# ─── Proxy LLM (configuré au démarrage par main(), ou par les tests) ─────────

_PROXY_CFG = None  # proxy.ProxyConfig
_RATE = None       # proxy.RateLimiter


def configure_proxy(cfg) -> None:
    """Installe la configuration du proxy (et son limiteur de débit)."""
    global _PROXY_CFG, _RATE
    _PROXY_CFG = cfg
    _RATE = _proxy.RateLimiter(cfg.rate_per_min)


# ─── Outil « colle une URL » ────────────────────────────────────────────────

_REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FETCH_ENABLED = False
_FETCH_RATE = None
_TRUST_PROXY = os.environ.get("IRP_TRUST_PROXY") == "1"  # derrière un reverse proxy de confiance : lire X-Forwarded-For
_TOOL_CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; "
             "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
_STATIC = {"/tool": ("irp-site/tool.html", "text/html; charset=utf-8"), "/tool.js": ("irp-site/tool.js", "text/javascript; charset=utf-8"),
           "/privacy": ("irp-site/privacy.html", "text/html; charset=utf-8")}
# Démo modèles locaux : CSP dédiée (bibliothèque d'inférence + poids depuis des hôtes nommés, jamais d'inline script).
_LOCAL_CSP = ("default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; "
              "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net; "
              "worker-src 'self' blob:; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
_LOCAL_PAGES = {"/local": ("irp-site/local.html", "text/html; charset=utf-8"), "/local.js": ("irp-site/local.js", "text/javascript; charset=utf-8")}
# Scripts publics du widget (lecture seule, sans secret) : intégrables depuis n'importe quel site → CORS ouvert.
_WIDGET = {"/widget.js": "irp-site/widget.js", "/reader.js": "irp-extension/reader.js"}
_CORS_OPEN = {"Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin"}


def configure_fetch(enabled: bool, per_minute: int = 10) -> None:
    global _FETCH_ENABLED, _FETCH_RATE
    _FETCH_ENABLED = enabled
    _FETCH_RATE = _proxy.RateLimiter(per_minute)


# ─── Serveur HTTP ────────────────────────────────────────────────────────────

class IRPHandler(BaseHTTPRequestHandler):
    """Handler qui sert des intents IRP (JSON) au lieu de HTML."""

    def do_GET(self):
        path = urlparse(self.path).path
        user_agent = self.headers.get("User-Agent", "")

        # ── Outil « colle une URL » (page, scripts, endpoint de récupération) ──
        if self._serve_tool(path):
            return

        # ── Vue agent / IRP-Doc (négociation de contenu explicite) ──
        if self._serve_agent_view(path):
            return

        # ── SEO: si c'est un bot, servir du HTML prerenderisé ──
        if is_bot(user_agent) and not path.startswith("/__"):
            irp_data = self._resolve_irp(path)
            if irp_data:
                html = prerender(irp_data)
                body = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-IRP-Prerendered", "true")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)
                return

        # ── Routes de debug ──
        if path == "/__health":
            self._serve_irp({
                "status": "ok",
                "version": "1.0",
                "intents": [i["name"] for i in _intent_catalog()],
            })
            return

        if path == "/__intents":
            self._serve_irp({"intents": _intent_catalog()})
            return

        if path == "/__data/products":
            self._serve_irp(_PRODUCTS)
            return

        if path == "/__data/articles":
            self._serve_irp(_ARTICLES)
            return

        # ── Route : page d'accueil ──
        if path == "/":
            self._serve_irp(_build_landing())
            return

        # ── Route : produit ──
        if path.startswith("/product/"):
            product_id = unquote(path[len("/product/"):])
            if not product_id:
                self._redirect("/")
                return
            product = _PRODUCTS_BY_ID.get(product_id)
            if not product:
                self._serve_irp(_build_error("404", f"Produit '{product_id}' introuvable", path), status=404)
                return
            self._serve_irp(show_product.build(product))
            return

        # ── Route : article ──
        if path.startswith("/article/"):
            article_id = unquote(path[len("/article/"):])
            if not article_id:
                self._redirect("/")
                return
            article = _ARTICLES_BY_ID.get(article_id)
            if not article:
                self._serve_irp(_build_error("404", f"Article '{article_id}' introuvable", path), status=404)
                return
            self._serve_irp(read_article.build(article))
            return

        # ── Route : dashboard ──
        if path == "/dashboard":
            self._serve_irp(show_dashboard.build(_DASHBOARD))
            return

        # ── Route : catalogue produits ──
        if path == "/catalog":
            self._serve_irp(show_catalog.build())
            return

        # ── Route : formulaire ──
        if path.startswith("/form/"):
            form_id = unquote(path[len("/form/"):])
            self._serve_irp(fill_form.build(form_id))
            return
        if path == "/contact":
            self._serve_irp(fill_form.build("contact"))
            return
        if path == "/signup":
            self._serve_irp(fill_form.build("signup"))
            return

        # ── Route : liste générique ──
        if path == "/tasks":
            self._serve_irp(browse_list.build("tasks"))
            return
        if path == "/favorites":
            self._serve_irp(browse_list.build("favorites"))
            return

        # ── Route : tarifs ──
        if path == "/pricing":
            self._serve_irp(show_pricing.build())
            return

        # ── Route : chat ──
        if path == "/chat":
            self._serve_irp(show_chat.build())
            return

        # ── 404 ──
        self._serve_irp(_build_error("404", f"Route '{path}' introuvable", path), status=404)

    # ── Réponses ──

    def _send_bytes(self, status: int, body: bytes, content_type: str, extra: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _proxy_cors_headers(self) -> dict:
        """CORS du proxy : jamais '*' — on ne renvoie que l'origine si elle est autorisée."""
        origin = self.headers.get("Origin")
        if _PROXY_CFG and origin and _proxy.origin_allowed(origin, _PROXY_CFG):
            return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        return {"Vary": "Origin"}

    def _proxy_error(self, status: int, code: str, extra: dict | None = None):
        headers = self._proxy_cors_headers()
        headers.update(extra or {})
        self._send_bytes(status, json.dumps({"error": code}).encode(), "application/json; charset=utf-8", headers)

    # ── CORS preflight ──

    def do_OPTIONS(self):
        """Preflight CORS. Proxy : origines autorisées seulement ; routes IRP publiques : ouvert (lecture seule)."""
        path = urlparse(self.path).path
        if path == "/__proxy/sgp":
            origin = self.headers.get("Origin")
            if not (_PROXY_CFG and _PROXY_CFG.enabled and origin and _proxy.origin_allowed(origin, _PROXY_CFG)):
                self._proxy_error(403, "origin_not_allowed")
                return
            self.send_response(204)
            for k, v in self._proxy_cors_headers().items():
                self.send_header(k, v)
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IRP-Token, Authorization")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IRP-Context")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path

        # ── Proxy SGP : relaye les appels LLM (l'API SGP n'autorise pas CORS depuis un navigateur) ──
        if path == "/__proxy/sgp":
            self._proxy_sgp()
            return

        self._serve_irp(_build_error("405", "Méthode POST non supportée", path), status=405)

    def _proxy_sgp(self):
        """Proxy durci vers SGP LLMaaS : auth → débit → Content-Type → taille → validation → relais."""
        cfg = _PROXY_CFG
        if cfg is None or not cfg.enabled:
            self._proxy_error(503, "proxy_disabled")
            return

        ok, status, code = _proxy.authorize(self.headers, cfg)
        if not ok:
            self._proxy_error(status, code)
            return

        if not _RATE.allow(self.client_address[0]):
            self._proxy_error(429, "rate_limited", {"Retry-After": "60"})
            return

        # Content-Type JSON exigé : bloque les "simple requests" cross-site (text/plain, formulaires)
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self._proxy_error(415, "content_type_must_be_json")
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._proxy_error(411, "length_required")
            return
        if length <= 0:
            self._proxy_error(400, "empty_body")
            return
        if length > _proxy.MAX_BODY:
            self._proxy_error(413, "body_too_large")
            return

        payload, err = _proxy.validate_payload(self.rfile.read(length))
        if payload is None:
            self._proxy_error(400, err)
            return

        status, headers, body = _proxy.forward(cfg, payload)
        extra = dict(self._proxy_cors_headers())
        self._send_bytes(status, body, headers.get("Content-Type", "application/json; charset=utf-8"), extra)

    # ── Outil « colle une URL » ──

    def _client_key(self) -> str:
        if _TRUST_PROXY:
            xff = (self.headers.get("X-Forwarded-For") or "").split(",")[-1].strip()
            if xff:
                return xff
        return self.client_address[0]

    def _serve_tool(self, path: str) -> bool:
        if path == "/__fetch":
            self._serve_fetch()
            return True
        rel = None
        if path in _WIDGET or (path.startswith("/core/") and re.fullmatch(r"/core/[a-z]+\.js", path)):
            rel = _WIDGET.get(path) or "irp-core/" + path[len("/core/"):]
            try:
                with open(os.path.join(_REPO_DIR, rel), "rb") as f:
                    body = f.read()
            except OSError:
                return False
            self._send_bytes(200, body, "text/javascript; charset=utf-8", {**_CORS_OPEN, "Cache-Control": "public, max-age=300"})
            return True
        if path in _LOCAL_PAGES:
            rel, ctype = _LOCAL_PAGES[path]
            try:
                with open(os.path.join(_REPO_DIR, rel), "rb") as f:
                    body = f.read()
            except OSError:
                return False
            self._send_bytes(200, body, ctype, {"Content-Security-Policy": _LOCAL_CSP, "Referrer-Policy": "no-referrer",
                                                "X-Frame-Options": "DENY", "Cache-Control": "no-cache"})
            return True
        if path in _STATIC:
            rel, ctype = _STATIC[path]
        elif path.startswith("/core/") and re.fullmatch(r"/core/[a-z]+\.js", path):
            rel, ctype = "irp-core/" + path[len("/core/"):], "text/javascript; charset=utf-8"
        if rel is None:
            return False
        full = os.path.join(_REPO_DIR, rel)
        try:
            with open(full, "rb") as f:
                body = f.read()
        except OSError:
            return False
        self._send_bytes(200, body, ctype, {"Content-Security-Policy": _TOOL_CSP, "Referrer-Policy": "no-referrer",
                                            "X-Frame-Options": "DENY", "Cache-Control": "no-cache"})
        return True

    def _fetch_json(self, status: int, payload: dict):
        self._send_bytes(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8",
                         {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    def _serve_fetch(self):
        if not _FETCH_ENABLED:
            return self._fetch_json(503, {"error": "fetch_disabled", "message": "La récupération d'adresses est désactivée sur ce serveur."})
        if (self.headers.get("Sec-Fetch-Site") or "same-origin") == "cross-site":
            return self._fetch_json(403, {"error": "forbidden", "message": "Requête inter-sites refusée."})
        if not _FETCH_RATE.allow(self._client_key()):
            self.send_response(429)
            self.send_header("Retry-After", "60")
            body = json.dumps({"error": "rate_limited", "message": "Trop de requêtes. Réessayez dans une minute."}).encode()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        qs = parse_qs(urlparse(self.path).query)
        url = (qs.get("url") or [""])[0]
        try:
            page = _fetcher.fetch_page(url)
        except _fetcher.FetchError as e:
            return self._fetch_json(e.status, {"error": e.code, "message": e.message})
        except Exception as e:  # jamais de détail interne vers le visiteur
            print(f"[FETCH] erreur inattendue: {type(e).__name__}", file=sys.stderr)
            return self._fetch_json(500, {"error": "internal", "message": "Erreur interne."})
        self._fetch_json(200, {"url": page.url, "status": page.status, "html": page.html, "truncated": page.truncated, "bytes": page.bytes})

    # ── Vue agent : IRP-Doc, Markdown, llms.txt, manifeste ──

    _AGENT_ROUTES = ["/", "/product/macbook-pro-16", "/article/irp-intro", "/dashboard", "/catalog", "/pricing"]

    def _origin(self) -> str:
        host = self.headers.get("Host", "")
        return f"http://{host}" if host else ""

    def _doc_for(self, path: str):
        irp = self._resolve_irp(path)
        if not irp:
            return None, 500
        status = 404 if irp["irp"]["intent"] == "show_error" else 200
        return _irpdoc.irp_to_doc(irp, path), status

    def _serve_agent_view(self, path: str) -> bool:
        """Retourne True si la requête a été traitée comme vue agent."""
        accept = (self.headers.get("Accept") or "").lower()
        fmt = None
        if path == "/llms.txt":
            lines = []
            for p in self._AGENT_ROUTES:
                doc, st = self._doc_for(p)
                if doc and st == 200:
                    href = "/index.md" if p == "/" else p + ".md"
                    lines.append((doc["title"], href, doc.get("description", "")))
            self._send_agent(200, _irpdoc.llms_txt("IRP", lines).encode("utf-8"), "text/plain; charset=utf-8")
            return True
        if path == "/.well-known/irp.json":
            origin = self._origin()
            manifest = {
                "irp_manifest": "1.0",
                "formats": {"irp_doc": "application/irp-doc+json", "markdown": "text/markdown", "intent": "application/irp+json"},
                "access": {"how": "Accept header or suffix (.md, .irpdoc.json)", "auth": "none", "license": "public"},
                "pages": [{"path": p, "irp_doc": origin + (p if p != "/" else "/index") + ".irpdoc.json",
                           "markdown": origin + (p if p != "/" else "/index") + ".md"} for p in self._AGENT_ROUTES],
            }
            self._send_agent(200, json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"), "application/json; charset=utf-8")
            return True
        if path.endswith(".irpdoc.json"):
            fmt, path = "doc", path[: -len(".irpdoc.json")]
        elif path.endswith(".md"):
            fmt, path = "md", path[:-3]
        elif "application/irp-doc+json" in accept:
            fmt = "doc"
        elif "text/markdown" in accept:
            fmt = "md"
        if fmt is None or path.startswith("/__"):
            return False
        if path in ("/index", ""):
            path = "/"
        doc, status = self._doc_for(path)
        if doc is None:
            return False
        if fmt == "doc":
            self._send_agent(status, json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8"), "application/irp-doc+json; charset=utf-8")
        else:
            self._send_agent(status, _irpdoc.to_markdown(doc).encode("utf-8"), "text/markdown; charset=utf-8")
        return True

    def _send_agent(self, status: int, body: bytes, ctype: str):
        # contenu public en lecture seule → CORS ouvert, mais jamais de cookies/credentials
        self._send_bytes(status, body, ctype, {"Access-Control-Allow-Origin": "*", "Vary": "Accept", "Cache-Control": "public, max-age=300"})

    def _resolve_irp(self, path: str) -> dict | None:
        """Résout une route vers un objet IRP (pour le prerender SEO)."""
        try:
            if path == "/":
                return _build_landing()
            if path.startswith("/product/"):
                product_id = unquote(path[len("/product/"):])
                product = _PRODUCTS_BY_ID.get(product_id)
                if product:
                    return show_product.build(product)
            elif path.startswith("/article/"):
                article_id = unquote(path[len("/article/"):])
                article = _ARTICLES_BY_ID.get(article_id)
                if article:
                    return read_article.build(article)
            elif path == "/dashboard":
                return show_dashboard.build(_DASHBOARD)
            elif path == "/catalog":
                return show_catalog.build()
            elif path == "/contact":
                return fill_form.build("contact")
            elif path == "/signup":
                return fill_form.build("signup")
            elif path == "/tasks":
                return browse_list.build("tasks")
            elif path == "/favorites":
                return browse_list.build("favorites")
            elif path == "/pricing":
                return show_pricing.build()
            elif path == "/chat":
                return show_chat.build()
            # 404
            return _build_error("404", f"Route '{path}' introuvable", path)
        except Exception as e:
            print(f"[SEO] Erreur résolution {path}: {e}", file=sys.stderr)
            return None

    def _serve_irp(self, data: dict, status: int = 200):
        """Sert une réponse IRP (JSON avec Content-Type application/irp+json)."""
        body = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/irp+json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Origin", "*")  # intents publics, lecture seule
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IRP-Context")
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, location: str):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")


# ─── Entrée ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="IRP Server — Intent Rendering Protocol")
    parser.add_argument("--host", default="localhost", help="Host (default: localhost)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--allow-origin", action="append", default=[], metavar="ORIGIN",
                        help="Origine navigateur autorisée pour le proxy SGP (répétable). "
                             "Défaut : http://localhost:3000 et http://127.0.0.1:3000")
    parser.add_argument("--no-proxy", action="store_true", help="Désactive le proxy SGP")
    parser.add_argument("--fetch", action="store_true",
                        help="Active /__fetch (outil « colle une URL ») même hors localhost (actif par défaut en local)")
    args = parser.parse_args()

    cfg = _proxy.build_config(args.host, args.allow_origin, enabled_flag=not args.no_proxy)
    configure_proxy(cfg)
    configure_fetch(args.fetch or cfg.loopback, int(os.environ.get("IRP_FETCH_RATE", "10")))

    server = ThreadingHTTPServer((args.host, args.port), IRPHandler)
    print(f"🚀 IRP Server — http://{args.host}:{args.port}")
    print(f"   Content-Type: application/irp+json")
    print(f"   Données: {len(_PRODUCTS)} produits, {len(_ARTICLES)} articles, 1 dashboard")
    print(f"   Routes:")
    print(f"     /                        → show_landing")
    print(f"     /product/<id>            → show_product ({', '.join(_PRODUCTS_BY_ID.keys())})")
    print(f"     /article/<id>            → read_article ({', '.join(_ARTICLES_BY_ID.keys())})")
    print(f"     /dashboard               → show_dashboard")
    print(f"     /__intents               → liste des intents (debug)")
    print(f"     /__health                → healthcheck")
    print(f"     /tool                    → outil « colle une URL » ({'actif' if _FETCH_ENABLED else 'récupération désactivée : --fetch'})")
    if cfg.enabled:
        print(f"   Proxy SGP : actif (clé : {cfg.key_source}, jeton : {'oui' if cfg.token else 'non'}, "
              f"origines : {', '.join(cfg.origins)})")
    else:
        print(f"   Proxy SGP : DÉSACTIVÉ — {cfg.reason}")
    if not cfg.loopback:
        print(f"   ⚠️  Écoute sur {args.host} (non-loopback) : le proxy exige IRP_PROXY_TOKEN")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur IRP")
        server.server_close()


if __name__ == "__main__":
    main()
