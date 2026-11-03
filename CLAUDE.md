# Arbeitsregeln für dieses Repo

Persönliche Journal-App mit KI-Berichten. Sprache in Code-Kommentaren, Oberfläche, Docs und Commits: Deutsch (Bezeichner im Code Englisch).

## Dokumentation, die gepflegt wird

| Datei | Inhalt | Wann anfassen |
|---|---|---|
| `DESIGN.md` | Abgestimmtes Design aus dem Interview, Soll-Zustand | Nur bei bewusster Designänderung |
| `docs/ARCHITECTURE.md` | Wie der Code tatsächlich aufgebaut ist: Module, Datenfluss, API, Berichtspipeline | Bei jeder Änderung an Struktur, API oder Pipeline |
| `docs/DECISIONS.md` | Entscheidungslog mit Datum, Kontext, Entscheidung, Folgen | Bei jeder Entscheidung, die nicht offensichtlich ist |
| `docs/TASKS.md` | Aufgabenliste: offen, in Arbeit, erledigt, mit Priorität | Zu Beginn und am Ende jeder Arbeitssitzung |
| `docs/CHANGELOG.md` | Was sich wann geändert hat, aus Nutzersicht | Bei jedem Push |
| `README.md` | Einrichtung und Bedienung für den Nutzer | Wenn sich Setup oder Bedienung ändert |

Regel für jede Sitzung: zuerst `docs/TASKS.md` lesen, am Ende `docs/TASKS.md` und `docs/CHANGELOG.md` aktualisieren. Neue Erkenntnisse über das System gehören in `docs/ARCHITECTURE.md` oder `docs/DECISIONS.md`, nicht nur in den Chat.

## Entwicklung

```bash
npm install
npm run dev          # Server (tsx watch) + Vite auf http://localhost:5173
npm run typecheck    # tsc für den Server, svelte-check für das Frontend
npm test             # node --test, Dateien server/src/**/*.test.ts
npm run build        # web/dist und server/dist
```

Lokaler Testlauf ohne echte KI: `AI_JOURNAL_FAKE_PROVIDER=1`, dazu `AI_JOURNAL_HOME` und `AI_JOURNAL_DIR` auf temporäre Ordner setzen, damit nichts Echtes angefasst wird. Browser-Test: `scripts/e2e.mjs` (braucht Playwright).

Vor jedem Push: `npm run typecheck && npm test && npm run build`.

## Grenzen

- Die KI schreibt nie in `entries/` oder `templates/` des Journals.
- Geheimnisse (PIN-Hash, API-Key, Token) nur in `~/.ai-journal/`, nie im Journal-Ordner, nie im Repo.
- `--bare` bei der Claude CLI nicht verwenden, es schaltet OAuth und Keychain ab (siehe DECISIONS).
- Keine neuen Abhängigkeiten ohne Eintrag in DECISIONS.
