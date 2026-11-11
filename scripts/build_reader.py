#!/usr/bin/env python3
"""Assemble l'extension du Chrome Web Store : dist/irp-reader/ (à charger en mode développeur) et dist/irp-reader-<version>.zip."""
import json
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, "irp-reader"), os.path.join(ROOT, "dist", "irp-reader")

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
shutil.copytree(SRC, OUT)
shutil.copy(os.path.join(ROOT, "irp-extension", "reader.js"), os.path.join(OUT, "reader.js"))
os.makedirs(os.path.join(OUT, "core"))
for f in sorted(os.listdir(os.path.join(ROOT, "irp-core"))):
    if f.endswith(".js"):
        shutil.copy(os.path.join(ROOT, "irp-core", f), os.path.join(OUT, "core", f))

version = json.load(open(os.path.join(OUT, "manifest.json")))["version"]
zpath = os.path.join(ROOT, "dist", f"irp-reader-{version}.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(OUT):
        for f in sorted(files):
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, OUT))
print(f"{OUT}\n{zpath} ({os.path.getsize(zpath) // 1024} Ko)")
