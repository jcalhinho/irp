#!/bin/bash
# Copie le fichier canonique de l'assainisseur vers le client et l'extension.
# (Pas de build dans ce projet : on garde des copies identiques, vérifiées par tests/sanitizer.test.mjs.)
set -e
cd "$(dirname "$0")/.."
SRC=irp-sdk/irp-sanitizer.js
cp "$SRC" irp-client/sanitizer.js
cp "$SRC" irp-extension/irp-sanitizer.js
echo "✅ $SRC → irp-client/sanitizer.js, irp-extension/irp-sanitizer.js"
