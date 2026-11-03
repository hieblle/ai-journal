# Änderungen

Neueste oben. Aus Nutzersicht, nicht aus Code-Sicht.

## 2026-11-03

- Dokumentation: `CLAUDE.md` mit Arbeitsregeln, `docs/` mit Architektur, Entscheidungslog, Aufgaben und diesem Protokoll. Backlog aus `DESIGN.md` nach `docs/TASKS.md` verschoben.
- Einstellungen → KI: neues Feld "Langlebiges Token" für die Claude CLI (aus `claude setup-token`). Damit hängt die App nicht am Keychain-Login der Terminalsitzung.
- Claude CLI: Aufruf ohne `--bare`, damit der normale Login genutzt wird. Die CLI läuft in einem leeren Ordner unter `~/.ai-journal/cli-cwd`.
- `start.sh` baut automatisch neu, wenn sich der Code nach `git pull` geändert hat, und aktualisiert bei Bedarf die Abhängigkeiten.
- Erste Version: Markdown-Journal mit PIN, Editor, Templates, Schnellnotizen, Kalender, Suche; KI-Berichte täglich, wöchentlich, monatlich, Quartal mit Langzeitgedächtnis und Persona; Anbieter Claude CLI, Claude API, Ollama; Scheduler mit Nachholen und manuellem Auslösen.
