import fs from "node:fs";
import type { AppConfig } from "./config.js";
import { STATE_PATH, HOME_DIR } from "./config.js";
import { addDays, monthKey, quarterKey, toDayKey, weekKey, weekRange, monthRange, quarterRange } from "./dates.js";
import type { Journal, ReportKind } from "./journal.js";
import { REPORT_KINDS } from "./journal.js";
import { generateReport } from "./reports/generate.js";

export interface SchedulerState {
  /** Last period key generated (or attempted) per kind. */
  lastDone: Partial<Record<ReportKind, string>>;
  /** Report keys the user has not opened yet. */
  unread: string[]; // "kind/key"
  lastError: { kind: ReportKind; key: string; message: string; at: string } | null;
}

export interface JobStatus {
  running: { kind: ReportKind; key: string; startedAt: string } | null;
  log: string[];
}

function loadState(): SchedulerState {
  try {
    if (fs.existsSync(STATE_PATH)) return { lastDone: {}, unread: [], lastError: null, ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
  } catch {
    /* fall through */
  }
  return { lastDone: {}, unread: [], lastError: null };
}

function saveState(s: SchedulerState): void {
  fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE_PATH + ".tmp", JSON.stringify(s, null, 2));
  fs.renameSync(STATE_PATH + ".tmp", STATE_PATH);
}

/**
 * Which period of each kind is "due" right now: the most recent period whose
 * end plus the configured time of day has passed. Only the latest one is
 * returned, so a long pause does not trigger a backlog of stale reports.
 */
export function duePeriod(kind: ReportKind, cfg: AppConfig, now = new Date()): string | null {
  const s = cfg.schedule[kind];
  if (!s.enabled) return null;
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.hour, s.minute);

  if (kind === "daily") {
    // Daily report for day D is due at D hour:minute.
    for (let i = 0; i < 2; i++) {
      const d = addDays(now, -i);
      if (at(d) <= now) return toDayKey(d);
    }
    return null;
  }
  if (kind === "weekly") {
    // Weekly report for ISO week W is due on the configured weekday at hour:minute,
    // where the weekday is in or right after that week (Sunday = last day of the week).
    // Trigger on Saturday/Sunday reports the week that is ending; Monday to Friday reports the previous week.
    const wd = cfg.schedule.weekly.weekday;
    for (let i = 0; i < 8; i++) {
      const d = addDays(now, -i);
      if (d.getDay() !== wd || at(d) > now) continue;
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      return weekKey(weekend ? d : addDays(d, -7));
    }
    return null;
  }
  if (kind === "monthly") {
    // Due on the 1st of the following month at hour:minute.
    const first = new Date(now.getFullYear(), now.getMonth(), 1, s.hour, s.minute);
    const prev = addDays(new Date(now.getFullYear(), now.getMonth(), 1), -1);
    if (first <= now) return monthKey(prev);
    const prevPrev = addDays(monthRange(monthKey(prev)).start, -1);
    return monthKey(prevPrev);
  }
  // quarterly: due on the 1st day of the next quarter at hour:minute
  const qStart = quarterRange(quarterKey(now)).start;
  const trigger = new Date(qStart.getFullYear(), qStart.getMonth(), 1, s.hour, s.minute);
  const prevQ = quarterKey(addDays(qStart, -1));
  if (trigger <= now) return prevQ;
  return quarterKey(addDays(quarterRange(prevQ).start, -1));
}

export class Scheduler {
  state: SchedulerState = loadState();
  status: JobStatus = { running: null, log: [] };
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private journal: () => Journal, private cfg: () => AppConfig) {}

  start(): void {
    this.stop();
    // First check shortly after start (catch-up), then hourly.
    setTimeout(() => void this.tick(), 5_000);
    this.timer = setInterval(() => void this.tick(), 60 * 60 * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  log(msg: string): void {
    const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
    console.log(`[scheduler] ${msg}`);
    this.status.log.push(line);
    if (this.status.log.length > 200) this.status.log.shift();
  }

  async tick(): Promise<void> {
    const cfg = this.cfg();
    for (const kind of REPORT_KINDS) {
      const key = duePeriod(kind, cfg);
      if (!key) continue;
      if (this.state.lastDone[kind] === key) continue;
      if (this.journal().readReport(kind, key)) {
        this.state.lastDone[kind] = key;
        saveState(this.state);
        continue;
      }
      await this.enqueue(kind, key, false);
    }
  }

  /** Runs generation serially; manual and scheduled calls share one queue. */
  enqueue(kind: ReportKind, key: string, force: boolean): Promise<{ ok: boolean; message: string }> {
    const run = async () => {
      this.status.running = { kind, key, startedAt: new Date().toISOString() };
      try {
        const res = await generateReport(this.journal(), this.cfg(), kind, key, { force, log: (m) => this.log(m) });
        this.state.lastDone[kind] = key;
        if (!res.skipped) {
          const id = `${kind}/${key}`;
          if (!this.state.unread.includes(id)) this.state.unread.push(id);
          this.state.lastError = null;
        }
        saveState(this.state);
        this.log(res.skipped ? `${kind} ${key}: ${res.skipped}` : `${kind} ${key}: fertig`);
        return { ok: true, message: res.skipped ?? "Bericht erzeugt." };
      } catch (err) {
        const message = (err as Error).message;
        this.state.lastDone[kind] = key; // do not retry every hour; the user can trigger manually
        this.state.lastError = { kind, key, message, at: new Date().toISOString() };
        saveState(this.state);
        this.log(`${kind} ${key}: FEHLER ${message}`);
        return { ok: false, message };
      } finally {
        this.status.running = null;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  markRead(kind: ReportKind, key: string): void {
    const id = `${kind}/${key}`;
    const i = this.state.unread.indexOf(id);
    if (i >= 0) {
      this.state.unread.splice(i, 1);
      saveState(this.state);
    }
  }
}
