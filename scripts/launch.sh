#!/bin/bash
# Startet den Journal-Server im Hintergrund (falls er nicht schon läuft), wartet,
# bis er antwortet, und öffnet die App im Browser.
# Wird von "AI Journal.app" aufgerufen (siehe scripts/make-app.sh), geht aber auch
# direkt im Terminal: ./scripts/launch.sh
set -u
cd "$(dirname "$0")/.."

# Programme, die per Doppelklick starten, bekommen nur einen minimalen PATH.
# node und claude liegen meist hier:
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
for d in "$HOME/.volta/bin" "$HOME/.nvm/versions/node"/*/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done

HOME_DIR="${AI_JOURNAL_HOME:-$HOME/.ai-journal}"
# Port und Adresse: Umgebungsvariable, sonst config.json, sonst Standard.
cfg_value() { node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(c[process.argv[2]]??""))}catch{}' "$HOME_DIR/config.json" "$1" 2>/dev/null; }
PORT="${AI_JOURNAL_PORT:-$(cfg_value port)}"; PORT="${PORT:-8787}"
HOST="${AI_JOURNAL_HOST:-$(cfg_value host)}"; HOST="${HOST:-127.0.0.1}"
[ "$HOST" = "0.0.0.0" ] && HOST=127.0.0.1
URL="http://$HOST:$PORT"
LOG="$HOME_DIR/server.log"
PIDFILE="$HOME_DIR/server.pid"

alive() { curl -fsS -m 2 "$URL/api/auth/status" 2>/dev/null | grep -q pinSet; }
notify() {
  echo "$1" >&2
  command -v osascript >/dev/null 2>&1 && osascript -e "display notification \"$1\" with title \"AI Journal\"" >/dev/null 2>&1
  return 0
}
open_url() {
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  else echo "Journal läuft auf $URL"; fi
}

mkdir -p "$HOME_DIR"

# Läuft schon? Dann nur den Browser öffnen.
if alive; then
  open_url
  exit 0
fi

# Antwortet auf dem Port etwas anderes?
if curl -s -m 2 -o /dev/null "$URL/"; then
  notify "Port $PORT ist belegt, aber nicht vom Journal."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  notify "Node.js nicht gefunden. Installieren mit: brew install node"
  exit 1
fi

# Log klein halten.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1000000 ]; then
  mv "$LOG" "$LOG.alt"
fi

echo "=== Start $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG"
nohup ./start.sh >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"

# Warten. Der erste Start baut die App, das kann ein bis zwei Minuten dauern.
for _ in $(seq 1 180); do
  if alive; then
    open_url
    exit 0
  fi
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    notify "Der Server ist beim Start abgebrochen. Protokoll: $LOG"
    tail -n 20 "$LOG" >&2
    exit 1
  fi
  sleep 1
done

notify "Der Server antwortet nach 3 Minuten nicht. Protokoll: $LOG"
exit 1
