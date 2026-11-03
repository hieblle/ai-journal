import type { ReportKind } from "../journal.js";

export interface ContextDoc {
  title: string;
  raw: string;
}

const KIND_LABEL: Record<ReportKind, string> = {
  daily: "Tagesbericht",
  weekly: "Wochenbericht",
  monthly: "Monatsbericht",
  quarterly: "Quartalsbericht",
};

export function kindLabel(kind: ReportKind): string {
  return KIND_LABEL[kind];
}

export function systemPrompt(persona: string, language: string): string {
  const lang = language === "de" ? "Deutsch" : language;
  return `${persona.trim()}

## Technische Regeln

- Antworte ausschließlich in ${lang}.
- Antworte nur mit dem fertigen Bericht in Markdown, ohne Vorrede, ohne Code-Zaun um den ganzen Text.
- Beziehe dich auf konkrete Stellen in den Einträgen (Datum nennen).
- Erfinde nichts. Wenn die Einträge zu einer Frage nichts hergeben, sag das.
- Alle Dateien im Abschnitt "Gedächtnis" sind dein eigenes Langzeitgedächtnis aus früheren Berichten. Nutze sie, um Wiederholungen und Entwicklungen über die Zeit zu erkennen.`;
}

function section(title: string, docs: ContextDoc[], emptyNote: string): string {
  if (docs.length === 0) return `# ${title}\n\n_${emptyNote}_\n`;
  return `# ${title}\n\n` + docs.map((d) => `## ${d.title}\n\n${d.raw.trim()}\n`).join("\n");
}

export interface ReportPromptInput {
  kind: ReportKind;
  key: string;
  periodLabel: string;
  entries: ContextDoc[];
  previousReports: ContextDoc[];
  memory: ContextDoc[];
  stats?: string;
}

export function reportPrompt(input: ReportPromptInput): string {
  const parts: string[] = [];
  parts.push(section("Gedächtnis", input.memory, "Noch leer, das ist der erste Bericht."));
  if (input.kind === "daily" || input.kind === "weekly") {
    parts.push(section("Einträge", input.entries, "Keine Einträge in diesem Zeitraum."));
  } else {
    parts.push(section(input.kind === "monthly" ? "Wochenberichte des Monats" : "Monatsberichte des Quartals", input.entries, "Keine Berichte in diesem Zeitraum."));
  }
  parts.push(section("Frühere Berichte", input.previousReports, "Keine früheren Berichte."));
  if (input.stats) parts.push(`# Zahlen\n\n${input.stats}\n`);
  parts.push(`# Aufgabe\n\n${task(input)}`);
  return parts.join("\n\n");
}

function task(input: ReportPromptInput): string {
  const head = `Schreibe den ${kindLabel(input.kind)} für ${input.periodLabel}. Überschrift: \`# ${kindLabel(input.kind)} ${input.periodLabel}\`.`;
  switch (input.kind) {
    case "daily":
      return `${head}

Maximal fünf Zeilen, keine Abschnitte. Inhalt:
1. Eine Beobachtung zum heutigen Eintrag, mit Beleg.
2. Falls gestern etwas offen war, das heute nicht mehr vorkommt: kurz benennen.
3. Genau eine Frage für morgen.

Kein Fazit, kein Rat, keine Liste von Vorschlägen. Das ist eine kurze Notiz, kein Bericht.`;
    case "weekly":
      return `${head}

Abschnitte, in dieser Reihenfolge, jeweils kurz und konkret:

## Was ich wahrnehme
Die zwei bis vier auffälligsten Dinge dieser Woche, mit Beleg (Datum, Zitat oder Paraphrase).

## Was sich wiederholt
Themen, die diese Woche und in früheren Wochen oder im Gedächtnis auftauchen und noch nicht gelöst sind. Nenne, seit wann und wie oft. Wenn etwas zum dritten Mal oder öfter offen ist, sag das deutlich.

## Was ich vermute
Deutungen und Blindspots, klar als Vermutung gekennzeichnet. Was wird umschifft, was wird nicht geschrieben?

## Vorschläge
Höchstens drei, konkret und klein genug, um sie nächste Woche umzusetzen.

## Nicht vergessen
Dinge aus den Einträgen, die ich mir vorgenommen oder versprochen habe und die sonst untergehen.

## Fragen
Höchstens drei Fragen, die ich mir stellen sollte. Keine rhetorischen.`;
    case "monthly":
      return `${head}

Grundlage sind die Wochenberichte des Monats und das Gedächtnis, nicht die Rohtexte. Abschnitte:

## Der Monat in kurz
Fünf bis acht Sätze.

## Gelöst, verschoben, offen
Was wurde in diesem Monat tatsächlich abgeschlossen? Was wurde nur verschoben? Was ist weiter offen und seit wann?

## Energie und Fokus
Entwicklung über die Wochen, falls Zahlen vorliegen. Zusammenhänge mit Ereignissen, falls erkennbar.

## Kläranlage (Blick auf den Vormonat)
Was war vor vier Wochen dringend und ist heute belanglos? Was hat sich von selbst erledigt? Was hängt immer noch und braucht eine Entscheidung statt weiteres Grübeln?

## Vergleich zum Vormonat
Falls ein früherer Monatsbericht vorliegt: was ist besser, was schlechter, was gleich.

## Fragen
Höchstens drei.`;
    case "quarterly":
      return `${head}

Grundlage sind die Monatsberichte des Quartals und das Gedächtnis. Das ist die Gedankenkläranlage mit drei Monaten Abstand. Abschnitte:

## Was war wichtig und ist weg
Themen, die vor drei Monaten groß waren und heute nicht mehr vorkommen. Was sagt das?

## Was zieht sich durch
Themen, die das ganze Quartal über offen waren. Nenne jedes beim Namen und seit wann es im Gedächtnis steht.

## Was sich geklärt hat
Entwicklungen, die ich vermutlich selbst nicht bemerkt habe.

## Was eine Entscheidung braucht
Dinge, bei denen weiteres Nachdenken nichts mehr bringt. Formuliere die Entscheidung, die ansteht, als Frage mit zwei bis drei konkreten Optionen.

## Das Quartal in drei Sätzen

## Fragen
Höchstens drei.`;
  }
}

export function memoryUpdatePrompt(input: { kind: ReportKind; key: string; periodLabel: string; report: string; memory: ContextDoc[] }): string {
  const files = input.memory.length
    ? input.memory.map((d) => `=== DATEI: ${d.title} ===\n${d.raw.trim()}\n=== ENDE ===`).join("\n\n")
    : "_Noch keine Dateien._";
  return `# Aktuelles Gedächtnis

${files}

# Neuer ${kindLabel(input.kind)} ${input.periodLabel}

${input.report.trim()}

# Aufgabe

Aktualisiere dein Gedächtnis anhand des neuen Berichts. Regeln:

- Gib jede Datei, die sich ändert oder neu ist, vollständig aus, im Format:
  === DATEI: name.md ===
  (kompletter Inhalt)
  === ENDE ===
- Dateien, die sich nicht ändern, lässt du weg.
- Dateinamen: nur Kleinbuchstaben, Ziffern, Bindestrich, Endung .md. Vorgesehen sind themen.md (Tabelle mit Thema, erstes Auftreten, letztes Auftreten, Anzahl Zeiträume, Status, Notiz), muster.md, ziele.md, fragen.md. Du darfst weitere anlegen, wenn es nötig ist.
- Status in themen.md: offen, in Arbeit, gelöst, verworfen. Gelöste Themen bleiben als gelöst stehen, mit Datum.
- Halte die Dateien knapp. Das Gedächtnis ist eine Zusammenfassung, kein Archiv. Keine Zitate, nur Essenz und Zeitangaben.
- Keine Erklärungen außerhalb der Dateiblöcke. Wenn sich nichts ändert, antworte nur mit: KEINE ÄNDERUNG`;
}

/** Parses "=== DATEI: x.md === ... === ENDE ===" blocks. */
export function parseMemoryFiles(text: string): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  const re = /===\s*DATEI:\s*([a-z0-9][a-z0-9-]*\.md)\s*===\s*\n([\s\S]*?)\n?===\s*ENDE\s*===/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ name: m[1], content: m[2].trim() + "\n" });
  }
  return out;
}
