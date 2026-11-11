#!/usr/bin/env python3
"""Vue agent du serveur : /llms.txt, /.well-known/irp.json, .md, .irpdoc.json, négociation Accept."""

import importlib.util
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(ROOT, "irp-server")
sys.path.insert(0, SERVER_DIR)
import irpdoc  # noqa: E402

_spec = importlib.util.spec_from_file_location("irp_server_agent", os.path.join(SERVER_DIR, "server.py"))
srv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(srv)


class TestAgentView(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.web = ThreadingHTTPServer(("127.0.0.1", 0), srv.IRPHandler)
        threading.Thread(target=cls.web.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.web.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.web.shutdown()

    def get(self, path, headers=None):
        req = urllib.request.Request(self.base + path, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, r.headers, r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode("utf-8")

    def test_markdown_suffix_and_accept(self):
        s, h, b = self.get("/product/macbook-pro-16.md")
        self.assertEqual(s, 200)
        self.assertTrue(h["Content-Type"].startswith("text/markdown"))
        self.assertIn("2 799 €", b)
        s2, _, b2 = self.get("/product/macbook-pro-16", {"Accept": "text/markdown"})
        self.assertEqual((s2, b2), (200, b))

    def test_irpdoc_suffix_and_accept(self):
        s, h, b = self.get("/pricing.irpdoc.json")
        self.assertEqual(s, 200)
        self.assertTrue(h["Content-Type"].startswith("application/irp-doc+json"))
        doc = json.loads(b)
        self.assertEqual(doc["irp_doc"], "1.0")
        self.assertIn("Gratuit", doc["must_show"])
        s2, _, b2 = self.get("/pricing", {"Accept": "application/irp-doc+json"})
        self.assertEqual(json.loads(b2), doc)

    def test_default_behaviour_unchanged(self):
        s, h, _ = self.get("/pricing", {"User-Agent": "Mozilla/5.0"})
        self.assertEqual((s, h["Content-Type"].split(";")[0]), (200, "application/irp+json"))

    def test_root_alias_and_404_status(self):
        self.assertEqual(self.get("/index.md")[0], 200)
        s, _, b = self.get("/inexistant.md")
        self.assertEqual(s, 404)
        self.assertIn("introuvable", b)

    def test_debug_routes_not_exposed_as_agent_docs(self):
        s, h, _ = self.get("/__health.md")
        self.assertNotIn("markdown", h.get("Content-Type", ""))

    def test_llms_txt_lists_pages_that_exist(self):
        s, h, b = self.get("/llms.txt")
        self.assertEqual(s, 200)
        self.assertTrue(b.startswith("# IRP"))
        links = [l.split("](")[1].split(")")[0] for l in b.splitlines() if l.startswith("- [")]
        self.assertGreaterEqual(len(links), 5)
        for href in links:
            self.assertEqual(self.get(href)[0], 200, href)

    def test_manifest(self):
        s, _, b = self.get("/.well-known/irp.json", {"Host": "exemple.test"})
        m = json.loads(b)
        self.assertEqual(m["irp_manifest"], "1.0")
        self.assertIn("application/irp-doc+json", m["formats"].values())
        self.assertTrue(all(p["markdown"].startswith("http://exemple.test/") for p in m["pages"]))

    def test_headers_safe(self):
        _, h, _ = self.get("/pricing.md")
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertEqual(h["Access-Control-Allow-Origin"], "*")
        self.assertIsNone(h.get("Set-Cookie"))
        self.assertIn("Accept", h["Vary"])

    def test_markdown_unit(self):
        doc = {"irp_doc": "1.0", "title": "T", "blocks": [
            {"type": "table", "headers": ["a|b"], "rows": [[["x", {"t": "a", "href": "/y", "text": "lien"}]]]},
            {"type": "callout", "kind": "danger", "title": "Stop", "text": "non"}]}
        md = irpdoc.to_markdown(doc)
        self.assertIn("| a\\|b |", md)  # le « | » d'un en-tête est échappé
        self.assertIn("[lien](/y)", md)
        self.assertIn("**DANGER** Stop : non", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
