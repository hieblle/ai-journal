# Entscheidungslog

Neueste oben. Jede Entscheidung: Kontext, Entscheidung, Folgen. Die Grundentscheidungen aus dem Design-Interview stehen in `../DESIGN.md`.

## 2026-11-03 · Mac-Programm als Shell-Bundle statt Automator oder Electron

**Kontext.** Der Nutzer will ein Icon, das Server und Browser startet. Optionen: Automator/Kurzbefehle-App, `.command`-Datei (öffnet ein Terminalfenster, das offen bleibt), Electron (schwer, eigener Build), oder ein handgebautes `.app`-Bundle mit Shell-Skript.

**Entscheidung.** `scripts/make-app.sh` erzeugt ein minimales Bundle (`Info.plist` + Skript + `icon.icns`), das `scripts/launch.sh` aus dem Repo aufruft. Das Bundle enthält keinen Code, nur den Pfad zum Repo; Codeänderungen brauchen kein neues Bundle. `LSUIElement` verhindert ein Dock-Symbol, da das Programm nach dem Start sofort beendet ist. Der Server läuft per `nohup` weiter.

**Folgen.** Unsigniert, aber lokal erzeugt, daher ohne Gatekeeper-Warnung. Beenden nur über `scripts/stop.sh` oder das optionale zweite Programm. Wird das Repo verschoben, muss `npm run mac-app` erneut laufen. Programme per Doppelklick haben einen minimalen `PATH`; `launch.sh` ergänzt die üblichen Orte für `node` und `claude`.

## 2026-11-03 · Langlebiges CLI-Token als Prototyp-Lösung, Keychain als Ziel

**Kontext.** `claude -p` meldete auf dem Mac "OAuth session expired and could not be refreshed", obwohl `claude` interaktiv läuft. Ursache noch nicht geklärt (Vermutung: zweite Installation oder Alias). `claude setup-token` ist der offizielle Weg für nicht-interaktive Nutzung mit Abo.

**Entscheidung.** Optionales Feld "Langlebiges Token" in den KI-Einstellungen. Wird als `CLAUDE_CODE_OAUTH_TOKEN` nur in die Umgebung des CLI-Unterprozesses gegeben. Ablage vorerst im Klartext in `~/.ai-journal/config.json` (Mode 0600).

**Folgen.** Funktioniert, aber nicht für Dauerbetrieb akzeptabel: Jeder Prozess unter dem Nutzer kann die Datei lesen. Offener Task mit höchster Priorität: Ablage in der macOS-Keychain plus optionaler Befehl, der das Token liefert (1Password, Bitwarden). Gleiches Muster dann für den API-Key.

## 2026-11-03 · Kein `--bare` beim CLI-Aufruf, stattdessen leeres Arbeitsverzeichnis

**Kontext.** Erster CLI-Aufruf aus der App scheiterte mit "Not logged in". Die CLI-Hilfe zu `--bare`: Keychain-Reads und OAuth werden nie gelesen, nur `ANTHROPIC_API_KEY` oder ein apiKeyHelper.

**Entscheidung.** `--bare` entfernt. Um trotzdem keine Projekt-Settings, Hooks oder CLAUDE.md aus dem Repo zu laden, läuft die CLI mit `cwd = ~/.ai-journal/cli-cwd` (leer). `--no-session-persistence` und `--tools ""` bleiben.

**Folgen.** Nutzer-Settings aus `~/.claude/settings.json` werden weiterhin geladen, das ist gewollt (Login, Modellwahl). Globale Hooks des Nutzers würden ebenfalls laufen; bisher kein Problem.

## 2026-11-03 · Build-Stempel in `start.sh`

**Kontext.** `start.sh` baute nur, wenn kein `dist` existierte. Nach `git pull` lief die alte Version weiter.

**Entscheidung.** Hash aus `git rev-parse HEAD` und `git status --porcelain` wird in `server/dist/.build-stamp` abgelegt; weicht er ab, wird neu gebaut. `REBUILD=1` erzwingt.

## 2026-11-03 · Gedächtnis-Update als zweiter KI-Aufruf

**Kontext.** Ein einziger Aufruf, der Bericht und Memory-Dateien liefert, macht den Bericht schlechter (die Antwort wird zur Buchhaltung) und das Parsen fragil.

**Entscheidung.** Zwei Aufrufe: erst Bericht, dann Update mit Bericht + aktuellem Memory. Memory-Dateien im Format `=== DATEI: name.md === … === ENDE ===`, nur geänderte Dateien werden zurückgegeben, `KEINE ÄNDERUNG` ist erlaubt. Dateinamen auf `[a-z0-9-]+.md` beschränkt, `README.md` wird nie überschrieben.

**Folgen.** Doppelte Token-Kosten pro Bericht, dafür robuster. Scheitert das Update, bleibt der Bericht erhalten und das Protokoll zeigt den Fehler.

## 2026-11-03 · Berichte stufenweise statt aus Rohtexten

**Entscheidung.** Monatsbericht aus Wochenberichten, Quartalsbericht aus Monatsberichten, nie aus allen Einträgen. Hält den Kontext klein genug für Ollama und zwingt zur Verdichtung.

## 2026-11-03 · Atomares Schreiben im Journal-Ordner

**Kontext.** Der Ordner kann in OneDrive liegen und gleichzeitig in Obsidian offen sein.

**Entscheidung.** Jeder Schreibvorgang geht über Temp-Datei + `rename`. Frontmatter-Datum wird unquotiert geschrieben (`date: 2026-11-03`), damit Obsidian es als Datum erkennt.

## 2026-11-03 · Zustandslose Sessions, Secret auf Platte

**Entscheidung.** Session-Token = base64(payload).HMAC, Secret in `~/.ai-journal/session-secret`. Keine Session-Tabelle, Sitzungen überleben Neustarts. Ablauf gleitend = Sperrzeit aus den Einstellungen. Zusätzlich sperrt der Client bei Inaktivität und ruft logout.

## 2026-11-03 · Tech-Stack

**Entscheidung.** TypeScript durchgehend: Node 22, Fastify 5, Svelte 5 (Runes), Vite, CodeMirror 6, gray-matter, marked + DOMPurify, `@anthropic-ai/sdk`. Kein Router-Paket (Hash-Routing reicht), keine Datenbank, keine ORM. Begründung: eine Sprache für Server und PWA, kleine Oberfläche, Markdown ist die Quelle der Wahrheit.

## 2026-11-03 · Fake-Anbieter für Tests

**Entscheidung.** `AI_JOURNAL_FAKE_PROVIDER=1` ersetzt alle Anbieter durch einen Platzhalter, der sofort einen Bericht und ein Memory-Update liefert. Damit lässt sich die ganze Pipeline ohne Kosten und ohne Login prüfen.
