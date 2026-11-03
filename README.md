# AI Journal

Ein persönliches Journal in Markdown mit einem KI-Gegenüber, das regelmäßig ehrlich spiegelt, was in den Einträgen steht. Läuft als lokaler Webserver auf dem Mac, Oberfläche im Browser.

Dokumentation: [DESIGN.md](DESIGN.md) (Soll), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Ist), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/TASKS.md](docs/TASKS.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Schnellstart (Mac)

Voraussetzung: Node.js 22 oder neuer (`brew install node`).

```bash
git clone <dieses Repo> ~/ai-journal
cd ~/ai-journal
./start.sh
```

Beim ersten Start werden Abhängigkeiten installiert und die Oberfläche gebaut. Danach läuft die App auf <http://127.0.0.1:8787>. Beim ersten Öffnen legst du eine PIN fest.

Der Journal-Ordner ist standardmäßig `~/Journal`. In den Einstellungen kannst du ihn ändern, zum Beispiel auf einen Ordner in OneDrive. Alles darin ist reines Markdown und lässt sich jederzeit mit Obsidian als Vault öffnen.

## Als Programm am Mac (Doppelklick)

Einmalig:

```bash
cd ~/PROJECTS/ai-journal
npm run mac-app
```

Das legt `~/Applications/AI Journal.app` an. Öffnen per Spotlight („AI Journal“) oder aus `~/Applications`, von dort ins Dock ziehen.

- **Doppelklick** startet den Server im Hintergrund, wartet, bis er antwortet, und öffnet die App im Browser. Nach einem `git pull` dauert das ein bis zwei Minuten, weil neu gebaut wird; Fehler kommen als Mitteilung.
- **Solange das Symbol im Dock ist, läuft der Server.** Klick aufs Symbol öffnet den Browser erneut.
- **Beenden (⌘Q oder Rechtsklick im Dock → Beenden) stoppt den Server.** Stirbt der Server von selbst, verschwindet das Symbol nach kurzer Zeit.

Protokoll des Hintergrundservers: `~/.ai-journal/server.log`. Das Programm enthält nur den Pfad zum Repo; nach Codeänderungen muss es nicht neu erzeugt werden, nach einem Umzug des Ordners schon. Ohne Programm geht es auch im Terminal: `./scripts/launch.sh` startet, `./scripts/stop.sh` beendet.

## Ordnerstruktur

```
Journal/
  entries/2026/2026-11-03.md     deine Einträge, eine Datei pro Tag
  templates/standard.md          Vorlagen für neue Tage, in der App editierbar
  audio/                         Sprachaufnahmen (kommt mit der Handy-Version)
  ai/persona.md                  Charakter der KI, editierbar
  ai/memory/                     Langzeitgedächtnis der KI, lesbar und korrigierbar
  ai/reports/weekly/2026-W45.md  Berichte (daily, weekly, monthly, quarterly)
```

Einstellungen, PIN-Hash, API-Key und Scheduler-Zustand liegen in `~/.ai-journal/`, nicht im Journal-Ordner.

## KI-Anbieter

In den Einstellungen unter „KI“ wählbar:

| Anbieter | Voraussetzung | Hinweis |
|---|---|---|
| Claude Code CLI (Standard) | `claude` installiert und eingeloggt (`claude` einmal im Terminal starten) | Nutzt dein Abo, kein API-Key. Läuft nur auf dem Rechner, auf dem die CLI eingeloggt ist. |
| Claude API | API-Key von console.anthropic.com | Pay-per-use. Modell einstellbar, Standard `claude-opus-5-5`. |
| Ollama | Ollama läuft lokal, Modell ist gezogen | Nichts verlässt den Rechner. Für Monats- und Quartalsberichte ein Modell mit großem Kontext wählen. |

„Speichern und testen“ prüft die Verbindung und schickt eine Mini-Anfrage.

## Berichte

| Bericht | Wann (Standard) | Grundlage |
|---|---|---|
| Täglich | 21:00 | heutiger und gestriger Eintrag, Gedächtnis |
| Wöchentlich | Sonntag 20:00 | 7 Einträge, Gedächtnis, letzte 3 Wochenberichte |
| Monatlich | 1. des Monats 09:00 | Wochenberichte, Gedächtnis, letzter Monatsbericht |
| Quartal | 1. des Quartals 09:00 | Monatsberichte, Gedächtnis, letzter Quartalsbericht |

Der Server prüft stündlich und beim Start, was fällig ist. War der Mac aus, wird beim nächsten Start nachgeholt. Unter „Berichte“ kannst du jeden Bericht auch sofort erzeugen oder neu erzeugen. Nach jedem Bericht aktualisiert die KI ihr Gedächtnis in `ai/memory/`.

Der Charakter der KI steht in `ai/persona.md` (Radical Honesty nach Brad Blanton). Nach den ersten Wochenberichten lohnt es sich, ihn nachzuschärfen.

## Automatisch beim Login starten

Alternative zum Programm-Icon, wenn der Server immer laufen soll (dann erzeugt der Zeitplan Berichte auch ohne dein Zutun). Beides zusammen ist nicht sinnvoll: Beenden des Programms stoppt auch den LaunchAgent-Server, den launchd dann sofort neu startet.

Lege `~/Library/LaunchAgents/de.ai-journal.plist` an (Pfade anpassen):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>de.ai-journal</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/Users/DEIN-NAME/ai-journal/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>/tmp/ai-journal.log</string>
  <key>StandardErrorPath</key><string>/tmp/ai-journal.log</string>
</dict>
</plist>
```

Dann:

```bash
launchctl load ~/Library/LaunchAgents/de.ai-journal.plist
```

## Umgebungsvariablen

| Variable | Standard | Zweck |
|---|---|---|
| `AI_JOURNAL_PORT` | `8787` | Port |
| `AI_JOURNAL_HOST` | `127.0.0.1` | Bind-Adresse. Für Zugriff vom Handy über Tailscale auf `0.0.0.0` oder die Tailscale-IP setzen. |
| `AI_JOURNAL_DIR` | `~/Journal` | Journal-Ordner beim allerersten Start (danach aus der Konfiguration) |
| `AI_JOURNAL_HOME` | `~/.ai-journal` | Ordner für Konfiguration und Zustand |
| `REBUILD=1` | | erzwingt einen neuen Build in `start.sh` (sonst wird automatisch gebaut, wenn der Code sich geändert hat) |

## Entwicklung

```bash
npm install
npm run dev        # Server mit Neustart bei Änderungen + Vite auf http://localhost:5173
npm run typecheck
npm test
```

`AI_JOURNAL_FAKE_PROVIDER=1` ersetzt alle KI-Anbieter durch einen Platzhalter, der sofort einen Testbericht liefert. Praktisch, um den Ablauf ohne echte Anfragen zu prüfen.

## Was noch kommt

- Handy (Android) als PWA über Tailscale, mit Offline-Puffer
- Audioaufnahme und Transkription (lokal mit Whisper oder per API)
