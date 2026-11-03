#!/bin/bash
# Beendet den im Hintergrund laufenden Journal-Server.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
HOME_DIR="${AI_JOURNAL_HOME:-$HOME/.ai-journal}"
cfg_value() { node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(c[process.argv[2]]??""))}catch{}' "$HOME_DIR/config.json" "$1" 2>/dev/null; }
PORT="${AI_JOURNAL_PORT:-$(cfg_value port)}"; PORT="${PORT:-8787}"
PIDFILE="$HOME_DIR/server.pid"

pid=""
[ -f "$PIDFILE" ] && pid=$(cat "$PIDFILE")
if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
  # Keine PID-Datei (z.B. Start über LaunchAgent oder Terminal): über den Port suchen.
  pid=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)
fi

if [ -z "$pid" ]; then
  echo "Es läuft kein Journal-Server."
  rm -f "$PIDFILE"
  exit 0
fi

kill "$pid" 2>/dev/null
for _ in $(seq 1 20); do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.25
done
kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
rm -f "$PIDFILE"
echo "Journal-Server beendet."
