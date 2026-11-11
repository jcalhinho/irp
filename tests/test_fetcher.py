#!/usr/bin/env python3
"""Tests anti-SSRF du téléchargeur de pages (irp-server/fetcher.py) et de l'endpoint /__fetch."""

import importlib.util
import json
import os
import socket
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT, "irp-server")
sys.path.insert(0, SERVER_DIR)
import fetcher  # noqa: E402

_spec = importlib.util.spec_from_file_location("irp_server_fetch", os.path.join(SERVER_DIR, "server.py"))
srv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(srv)

HTML = "<!doctype html><html lang='fr'><head><title>t</title></head><body><main><h1>Bonjour</h1><p>25 € le 15 mars.</p></main></body></html>"


class Target(BaseHTTPRequestHandler):
    seen: list = []
    mode = "ok"

    def do_GET(self):
        Target.seen.append(dict(self.headers))
        m, p = Target.mode, self.path
        if p == "/redir-private":
            self.send_response(302); self.send_header("Location", "http://evil.test/secret"); self.end_headers(); return
        if p == "/loop":
            self.send_response(302); self.send_header("Location", "/loop"); self.end_headers(); return
        if p == "/json":
            body = b'{"a":1}'; self.send_response(200); self.send_header("Content-Type", "application/json")
        elif p == "/latin1":
            body = "<p>caf\xe9 12 €</p>".encode("latin-1", "replace"); self.send_response(200); self.send_header("Content-Type", "text/html; charset=iso-8859-1")
        elif p == "/big":
            body = b"<p>" + b"a" * 5000 + b"</p>"; self.send_response(200); self.send_header("Content-Type", "text/html")
        elif p == "/403":
            body = b"blocked"; self.send_response(403); self.send_header("Content-Type", "text/html")
        elif p == "/404":
            body = b"nope"; self.send_response(404); self.send_header("Content-Type", "text/html")
        elif p == "/slow":
            time.sleep(2); body = HTML.encode(); self.send_response(200); self.send_header("Content-Type", "text/html")
        else:
            body = HTML.encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def start(handler):
    s = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


class TestValidation(unittest.TestCase):
    def bad(self, url, code=None):
        with self.assertRaises(fetcher.FetchError) as cm:
            fetcher.validate_url(url)
        if code:
            self.assertEqual(cm.exception.code, code, url)

    def test_scheme_whitelist(self):
        for u in ["file:///etc/passwd", "ftp://a.fr/x", "javascript:alert(1)", "gopher://a.fr", "data:text/html,x", "//a.fr/x", "a.fr/x"]:
            self.bad(u, "bad_scheme")

    def test_credentials_ports_and_junk(self):
        self.bad("http://user:pw@a.fr/", "bad_url")
        self.bad("http://a.fr@evil.fr/", "bad_url")
        self.bad("http://a.fr:8080/", "bad_port")
        self.bad("https://a.fr:80/", "bad_port")
        self.bad("http://a.fr:22/", "bad_port")
        self.bad("http://a.fr:notaport/", "bad_url")
        self.bad("http://a.fr/\r\nHost: evil", "bad_url")
        self.bad("http://a.fr/ x", "bad_url")
        self.bad("", "bad_url")
        self.bad("http://" + "a" * 3000, "bad_url")
        self.bad(None, "bad_url")

    def test_valid(self):
        self.assertEqual(fetcher.validate_url("https://Exemple.fr/a?b=1"), ("https", "exemple.fr", 443, "/a?b=1"))
        self.assertEqual(fetcher.validate_url("http://exemple.fr")[2:], (80, "/"))


class TestPublicIP(unittest.TestCase):
    def test_blocked(self):
        for ip in ["127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1",
                   "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
                   "2002:7f00:0001::1", "192.0.2.1", "198.51.100.7", "not-an-ip"]:
            self.assertFalse(fetcher.is_public_ip(ip), ip)

    def test_allowed(self):
        for ip in ["93.184.216.34", "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]:
            self.assertTrue(fetcher.is_public_ip(ip), ip)

    def test_any_private_address_blocks_the_host(self):
        res = lambda host, port, **k: [(2, 1, 6, "", ("93.184.216.34", port)), (2, 1, 6, "", ("10.0.0.5", port))]
        with self.assertRaises(fetcher.FetchError) as cm:
            fetcher.resolve_public("mixte.test", 80, res)
        self.assertEqual(cm.exception.code, "forbidden_host")

    def test_dns_failure(self):
        def boom(*a, **k):
            raise socket.gaierror("x")
        with self.assertRaises(fetcher.FetchError) as cm:
            fetcher.resolve_public("nx.test", 80, boom)
        self.assertEqual(cm.exception.code, "dns")

    def test_direct_internal_targets_refused_end_to_end(self):
        for u in ["http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.1.2.3/",
                  "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "https://metadata.google.internal/"]:
            with self.assertRaises(fetcher.FetchError, msg=u) as cm:
                fetcher.fetch_page(u)
            self.assertIn(cm.exception.code, ("forbidden_host", "dns"), u)


class TestFetch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t, cls.port = start(Target)
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.t.shutdown()

    def setUp(self):
        Target.seen.clear()

    def fetch(self, path, **kw):
        return fetcher.fetch_page(self.base + path, allow_private=True, _plain_ports=True, **kw)

    def test_success_and_request_headers(self):
        p = self.fetch("/")
        self.assertEqual((p.status, p.truncated), (200, False))
        self.assertIn("25 €", p.html)
        h = Target.seen[0]
        self.assertTrue(h["User-Agent"].startswith("IRP-Reader/"))
        self.assertEqual(h["Accept-Encoding"], "identity")
        self.assertNotIn("Cookie", h)
        self.assertNotIn("Authorization", h)

    def test_non_html_refused(self):
        with self.assertRaises(fetcher.FetchError) as cm:
            self.fetch("/json")
        self.assertEqual(cm.exception.code, "not_html")

    def test_http_error_status(self):
        with self.assertRaises(fetcher.FetchError) as cm:
            self.fetch("/404")
        self.assertEqual(cm.exception.code, "upstream_status")

    def test_bot_protection_gives_actionable_message(self):
        with self.assertRaises(fetcher.FetchError) as cm:
            self.fetch("/403")
        self.assertEqual(cm.exception.code, "blocked")
        self.assertIn("extension", cm.exception.message)

    def test_size_cap_truncates(self):
        p = self.fetch("/big", max_bytes=2000)
        self.assertTrue(p.truncated)
        self.assertEqual(p.bytes, 2000)

    def test_charset_decoding(self):
        self.assertIn("café", self.fetch("/latin1").html)

    def test_redirect_loop_stopped(self):
        with self.assertRaises(fetcher.FetchError) as cm:
            self.fetch("/loop")
        self.assertEqual(cm.exception.code, "redirect")

    def test_redirect_to_internal_address_is_blocked_at_the_hop(self):
        real = fetcher.is_public_ip
        res = lambda host, port, **k: [(2, 1, 6, "", ("127.0.0.1" if host == "good.test" else "169.254.169.254", port))]
        with mock.patch.object(fetcher, "is_public_ip", lambda ip: ip == "127.0.0.1" or real(ip)):
            with self.assertRaises(fetcher.FetchError) as cm:
                fetcher.fetch_page(f"http://good.test:{self.port}/redir-private", resolver=res, _plain_ports=True)
        self.assertEqual(cm.exception.code, "forbidden_host")
        self.assertEqual(len(Target.seen), 1, "le saut vers l'adresse interne ne doit jamais être contacté")

    def test_connection_pinned_to_validated_ip_not_re_resolved(self):
        calls = []

        def res(host, port, **k):
            calls.append(host)
            return [(2, 1, 6, "", ("127.0.0.1", port))]
        with mock.patch.object(fetcher, "is_public_ip", lambda ip: ip == "127.0.0.1"):
            p = fetcher.fetch_page(f"http://rebind.test:{self.port}/", resolver=res, _plain_ports=True)
        self.assertEqual(p.status, 200)
        self.assertEqual(calls, ["rebind.test"], "une seule résolution DNS par saut")
        self.assertEqual(Target.seen[0]["Host"], f"rebind.test:{self.port}")

    def test_deadline(self):
        with mock.patch.object(fetcher, "TIMEOUT", 0.5):
            with self.assertRaises(fetcher.FetchError) as cm:
                self.fetch("/slow")
        self.assertEqual(cm.exception.code, "timeout")


class TestEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.web, cls.port = start(srv.IRPHandler)
        cls.t, cls.tport = start(Target)

    @classmethod
    def tearDownClass(cls):
        cls.web.shutdown(); cls.t.shutdown()

    def setUp(self):
        srv.configure_fetch(True, 100)

    def get(self, path, headers=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_refuses_internal_urls_with_user_message(self):
        s, h, b = self.get("/__fetch?url=" + urllib.request.quote("http://169.254.169.254/latest/meta-data/"))
        self.assertEqual(s, 403)
        self.assertEqual(json.loads(b)["error"], "forbidden_host")
        self.assertEqual(h["Cache-Control"], "no-store")

    def test_refuses_the_server_itself(self):
        s, _, b = self.get("/__fetch?url=" + urllib.request.quote(f"http://127.0.0.1:{self.port}/__health"))
        self.assertIn(s, (400, 403))

    def test_missing_param_and_bad_scheme(self):
        self.assertEqual(self.get("/__fetch")[0], 400)
        self.assertEqual(self.get("/__fetch?url=file:///etc/passwd")[0], 400)

    def test_disabled_by_default_flag(self):
        srv.configure_fetch(False)
        s, _, b = self.get("/__fetch?url=https://exemple.fr/")
        self.assertEqual((s, json.loads(b)["error"]), (503, "fetch_disabled"))

    def test_cross_site_requests_refused(self):
        s, _, _ = self.get("/__fetch?url=https://exemple.fr/", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(s, 403)

    def test_rate_limit(self):
        srv.configure_fetch(True, 3)
        codes = [self.get("/__fetch?url=http://127.0.0.1/")[0] for _ in range(5)]
        self.assertEqual(codes.count(429), 2, codes)

    def test_success_path_returns_html_as_json_text(self):
        real = fetcher.fetch_page
        with mock.patch.object(srv._fetcher, "fetch_page", lambda url: real(f"http://127.0.0.1:{self.tport}/", allow_private=True, _plain_ports=True)):
            s, h, b = self.get("/__fetch?url=https://exemple.fr/")
        d = json.loads(b)
        self.assertEqual(s, 200)
        self.assertIn("25 €", d["html"])
        self.assertTrue(h["Content-Type"].startswith("application/json"))
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")

    def test_tool_assets_and_csp(self):
        s, h, b = self.get("/tool")
        self.assertEqual(s, 200)
        csp = h["Content-Security-Policy"]
        self.assertIn("default-src 'none'", csp)
        self.assertNotIn("script-src 'unsafe", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertEqual(self.get("/tool.js")[0], 200)
        self.assertEqual(self.get("/core/index.js")[0], 200)
        self.assertEqual(self.get("/core/../server.py")[0], 404)
        self.assertEqual(self.get("/core/%2e%2e/server.py")[0], 404)
        self.assertEqual(self.get("/core/doc.js/../../irp-server/server.py")[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
