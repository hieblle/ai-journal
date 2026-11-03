/** Date helpers, all in server local time. Day keys are "YYYY-MM-DD". */

export type DayKey = string;

export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key: DayKey): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Ungültiges Datum: ${key}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isDayKey(s: unknown): s is DayKey {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromDayKey(s).getTime());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function today(): DayKey {
  return toDayKey(new Date());
}

export function timeHHMM(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO 8601 week: returns { year, week } where year is the ISO week-year. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7; // Mo=1 .. So=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekKey(d: Date): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

/** Monday of the ISO week that contains d. */
export function startOfIsoWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - (day - 1));
  return r;
}

export function weekRange(key: string): { start: Date; end: Date } {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Ungültige Woche: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO: week 1 contains Jan 4th
  const jan4 = new Date(year, 0, 4);
  const start = startOfIsoWeek(jan4);
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = addDays(start, 6);
  return { start, end };
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthRange(key: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Ungültiger Monat: ${key}`);
  const start = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const end = new Date(Number(m[1]), Number(m[2]), 0);
  return { start, end };
}

export function quarterKey(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function quarterRange(key: string): { start: Date; end: Date } {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!m) throw new Error(`Ungültiges Quartal: ${key}`);
  const q = Number(m[2]);
  const start = new Date(Number(m[1]), (q - 1) * 3, 1);
  const end = new Date(Number(m[1]), q * 3, 0);
  return { start, end };
}

export function monthsInQuarter(key: string): string[] {
  const { start } = quarterRange(key);
  return [0, 1, 2].map((i) => monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1)));
}

export function daysBetween(start: Date, end: Date): DayKey[] {
  const out: DayKey[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(toDayKey(d));
  return out;
}

/** Previous period key for each kind. */
export function previousKey(kind: "weekly" | "monthly" | "quarterly", key: string): string {
  if (kind === "weekly") return weekKey(addDays(weekRange(key).start, -1));
  if (kind === "monthly") return monthKey(addDays(monthRange(key).start, -1));
  return quarterKey(addDays(quarterRange(key).start, -1));
}

export function formatDayLong(key: DayKey): string {
  const d = fromDayKey(key);
  const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return `${weekdays[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
