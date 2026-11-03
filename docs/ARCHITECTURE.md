# Architektur

Stand: 2026-11-03. Beschreibt den Code, wie er ist. Das Soll steht in `../DESIGN.md`.

## Überblick

```
Browser (Svelte SPA, web/)  ──HTTP /api──▶  Node-Server (Fastify, server/)
                                                │
                                                ├── Journal-Ordner (Markdown)      ~/Journal oder konfiguriert
                                                ├── Konfiguration + Zustand        ~/.ai-journal/
                                                └── KI-Anbieter (CLI | API | Ollama)
```

Ein Prozess, keine Datenbank. Alles Fachliche liegt als Markdown im Journal-Ordner, alles Technische in `~/.ai-journal/`.

## Server (`server/src/`)

| Datei | Verantwortung |
|---|---|
| `index.ts` | Bootstrap: Config laden, Journal initialisieren, Routen registrieren, statisches Frontend aus `web/dist` ausliefern, Scheduler starten. `buildServer()` ist exportiert, damit Tests den Server ohne `listen` bauen können. |
| `config.ts` | `AppConfig`-Typ, Defaults, Laden/Speichern von `~/.ai-journal/config.json` (atomar, Mode 0600), `publicConfig()` maskiert Geheimnisse für den Browser. Pfade: `HOME_DIR`, `CONFIG_PATH`, `STATE_PATH`, `SECRET_PATH`. |
| `auth.ts` | PIN-Hash (scrypt), `LoginGuard` (Wartezeit nach 3 Fehlversuchen, verdoppelnd bis 5 min), `Sessions` (HMAC-signierte, zustandslose Tokens mit gleitender Ablaufzeit = Sperrzeit). Session-Secret in `~/.ai-journal/session-secret`. |
| `dates.ts` | Datumslogik in Server-Lokalzeit: Tageskeys `YYYY-MM-DD`, ISO-Wochen `YYYY-Www`, Monate `YYYY-MM`, Quartale `YYYY-Qn`, Zeiträume, Vorgänger. |
| `journal.ts` | Klasse `Journal`: Ordnerlayout, Einträge lesen/schreiben (gray-matter für Frontmatter), Templates, Berichte, Memory, Persona, Schnellnotiz, Suche. Alle Schreibvorgänge über `atomicWrite` (Temp-Datei + rename), damit OneDrive und Obsidian nie halbe Dateien sehen. Enthält die Standardtexte für `persona.md`, `templates/standard.md`, `memory/README.md`, `memory/themen.md`. |
| `routes.ts` | Alle HTTP-Routen, Fehlerbehandlung, Auth-Hook. Siehe API unten. |
| `scheduler.ts` | `duePeriod()` berechnet pro Berichtsart den zuletzt fälligen Zeitraum. `Scheduler` prüft 5 s nach Start und dann stündlich, führt Jobs seriell über eine Promise-Queue aus, hält Zustand in `~/.ai-journal/state.json` (`lastDone` pro Art, `unread`, `lastError`). |
| `ai/provider.ts` | Interface `AiProvider { generate({system, prompt}), test() }` und `createProvider(cfg, kind)`. `AI_JOURNAL_FAKE_PROVIDER=1` ersetzt alle Anbieter durch `FakeProvider`. |
| `ai/claudeCli.ts` | Startet `claude -p --no-session-persistence --tools "" --output-format text --system-prompt …`, Prompt über stdin, Arbeitsverzeichnis `~/.ai-journal/cli-cwd` (leer, damit keine Projekt-Settings gelesen werden). Optionales Token wird als `CLAUDE_CODE_OAUTH_TOKEN` in die Umgebung gegeben. Timeout 15 min. |
| `ai/claudeApi.ts` | `@anthropic-ai/sdk`, `messages.stream` + `finalMessage()`, prüft `stop_reason === "refusal"`. |
| `ai/ollama.ts` | `POST /api/chat` mit `stream: false`, `num_ctx` 32k. `test()` fragt `/api/tags` ab und warnt, wenn das Modell fehlt. |
| `reports/prompts.ts` | System-Prompt (Persona + technische Regeln), Aufgaben-Prompts pro Berichtsart, Prompt für das Gedächtnis-Update, `parseMemoryFiles()` für das Format `=== DATEI: name.md === … === ENDE ===`. |
| `reports/generate.ts` | `collectContext()` sammelt pro Art die Dokumente, `generateReport()` führt zwei Aufrufe aus (Bericht, dann Gedächtnis-Update), schreibt Bericht mit Fußzeile und aktualisierte Memory-Dateien. |

### Berichtspipeline

```
collectContext(kind, key)
  daily:     Eintrag heute + gestern, letzter Tagesbericht, Memory
  weekly:    7 Einträge, letzte 3 Wochenberichte, Memory, Energie/Fokus-Tabelle
  monthly:   Wochenberichte des Monats, letzter Monatsbericht, Memory, Energie/Fokus
  quarterly: Monatsberichte des Quartals, letzter Quartalsbericht, Memory
        │
        ▼
provider.generate(system = Persona + Regeln, prompt = Memory + Dokumente + Aufgabe)
        │  → ai/reports/<kind>/<key>.md  (mit Fußzeile "Erzeugt am … mit …")
        ▼
provider.generate(system, prompt = aktuelles Memory + neuer Bericht + Update-Regeln)
        │  → parseMemoryFiles → ai/memory/<name>.md  (nur geänderte Dateien)
        ▼
state.json: lastDone[kind] = key, unread += "kind/key"
```

Ein Bericht wird übersprungen, wenn es im Zeitraum keine Dokumente gibt (`skipped`). Bei einem Fehler wird `lastDone` trotzdem gesetzt, damit der Scheduler nicht stündlich erneut scheitert; der Nutzer sieht `lastError` und löst manuell neu aus.

### Fälligkeit (`duePeriod`)

- **daily**: Tag D ist fällig ab D um `hour:minute`. Vorher ist D-1 fällig.
- **weekly**: Trigger am konfigurierten Wochentag. Samstag/Sonntag → laufende Woche, Montag bis Freitag → Vorwoche.
- **monthly**: Vormonat ab dem 1. um `hour:minute`.
- **quarterly**: Vorquartal ab dem 1. des Quartals um `hour:minute`.

Es wird immer nur der jüngste fällige Zeitraum geliefert, kein Rückstau nach langer Pause.

## API

Alle Antworten JSON. Fehler als `{ error }` mit passendem Status. Alles außer `/api/auth/*` braucht das Session-Cookie `aij_session`, solange eine PIN gesetzt ist.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/auth/status` | `pinSet`, `authenticated`, `lockAfterMinutes` |
| POST | `/api/auth/setup` | PIN erstmalig setzen (409, wenn schon gesetzt) |
| POST | `/api/auth/login` | PIN prüfen, Cookie setzen; 429 bei Sperre |
| POST | `/api/auth/logout` | Cookie löschen |
| POST | `/api/auth/change` | PIN ändern (`oldPin`, `pin`) |
| GET | `/api/overview` | heute, Eintragsdaten, Templates, ungelesene Berichte, laufender Job, aktuelle und fällige Zeiträume |
| GET | `/api/entries/:date?create=1` | Eintrag lesen, optional aus Template anlegen |
| PUT | `/api/entries/:date` | `body` und/oder `meta` (energy, focus) speichern |
| POST | `/api/quicknote` | `text` mit Uhrzeit an Tag anhängen |
| GET | `/api/search?q=` | Volltext über Einträge (nur Body) und Berichte |
| GET/PUT/DELETE | `/api/templates[/:name]` | Templates |
| GET | `/api/reports` | Liste mit Label und `unread` |
| GET/PUT | `/api/reports/:kind/:key` | Bericht lesen (markiert gelesen) / überschreiben |
| GET | `/api/reports/:kind/:key/context` | Welche Dokumente die KI bekäme |
| POST | `/api/reports/:kind/:key/generate` | Job einreihen, `force` überschreibt; 409 wenn einer läuft |
| GET | `/api/reports/status` | laufender Job, Protokoll, letzter Fehler |
| GET/PUT | `/api/memory[/:name]`, `/api/persona` | Gedächtnis und Persona |
| GET/PUT | `/api/settings` | Konfiguration (Geheimnisse maskiert; maskierter Wert beim PUT heißt "unverändert") |
| POST | `/api/settings/test-provider` | Verbindungstest für einen Anbieter |

## Frontend (`web/src/`)

Svelte 5 mit Runes, Vite, kein Router-Paket. Routing über den URL-Hash: `#/entry/<date>`, `#/reports[/<kind>/<key>]`, `#/search[/<q>]`, `#/settings[/<tab>]`.

| Datei | Verantwortung |
|---|---|
| `lib/api.ts` | `fetch`-Wrapper, Typen, löst bei 401 das Event `aij:unauthorized` aus |
| `lib/state.svelte.ts` | Globaler Zustand `app`: Route, Sperre, Overview, Seitenmenü, Toasts, Inaktivitäts-Timer (sperrt clientseitig und ruft logout) |
| `App.svelte` | Sperrbildschirm oder Shell mit Seitenmenü und aktueller Ansicht |
| `components/Lock.svelte` | PIN setzen / entsperren |
| `components/Sidebar.svelte`, `Calendar.svelte` | Navigation, einklappbar, auf Mobil als Overlay mit Backdrop |
| `components/EntryView.svelte` | Tag: Energie/Fokus-Punkte, Editor, Schnellnotiz. Autosave 900 ms nach letzter Änderung, zusätzlich bei Tab-Wechsel, Navigation und Cmd/Ctrl+S |
| `components/Editor.svelte` | CodeMirror 6 mit Markdown-Hervorhebung, Zeilenumbruch, History |
| `components/ReportsView.svelte` | Übersicht aktueller Zeiträume, Liste, Anzeige (marked + DOMPurify), Bearbeiten, Erzeugen, Protokoll; pollt Status alle 3 s während ein Job läuft |
| `components/SearchView.svelte` | Suche mit Hervorhebung |
| `components/SettingsView.svelte`, `FileEditor.svelte` | Tabs: Allgemein, KI, Zeitplan, Templates, Persona, Gedächtnis, PIN |

Styling in `app.css` über CSS-Variablen, hell und dunkel per `prefers-color-scheme`.

## Dateien außerhalb des Repos

```
~/.ai-journal/
  config.json       Konfiguration inkl. PIN-Hash, API-Key, CLI-Token (Mode 0600)
  session-secret    HMAC-Schlüssel für Session-Cookies
  state.json        Scheduler-Zustand
  cli-cwd/          leeres Arbeitsverzeichnis für die Claude CLI
  server.log        Ausgabe des Hintergrundservers (launch.sh), ab 1 MB nach server.log.alt verschoben
  server.pid        PID des Hintergrundservers
```

Überschreibbar mit `AI_JOURNAL_HOME`. Journal-Ordner beim ersten Start aus `AI_JOURNAL_DIR`, danach aus der Config.

## Build und Start

`start.sh` installiert bei Bedarf Abhängigkeiten, baut neu, wenn sich der Git-Stand seit dem letzten Build geändert hat (Stempel in `server/dist/.build-stamp`), und startet `node server/dist/index.js` im Vordergrund. Im Dev-Modus (`npm run dev`) liefert Vite das Frontend und leitet `/api` an den Server weiter.

### Skripte (`scripts/`)

| Datei | Zweck |
|---|---|
| `launch.sh` | Hintergrundstart: erweitert `PATH` um `~/.local/bin`, Homebrew, nvm/volta (Programme per Doppelklick haben sonst kein `node`/`claude`), liest Port und Host aus Umgebung oder `config.json`, prüft über `GET /api/auth/status`, ob der Server schon läuft, startet sonst `start.sh` per `nohup` (Log `~/.ai-journal/server.log`, PID `~/.ai-journal/server.pid`), wartet bis zu 3 Minuten und öffnet dann den Browser. Fehler als macOS-Mitteilung über `osascript`. |
| `stop.sh` | Beendet den Server über die PID-Datei, sonst über `lsof` auf dem Port. |
| `make-app.sh` | Baut `~/Applications/AI Journal.app`: minimales Bundle mit `Info.plist` (`LSUIElement`, kein Dock-Symbol während des Laufs), Startskript `Contents/MacOS/run`, das `scripts/launch.sh` aus dem Repo aufruft, und `icon.icns` aus `assets/icon-1024.png` (per `sips` + `iconutil`). Mit `--stop` zusätzlich „AI Journal beenden.app“. |
| `e2e.mjs` | Browser-Test mit Playwright gegen einen laufenden Server mit Fake-Anbieter. |

`assets/icon-1024.png` ist aus `web/public/icon.svg` gerendert (832 px Icon auf 1024 px, transparenter Rand, Schatten), wie macOS es für App-Icons erwartet.
