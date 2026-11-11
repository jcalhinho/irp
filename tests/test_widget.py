"""Le widget et ses dépendances sont servis en lecture seule, intégrables depuis n'importe quelle origine."""
import importlib.util, os, sys, threading, unittest, urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "irp-server"))
spec = importlib.util.spec_from_file_location("irp_server_w", os.path.join(ROOT, "irp-server", "server.py"))
srv = importlib.util.module_from_spec(spec); spec.loader.exec_module(srv)


class WidgetRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.IRPHandler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        return urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=5)

    def test_assets_served_with_open_cors(self):
        for p in ("/widget.js", "/reader.js", "/core/index.js", "/core/render.js"):
            r = self.get(p)
            self.assertEqual(r.status, 200, p)
            self.assertEqual(r.headers["Access-Control-Allow-Origin"], "*", p)
            self.assertIn("javascript", r.headers["Content-Type"])

    def test_no_path_traversal(self):
        for p in ("/core/../server.py", "/core/..%2fserver.py", "/core/INDEX.js"):
            with self.assertRaises(Exception):
                self.get(p)


if __name__ == "__main__":
    unittest.main()
