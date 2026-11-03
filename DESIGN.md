# AI Journal – Design

Stand: 2026-11-03. Ergebnis des Design-Interviews, gemeinsames Verständnis.

## Zweck

Ein persönliches Journal mit einem KI-Gegenüber nach Radical Honesty (Brad Blanton),
das regelmäßig ehrlich spiegelt, was in den Texten steht: wiederkehrende Muster,
ungelöste Themen, Blindspots, Vorschläge, die richtigen Fragen. Persönliches ist
der Kern, Arbeit und Effektivität ein Themenfeld darunter.

## Plattform

- Lokaler Webserver auf dem Mac, per Skript gestartet (`./start.sh`), Oberfläche im Browser.
- Später Android als PWA über Tailscale, mit Offline-Puffer für Text und Audio.
- Keine native App. Reihenfolge: erst Mac komplett, dann Handy.
- Der Server ist so gebaut, dass er ohne Änderung auch auf einem Pi oder VPS läuft.

## Daten

Ein eigener Ordner, kein Obsidian-Vault, aber jederzeit mit Obsidian öffenbar.
Kann in OneDrive liegen (Backup). Dateien bleiben Klartext.

```
journal/
  entries/2026/2026-11-03.md     ← nur der Mensch schreibt hier
  templates/                     ← nur der Mensch, editierbar in der App
  audio/                         ← Originalaufnahmen (V2)
  ai/reports/daily/2026-11-03.md
  ai/reports/weekly/2026-W45.md
  ai/reports/monthly/2026-11.md
  ai/reports/quarterly/2026-Q4.md
  ai/memory/                     ← Langzeitgedächtnis der KI, lesbar und korrigierbar
  ai/persona.md                  ← Charakter der KI, editierbar
```

Einstellungen, PIN-Hash, API-Keys und Scheduler-Zustand liegen außerhalb in
`~/.ai-journal/` (überschreibbar mit `AI_JOURNAL_HOME`), damit nichts davon in
OneDrive landet.

Die KI schreibt nie in `entries/` oder `templates/`.

## Einträge

- Eine Datei pro Tag. Frontmatter mit `date` automatisch, optional `energy` und
  `focus` (1 bis 5), beide überspringbar.
- Freitext-Editor mit Autosave. Neue Tage werden aus dem Standard-Template
  vorgefüllt (Auslieferung: Geschafft / Hängt / Morgen). Templates sind
  Markdown-Dateien in `templates/`, in der App anleg- und änderbar.
- Schnellnotiz-Feld hängt Text mit Uhrzeit unten an die heutige Datei an
  (`**14:32** …`). Später kommen Transkripte vom Handy auf demselben Weg.
- Alte Einträge, Berichte und Memory sind in der App editierbar.

## Oberfläche

- Schmales, einklappbares Seitenmenü: heute, letzte Tage, Monatskalender,
  Berichte, Suche, Einstellungen.
- Rohtext-Editor mit leichter Markdown-Hervorhebung, keine Vorschau, keine
  Tags, keine Graphen (dafür Obsidian).
- Berichte gerendert, neue markiert. Volltextsuche über Einträge und Berichte.
- Alles Deutsch.

## PIN

Sperrt die Oberfläche beim Öffnen und nach Inaktivität (einstellbar). Serverseitig
gehasht (scrypt), Wartezeit nach Fehlversuchen. Session als signiertes Cookie.
Schützt gegen "jemand sitzt kurz am Rechner / hat das Handy", nicht gegen
Dateisystemzugriff.

## KI-Anbieter

Drei, in den Einstellungen wählbar, hinter einer gemeinsamen Schnittstelle:

1. **Claude Code CLI** headless (`claude -p`), Standard, nutzt das Abo, kein Key.
2. **Claude API** mit eigenem Key (`@anthropic-ai/sdk`).
3. **Ollama** lokal (`/api/chat`).

Berichtssprache Deutsch, per Du, als Einstellung.

## Berichte

| Bericht | Kontext | Inhalt |
|---|---|---|
| Täglich (abschaltbar) | heute, gestern, Memory | max. 5 Zeilen, eine Beobachtung, eine Frage |
| Wöchentlich (Kern) | 7 Einträge, Memory, letzte 3 Wochenberichte | Muster, ungelöste Wiederholungen, Blindspots, Vorschläge, nicht vergessen, max. 3 Fragen |
| Monatlich | Wochenberichte, Memory, letzter Monatsbericht | Zusammenfassung, gelöst/verschoben, Energie/Fokus-Verlauf, Kläranlage auf den Vormonat |
| Quartal | Monatsberichte, Memory, letzter Quartalsbericht | Kläranlage auf 3 Monate: was war wichtig und ist weg, was zieht sich durch, was braucht eine Entscheidung |

Nach jedem Bericht pflegt die KI `ai/memory/` (Themen mit erstem/letztem
Auftreten und Status, Muster, Ziele, offene Fragen). Memory ist das
Langzeitgedächtnis, jeder Bericht bekommt den gesamten Ordner als Kontext.

Kein Dialog mit der KI: die Reaktion auf einen Bericht gehört ins Journal.

## Zeitplan

Einstellbare Zeiten (Standard: täglich 21:00, wöchentlich Sonntag 20:00,
monatlich am 1. um 09:00, Quartal am 1. des Quartals um 09:00). Der Server
prüft stündlich und beim Start, was fällig ist, und erzeugt es im Hintergrund.
War der Server aus, holt er beim Start nach. Pro Bericht gibt es "jetzt
erzeugen" und "neu erzeugen". Zustand in `~/.ai-journal/state.json`.

## Persona (Radical Honesty)

- Sagt, was sie wahrnimmt, nicht was höflich wäre. Keine Abschwächung.
- Trennt Beobachtung mit Beleg ("Ich lese in deinen Texten …") von Vermutung
  ("Ich vermute …").
- Benennt Vermeidung, Ausreden und Selbsterzählungen direkt.
- Fragt nach dem, was nicht geschrieben wurde, wenn ein Thema umschifft wird.
- Keine Diagnosen, keine Fachbegriffe, klarer Hinweis auf echte Hilfe bei
  Krisenanzeichen.
- Arbeit ist ein Themenfeld unter anderen, nicht das Raster.

Liegt in `ai/persona.md`, editierbar.

## V2 (Handy)

PWA, Tailscale-Anleitung, Offline-Puffer, Audioaufnahme mit Transkription
lokal (Whisper) oder per API, wählbar, lokal als Standard.

## Tech-Stack

TypeScript durchgehend. Node 22, Fastify-Server, Svelte-Frontend mit Vite,
CodeMirror für den Editor. Start per `./start.sh`.

## Backlog

Offene Aufgaben, die nach dem Prototyp anstehen. Reihenfolge nach Priorität.

1. **Token sicher ablegen (vor Dauerbetrieb).** Das langlebige CLI-Token aus
   `claude setup-token` liegt aktuell im Klartext in `~/.ai-journal/config.json`.
   Geplant: Ablage in der macOS-Keychain (`security add-generic-password` /
   `find-generic-password`), nur zur Laufzeit auslesen, plus optionales Feld
   "Befehl, der das Token liefert" für 1Password/Bitwarden/eigene Skripte.
   Gleiches Muster für den Claude-API-Key. Aufwand ca. eine Stunde.
2. **Klären, warum der Print-Modus den Keychain-Login nicht nutzt.** Interaktiv
   läuft `claude`, `claude -p` meldet "OAuth session expired". Diagnose:
   `type claude`, `claude --version`, `claude auth status --text`,
   `claude -p "Sag OK."`. Vermutung: zweite Installation oder Alias.
3. **Wochenbericht kalibrieren.** Nach den ersten echten Berichten Persona und
   Prompts nachschärfen.
4. **V2 Handy:** PWA, Tailscale-Anleitung, Offline-Puffer.
5. **V2 Audio:** Aufnahme, Transkription lokal (Whisper) oder per API.
6. Ideen aus dem Vorgängerprojekt sichten (Pennebaker-Notizen, Wochen-Zielreview).
