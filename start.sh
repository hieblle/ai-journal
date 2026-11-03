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

if [ ! -f web/dist/index.html ] || [ ! -f server/dist/index.js ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "Baue Oberfläche und Server …"
  npm run build
fi

PORT="${AI_JOURNAL_PORT:-8787}"
HOST="${AI_JOURNAL_HOST:-127.0.0.1}"
echo "Journal läuft auf http://${HOST}:${PORT}"
exec node server/dist/index.js
