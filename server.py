#!/usr/bin/env python3
"""
AI Runtime Web — POC
====================
Serveur web sans build step. Des agents IA génèrent le HTML/CSS/JS à la volée
à chaque requête. Aucun fichier statique, aucune compilation.

Utilise le modèle claude-qwen via SGP LLMaaS par défaut.

Usage:
    python3 server.py [--port 8000] [--host localhost]

    # Surcharge optionnelle via env:
    export SGP_API_KEY="sk-..."        # clé SGP (auto-détectée depuis OpenCode)
    export AI_MODEL="claude-qwen"      # modèle
    export AI_BASE_URL="https://llmasservice.sgp.fr/v1"

Routes:
    GET /                    → page d'accueil générée par l'IA
    GET /page/<sujet>        → page sur un sujet, générée à la volée
    GET /url/<url>           → récupère une page web, l'IA s'en inspire pour en générer une nouvelle
    GET /__cache             → voir le cache (debug)
    POST /__cache/clear      → vider le cache (debug)
"""

import argparse
import json
import os
import sys
import re
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

# ─── Configuration ───────────────────────────────────────────────────────────

# Auto-détection de la clé SGP depuis la config OpenCode
def _detect_sgp_key() -> str:
    """Cherche la clé API SGP dans l'env puis dans ~/.local/share/opencode/auth.json."""
    # 1. Variable d'environnement
    env_key = os.environ.get("SGP_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if env_key:
        return env_key

    # 2. Config OpenCode
    try:
        auth_path = os.path.expanduser("~/.local/share/opencode/auth.json")
        with open(auth_path) as f:
            auth = json.load(f)
            if "sgp" in auth and "key" in auth["sgp"]:
                return auth["sgp"]["key"]
    except Exception:
        pass

    return ""

API_KEY = _detect_sgp_key()
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://llmasservice.sgp.fr/v1")
MODEL = os.environ.get("AI_MODEL", "claude-qwen")

# Cache en mémoire: { chemin → html_généré }
_page_cache: dict[str, str] = {}

SYSTEM_PROMPT = """Tu es un générateur de pages web. Tu reçois une description de page et tu DOIS répondre avec UNIQUEMENT le code HTML complet de la page.

Règles STRICTES:
1. Réponds avec du HTML5 valide, du <style> CSS et du <script> JS inline — TOUT dans un seul fichier HTML.
2. NE mets PAS de markdown (pas de ```html), pas d'explication, pas de texte avant ou après. UNIQUEMENT le HTML.
3. Le HTML commence par <!DOCTYPE html> et finit par </html>.
4. Le design doit être moderne, responsive et soigné. Utilise CSS Grid/Flexbox, des variables CSS, des animations subtiles.
5. Le JS doit être fonctionnel et améliorer l'expérience (interactivité, animations).
6. N'inclus AUCUNE ressource externe (pas de CDN, pas de <link> vers Google Fonts, pas d'images externes). Tout doit être self-contained.
7. Pour les images, utilise des SVG inline ou des placeholders CSS.
8. La page doit être complète et fonctionnelle immédiatement dans un navigateur."""

# ─── Récupération d'URLs ─────────────────────────────────────────────────────

def fetch_url_content(url: str, max_chars: int = 8000) -> str:
    """Récupère le contenu texte d'une URL, nettoyé pour être passé au LLM."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "AI-Runtime-Web/1.0 (POC)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    # Nettoyage basique du HTML pour extraire le texte pertinent
    # Enlève les scripts et styles
    raw = re.sub(r"<script[^>]*>.*?</script>", "", raw, flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(r"<style[^>]*>.*?</style>", "", raw, flags=re.DOTALL | re.IGNORECASE)
    # Enlève les commentaires HTML
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.DOTALL)
    # Enlève les tags mais garde le texte
    text = re.sub(r"<[^>]+>", " ", raw)
    # Nettoie les espaces multiples
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) > max_chars:
        text = text[:max_chars] + "\n... [contenu tronqué]"
    return text


# ─── Agent IA ────────────────────────────────────────────────────────────────

def generate_page(prompt: str) -> str:
    """Appelle le LLM pour générer une page HTML complète à partir du prompt."""

    if not API_KEY:
        return _fallback_page(prompt)

    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 8192,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{AI_BASE_URL}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
            # Nettoyage: si l'IA a quand même mis du markdown, on l'enlève
            if content.startswith("```"):
                lines = content.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                content = "\n".join(lines).strip()
            return content
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:300]
        print(f"[ERREUR API] HTTP {e.code}: {err_body}", file=sys.stderr)
        return _fallback_page(prompt, error=f"API Error {e.code}: {err_body}")
    except Exception as e:
        print(f"[ERREUR] {e}", file=sys.stderr)
        return _fallback_page(prompt, error=str(e))


def _fallback_page(prompt: str, error: str = "") -> str:
    """Page de secours quand pas de clé API ou erreur."""
    error_msg = f"<!-- {error} -->" if error else "<!-- Mode démo: pas de clé API -->"
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Runtime Web — POC</title>
    <style>
        :root {{
            --bg: #0f0f1a;
            --fg: #e0e0e8;
            --accent: #7c3aed;
            --accent-light: #a78bfa;
            --card: #1a1a2e;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, system-ui, sans-serif;
            background: var(--bg);
            color: var(--fg);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .container {{
            max-width: 640px;
            padding: 3rem;
            text-align: center;
        }}
        h1 {{
            font-size: 2.5rem;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, var(--accent), var(--accent-light));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        .badge {{
            display: inline-block;
            padding: 0.3rem 1rem;
            background: var(--card);
            border: 1px solid var(--accent);
            border-radius: 999px;
            font-size: 0.85rem;
            color: var(--accent-light);
            margin-bottom: 2rem;
        }}
        p {{ line-height: 1.7; color: #a0a0b0; margin-bottom: 1rem; }}
        code {{
            background: var(--card);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.9rem;
            color: var(--accent-light);
        }}
        .prompt-box {{
            margin-top: 2rem;
            padding: 1rem;
            background: var(--card);
            border-radius: 8px;
            border-left: 3px solid var(--accent);
            text-align: left;
            word-break: break-word;
        }}
        .links {{
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        }}
        a {{
            color: var(--accent-light);
            text-decoration: none;
            padding: 0.5rem 1.2rem;
            border: 1px solid var(--accent);
            border-radius: 6px;
            transition: all 0.2s;
        }}
        a:hover {{
            background: var(--accent);
            color: white;
        }}
    </style>
</head>
<body>
    <div class="container">
        <span class="badge">⚡ Sans build · IA au runtime</span>
        <h1>AI Runtime Web</h1>
        {error_msg}
        <p>Cette page a été générée <strong>sans build step</strong>.
           Aucun webpack, aucun vite, aucun fichier HTML statique.</p>
        <p>Le serveur a reçu la requête et a demandé à un agent IA de générer
           cette page à la volée.</p>
        <div class="prompt-box">
            <strong>Prompt envoyé à l'IA :</strong><br>
            <code>{prompt}</code>
        </div>
        <div class="links">
            <a href="/">Accueil</a>
            <a href="/page/landing-saas">Landing SaaS</a>
            <a href="/page/portfolio">Portfolio</a>
            <a href="/page/blog-tech">Blog Tech</a>
            <a href="/page/dashboard">Dashboard</a>
        </div>
    </div>
</body>
</html>"""


# ─── Serveur HTTP ────────────────────────────────────────────────────────────

class AIRuntimeHandler(BaseHTTPRequestHandler):
    """Handler qui route chaque requête vers l'agent IA."""

    def do_GET(self):
        path = urlparse(self.path).path

        # Routes de debug
        if path == "/__cache":
            self._json(200, {"pages": list(_page_cache.keys()), "count": len(_page_cache)})
            return

        # Route principale
        if path == "/":
            prompt = (
                "Génère la page d'accueil d'un projet qui s'appelle 'AI Runtime Web'. "
                "Ce projet remplace les build tools traditionnels (webpack, vite, next build) "
                "par des agents IA qui génèrent les pages web à la volée au runtime. "
                "La page doit expliquer le concept, montrer un exemple de code, "
                "et avoir des liens vers /page/landing-saas, /page/portfolio, "
                "/page/blog-tech, /page/dashboard. "
                "Mentionne aussi la route /url/<url> qui permet de s'inspirer d'une page web existante. "
                "Design moderne, dark mode, avec des animations."
            )
            self._serve_ai_page(path, prompt)
            return

        # Route /page/<sujet>
        if path.startswith("/page/"):
            sujet = unquote(path[len("/page/"):])
            if not sujet:
                self._redirect("/")
                return
            prompt = (
                f"Génère une page web complète sur le sujet suivant: '{sujet}'. "
                f"La page doit être moderne, responsive, avec un design soigné. "
                f"Adapte le contenu et le style au sujet. "
                f"Inclus du JavaScript interactif pertinent. "
                f"La page doit être complète et fonctionnelle."
            )
            self._serve_ai_page(path, prompt)
            return

        # Route /url/<url> — récupère une page web et s'en inspire
        if path.startswith("/url/"):
            raw_url = unquote(path[len("/url/"):])
            if not raw_url:
                self._redirect("/")
                return
            # Ajoute https:// si pas de schéma
            if not raw_url.startswith("http://") and not raw_url.startswith("https://"):
                raw_url = "https://" + raw_url

            print(f"[URL FETCH] {raw_url}")
            try:
                content = fetch_url_content(raw_url)
                print(f"[URL FETCH OK] {len(content)} chars récupérés")
            except Exception as e:
                print(f"[URL FETCH ERROR] {e}", file=sys.stderr)
                # En cas d'erreur, on génère quand même une page qui l'explique
                prompt = (
                    f"Génère une page d'erreur stylée qui explique que l'URL '{raw_url}' "
                    f"n'a pas pu être récupérée (erreur: {e}). "
                    f"Propose des liens vers d'autres pages. Design moderne, dark mode."
                )
                self._serve_ai_page(path, prompt)
                return

            prompt = (
                f"Voici le contenu texte d'une page web existante (URL: {raw_url}):\n\n"
                f"---\n{content}\n---\n\n"
                f"Génère une NOUVELLE page web inspirée de ce contenu. "
                f"Ne copie pas le code source — crée une page originale et moderne "
                f"qui couvre le même sujet avec un meilleur design. "
                f"La page doit être en français si le contenu source est en français, "
                f"sinon dans la langue du contenu source. "
                f"Design moderne, responsive, avec du JavaScript interactif. "
                f"Self-contained (pas de ressources externes)."
            )
            self._serve_ai_page(path, prompt)
            return

        # 404 généré par l'IA aussi
        prompt = (
            f"Génère une page 404 créative et originale. "
            f"La page demandée était: '{path}'. "
            f"Fais quelque chose de fun et inattendu, avec des animations. "
            f"Inclus un lien vers / pour revenir à l'accueil."
        )
        self._serve_ai_page(path, prompt)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/__cache/clear":
            _page_cache.clear()
            self._json(200, {"status": "cache cleared", "remaining": len(_page_cache)})
            return
        self._json(404, {"error": "not found"})

    def _serve_ai_page(self, cache_key: str, prompt: str):
        """Sert une page générée par l'IA, avec cache."""
        if cache_key in _page_cache:
            html = _page_cache[cache_key]
            print(f"[CACHE HIT] {cache_key}")
        else:
            print(f"[IA GÉNÉRATION] {cache_key} → prompt: {prompt[:80]}...")
            html = generate_page(prompt)
            _page_cache[cache_key] = html
            print(f"[CACHE STORE] {cache_key} ({len(html)} bytes)")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _json(self, code: int, data: dict):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
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
    parser = argparse.ArgumentParser(description="AI Runtime Web — POC")
    parser.add_argument("--host", default="localhost", help="Host (default: localhost)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    args = parser.parse_args()

    key_source = "env" if os.environ.get("SGP_API_KEY") or os.environ.get("OPENAI_API_KEY") else "OpenCode config"

    if not API_KEY:
        print("⚠️  Aucune clé API trouvée — mode démo (page de fallback)", file=sys.stderr)
        print("   Sources checkées: SGP_API_KEY, OPENAI_API_KEY, ~/.local/share/opencode/auth.json", file=sys.stderr)
        print("", file=sys.stderr)

    server = HTTPServer((args.host, args.port), AIRuntimeHandler)
    print(f"🚀 AI Runtime Web — http://{args.host}:{args.port}")
    print(f"   Modèle: {MODEL}")
    print(f"   API: {AI_BASE_URL}")
    print(f"   Clé: {'✅ ' + key_source if API_KEY else '❌ manquante (mode démo)'}")
    print(f"   Cache: en mémoire (POST /__cache/clear pour vider)")
    print(f"   Routes:")
    print(f"     /                    → accueil")
    print(f"     /page/<sujet>        → page sur un sujet")
    print(f"     /url/<url>           → page inspirée d'une URL existante")
    print(f"     /__cache             → debug cache")
    print()
    print(f"   Exemples:")
    print(f"     http://{args.host}:{args.port}/page/portfolio")
    print(f"     http://{args.host}:{args.port}/url/example.com")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur")
        server.server_close()


if __name__ == "__main__":
    main()
