#!/usr/bin/env python3
"""
Tests E2E automatisés pour IRP
==============================
Valide toutes les routes serveur, le SEO prerender, le proxy SGP,
et la cohérence des intents.

Usage:
    python3 tests/e2e_test.py [--port 8001]
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

# ─── Configuration ───────────────────────────────────────────────────────────

DEFAULT_PORT = 8001
BASE_URL = f"http://localhost:{DEFAULT_PORT}"

# ─── Utilitaires ─────────────────────────────────────────────────────────────

class Color:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    NC = "\033[0m"

_passed = 0
_failed = 0
_errors = []


def ok(msg):
    global _passed
    _passed += 1
    print(f"  {Color.GREEN}✅{Color.NC} {msg}")


def fail(msg, detail=""):
    global _failed
    _failed += 1
    _errors.append(f"{msg}: {detail}")
    print(f"  {Color.RED}❌{Color.NC} {msg}" + (f" — {detail}" if detail else ""))


def section(title):
    print(f"\n{Color.BLUE}━━━ {title} ━━━{Color.NC}")


def fetch(path, headers=None, method="GET"):
    """Fetch une URL et retourne (status, headers, body)."""
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, {}, str(e)


def fetch_json(path, headers=None):
    """Fetch une URL et retourne (status, json_data)."""
    status, hdrs, body = fetch(path, headers)
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, None


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_health():
    """Test du healthcheck."""
    section("Healthcheck")
    status, data = fetch_json("/__health")
    if status == 200 and data and data.get("status") == "ok":
        ok(f"/__health → status=ok, version={data.get('version')}")
    else:
        fail(f"/__health → status={status}", str(data)[:100])


def test_routes_irp():
    """Test de toutes les routes IRP — doivent retourner du JSON valide."""
    section("Routes IRP (application/irp+json)")

    routes = [
        ("/", "show_landing"),
        ("/product/macbook-pro-16", "show_product"),
        ("/article/irp-intro", "read_article"),
        ("/dashboard", "show_dashboard"),
        ("/catalog", "show_catalog"),
        ("/contact", "fill_form"),
        ("/signup", "fill_form"),
        ("/tasks", "browse_list"),
        ("/favorites", "browse_list"),
        ("/pricing", "show_pricing"),
        ("/chat", "show_chat"),
    ]

    for path, expected_intent in routes:
        status, hdrs, body = fetch(path, {"Accept": "application/irp+json"})
        ct = hdrs.get("Content-Type", hdrs.get("content-type", ""))

        if status != 200:
            fail(f"{path} → HTTP {status}")
            continue

        if "application/irp+json" not in ct:
            fail(f"{path} → Content-Type={ct}", "expected application/irp+json")
            continue

        try:
            data = json.loads(body)
            irp = data.get("irp", data)
            intent = irp.get("intent")
            version = irp.get("version")

            if intent == expected_intent:
                ok(f"{path} → intent={intent}, version={version}")
            else:
                fail(f"{path} → intent={intent}", f"expected {expected_intent}")

            # Vérifier que data est présent
            if not irp.get("data"):
                fail(f"{path} → data manquant")

        except json.JSONDecodeError:
            fail(f"{path} → JSON invalide")


def test_404():
    """Test de la route 404 — doit retourner un intent show_error."""
    section("Route 404")
    status, data = fetch_json("/route-inexistante")
    if status == 404 and data:
        irp = data.get("irp", data)
        if irp.get("intent") == "show_error":
            ok(f"/route-inexistante → 404, intent=show_error")
        else:
            fail(f"/route-inexistante → intent={irp.get('intent')}", "expected show_error")
    else:
        fail(f"/route-inexistante → status={status}")


def test_product_404():
    """Test d'un produit inexistant."""
    section("Produit inexistant")
    status, data = fetch_json("/product/inexistant-xyz")
    if status == 404 and data:
        irp = data.get("irp", data)
        if irp.get("intent") == "show_error":
            ok(f"/product/inexistant-xyz → 404, intent=show_error")
        else:
            fail(f"/product/inexistant-xyz → intent={irp.get('intent')}")
    else:
        fail(f"/product/inexistant-xyz → status={status}")


def test_cors_preflight():
    """Test du preflight CORS."""
    section("CORS Preflight")
    url = f"{BASE_URL}/"
    req = urllib.request.Request(url, method="OPTIONS")
    req.add_header("Origin", "http://localhost:3000")
    req.add_header("Access-Control-Request-Method", "GET")
    req.add_header("Access-Control-Request-Headers", "Content-Type, X-IRP-Context")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            aco = resp.headers.get("Access-Control-Allow-Origin", "")
            acm = resp.headers.get("Access-Control-Allow-Methods", "")
            ach = resp.headers.get("Access-Control-Allow-Headers", "")
            if status == 204 and aco == "*" and "GET" in acm and "Content-Type" in ach:
                ok(f"OPTIONS / → 204, CORS headers OK")
            else:
                fail(f"OPTIONS / → status={status}", f"ACO={aco} ACM={acm} ACH={ach}")
    except Exception as e:
        fail(f"OPTIONS / → exception", str(e))


def test_seo_prerender():
    """Test du prerender SEO pour les bots."""
    section("SEO Prerender (bots)")

    bot_uas = [
        "Googlebot/2.1",
        "Bingbot/2.0",
        "DuckDuckBot/1.1",
    ]

    for ua in bot_uas:
        status, hdrs, body = fetch("/", {"User-Agent": ua})
        ct = hdrs.get("Content-Type", hdrs.get("content-type", ""))
        prerendered = hdrs.get("X-IRP-Prerendered", hdrs.get("x-irp-prerendered", ""))

        if status != 200:
            fail(f"UA={ua} → HTTP {status}")
            continue

        if "text/html" not in ct:
            fail(f"UA={ua} → Content-Type={ct}", "expected text/html")
            continue

        if prerendered != "true":
            fail(f"UA={ua} → X-IRP-Prerendered={prerendered}", "expected true")
            continue

        # Vérifier la présence d'éléments SEO
        checks = [
            ("<!DOCTYPE html>", "DOCTYPE"),
            ("<title>", "title tag"),
            ('name="description"', "meta description"),
            ('property="og:title"', "Open Graph"),
            ('application/ld+json', "JSON-LD structured data"),
        ]
        all_ok = True
        for needle, label in checks:
            if needle not in body:
                fail(f"UA={ua} → missing {label}")
                all_ok = False

        if all_ok:
            ok(f"UA={ua} → HTML prerendered with SEO ({len(body)} bytes)")


def test_seo_normal_client():
    """Test qu'un client normal ne reçoit PAS du HTML (mais du JSON)."""
    section("Client normal (pas de prerender)")
    status, hdrs, body = fetch("/", {"User-Agent": "Mozilla/5.0 (Macintosh)"})
    ct = hdrs.get("Content-Type", hdrs.get("content-type", ""))
    if "application/irp+json" in ct:
        ok(f"UA=Mozilla → Content-Type=application/irp+json (pas de prerender)")
    else:
        fail(f"UA=Mozilla → Content-Type={ct}", "expected application/irp+json")


def test_seo_product():
    """Test du prerender SEO sur une fiche produit."""
    section("SEO Prerender — Produit")
    status, hdrs, body = fetch("/product/macbook-pro-16", {"User-Agent": "Googlebot/2.1"})
    ct = hdrs.get("Content-Type", hdrs.get("content-type", ""))

    if status == 200 and "text/html" in ct:
        has_product_schema = '"@type": "Product"' in body or '"@type":"Product"' in body
        has_price = "price" in body.lower()
        if has_product_schema and has_price:
            ok(f"Googlebot /product/macbook-pro-16 → HTML with Product schema + price")
        else:
            fail(f"Googlebot /product → missing Product schema or price",
                 f"schema={has_product_schema} price={has_price}")
    else:
        fail(f"Googlebot /product → status={status} ct={ct}")


def test_intents_list():
    """Test de la route /__intents."""
    section("Debug: /__intents")
    status, data = fetch_json("/__intents")
    if status == 200 and data and "intents" in data:
        count = len(data["intents"])
        ok(f"/__intents → {count} intents listés")
    else:
        fail(f"/__intents → status={status}")


def test_data_endpoints():
    """Test des endpoints de debug data."""
    section("Debug: /__data/*")
    for path, expected_key in [("/__data/products", None), ("/__data/articles", None)]:
        status, data = fetch_json(path)
        if status == 200 and isinstance(data, list):
            ok(f"{path} → {len(data)} items")
        else:
            fail(f"{path} → status={status}")


def test_proxy_sgp():
    """Test que le proxy SGP répond (même sans clé, doit retourner une réponse)."""
    section("Proxy SGP")
    # Test sans body — doit retourner une erreur 500 (pas de clé) ou 200
    status, hdrs, body = fetch("/__proxy/sgp", method="POST")
    # On accepte 400 (body invalide), 500 (pas de clé) ou 200 (si clé configurée)
    if status in (200, 400, 500):
        ok(f"/__proxy/sgp → status={status} (proxy actif)")
    else:
        fail(f"/__proxy/sgp → status={status}", "expected 200, 400 or 500")


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Tests E2E IRP")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port du serveur IRP")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = f"http://localhost:{args.port}"

    print(f"{Color.BLUE}⚡ IRP — Tests E2E{Color.NC}")
    print(f"   Serveur: {BASE_URL}")
    print(f"   {'═' * 60}")

    # Vérifier que le serveur tourne
    status, _ = fetch_json("/__health")
    if status != 200:
        print(f"\n{Color.RED}❌ Le serveur IRP ne répond pas sur {BASE_URL}{Color.NC}")
        print(f"   Démarrez-le avec: python3 irp-server/server.py --port {args.port}")
        sys.exit(1)

    # Lancer tous les tests
    test_health()
    test_routes_irp()
    test_404()
    test_product_404()
    test_cors_preflight()
    test_seo_prerender()
    test_seo_normal_client()
    test_seo_product()
    test_intents_list()
    test_data_endpoints()
    test_proxy_sgp()

    # Résumé
    total = _passed + _failed
    print(f"\n{Color.BLUE}{'═' * 60}{Color.NC}")
    print(f"  {Color.GREEN}✅ {_passed}{Color.NC} passed, {Color.RED}❌ {_failed}{Color.NC} failed, {total} total")
    print(f"{Color.BLUE}{'═' * 60}{Color.NC}")

    if _failed > 0:
        print(f"\n{Color.RED}Échecs:{Color.NC}")
        for err in _errors:
            print(f"  • {err}")
        sys.exit(1)
    else:
        print(f"\n{Color.GREEN}🎉 Tous les tests passent !{Color.NC}")


if __name__ == "__main__":
    main()
