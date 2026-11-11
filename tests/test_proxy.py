#!/usr/bin/env python3
"""
Tests du proxy LLM durci (stdlib/unittest)
==========================================
Démarre le VRAI serveur IRP (irp-server/server.py) et un faux « amont » SGP local.
Aucune clé réelle, aucun accès réseau externe.

Usage (depuis la racine du projet) :
    python3 -m unittest discover -s tests -p "test_*.py" -v
"""

import importlib.util
import json
import os
import sys
import tempfile
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
import proxy  # noqa: E402

_spec = importlib.util.spec_from_file_location("irp_server_under_test", os.path.join(SERVER_DIR, "server.py"))
srv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(srv)

KEY = "sk-test-secret-key-0123456789"
TOKEN = "t" * 24
GOOD = "http://localhost:3000"
EVIL = "https://evil.example"
MSG = {"messages": [{"role": "user", "content": "hi"}]}


class Upstream(BaseHTTPRequestHandler):
    """Faux SGP : enregistre ce qu'il reçoit."""
    calls: list = []
    mode = "ok"  # ok | error | slow

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        Upstream.calls.append((dict(self.headers), json.loads(self.rfile.read(n))))
        if Upstream.mode == "slow":
            time.sleep(1.0)
        if Upstream.mode == "error":
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"SECRET-UPSTREAM-DETAIL")
            return
        out = json.dumps({"choices": [{"message": {"content": "<p>ok</p>"}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


def start(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.up, up_port = start(Upstream)
        cls.up_url = f"http://127.0.0.1:{up_port}/v1/chat/completions"
        cls.web, cls.port = start(srv.IRPHandler)

    @classmethod
    def tearDownClass(cls):
        cls.up.shutdown()
        cls.web.shutdown()

    def setUp(self):
        Upstream.calls.clear()
        Upstream.mode = "ok"
        self.configure()

    def configure(self, token="", rate=1000):
        env = {"SGP_API_KEY": KEY, "IRP_SGP_URL": self.up_url, "IRP_PROXY_RATE": str(rate)}
        if token:
            env["IRP_PROXY_TOKEN"] = token
        srv.configure_proxy(proxy.build_config("127.0.0.1", env=env))

    def request(self, method, path, data=None, headers=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def post(self, body=None, headers=None, raw=None):
        data = raw if raw is not None else json.dumps(body if body is not None else MSG).encode()
        h = {"Content-Type": "application/json"}
        h.update(headers or {})
        return self.request("POST", "/__proxy/sgp", data, h)


class TestForwarding(Base):
    def test_payload_is_rewritten_before_forwarding(self):
        s, _, _ = self.post({
            "model": "gpt-evil", "max_tokens": 999999, "temperature": 99, "tools": [{"x": 1}], "user": "u1",
            "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u", "name": "x"}],
        }, headers={"Authorization": "Bearer attacker"})
        self.assertEqual(s, 200)
        (hdrs, body), = Upstream.calls
        self.assertEqual(hdrs["Authorization"], f"Bearer {KEY}", "l'amont doit recevoir la clé serveur, pas celle du client")
        self.assertEqual(body["model"], "claude-qwen")
        self.assertEqual(body["max_tokens"], proxy.MAX_TOKENS_CAP)
        self.assertEqual(body["temperature"], 1.5)
        self.assertEqual(set(body), {"model", "messages", "temperature", "max_tokens", "stream"})
        self.assertTrue(all(set(m) == {"role", "content"} for m in body["messages"]))

    def test_key_is_never_returned_to_client(self):
        s, h, b = self.post()
        self.assertEqual(s, 200)
        self.assertNotIn(KEY, b.decode() + str(h))

    def test_upstream_error_is_opaque(self):
        Upstream.mode = "error"
        s, _, b = self.post()
        self.assertEqual(s, 502)
        self.assertNotIn(b"SECRET-UPSTREAM-DETAIL", b)
        self.assertEqual(json.loads(b)["error"], "upstream_error")

    def test_server_is_threaded_slow_proxy_call_does_not_block_others(self):
        Upstream.mode = "slow"
        t = threading.Thread(target=self.post)
        t.start()
        time.sleep(0.25)
        t0 = time.monotonic()
        s, _, _ = self.request("GET", "/__health")
        elapsed = time.monotonic() - t0
        t.join()
        self.assertEqual(s, 200)
        self.assertLess(elapsed, 0.6, f"/__health a attendu {elapsed:.2f}s : le serveur n'est pas multithread")


class TestOriginAndCsrf(Base):
    def test_hostile_origin_is_blocked_and_upstream_untouched(self):
        s, h, _ = self.post(headers={"Origin": EVIL})
        self.assertEqual(s, 403)
        self.assertIsNone(h.get("Access-Control-Allow-Origin"))
        self.assertEqual(Upstream.calls, [])

    def test_allowed_origin_gets_exact_origin_not_wildcard(self):
        s, h, _ = self.post(headers={"Origin": GOOD})
        self.assertEqual(s, 200)
        self.assertEqual(h.get("Access-Control-Allow-Origin"), GOOD)

    def test_extension_origin_and_origin_less_clients_ok(self):
        self.assertEqual(self.post(headers={"Origin": "chrome-extension://abcdefgh"})[0], 200)
        self.assertEqual(self.post()[0], 200)

    def test_text_plain_simple_request_is_rejected(self):
        self.assertEqual(self.post(headers={"Content-Type": "text/plain", "Origin": GOOD})[0], 415)
        self.assertEqual(self.post(headers={"Content-Type": "text/plain", "Origin": EVIL})[0], 403)
        self.assertEqual(Upstream.calls, [])

    def test_preflight(self):
        s, h, _ = self.request("OPTIONS", "/__proxy/sgp", headers={"Origin": EVIL})
        self.assertEqual(s, 403)
        self.assertIsNone(h.get("Access-Control-Allow-Origin"))
        s, h, _ = self.request("OPTIONS", "/__proxy/sgp", headers={"Origin": GOOD})
        self.assertEqual(s, 204)
        self.assertEqual(h.get("Access-Control-Allow-Origin"), GOOD)
        self.assertIn("POST", h.get("Access-Control-Allow-Methods"))
        # routes IRP publiques (lecture seule) : CORS ouvert, pas de POST
        s, h, _ = self.request("OPTIONS", "/", headers={"Origin": EVIL})
        self.assertEqual((s, h.get("Access-Control-Allow-Origin")), (204, "*"))
        self.assertNotIn("POST", h.get("Access-Control-Allow-Methods"))


class TestLimits(Base):
    def test_body_too_large(self):
        raw = json.dumps({"messages": [{"role": "user", "content": "a" * (proxy.MAX_BODY + 10)}]}).encode()
        self.assertEqual(self.post(raw=raw)[0], 413)

    def test_invalid_inputs(self):
        self.assertEqual(json.loads(self.post(raw=b"{pas du json")[2])["error"], "invalid_json")
        self.assertEqual(self.post({"messages": [{"role": "tool", "content": "x"}]})[0], 400)
        self.assertEqual(self.post({"messages": []})[0], 400)
        self.assertEqual(self.post({"messages": [{"role": "user", "content": 42}]})[0], 400)
        self.assertEqual(self.post({"messages": [{"role": "user", "content": "x"}] * (proxy.MAX_MESSAGES + 1)})[0], 400)
        self.assertEqual(self.post(raw=b"[1,2,3]")[0], 400)
        self.assertEqual(self.request("POST", "/__proxy/sgp", b"", {"Content-Type": "application/json"})[0], 400)
        self.assertEqual(Upstream.calls, [])

    def test_messages_total_size_cap(self):
        big = "a" * 70_000
        s, _, b = self.post({"messages": [{"role": "user", "content": big}, {"role": "user", "content": big}]})
        self.assertEqual((s, json.loads(b)["error"]), (400, "messages_too_large"))

    def test_rate_limit(self):
        self.configure(rate=3)
        self.assertEqual([self.post()[0] for _ in range(3)], [200, 200, 200])
        s, h, _ = self.post()
        self.assertEqual(s, 429)
        self.assertEqual(h.get("Retry-After"), "60")

    def test_proxy_disabled_without_key(self):
        with mock.patch.object(proxy, "AUTH_JSON_PATH", "/nonexistent/auth.json"):
            srv.configure_proxy(proxy.build_config("127.0.0.1", env={"IRP_SGP_URL": self.up_url}))
        self.assertEqual(json.loads(self.post()[2])["error"], "proxy_disabled")


class TestToken(Base):
    def test_token_required_and_accepted_via_both_headers(self):
        self.configure(token=TOKEN)
        self.assertEqual(self.post()[0], 401)
        self.assertEqual(self.post(headers={"X-IRP-Token": "faux" * 6})[0], 401)
        self.assertEqual(self.post(headers={"X-IRP-Token": TOKEN})[0], 200)
        self.assertEqual(self.post(headers={"Authorization": f"Bearer {TOKEN}"})[0], 200)

    def test_valid_token_from_unlisted_origin_works_but_browser_cannot_read_it(self):
        self.configure(token=TOKEN)
        s, h, _ = self.post(headers={"X-IRP-Token": TOKEN, "Origin": EVIL})
        self.assertEqual(s, 200)
        self.assertIsNone(h.get("Access-Control-Allow-Origin"))


class TestCatalog(Base):
    def test_intents_and_health_list_all_nine(self):
        names = {i["name"] for i in json.loads(self.request("GET", "/__intents")[2])["intents"]}
        self.assertEqual(len(names), 9)
        self.assertEqual(set(json.loads(self.request("GET", "/__health")[2])["intents"]), names)


class TestConfig(unittest.TestCase):
    def test_loopback_detection(self):
        for h in ("localhost", "127.0.0.1", "::1", "[::1]"):
            self.assertTrue(proxy.is_loopback(h), h)
        for h in ("0.0.0.0", "192.168.1.5", "example.com", "::"):
            self.assertFalse(proxy.is_loopback(h), h)

    def test_non_loopback_requires_token(self):
        env = {"SGP_API_KEY": KEY}
        self.assertFalse(proxy.build_config("0.0.0.0", env=env).enabled)
        self.assertIn("IRP_PROXY_TOKEN", proxy.build_config("0.0.0.0", env=env).reason)
        self.assertTrue(proxy.build_config("0.0.0.0", env={**env, "IRP_PROXY_TOKEN": TOKEN}).enabled)
        self.assertFalse(proxy.build_config("127.0.0.1", env={**env, "IRP_PROXY_TOKEN": "court"}).enabled)

    def test_opencode_auth_json_only_used_on_loopback(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "auth.json")
            with open(path, "w") as f:
                json.dump({"sgp": {"key": "sk-from-file-123456"}}, f)
            with mock.patch.object(proxy, "AUTH_JSON_PATH", path):
                local = proxy.build_config("127.0.0.1", env={})
                self.assertEqual((local.enabled, local.key_source), (True, "opencode auth.json"))
                exposed = proxy.build_config("0.0.0.0", env={"IRP_PROXY_TOKEN": TOKEN})
                self.assertEqual((exposed.enabled, exposed.key), (False, ""))

    def test_rate_limiter_window(self):
        rl = proxy.RateLimiter(2)
        self.assertEqual([rl.allow("a", 0.0), rl.allow("a", 1.0), rl.allow("a", 2.0)], [True, True, False])
        self.assertTrue(rl.allow("b", 2.0))
        self.assertTrue(rl.allow("a", 61.5))  # la fenêtre d'une minute a glissé

    def test_validate_payload_ignores_non_numeric_and_bool(self):
        p, _ = proxy.validate_payload(json.dumps({**MSG, "temperature": True, "max_tokens": "9999"}).encode())
        self.assertEqual((p["temperature"], p["max_tokens"]), (0.7, 4096))


if __name__ == "__main__":
    unittest.main(verbosity=2)
