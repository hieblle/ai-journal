# Aufgaben

Stand: 2026-11-03. Zu Beginn jeder Sitzung lesen, am Ende aktualisieren. Priorität: P1 vor Dauerbetrieb, P2 nächste Ausbaustufe, P3 später.

## Offen

### P1 · Vor Dauerbetrieb

- [ ] **Token und API-Key sicher ablegen.** Aktuell Klartext in `~/.ai-journal/config.json`. Ziel: macOS-Keychain (`security add-generic-password` / `find-generic-password`), nur zur Laufzeit auslesen, Config enthält kein Geheimnis mehr. Plus optionales Feld "Befehl, der das Token liefert" (1Password `op read`, Bitwarden, eigenes Skript). Fallback auf Config-Datei, wenn kein Keychain (Linux, Pi). Aufwand ca. 1 Stunde. Keychain-Teil nur auf dem Mac testbar.
- [ ] **Klären, warum `claude -p` den Keychain-Login nicht nutzt.** Interaktiv läuft `claude`, Print-Modus meldet "OAuth session expired and could not be refreshed". Diagnose auf dem Mac: `type claude`, `claude --version`, `claude auth status --text`, `claude -p "Sag OK."`. Vermutung: zweite Installation (npm vs. nativ) oder Alias. Wenn geklärt, braucht es evtl. kein eigenes Token.
- [ ] **Pull Request nach `main` mergen**, danach auf dem Mac auf `main` wechseln.

### P2 · Nach den ersten echten Berichten

- [ ] **Wochenbericht kalibrieren.** Nach 2 bis 3 echten Wochenberichten Persona (`ai/persona.md`) und Aufgaben-Prompts (`server/src/reports/prompts.ts`) nachschärfen. Prüfen: Belegt die KI Beobachtungen mit Datum? Trennt sie Beobachtung und Vermutung? Erkennt sie Wiederholungen über das Gedächtnis?
- [ ] **Gedächtnis-Qualität prüfen.** Bleibt `themen.md` knapp? Werden gelöste Themen als gelöst markiert? Legt die KI sinnvolle weitere Dateien an?
- [ ] **Tagesbericht bewerten.** Nervt er oder hilft er? Standard an oder aus?
- [ ] Ideen aus dem Vorgängerprojekt (Notion: "Lokale Journaling App mit Ollama") sichten: Pennebaker-Notizen zur Schreiboberfläche ohne Feedback, Wochen-Zielreview, Importfunktion für alte Journaldaten.

### P3 · V2 Handy und Audio

- [ ] **PWA.** Service Worker, Offline-Puffer für Text (IndexedDB), Nachsenden bei Verbindung, letzte Tage und letzter Bericht zwischenspeichern.
- [ ] **Tailscale-Anleitung** im README: `AI_JOURNAL_HOST`, `tailscale serve` für HTTPS, Installation als Homescreen-App.
- [ ] **Audio.** Aufnahme-Button (MediaRecorder), Upload nach `audio/`, Transkription lokal (whisper.cpp als Unterprozess) oder per API, wählbar wie bei den KI-Anbietern. Transkript als Schnellnotiz anhängen.
- [ ] Optionales LaunchAgent-Setup-Skript statt manuellem Plist.

### Kleinkram

- [ ] Berichte-Übersicht: Karte "Aktuelle Zeiträume" ist noch etwas voll, Layout prüfen.
- [ ] Frontend-Bundle ist 660 kB; CodeMirror und marked per dynamischem Import laden.
- [ ] Suche: Treffer in Frontmatter-Feldern (z.B. `energy: 2`) bewusst ausgeschlossen, evtl. Filter nach Energie/Fokus ergänzen.

## In Arbeit

(nichts)

## Erledigt

- [x] 2026-11-03 · Design-Interview, Ergebnis in `DESIGN.md`
- [x] 2026-11-03 · V1: Server, Speicher, PIN, Editor, Berichte, Scheduler, Einstellungen
- [x] 2026-11-03 · Unit-Tests (Datum, Fälligkeit, Memory-Parsing), Browser-Test mit Fake-Anbieter
- [x] 2026-11-03 · README mit Setup, LaunchAgent, Umgebungsvariablen
- [x] 2026-11-03 · Notion-Projektseite in "PROJECTS PRIVAT / Sideprojects" angelegt
- [x] 2026-11-03 · CLI-Fix: `--bare` entfernt, leeres Arbeitsverzeichnis
- [x] 2026-11-03 · `start.sh` baut bei Codeänderung automatisch neu
- [x] 2026-11-03 · Langlebiges CLI-Token als Einstellung; App läuft lokal auf dem Mac
- [x] 2026-11-03 · Dokumentationsstruktur: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/CHANGELOG.md`
