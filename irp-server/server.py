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
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

# SEO: prerender HTML pour les bots
from seo import is_bot, prerender

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


# ─── Serveur HTTP ────────────────────────────────────────────────────────────

class IRPHandler(BaseHTTPRequestHandler):
    """Handler qui sert des intents IRP (JSON) au lieu de HTML."""

    def do_GET(self):
        path = urlparse(self.path).path
        user_agent = self.headers.get("User-Agent", "")

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
                self.end_headers()
                self.wfile.write(body)
                return

        # ── Routes de debug ──
        if path == "/__health":
            self._serve_irp({
                "status": "ok",
                "version": "1.0",
                "intents": ["show_landing", "show_product", "read_article", "show_dashboard"],
            })
            return

        if path == "/__intents":
            self._serve_irp({
                "intents": [
                    {
                        "name": "show_landing",
                        "description": "Page d'accueil marketing",
                        "route": "GET /",
                    },
                    {
                        "name": "show_product",
                        "description": "Fiche produit e-commerce",
                        "route": "GET /product/<id>",
                        "available_ids": list(_PRODUCTS_BY_ID.keys()),
                    },
                    {
                        "name": "read_article",
                        "description": "Article de blog/presse",
                        "route": "GET /article/<id>",
                        "available_ids": list(_ARTICLES_BY_ID.keys()),
                    },
                    {
                        "name": "show_dashboard",
                        "description": "Tableau de bord avec widgets",
                        "route": "GET /dashboard",
                    },
                ],
            })
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

    def do_OPTIONS(self):
        """Gère les requêtes preflight CORS (OPTIONS)."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IRP-Context")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path

        # ── Proxy SGP : relaye les appels LLM vers SGP LLMaaS ──
        # Nécessaire car l'API SGP ne supporte pas CORS depuis le navigateur
        if path == "/__proxy/sgp":
            self._proxy_sgp()
            return

        self._serve_irp(_build_error("405", "Méthode POST non supportée", path), status=405)

    def _proxy_sgp(self):
        """Proxy vers SGP LLMaaS pour éviter les problèmes CORS côté navigateur."""
        import urllib.request

        # Clé SGP : depuis l'env ou depuis la config OpenCode
        sgp_key = os.environ.get("SGP_API_KEY", "")
        if not sgp_key:
            try:
                auth_path = os.path.expanduser("~/.local/share/opencode/auth.json")
                with open(auth_path) as f:
                    auth = json.load(f)
                    sgp_key = auth.get("sgp", {}).get("key", "")
            except Exception:
                pass

        if not sgp_key:
            self._serve_irp({"error": "Aucune clé SGP configurée"}, status=500)
            return

        # Lire le body de la requête
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Forward vers SGP
        sgp_url = "https://llmasservice.sgp.fr/v1/chat/completions"
        req = urllib.request.Request(
            sgp_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {sgp_key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp_body = resp.read()
                # Retourne la réponse SGP au client avec CORS
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-IRP-Context")
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            print(f"[PROXY SGP] HTTP {e.code}: {err_body[:200]}", file=sys.stderr)
            self._serve_irp({"error": f"SGP API Error {e.code}", "detail": err_body[:500]}, status=e.code)
        except Exception as e:
            print(f"[PROXY SGP] Erreur: {e}", file=sys.stderr)
            self._serve_irp({"error": str(e)}, status=500)

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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), IRPHandler)
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
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur IRP")
        server.server_close()


if __name__ == "__main__":
    main()
