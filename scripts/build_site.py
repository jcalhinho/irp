#!/usr/bin/env python3
"""Assemble le site STATIQUE (Netlify, Cloudflare Pages, GitHub Pages…) dans dist-site/.
Contient : accueil, /tool (mode collage), /local (démo modèles locaux), widget.js, reader.js, /core/*.js, /privacy, en-têtes de sécurité.
Ne contient pas : la récupération d'URL et la vue agent (serveur Python, voir irp-server/)."""
import os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist-site")
os.makedirs(os.path.join(OUT, "core"), exist_ok=True)

def cp(src, dst):
    shutil.copy(os.path.join(ROOT, src), os.path.join(OUT, dst))

for f in ("tool.js", "tool.css", "local.html", "local.js", "privacy.html", "widget.js"):
    cp("irp-site/" + f, f)
cp("irp-extension/reader.js", "reader.js")
for f in sorted(os.listdir(os.path.join(ROOT, "irp-core"))):
    if f.endswith(".js"):
        cp("irp-core/" + f, "core/" + f)
with open(os.path.join(ROOT, "irp-site/tool.html"), encoding="utf-8") as source:
    reader_html = source.read().replace('<html lang="fr">', '<html lang="fr" data-fetch-mode="unavailable">')
for name in ("index.html", "tool.html"):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as page:
        page.write(reader_html)
os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)
for name in sorted(os.listdir(os.path.join(ROOT, "irp-site", "fonts"))):
    cp("irp-site/fonts/" + name, "fonts/" + name)

CSP_TOOL = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
CSP_LOCAL = ("default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; "
             "font-src 'self'; "
             "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net; "
             "worker-src 'self' blob:; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
open(os.path.join(OUT, "_headers"), "w", encoding="utf-8").write(f"""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/
  Content-Security-Policy: {CSP_TOOL}
  X-Frame-Options: DENY
/index.html
  Content-Security-Policy: {CSP_TOOL}
  X-Frame-Options: DENY
/tool
  Content-Security-Policy: {CSP_TOOL}
  X-Frame-Options: DENY
/tool.html
  Content-Security-Policy: {CSP_TOOL}
  X-Frame-Options: DENY
/local
  Content-Security-Policy: {CSP_LOCAL}
  X-Frame-Options: DENY
/local.html
  Content-Security-Policy: {CSP_LOCAL}
  X-Frame-Options: DENY
/widget.js
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: no-cache
/reader.js
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: no-cache
/core/*
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
  Cache-Control: no-cache
""")
print(OUT, sum(len(f) for _, _, f in os.walk(OUT)), "fichiers")
