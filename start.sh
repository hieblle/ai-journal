#!/bin/bash
# Startet den Journal-Server. Beim ersten Start wird gebaut.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Installieren z.B. mit: brew install node" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installiere Abhängigkeiten …"
  npm install --no-audit --no-fund
fi

# Neu bauen, wenn kein Build da ist, der Code sich seit dem letzten Build geändert hat, oder REBUILD=1 gesetzt ist.
STAMP=server/dist/.build-stamp
CURRENT=$( { git rev-parse HEAD 2>/dev/null; git status --porcelain 2>/dev/null | head -c 2000; } | shasum | cut -c1-16 )
if [ ! -f web/dist/index.html ] || [ ! -f server/dist/index.js ] || [ "${REBUILD:-0}" = "1" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$CURRENT" ]; then
  if [ -f package-lock.json ] && [ node_modules/.package-lock.json -ot package-lock.json ]; then
    echo "Aktualisiere Abhängigkeiten …"
    npm install --no-audit --no-fund
  fi
  echo "Baue Oberfläche und Server …"
  npm run build
  echo "$CURRENT" > "$STAMP"
fi

PORT="${AI_JOURNAL_PORT:-8787}"
HOST="${AI_JOURNAL_HOST:-127.0.0.1}"
echo "Journal läuft auf http://${HOST}:${PORT}"
exec node server/dist/index.js
