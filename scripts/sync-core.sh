#!/usr/bin/env bash
# Copie irp-core/ (source canonique) vers les clients qui l'embarquent.
set -euo pipefail
cd "$(dirname "$0")/.."
for dest in irp-extension/core irp-client/core; do
  rm -rf "$dest"; mkdir -p "$dest"; cp irp-core/*.js "$dest"/
done
echo "irp-core synchronisé → irp-extension/core, irp-client/core,"
