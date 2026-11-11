"""
Récupération sécurisée d'une page publique (pour l'outil « colle une URL »).
=========================================================================
Un endpoint qui télécharge une URL donnée par un visiteur est le cas d'école du SSRF.
Garde-fous, tous testés (tests/test_fetcher.py) :
  - http/https uniquement, ports 80/443 uniquement, pas d'identifiants dans l'URL ;
  - la résolution DNS est faite UNE fois ; toutes les adresses doivent être publiques
    (ni loopback, ni privées, ni lien-local/métadonnées cloud, ni CGNAT, ni IPv4 mappée en IPv6) ;
  - la connexion est « épinglée » sur l'IP validée (pas de DNS rebinding entre contrôle et connexion) ;
  - redirections suivies à la main (max 3), chaque saut revalidé de la même façon ;
  - pas de cookies, pas d'en-têtes du visiteur, Accept-Encoding: identity (pas de bombe de décompression) ;
  - type de contenu HTML/XHTML uniquement, taille et durée bornées ;
  - le HTML récupéré n'est JAMAIS interprété par le serveur : il est renvoyé comme texte au navigateur.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT = 8.0          # par opération réseau
DEADLINE = 15.0        # durée totale maximale
MAX_REDIRECTS = 3
ALLOWED_PORTS = {80: "http", 443: "https"}
HTML_TYPES = ("text/html", "application/xhtml+xml")
USER_AGENT = "IRP-Reader/1.0 (lecture adaptée; +https://github.com/ajc/irp)"


class FetchError(Exception):
    """Erreur destinée à l'utilisateur : `code` stable, `message` lisible (français)."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass
class Page:
    url: str
    status: int
    html: str
    truncated: bool
    bytes: int


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            addr = addr.ipv4_mapped
        elif addr.sixtofour is not None:
            addr = addr.sixtofour
        elif addr.teredo is not None:
            return False
    return addr.is_global and not addr.is_multicast


def validate_url(url: str):
    """Retourne (scheme, host, port, path_with_query). Lève FetchError."""
    if not isinstance(url, str) or not url.strip() or len(url) > 2048:
        raise FetchError("bad_url", "Adresse invalide.")
    if any(ord(c) < 33 or ord(c) == 127 for c in url.strip()):
        raise FetchError("bad_url", "Adresse invalide.")
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https"):
        raise FetchError("bad_scheme", "Seules les adresses http:// et https:// sont acceptées.")
    if parts.username or parts.password or "@" in (parts.netloc or ""):
        raise FetchError("bad_url", "Les identifiants dans l'adresse ne sont pas acceptés.")
    host = parts.hostname
    if not host:
        raise FetchError("bad_url", "Adresse invalide.")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError:
        raise FetchError("bad_url", "Port invalide.")
    if port not in ALLOWED_PORTS or ALLOWED_PORTS[port] != parts.scheme:
        raise FetchError("bad_port", "Seuls les ports standards 80 (http) et 443 (https) sont acceptés.")
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return parts.scheme, host.rstrip("."), port, path


def resolve_public(host: str, port: int, resolver=socket.getaddrinfo, allow_private: bool = False) -> str:
    """Résout `host` et retourne UNE adresse publique ; refuse si une seule des adresses est non publique."""
    try:
        infos = resolver(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise FetchError("dns", "Ce nom de domaine est introuvable.", 502)
    ips = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    if not ips:
        raise FetchError("dns", "Ce nom de domaine est introuvable.", 502)
    if not allow_private and not all(is_public_ip(ip) for ip in ips):
        raise FetchError("forbidden_host", "Cette adresse pointe vers un réseau non public : refusée.", 403)
    return ips[0]


class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, ip, timeout, context):
        super().__init__(host, port, timeout=timeout, context=context)
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)  # vérifie le certificat pour le NOM demandé


def _decode(raw: bytes, content_type: str) -> str:
    charset = "utf-8"
    for part in content_type.split(";")[1:]:
        k, _, v = part.strip().partition("=")
        if k.lower() == "charset" and v:
            charset = v.strip("\"' ").lower()
    try:
        return raw.decode(charset, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def fetch_page(url: str, *, resolver=socket.getaddrinfo, allow_private: bool = False,
               max_bytes: int = MAX_BYTES, deadline: float = DEADLINE, _plain_ports: bool = False) -> Page:
    """Télécharge une page HTML publique. `allow_private`/`_plain_ports` : réservés aux tests locaux."""
    start = time.monotonic()
    current = url
    context = ssl.create_default_context()
    for hop in range(MAX_REDIRECTS + 1):
        scheme, host, port, path = validate_url(current) if not _plain_ports else _validate_loose(current)
        ip = resolve_public(host, port, resolver, allow_private)
        if time.monotonic() - start > deadline:
            raise FetchError("timeout", "Le site met trop de temps à répondre.", 504)
        conn = (_PinnedHTTPS(host, port, ip, TIMEOUT, context) if scheme == "https" else _PinnedHTTP(host, port, ip, TIMEOUT))
        try:
            conn.request("GET", path, headers={
                "Host": host if port in (80, 443) else f"{host}:{port}", "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml;q=0.9", "Accept-Encoding": "identity",
                "Accept-Language": "fr,en;q=0.5", "Connection": "close"})
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader("Location")
                resp.read(0)
                if not loc:
                    raise FetchError("redirect", "Redirection invalide.", 502)
                current = urljoin(current, loc)
                continue
            ctype = (resp.getheader("Content-Type") or "").split(";")[0].strip().lower()
            if resp.status >= 400:
                raise FetchError("upstream_status", f"Le site a répondu avec l'erreur {resp.status}.", 502)
            if ctype not in HTML_TYPES:
                raise FetchError("not_html", "Cette adresse ne renvoie pas une page web (HTML).", 415)
            declared = resp.getheader("Content-Length")
            if declared and declared.isdigit() and int(declared) > max_bytes * 4:
                raise FetchError("too_large", "Page trop volumineuse.", 413)
            raw = bytearray()
            while len(raw) <= max_bytes:
                if time.monotonic() - start > deadline:
                    raise FetchError("timeout", "Le site met trop de temps à répondre.", 504)
                chunk = resp.read(min(65536, max_bytes + 1 - len(raw)))
                if not chunk:
                    break
                raw += chunk
            truncated = len(raw) > max_bytes
            raw = bytes(raw[:max_bytes])
            return Page(url=current, status=resp.status, html=_decode(raw, resp.getheader("Content-Type") or ""), truncated=truncated, bytes=len(raw))
        except FetchError:
            raise
        except ssl.SSLError:
            raise FetchError("tls", "Le certificat du site n'est pas valide.", 502)
        except (socket.timeout, TimeoutError):
            raise FetchError("timeout", "Le site met trop de temps à répondre.", 504)
        except (OSError, http.client.HTTPException):
            raise FetchError("network", "Impossible de joindre ce site.", 502)
        finally:
            conn.close()
    raise FetchError("redirect", "Trop de redirections.", 502)


def _validate_loose(url: str):
    """Tests locaux uniquement : accepte un port arbitraire (jamais utilisé en production)."""
    p = urlsplit(url)
    path = (p.path or "/") + (("?" + p.query) if p.query else "")
    return p.scheme, p.hostname, p.port or 80, path
