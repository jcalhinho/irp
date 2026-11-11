#!/bin/bash
# start.sh — Démarre le serveur IRP + le client IRP + ouvre le navigateur
# Usage: ./start.sh [--port-server 8001] [--port-client 3000]

set -e

# ─── Config ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT_SERVER=8001
PORT_CLIENT=3000

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --port-server) PORT_SERVER="$2"; shift 2 ;;
    --port-client) PORT_CLIENT="$2"; shift 2 ;;
    *) echo "Usage: $0 [--port-server 8001] [--port-client 3000]"; exit 1 ;;
  esac
done

# ─── Couleurs ────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}⚡ IRP — Intent Rendering Protocol${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ─── Vérifier Python ─────────────────────────────────────────────────────────

if ! command -v python3 &> /dev/null; then
  echo -e "${RED}❌ Python 3 n'est pas installé. Installez-le avec: brew install python3${NC}"
  exit 1
fi

PY_VERSION=$(python3 --version 2>&1)
echo -e "${GREEN}✅${NC} Python: $PY_VERSION"

# ─── Tuer les anciens processus sur les ports ────────────────────────────────

kill_port() {
  local port=$1
  local pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}⚠️${NC} Port $port occupé (PID $pid) — arrêt..."
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
}

kill_port $PORT_SERVER
kill_port $PORT_CLIENT

# ─── Démarrer le serveur IRP ─────────────────────────────────────────────────

echo -e "${GREEN}▶${NC} Démarrage du serveur IRP sur le port $PORT_SERVER..."
cd "$SCRIPT_DIR/irp-server"
# Le proxy SGP n'accepte que les origines du client lancé ci-dessous
export IRP_ALLOWED_ORIGINS="http://localhost:$PORT_CLIENT,http://127.0.0.1:$PORT_CLIENT"
nohup python3 server.py --port $PORT_SERVER > /tmp/irp-server.log 2>&1 &
SERVER_PID=$!
echo -e "  PID: $SERVER_PID"

# Attendre que le serveur réponde
for i in $(seq 1 10); do
  if curl -s --max-time 2 "http://localhost:$PORT_SERVER/__health" | grep -q '"ok"' 2>/dev/null; then
    echo -e "${GREEN}✅${NC} Serveur IRP prêt: http://localhost:$PORT_SERVER"
    break
  fi
  sleep 1
  if [ $i -eq 10 ]; then
    echo -e "${RED}❌ Le serveur IRP n'a pas démarré. Vérifiez /tmp/irp-server.log${NC}"
    exit 1
  fi
done

# ─── Démarrer le client IRP ──────────────────────────────────────────────────

echo -e "${GREEN}▶${NC} Démarrage du client IRP sur le port $PORT_CLIENT..."
cd "$SCRIPT_DIR/irp-client"
nohup python3 -m http.server $PORT_CLIENT --directory . > /tmp/irp-client.log 2>&1 &
CLIENT_PID=$!
echo -e "  PID: $CLIENT_PID"

# Attendre que le client réponde
for i in $(seq 1 5); do
  if curl -s --max-time 2 "http://localhost:$PORT_CLIENT/index.html" | grep -q '<html' 2>/dev/null; then
    echo -e "${GREEN}✅${NC} Client IRP prêt: http://localhost:$PORT_CLIENT"
    break
  fi
  sleep 1
done

# ─── Afficher les routes disponibles ─────────────────────────────────────────

echo ""
echo -e "${BLUE}📋 Routes disponibles:${NC}"
echo -e "  ${GREEN}http://localhost:$PORT_CLIENT/index.html${NC}  → Landing (rendu IA)"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/tool${NC}              → ⭐ Outil « colle une URL » (lecture adaptée)"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/${NC}                  → Intent show_landing"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/product/macbook-pro-16${NC}  → show_product"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/article/irp-intro${NC}       → read_article"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/dashboard${NC}               → show_dashboard"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/catalog${NC}                 → show_catalog"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/pricing${NC}                 → show_pricing"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/contact${NC}                 → fill_form"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/tasks${NC}                   → browse_list"
echo -e "  ${GREEN}http://localhost:$PORT_SERVER/chat${NC}                    → show_chat"
echo ""

# ─── Ouvrir le navigateur ────────────────────────────────────────────────────

echo -e "${GREEN}🌐 Ouverture du navigateur...${NC}"
if command -v open &> /dev/null; then
  open "http://localhost:$PORT_SERVER/tool"
elif command -v xdg-open &> /dev/null; then
  xdg-open "http://localhost:$PORT_SERVER/tool"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ IRP est en cours d'exécution.${NC}"
echo ""
echo -e "  Client:  ${GREEN}http://localhost:$PORT_CLIENT${NC}"
echo -e "  Serveur: ${GREEN}http://localhost:$PORT_SERVER${NC}"
echo -e "  Logs:    /tmp/irp-server.log, /tmp/irp-client.log"
echo ""
echo -e "  Pour arrêter: ${YELLOW}kill $SERVER_PID $CLIENT_PID${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Garder le script vivant pour que les processus ne soient pas tués
wait
