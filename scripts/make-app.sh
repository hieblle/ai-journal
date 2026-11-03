#!/bin/bash
# Erzeugt "AI Journal.app" für macOS. Doppelklick startet den Server im
# Hintergrund und öffnet die App im Browser (ruft scripts/launch.sh auf).
# Optional als zweites Programm "AI Journal beenden.app" mit --stop.
#
#   ./scripts/make-app.sh            → ~/Applications/AI Journal.app
#   ./scripts/make-app.sh --stop     → zusätzlich ~/Applications/AI Journal beenden.app
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ "$(uname)" != "Darwin" ]; then
  echo "Dieses Skript läuft nur auf macOS." >&2
  exit 1
fi

WITH_STOP=0
[ "${1:-}" = "--stop" ] && WITH_STOP=1

make_icns() {
  local out=$1 src="$ROOT/assets/icon-1024.png"
  local set
  set=$(mktemp -d)/icon.iconset
  mkdir -p "$set"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$src" --out "$set/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$src" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$set" -o "$out"
  rm -rf "$(dirname "$set")"
}

make_app() {
  local app=$1 name=$2 id=$3 script=$4
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleDisplayName</key><string>$name</string>
  <key>CFBundleIdentifier</key><string>$id</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
  cat > "$app/Contents/MacOS/run" <<RUN
#!/bin/bash
exec "$ROOT/scripts/$script"
RUN
  chmod +x "$app/Contents/MacOS/run"
  make_icns "$app/Contents/Resources/icon.icns"
  touch "$app"
  echo "Erstellt: $app"
}

mkdir -p "$HOME/Applications"
make_app "$HOME/Applications/AI Journal.app" "AI Journal" "de.ai-journal.launcher" "launch.sh"
if [ "$WITH_STOP" = 1 ]; then
  make_app "$HOME/Applications/AI Journal beenden.app" "AI Journal beenden" "de.ai-journal.stop" "stop.sh"
fi

echo
echo "Fertig. Das Programm liegt in ~/Applications. Öffne den Ordner mit:"
echo "  open ~/Applications"
echo "Von dort ins Dock ziehen oder per Spotlight (⌘ Leertaste) \"AI Journal\" starten."
