#!/bin/bash
# Erzeugt ~/Applications/AI Journal.app für macOS.
# Doppelklick startet den Server im Hintergrund und öffnet die App im Browser.
# Das Programm bleibt im Dock, solange der Server läuft; Beenden (⌘Q) stoppt ihn.
# Quelle: scripts/AI-Journal.applescript, übersetzt mit osacompile (in macOS enthalten).
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ "$(uname)" != "Darwin" ]; then
  echo "Dieses Skript läuft nur auf macOS." >&2
  exit 1
fi

APP="$HOME/Applications/AI Journal.app"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Skript mit Repo-Pfad befüllen und als "stay open"-Programm übersetzen.
sed "s|__ROOT__|$ROOT|" scripts/AI-Journal.applescript > "$TMP/AI Journal.applescript"
mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -s -o "$APP" "$TMP/AI Journal.applescript"

# Icon aus assets/icon-1024.png in allen Größen.
mkdir -p "$TMP/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" assets/icon-1024.png --out "$TMP/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) assets/icon-1024.png --out "$TMP/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/icon.iconset" -o "$APP/Contents/Resources/applet.icns"

PLIST="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "AI Journal" "$PLIST"
plutil -replace CFBundleDisplayName -string "AI Journal" "$PLIST"
plutil -replace CFBundleIdentifier -string "de.ai-journal.app" "$PLIST"
touch "$APP"

echo "Erstellt: $APP"
echo
echo "Öffnen mit Spotlight (⌘ Leertaste, \"AI Journal\") oder:"
echo "  open ~/Applications"
echo "Von dort ins Dock ziehen. Beenden über ⌘Q oder Rechtsklick im Dock stoppt den Server."
