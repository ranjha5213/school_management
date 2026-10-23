#!/data/data/com.termux/files/usr/bin/bash
# start.sh — launch backend + frontend in tmux, then open in Chrome.
# Usage:
#   ./start.sh          start everything
#   ./start.sh --stop   stop everything
#   ./start.sh --status show sessions + port state

set -u

PROJECT="$HOME/school"
BACKEND="$PROJECT/backend"
FRONTEND="$PROJECT/frontend"
FRONTEND_PORT=5173
BACKEND_PORT=5000
SESSION_BE="school-backend"
SESSION_FE="school-frontend"

# ─── Colours ───
G="\033[0;32m"; R="\033[0;31m"; Y="\033[1;33m"; B="\033[0;34m"; N="\033[0m"

log()  { echo -e "${B}▶${N} $*"; }
ok()   { echo -e "${G}✓${N} $*"; }
warn() { echo -e "${Y}⚠${N} $*"; }
err()  { echo -e "${R}✗${N} $*"; }

# ─── Kill every process listening on a given port ───
kill_port() {
  local port="$1"
  local pids=""

  # Prefer fuser (part of psmisc)
  if command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "$port/tcp" 2>/dev/null | tr -d ' ')
  fi

  # Fallback: lsof
  if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:$port" 2>/dev/null | tr '\n' ' ')
  fi

  # Fallback: parse /proc/net/tcp (Android/Termux has this)
  if [ -z "$pids" ]; then
    local hexport
    hexport=$(printf '%04X' "$port")
    pids=$(awk -v p=":$hexport" '$2 ~ p {print $10}' /proc/net/tcp 2>/dev/null \
           | grep -v '^0$' | sort -u | tr '\n' ' ')
  fi

  if [ -n "$pids" ]; then
    warn "Port $port busy (PIDs: $pids) — killing"
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 1
  fi
}

# ─── Check if a port is free ───
port_free() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    ! fuser "$port/tcp" >/dev/null 2>&1
    return
  fi
  local hexport
  hexport=$(printf '%04X' "$port")
  ! awk -v p=":$hexport" '$2 ~ p {found=1} END {exit !found}' /proc/net/tcp 2>/dev/null
}

# ─── Full cleanup ───
cleanup_all() {
  log "Killing tmux sessions..."
  tmux kill-session -t "$SESSION_BE" 2>/dev/null && ok "Killed $SESSION_BE" || true
  tmux kill-session -t "$SESSION_FE" 2>/dev/null && ok "Killed $SESSION_FE" || true

  log "Killing node/nodemon/vite processes..."
  pkill -f "node server.js" 2>/dev/null && ok "Killed node server.js"   || true
  pkill -f "nodemon"        2>/dev/null && ok "Killed nodemon"          || true
  pkill -f "vite"           2>/dev/null && ok "Killed vite"             || true
  pkill -f "npm run dev"    2>/dev/null || true

  log "Freeing ports $BACKEND_PORT and $FRONTEND_PORT..."
  kill_port "$BACKEND_PORT"
  kill_port "$FRONTEND_PORT"

  # Wait up to 10s for each port to actually release
  local i
  for i in $(seq 1 10); do
    port_free "$BACKEND_PORT" && port_free "$FRONTEND_PORT" && break
    sleep 1
  done

  if port_free "$BACKEND_PORT" && port_free "$FRONTEND_PORT"; then
    ok "Both ports free"
  else
    warn "Some ports still busy — continuing anyway"
  fi
}

# ─── Show status ───
show_status() {
  echo ""
  echo "── tmux sessions ──"
  tmux ls 2>/dev/null || echo "  (none)"
  echo ""
  echo "── ports ──"
  for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    if port_free "$p"; then
      echo "  :$p  free"
    else
      echo "  :$p  BUSY"
    fi
  done
  echo ""
}

# ─── Argument handling ───
case "${1:-}" in
  --stop)
    cleanup_all
    ok "All stopped."
    exit 0
    ;;
  --status)
    show_status
    exit 0
    ;;
  --help|-h)
    echo "Usage: $0 [--stop|--status|--help]"
    exit 0
    ;;
esac

# ════════════════════════════════════════════════════════════
# START
# ════════════════════════════════════════════════════════════

# ─── Ensure tmux exists ───
if ! command -v tmux >/dev/null 2>&1; then
  log "Installing tmux..."
  pkg install -y tmux
fi

# ─── Ensure psmisc (fuser) if possible ───
if ! command -v fuser >/dev/null 2>&1; then
  log "Installing psmisc (fuser)..."
  pkg install -y psmisc >/dev/null 2>&1 || warn "Couldn't install psmisc — will use /proc fallback"
fi

# ─── Clean everything first ───
log "Cleaning up any previous run..."
cleanup_all

# ─── Ensure crond is running ───
if ! pgrep -x crond >/dev/null 2>&1; then
  crond 2>/dev/null || true
  echo "▶ Started crond"
fi

# ─── Start backend ───
log "Starting backend (tmux: $SESSION_BE)..."
tmux new-session -d -s "$SESSION_BE" -c "$BACKEND" \
  "npm run dev; echo '[backend exited]'; exec bash"

# ─── Start frontend ───
log "Starting frontend (tmux: $SESSION_FE)..."
tmux new-session -d -s "$SESSION_FE" -c "$FRONTEND" \
  "rm -rf node_modules/.vite 2>/dev/null; npm run dev; echo '[frontend exited]'; exec bash"

# ─── Wait for backend ───
log "Waiting for backend on :$BACKEND_PORT..."
BE_UP=0
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$BACKEND_PORT/health"; then
    ok "Backend up"
    BE_UP=1
    break
  fi
  sleep 1
done
[ "$BE_UP" = "0" ] && err "Backend didn't start in 30s (tmux attach -t $SESSION_BE)"

# ─── Wait for frontend ───
log "Waiting for frontend on :$FRONTEND_PORT..."
FE_UP=0
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$FRONTEND_PORT/"; then
    ok "Frontend up"
    FE_UP=1
    break
  fi
  sleep 1
done
[ "$FE_UP" = "0" ] && err "Frontend didn't start in 30s (tmux attach -t $SESSION_FE)"

# ─── Detect LAN IP ───
LAN_IP=$(ip -4 addr show 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | grep -v '^127\.' | head -1)
[ -z "$LAN_IP" ] && LAN_IP=$(ifconfig 2>/dev/null | awk '/inet / {print $2}' | grep -v '^127\.' | head -1)
[ -z "$LAN_IP" ] && LAN_IP="localhost"

URL="http://$LAN_IP:$FRONTEND_PORT"
log "App URL: $URL"

# ─── Open in Chrome ───
if [ "$BE_UP" = "1" ] && [ "$FE_UP" = "1" ]; then
  if command -v am >/dev/null 2>&1; then
    am start -a android.intent.action.VIEW -d "$URL" \
         -n com.android.chrome/com.google.android.apps.chrome.Main \
         2>/dev/null \
      || am start -a android.intent.action.VIEW -d "$URL" 2>/dev/null \
      || termux-open-url "$URL"
  elif command -v termux-open-url >/dev/null 2>&1; then
    termux-open-url "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  else
    warn "No opener found. Open manually: $URL"
  fi
else
  warn "Not opening browser — one or both servers failed to start"
fi

# ─── Summary ───
echo ""
echo "══════════════════════════════════════════════════"
echo " Backend  : tmux attach -t $SESSION_BE    (:$BACKEND_PORT)"
echo " Frontend : tmux attach -t $SESSION_FE    (:$FRONTEND_PORT)"
echo " URL      : $URL"
echo " Detach   : Ctrl+B, then D"
echo " Status   : $0 --status"
echo " Stop     : $0 --stop"
echo "══════════════════════════════════════════════════"
