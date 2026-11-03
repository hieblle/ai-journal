#!/bin/bash
# Exit 0, wenn der Hintergrundserver läuft (Prozess aus der PID-Datei lebt oder der Port antwortet), sonst 1.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
HOME_DIR="${AI_JOURNAL_HOME:-$HOME/.ai-journal}"
PIDFILE="$HOME_DIR/server.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then exit 0; fi
cfg_value() { node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(c[process.argv[2]]??""))}catch{}' "$HOME_DIR/config.json" "$1" 2>/dev/null; }
PORT="${AI_JOURNAL_PORT:-$(cfg_value port)}"; PORT="${PORT:-8787}"
curl -fsS -m 2 "http://127.0.0.1:$PORT/api/auth/status" 2>/dev/null | grep -q pinSet
