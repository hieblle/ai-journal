import type { AppConfig } from "../config.js";
import { addDays, daysBetween, formatDayLong, fromDayKey, monthRange, monthsInQuarter, previousKey, quarterRange, toDayKey, weekKey, weekRange, isDayKey } from "../dates.js";
import type { Journal, ReportKind } from "../journal.js";
import type { AiProvider } from "../ai/provider.js";
import { createProvider } from "../ai/provider.js";
import { memoryUpdatePrompt, parseMemoryFiles, reportPrompt, systemPrompt, type ContextDoc } from "./prompts.js";

export interface GenerateResult {
  kind: ReportKind;
  key: string;
  content: string;
  memoryUpdated: string[];
  skipped?: string;
}

export function periodLabel(kind: ReportKind, key: string): string {
  switch (kind) {
    case "daily":
      return formatDayLong(key);
    case "weekly": {
      const { start, end } = weekRange(key);
      return `${key} (${fmt(start)} bis ${fmt(end)})`;
    }
    case "monthly": {
      const { start } = monthRange(key);
      const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
      return `${months[start.getMonth()]} ${start.getFullYear()}`;
    }
    case "quarterly": {
      const { start, end } = quarterRange(key);
      return `${key} (${fmt(start)} bis ${fmt(end)})`;
    }
  }
}

function fmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function validateKey(kind: ReportKind, key: string): void {
  const ok =
    (kind === "daily" && isDayKey(key)) ||
    (kind === "weekly" && /^\d{4}-W\d{2}$/.test(key)) ||
    (kind === "monthly" && /^\d{4}-\d{2}$/.test(key)) ||
    (kind === "quarterly" && /^\d{4}-Q[1-4]$/.test(key));
  if (!ok) throw new Error(`Ungültiger Zeitraum für ${kind}: ${key}`);
}

/** Collects the context documents for a report. Exported for tests and for the preview endpoint. */
export function collectContext(journal: Journal, kind: ReportKind, key: string) {
  validateKey(kind, key);
  const memory: ContextDoc[] = journal.memoryBundle().map((m) => ({ title: m.name, raw: m.raw }));
  let entries: ContextDoc[] = [];
  let previousReports: ContextDoc[] = [];
  let stats: string | undefined;

  if (kind === "daily") {
    const yesterday = toDayKey(addDays(fromDayKey(key), -1));
    entries = journal.entriesInRange([yesterday, key]).map((e) => ({ title: formatDayLong(e.date), raw: e.raw }));
    previousReports = journal.latestReports("daily", 1, key).map((r) => ({ title: `Tagesbericht ${r.key}`, raw: r.raw }));
  } else if (kind === "weekly") {
    const { start, end } = weekRange(key);
    const found = journal.entriesInRange(daysBetween(start, end));
    entries = found.map((e) => ({ title: formatDayLong(e.date), raw: e.raw }));
    previousReports = journal.latestReports("weekly", 3, key).map((r) => ({ title: `Wochenbericht ${r.key}`, raw: r.raw }));
    stats = scoreStats(journal, found.map((e) => e.date));
  } else if (kind === "monthly") {
    const { start, end } = monthRange(key);
    const weeks = new Set<string>();
    for (const d of daysBetween(start, end)) weeks.add(weekKey(fromDayKey(d)));
    entries = [...weeks]
      .sort()
      .map((w) => ({ w, raw: journal.readReport("weekly", w) }))
      .filter((x): x is { w: string; raw: string } => x.raw !== null)
      .map((x) => ({ title: `Wochenbericht ${x.w}`, raw: x.raw }));
    previousReports = journal.latestReports("monthly", 1, key).map((r) => ({ title: `Monatsbericht ${r.key}`, raw: r.raw }));
    const days = journal.entriesInRange(daysBetween(start, end)).map((e) => e.date);
    stats = scoreStats(journal, days);
  } else {
    entries = monthsInQuarter(key)
      .map((m) => ({ m, raw: journal.readReport("monthly", m) }))
      .filter((x): x is { m: string; raw: string } => x.raw !== null)
      .map((x) => ({ title: `Monatsbericht ${x.m}`, raw: x.raw }));
    previousReports = journal.latestReports("quarterly", 1, key).map((r) => ({ title: `Quartalsbericht ${r.key}`, raw: r.raw }));
  }
  return { memory, entries, previousReports, stats };
}

function scoreStats(journal: Journal, dates: string[]): string | undefined {
  const rows: string[] = [];
  const e: number[] = [];
  const f: number[] = [];
  for (const d of dates) {
    const m = journal.readEntry(d).meta;
    const en = typeof m.energy === "number" ? m.energy : null;
    const fo = typeof m.focus === "number" ? m.focus : null;
    if (en !== null) e.push(en);
    if (fo !== null) f.push(fo);
    if (en !== null || fo !== null) rows.push(`| ${d} | ${en ?? "–"} | ${fo ?? "–"} |`);
  }
  if (rows.length === 0) return undefined;
  const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "–");
  return `Energie und Fokus (1 bis 5), ${dates.length} Einträge:\n\n| Tag | Energie | Fokus |\n|---|---|---|\n${rows.join("\n")}\n\nDurchschnitt: Energie ${avg(e)}, Fokus ${avg(f)}`;
}

export interface GenerateOptions {
  provider?: AiProvider;
  /** If true, generate even when a report already exists. */
  force?: boolean;
  log?: (msg: string) => void;
}

export async function generateReport(journal: Journal, cfg: AppConfig, kind: ReportKind, key: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  validateKey(kind, key);
  const log = opts.log ?? (() => {});
  const existing = journal.readReport(kind, key);
  if (existing && !opts.force) return { kind, key, content: existing, memoryUpdated: [], skipped: "Bericht existiert bereits." };

  const ctx = collectContext(journal, kind, key);
  if (ctx.entries.length === 0) {
    return { kind, key, content: "", memoryUpdated: [], skipped: "Keine Einträge im Zeitraum, kein Bericht erzeugt." };
  }

  const provider = opts.provider ?? createProvider(cfg);
  const system = systemPrompt(journal.readPersona(), cfg.language);
  const label = periodLabel(kind, key);
  log(`Erzeuge ${kind} ${key} mit ${provider.label} (${ctx.entries.length} Dokumente, ${ctx.memory.length} Gedächtnisdateien)`);

  const report = await provider.generate({ system, prompt: reportPrompt({ kind, key, periodLabel: label, ...ctx }) });
  const stamped = `${report.trim()}\n\n---\n_Erzeugt am ${new Date().toISOString().slice(0, 16).replace("T", " ")} mit ${provider.label}._\n`;
  journal.writeReport(kind, key, stamped);

  // Memory update is a second, separate call: report quality first, bookkeeping second.
  const memoryUpdated: string[] = [];
  try {
    const answer = await provider.generate({ system, prompt: memoryUpdatePrompt({ kind, key, periodLabel: label, report, memory: ctx.memory }) });
    for (const f of parseMemoryFiles(answer)) {
      if (f.name.toLowerCase() === "readme.md") continue;
      journal.writeMemory(f.name, f.content);
      memoryUpdated.push(f.name);
    }
    log(`Gedächtnis aktualisiert: ${memoryUpdated.join(", ") || "keine Änderung"}`);
  } catch (err) {
    log(`Gedächtnis-Update fehlgeschlagen: ${(err as Error).message}`);
  }

  return { kind, key, content: stamped, memoryUpdated };
}

export { previousKey };
