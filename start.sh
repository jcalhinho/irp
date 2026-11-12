#!/bin/bash
# Un serveur local, aucun port libéré de force, aucune clé nécessaire.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRP_READER_PORT=8001
IRP_READER_OPEN=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|--port-server) IRP_READER_PORT="${2:?Port manquant}"; shift 2 ;;
    --no-open) IRP_READER_OPEN=0; shift ;;
    *) echo "Usage: $0 [--port 8001] [--no-open]"; exit 1 ;;
  esac
done
if ! [[ "$IRP_READER_PORT" =~ ^[0-9]+$ ]] || (( IRP_READER_PORT < 1 || IRP_READER_PORT > 65535 )); then
  echo "Port invalide : $IRP_READER_PORT" >&2; exit 1
fi
command -v python3 >/dev/null || { echo "Python 3 est nécessaire." >&2; exit 1; }
# Vérifier le port avant d'ouvrir le navigateur ; ne jamais arrêter un autre service.
python3 - "$IRP_READER_PORT" <<'PY'
import socket, sys
try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', int(sys.argv[1])))
except OSError:
    sys.exit('Ce port est occupé. Choisissez-en un autre avec --port. Aucun processus arrêté.')
PY
IRP_READER_URL="http://127.0.0.1:$IRP_READER_PORT/tool"
echo "IRP Lecture : $IRP_READER_URL"
echo "Ctrl+C pour arrêter. Sans compte, sans clé API."
if [[ "$IRP_READER_OPEN" == 1 ]]; then
  (
    for ((i=0; i<30; i++)); do
      if curl -fsS --max-time 1 "$IRP_READER_URL" >/dev/null 2>&1; then
        if command -v open >/dev/null; then open "$IRP_READER_URL";
        elif command -v xdg-open >/dev/null; then xdg-open "$IRP_READER_URL"; fi
        break
      fi
      sleep .2
    done
  ) &
fi
exec python3 "$SCRIPT_DIR/irp-server/server.py" --host 127.0.0.1 --port "$IRP_READER_PORT" --no-proxy
