import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fromDayKey, isDayKey, timeHHMM, today, type DayKey } from "./dates.js";

export type ReportKind = "daily" | "weekly" | "monthly" | "quarterly";
export const REPORT_KINDS: ReportKind[] = ["daily", "weekly", "monthly", "quarterly"];

export interface EntryMeta {
  date: DayKey;
  energy?: number | null;
  focus?: number | null;
  [key: string]: unknown;
}

export interface Entry {
  date: DayKey;
  meta: EntryMeta;
  body: string;
  exists: boolean;
}

export interface ReportInfo {
  kind: ReportKind;
  key: string;
  path: string;
  mtime: number;
}

const DEFAULT_TEMPLATE = `## Geschafft

## Hängt / hat Zeit gefressen

## Morgen

`;

export const DEFAULT_PERSONA = `# Persona

Du bist mein Gegenüber beim Journaling. Deine Haltung ist Radical Honesty nach Brad Blanton.

## Haltung

- Du sagst, was du wahrnimmst, nicht was höflich wäre. Keine Abschwächung, kein "vielleicht könntest du", kein Lob zum Aufwärmen.
- Du trennst sauber zwischen Beobachtung und Vermutung. Beobachtungen belegst du mit der Stelle im Text ("Du schreibst am Dienstag: …"). Vermutungen kennzeichnest du als solche ("Ich vermute …").
- Du benennst Vermeidung, Ausreden und Geschichten, die ich mir selbst erzähle, direkt. Auch wenn es unangenehm ist, gerade dann.
- Du fragst nach dem, was ich nicht geschrieben habe, wenn auffällt, dass ein Thema umschifft wird.
- Du stellst wenige, gute Fragen statt vieler. Maximal drei pro Bericht.
- Du duzt mich. Du schreibst Deutsch, klar und ohne Floskeln. Keine Einleitungen wie "Vielen Dank für deine Einträge".

## Grenzen

- Keine Diagnosen, keine psychologischen Fachbegriffe, keine Therapie-Sprache.
- Du bist kein Therapeut und sagst das auch, wenn es relevant wird.
- Bei Anzeichen einer echten Krise (Hoffnungslosigkeit, Gedanken an Selbstverletzung, akute Überforderung) weist du klar und ohne Weichspülen darauf hin, dass ich mir echte Hilfe holen soll, und nennst das als ersten Punkt.

## Fokus

- Persönliches ist der Kern: wie ich mit mir, mit anderen und mit meiner Zeit umgehe.
- Arbeit und Effektivität sind ein Themenfeld unter anderen, nicht das Raster, durch das alles gelesen wird.
- Du verwechselst "produktiv" nicht mit "gut".
`;

export const MEMORY_README = `# Gedächtnis

Dieser Ordner ist das Langzeitgedächtnis der KI. Sie legt hier Dateien an und pflegt sie nach jedem Bericht:

- \`themen.md\`: offene und erledigte Themen mit erstem/letztem Auftreten und Status
- \`muster.md\`: wiederkehrende Verhaltensmuster
- \`ziele.md\`: erklärte Ziele und Vorhaben
- \`fragen.md\`: offene Fragen, die noch keine Antwort haben

Du kannst alles hier lesen und ändern. Was du änderst, gilt beim nächsten Bericht.
`;

const INITIAL_THEMEN = `# Themen

| Thema | Erstes Auftreten | Letztes Auftreten | Wochen | Status | Notiz |
|---|---|---|---|---|---|
`;

export class Journal {
  constructor(public readonly root: string) {}

  // ---- layout -------------------------------------------------------------

  get entriesDir() { return path.join(this.root, "entries"); }
  get templatesDir() { return path.join(this.root, "templates"); }
  get audioDir() { return path.join(this.root, "audio"); }
  get aiDir() { return path.join(this.root, "ai"); }
  get reportsDir() { return path.join(this.aiDir, "reports"); }
  get memoryDir() { return path.join(this.aiDir, "memory"); }
  get personaPath() { return path.join(this.aiDir, "persona.md"); }

  init(): void {
    for (const d of [this.entriesDir, this.templatesDir, this.audioDir, this.memoryDir, ...REPORT_KINDS.map((k) => path.join(this.reportsDir, k))]) {
      fs.mkdirSync(d, { recursive: true });
    }
    const std = path.join(this.templatesDir, "standard.md");
    if (!fs.existsSync(std)) fs.writeFileSync(std, DEFAULT_TEMPLATE);
    if (!fs.existsSync(this.personaPath)) fs.writeFileSync(this.personaPath, DEFAULT_PERSONA);
    const readme = path.join(this.memoryDir, "README.md");
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, MEMORY_README);
    const themen = path.join(this.memoryDir, "themen.md");
    if (!fs.existsSync(themen)) fs.writeFileSync(themen, INITIAL_THEMEN);
  }

  // ---- entries ------------------------------------------------------------

  entryPath(date: DayKey): string {
    if (!isDayKey(date)) throw new Error(`Ungültiges Datum: ${date}`);
    return path.join(this.entriesDir, date.slice(0, 4), `${date}.md`);
  }

  readEntry(date: DayKey): Entry {
    const p = this.entryPath(date);
    if (!fs.existsSync(p)) return { date, meta: { date }, body: "", exists: false };
    const raw = fs.readFileSync(p, "utf8");
    const parsed = matter(raw);
    const meta = { ...(parsed.data as Record<string, unknown>), date } as EntryMeta;
    return { date, meta, body: parsed.content.replace(/^\n/, ""), exists: true };
  }

  /** Full raw markdown (frontmatter + body) for AI context. */
  readEntryRaw(date: DayKey): string | null {
    const p = this.entryPath(date);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  writeEntry(date: DayKey, body: string, meta: Partial<EntryMeta> = {}): Entry {
    const existing = this.readEntry(date);
    const merged: EntryMeta = { ...existing.meta, ...meta, date };
    for (const k of ["energy", "focus"] as const) {
      const v = merged[k];
      if (v === null || v === undefined || (v as unknown) === "") delete merged[k];
      else merged[k] = clampScore(v);
    }
    const { date: _d, ...front } = merged;
    const content = matter
      .stringify(body.endsWith("\n") ? body : body + "\n", { date, ...front })
      .replace(/^date: '(\d{4}-\d{2}-\d{2})'$/m, "date: $1");
    atomicWrite(this.entryPath(date), content);
    return this.readEntry(date);
  }

  /** Creates today's entry from the template if it does not exist yet. */
  ensureEntry(date: DayKey, templateName: string): Entry {
    const e = this.readEntry(date);
    if (e.exists) return e;
    const tpl = this.readTemplate(templateName) ?? this.readTemplate("standard") ?? "";
    return this.writeEntry(date, tpl);
  }

  appendQuickNote(text: string, date: DayKey = today(), templateName = "standard"): Entry {
    const trimmed = text.trim();
    if (!trimmed) return this.readEntry(date);
    const e = this.ensureEntry(date, templateName);
    const sep = e.body.trim() === "" ? "" : e.body.endsWith("\n\n") ? "" : e.body.endsWith("\n") ? "\n" : "\n\n";
    const body = `${e.body}${sep}**${timeHHMM()}** ${trimmed}\n`;
    return this.writeEntry(date, body, e.meta);
  }

  listEntryDates(): DayKey[] {
    if (!fs.existsSync(this.entriesDir)) return [];
    const out: DayKey[] = [];
    for (const year of fs.readdirSync(this.entriesDir)) {
      const dir = path.join(this.entriesDir, year);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        const key = f.replace(/\.md$/, "");
        if (f.endsWith(".md") && isDayKey(key)) out.push(key);
      }
    }
    return out.sort().reverse();
  }

  entriesInRange(dates: DayKey[]): { date: DayKey; raw: string }[] {
    const out: { date: DayKey; raw: string }[] = [];
    for (const d of dates) {
      const raw = this.readEntryRaw(d);
      if (raw !== null && raw.trim() !== "") out.push({ date: d, raw });
    }
    return out;
  }

  // ---- templates ----------------------------------------------------------

  listTemplates(): string[] {
    if (!fs.existsSync(this.templatesDir)) return [];
    return fs.readdirSync(this.templatesDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();
  }

  readTemplate(name: string): string | null {
    const p = path.join(this.templatesDir, safeName(name) + ".md");
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  writeTemplate(name: string, content: string): void {
    atomicWrite(path.join(this.templatesDir, safeName(name) + ".md"), content);
  }

  deleteTemplate(name: string): void {
    const n = safeName(name);
    if (n === "standard") throw new Error("Das Standard-Template kann nicht gelöscht werden.");
    const p = path.join(this.templatesDir, n + ".md");
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // ---- reports ------------------------------------------------------------

  reportPath(kind: ReportKind, key: string): string {
    assertKind(kind);
    return path.join(this.reportsDir, kind, safeName(key) + ".md");
  }

  readReport(kind: ReportKind, key: string): string | null {
    const p = this.reportPath(kind, key);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  writeReport(kind: ReportKind, key: string, content: string): void {
    atomicWrite(this.reportPath(kind, key), content);
  }

  listReports(kind?: ReportKind): ReportInfo[] {
    const kinds = kind ? [kind] : REPORT_KINDS;
    const out: ReportInfo[] = [];
    for (const k of kinds) {
      const dir = path.join(this.reportsDir, k);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".md")) continue;
        const p = path.join(dir, f);
        out.push({ kind: k, key: f.replace(/\.md$/, ""), path: p, mtime: fs.statSync(p).mtimeMs });
      }
    }
    return out.sort((a, b) => b.key.localeCompare(a.key));
  }

  /** Latest N reports of a kind, newest first, as raw markdown. */
  latestReports(kind: ReportKind, n: number, beforeKey?: string): { key: string; raw: string }[] {
    return this.listReports(kind)
      .filter((r) => !beforeKey || r.key < beforeKey)
      .slice(0, n)
      .map((r) => ({ key: r.key, raw: fs.readFileSync(r.path, "utf8") }));
  }

  // ---- memory & persona ---------------------------------------------------

  listMemory(): string[] {
    if (!fs.existsSync(this.memoryDir)) return [];
    return fs.readdirSync(this.memoryDir).filter((f) => f.endsWith(".md")).sort();
  }

  readMemory(name: string): string | null {
    const p = path.join(this.memoryDir, safeName(name.replace(/\.md$/, "")) + ".md");
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  writeMemory(name: string, content: string): void {
    atomicWrite(path.join(this.memoryDir, safeName(name.replace(/\.md$/, "")) + ".md"), content);
  }

  /** All memory files concatenated for AI context (README excluded). */
  memoryBundle(): { name: string; raw: string }[] {
    return this.listMemory()
      .filter((f) => f.toLowerCase() !== "readme.md")
      .map((f) => ({ name: f, raw: fs.readFileSync(path.join(this.memoryDir, f), "utf8") }));
  }

  readPersona(): string {
    return fs.existsSync(this.personaPath) ? fs.readFileSync(this.personaPath, "utf8") : DEFAULT_PERSONA;
  }

  writePersona(content: string): void {
    atomicWrite(this.personaPath, content);
  }

  // ---- search -------------------------------------------------------------

  search(query: string, limit = 50): { type: "entry" | "report"; key: string; kind?: ReportKind; snippet: string }[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: { type: "entry" | "report"; key: string; kind?: ReportKind; snippet: string }[] = [];
    const scan = (raw: string): string | null => {
      const idx = raw.toLowerCase().indexOf(q);
      if (idx < 0) return null;
      const start = Math.max(0, idx - 60);
      const end = Math.min(raw.length, idx + q.length + 80);
      return (start > 0 ? "…" : "") + raw.slice(start, end).replace(/\s+/g, " ") + (end < raw.length ? "…" : "");
    };
    for (const d of this.listEntryDates()) {
      const s = scan(this.readEntry(d).body);
      if (s) results.push({ type: "entry", key: d, snippet: s });
      if (results.length >= limit) return results;
    }
    for (const r of this.listReports()) {
      const s = scan(fs.readFileSync(r.path, "utf8"));
      if (s) results.push({ type: "report", key: r.key, kind: r.kind, snippet: s });
      if (results.length >= limit) break;
    }
    return results;
  }
}

// ---- helpers ----------------------------------------------------------------

export function safeName(name: string): string {
  const n = name.trim();
  if (!n || n.includes("/") || n.includes("\\") || n.includes("..") || n.startsWith(".")) {
    throw new Error(`Ungültiger Name: ${name}`);
  }
  return n;
}

function assertKind(kind: string): asserts kind is ReportKind {
  if (!REPORT_KINDS.includes(kind as ReportKind)) throw new Error(`Unbekannte Berichtsart: ${kind}`);
}

function clampScore(v: unknown): number {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) throw new Error("Wert muss eine Zahl von 1 bis 5 sein.");
  return Math.min(5, Math.max(1, n));
}

/** Write via temp file + rename so OneDrive/Obsidian never see a half-written file. */
export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, file);
}

export { fromDayKey };
