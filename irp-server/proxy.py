"""
proxy.py — Proxy LLM durci pour IRP
====================================
Relaie les appels du client vers SGP LLMaaS (l'API SGP n'autorise pas CORS depuis un
navigateur). La clé API reste sur le serveur ; le navigateur ne la voit jamais.

Garanties :
  - Authentification : jeton (IRP_PROXY_TOKEN) obligatoire dès que le serveur n'est pas
    en loopback ; en loopback sans jeton, seules les origines autorisées passent.
  - CORS restreint : liste blanche d'origines (jamais "*" sur le proxy).
  - Charge utile réécrite : modèle imposé, champs filtrés, tailles et max_tokens bornés.
  - Limite de débit par client, corps limité, Content-Type JSON exigé (anti-CSRF "simple request").
  - Aucun détail d'erreur amont n'est renvoyé au client (journalisé côté serveur seulement).

Stdlib uniquement.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

DEFAULT_UPSTREAM = "https://llmasservice.sgp.fr/v1/chat/completions"
DEFAULT_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
AUTH_JSON_PATH = os.path.expanduser("~/.local/share/opencode/auth.json")

MODEL = "claude-qwen"
MAX_BODY = 256 * 1024          # octets reçus du client
MAX_MESSAGES = 8
MAX_CHARS = 120_000            # caractères cumulés des messages
MAX_TOKENS_CAP = 8192
MAX_UPSTREAM_RESPONSE = 8 * 1024 * 1024
DEFAULT_RATE_PER_MIN = 30
UPSTREAM_TIMEOUT = 120
ROLES = {"system", "user", "assistant"}


def is_loopback(host: str) -> bool:
    """True si l'hôte d'écoute n'est joignable que depuis cette machine."""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


@dataclass
class ProxyConfig:
    enabled: bool
    reason: str            # pourquoi désactivé (vide si activé)
    key: str               # clé SGP (jamais journalisée ni renvoyée)
    key_source: str        # "env", "opencode auth.json" ou ""
    token: str             # jeton du proxy ("" = pas de jeton)
    origins: tuple         # origines navigateur autorisées
    allow_extensions: bool  # accepter les origines chrome-extension://
    upstream: str
    rate_per_min: int
    loopback: bool


def load_key(loopback: bool, env=os.environ) -> tuple[str, str]:
    """Clé SGP : variable d'environnement, ou (loopback uniquement) config OpenCode locale."""
    key = env.get("SGP_API_KEY", "").strip()
    if key:
        return key, "env"
    if loopback:
        try:
            with open(AUTH_JSON_PATH, encoding="utf-8") as f:
                key = (json.load(f).get("sgp", {}) or {}).get("key", "").strip()
            if key:
                return key, "opencode auth.json"
        except Exception:
            pass
    return "", ""


def build_config(host: str, extra_origins=(), env=os.environ, enabled_flag: bool = True) -> ProxyConfig:
    loopback = is_loopback(host)
    token = env.get("IRP_PROXY_TOKEN", "").strip()
    origins = list(DEFAULT_ORIGINS)
    origins += [o.strip().rstrip("/") for o in env.get("IRP_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    origins += [o.strip().rstrip("/") for o in extra_origins if o.strip()]
    key, source = load_key(loopback, env)
    try:
        rate = int(env.get("IRP_PROXY_RATE", DEFAULT_RATE_PER_MIN))
    except ValueError:
        rate = DEFAULT_RATE_PER_MIN

    reason = ""
    if not enabled_flag:
        reason = "désactivé (--no-proxy)"
    elif token and len(token) < 16:
        reason = "IRP_PROXY_TOKEN trop court (16 caractères minimum)"
    elif not key:
        reason = "aucune clé SGP (définir SGP_API_KEY)"
    elif not loopback and not token:
        reason = "hôte non-loopback : IRP_PROXY_TOKEN est obligatoire"
    return ProxyConfig(
        enabled=not reason, reason=reason, key=key, key_source=source, token=token,
        origins=tuple(dict.fromkeys(origins)), allow_extensions=True,
        upstream=env.get("IRP_SGP_URL", DEFAULT_UPSTREAM), rate_per_min=max(1, rate), loopback=loopback,
    )


class RateLimiter:
    """Fenêtre glissante d'une minute, par clé (adresse IP du client)."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if now - t < 60.0]
            if len(hits) >= self.per_minute:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            return True


def origin_allowed(origin: str | None, cfg: ProxyConfig) -> bool:
    if not origin:
        return False
    if origin in cfg.origins:
        return True
    return cfg.allow_extensions and origin.startswith("chrome-extension://")


def _token_from_headers(headers) -> str:
    auth = headers.get("Authorization", "") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (headers.get("X-IRP-Token", "") or "").strip()


def authorize(headers, cfg: ProxyConfig) -> tuple[bool, int, str]:
    """(autorisé, statut HTTP, code d'erreur)."""
    if cfg.token:
        supplied = _token_from_headers(headers)
        if supplied and hmac.compare_digest(supplied.encode(), cfg.token.encode()):
            return True, 200, ""
        return False, 401, "unauthorized"
    # Sans jeton (loopback uniquement) : une origine navigateur doit être autorisée.
    # Pas d'en-tête Origin = client non-navigateur local (curl, tests) : accepté.
    origin = headers.get("Origin")
    if origin is not None and not origin_allowed(origin, cfg):
        return False, 403, "origin_not_allowed"
    return True, 200, ""


def validate_payload(raw: bytes) -> tuple[dict | None, str]:
    """Réécrit la charge utile : on ne transmet que ce que le proxy a validé."""
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None, "invalid_json"
    if not isinstance(obj, dict):
        return None, "invalid_payload"
    msgs = obj.get("messages")
    if not isinstance(msgs, list) or not 1 <= len(msgs) <= MAX_MESSAGES:
        return None, "invalid_messages"
    clean, total = [], 0
    for m in msgs:
        if not isinstance(m, dict) or m.get("role") not in ROLES or not isinstance(m.get("content"), str):
            return None, "invalid_messages"
        total += len(m["content"])
        if total > MAX_CHARS:
            return None, "messages_too_large"
        clean.append({"role": m["role"], "content": m["content"]})

    def num(v, lo, hi, default):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return default
        return max(lo, min(hi, v))

    return {
        "model": MODEL,  # imposé : le client ne choisit pas le modèle (ni le coût)
        "messages": clean,
        "temperature": num(obj.get("temperature"), 0.0, 1.5, 0.7),
        "max_tokens": int(num(obj.get("max_tokens"), 1, MAX_TOKENS_CAP, 4096)),
        "stream": bool(obj.get("stream")),
    }, ""


def forward(cfg: ProxyConfig, payload: dict) -> tuple[int, dict, bytes]:
    """Appelle l'API amont. Retourne (statut, en-têtes, corps) ; jamais de détail amont côté client."""
    req = urllib.request.Request(
        cfg.upstream,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
            body = resp.read(MAX_UPSTREAM_RESPONSE + 1)
            if len(body) > MAX_UPSTREAM_RESPONSE:
                return 502, {}, b'{"error":"upstream_response_too_large"}'
            ctype = resp.headers.get("Content-Type") or "application/json"
            return 200, {"Content-Type": ctype}, body
    except urllib.error.HTTPError as e:
        detail = e.read(300).decode("utf-8", errors="replace")
        print(f"[PROXY] amont HTTP {e.code}: {detail}", file=sys.stderr)
        return 502, {}, json.dumps({"error": "upstream_error", "status": e.code}).encode()
    except Exception as e:  # réseau, timeout, TLS…
        print(f"[PROXY] erreur amont: {type(e).__name__}: {e}", file=sys.stderr)
        return 502, {}, b'{"error":"upstream_unreachable"}'
