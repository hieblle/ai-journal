import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { hashPin, LoginGuard, Sessions, validPinFormat, verifyPin } from "./auth.js";
import { applyConfigPatch, publicConfig, saveConfig, type AppConfig, type ProviderKind } from "./config.js";
import { isDayKey, today, weekKey, monthKey, quarterKey, addDays, toDayKey } from "./dates.js";
import { Journal, REPORT_KINDS, type ReportKind } from "./journal.js";
import { createProvider } from "./ai/provider.js";
import { collectContext, periodLabel, validateKey } from "./reports/generate.js";
import { duePeriod, Scheduler } from "./scheduler.js";

export interface AppContext {
  cfg: AppConfig;
  journal: Journal;
  sessions: Sessions;
  guard: LoginGuard;
  scheduler: Scheduler;
  /** Replaces config + journal after settings change. */
  reload(next: AppConfig): void;
}

const COOKIE = "aij_session";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function bad(msg: string): never {
  throw new HttpError(400, msg);
}

function asKind(v: unknown): ReportKind {
  if (typeof v !== "string" || !REPORT_KINDS.includes(v as ReportKind)) bad("Unbekannte Berichtsart.");
  return v as ReportKind;
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    const status = err instanceof HttpError ? err.status : e.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ error: e.message || "Unbekannter Fehler" });
  });

  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { path: "/", httpOnly: true, sameSite: "strict", secure: "auto", maxAge: 60 * 60 * 24 * 30 });

  // ---- auth (public) -------------------------------------------------------

  app.get("/api/auth/status", async (req, reply) => {
    const token = ctx.sessions.verify(req.cookies[COOKIE]);
    if (token) setCookie(reply, token);
    return { pinSet: Boolean(ctx.cfg.pinHash), authenticated: Boolean(token) || !ctx.cfg.pinHash, lockAfterMinutes: ctx.cfg.lockAfterMinutes };
  });

  app.post<{ Body: { pin?: string } }>("/api/auth/setup", async (req, reply) => {
    if (ctx.cfg.pinHash) throw new HttpError(409, "PIN ist bereits gesetzt.");
    const pin = req.body?.pin;
    if (!validPinFormat(pin)) bad("PIN muss aus 4 bis 12 Ziffern bestehen.");
    ctx.reload({ ...ctx.cfg, pinHash: hashPin(pin) });
    setCookie(reply, ctx.sessions.issue());
    return { ok: true };
  });

  app.post<{ Body: { pin?: string } }>("/api/auth/login", async (req, reply) => {
    const g = ctx.guard.check();
    if (!g.ok) throw new HttpError(429, `Zu viele Fehlversuche. Warte ${g.retryAfterSec} Sekunden.`);
    const pin = req.body?.pin;
    if (!validPinFormat(pin) || !verifyPin(pin, ctx.cfg.pinHash)) {
      const wait = ctx.guard.fail();
      throw new HttpError(401, wait ? `Falsche PIN. Nächster Versuch in ${wait} Sekunden.` : "Falsche PIN.");
    }
    ctx.guard.success();
    setCookie(reply, ctx.sessions.issue());
    return { ok: true };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  // ---- auth guard for everything else ---------------------------------------

  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/auth/")) return;
    if (!ctx.cfg.pinHash) return; // not set up yet: allow, UI forces setup first
    const token = ctx.sessions.verify(req.cookies[COOKIE]);
    if (!token) throw new HttpError(401, "Nicht angemeldet.");
    setCookie(reply, token);
  });

  app.post<{ Body: { oldPin?: string; pin?: string } }>("/api/auth/change", async (req) => {
    const { oldPin, pin } = req.body ?? {};
    if (ctx.cfg.pinHash && (!validPinFormat(oldPin) || !verifyPin(oldPin, ctx.cfg.pinHash))) throw new HttpError(401, "Alte PIN ist falsch.");
    if (!validPinFormat(pin)) bad("PIN muss aus 4 bis 12 Ziffern bestehen.");
    ctx.reload({ ...ctx.cfg, pinHash: hashPin(pin) });
    return { ok: true };
  });

  // ---- overview ------------------------------------------------------------

  app.get("/api/overview", async () => {
    const dates = ctx.journal.listEntryDates();
    const now = new Date();
    return {
      today: today(),
      dates,
      templates: ctx.journal.listTemplates(),
      defaultTemplate: ctx.cfg.defaultTemplate,
      unread: ctx.scheduler.state.unread,
      lastError: ctx.scheduler.state.lastError,
      running: ctx.scheduler.status.running,
      provider: ctx.cfg.provider,
      current: { daily: toDayKey(addDays(now, -1)), weekly: weekKey(now), monthly: monthKey(now), quarterly: quarterKey(now) },
      due: Object.fromEntries(REPORT_KINDS.map((k) => [k, duePeriod(k, ctx.cfg, now)])),
    };
  });

  // ---- entries -------------------------------------------------------------

  app.get<{ Params: { date: string }; Querystring: { create?: string; template?: string } }>("/api/entries/:date", async (req) => {
    const { date } = req.params;
    if (!isDayKey(date)) bad("Ungültiges Datum.");
    if (req.query.create === "1") return ctx.journal.ensureEntry(date, req.query.template || ctx.cfg.defaultTemplate);
    return ctx.journal.readEntry(date);
  });

  app.put<{ Params: { date: string }; Body: { body?: string; meta?: Record<string, unknown> } }>("/api/entries/:date", async (req) => {
    const { date } = req.params;
    if (!isDayKey(date)) bad("Ungültiges Datum.");
    const body = typeof req.body?.body === "string" ? req.body.body : ctx.journal.readEntry(date).body;
    return ctx.journal.writeEntry(date, body, (req.body?.meta ?? {}) as Record<string, unknown>);
  });

  app.post<{ Body: { text?: string; date?: string } }>("/api/quicknote", async (req) => {
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim()) bad("Text fehlt.");
    const date = req.body?.date && isDayKey(req.body.date) ? req.body.date : today();
    return ctx.journal.appendQuickNote(text, date, ctx.cfg.defaultTemplate);
  });

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => ({ results: ctx.journal.search(req.query.q ?? "") }));

  // ---- templates -----------------------------------------------------------

  app.get("/api/templates", async () => ({
    templates: ctx.journal.listTemplates().map((name) => ({ name, content: ctx.journal.readTemplate(name) ?? "" })),
    defaultTemplate: ctx.cfg.defaultTemplate,
  }));

  app.put<{ Params: { name: string }; Body: { content?: string } }>("/api/templates/:name", async (req) => {
    if (typeof req.body?.content !== "string") bad("Inhalt fehlt.");
    ctx.journal.writeTemplate(req.params.name, req.body.content);
    return { ok: true };
  });

  app.delete<{ Params: { name: string } }>("/api/templates/:name", async (req) => {
    ctx.journal.deleteTemplate(req.params.name);
    if (ctx.cfg.defaultTemplate === req.params.name) ctx.reload({ ...ctx.cfg, defaultTemplate: "standard" });
    return { ok: true };
  });

  // ---- reports -------------------------------------------------------------

  app.get("/api/reports", async () => ({
    reports: ctx.journal.listReports().map((r) => ({ kind: r.kind, key: r.key, mtime: r.mtime, label: periodLabel(r.kind, r.key), unread: ctx.scheduler.state.unread.includes(`${r.kind}/${r.key}`) })),
  }));

  app.get<{ Params: { kind: string; key: string } }>("/api/reports/:kind/:key", async (req) => {
    const kind = asKind(req.params.kind);
    const content = ctx.journal.readReport(kind, req.params.key);
    if (content === null) throw new HttpError(404, "Bericht nicht gefunden.");
    ctx.scheduler.markRead(kind, req.params.key);
    return { kind, key: req.params.key, label: periodLabel(kind, req.params.key), content };
  });

  app.put<{ Params: { kind: string; key: string }; Body: { content?: string } }>("/api/reports/:kind/:key", async (req) => {
    const kind = asKind(req.params.kind);
    if (typeof req.body?.content !== "string") bad("Inhalt fehlt.");
    validateKey(kind, req.params.key);
    ctx.journal.writeReport(kind, req.params.key, req.body.content);
    return { ok: true };
  });

  app.post<{ Params: { kind: string; key: string }; Body: { force?: boolean } }>("/api/reports/:kind/:key/generate", async (req) => {
    const kind = asKind(req.params.kind);
    validateKey(kind, req.params.key);
    if (ctx.scheduler.status.running) throw new HttpError(409, `Es läuft bereits ${ctx.scheduler.status.running.kind} ${ctx.scheduler.status.running.key}.`);
    // Fire and forget; the UI polls /api/reports/status.
    void ctx.scheduler.enqueue(kind, req.params.key, Boolean(req.body?.force));
    return { ok: true, started: true };
  });

  app.get<{ Params: { kind: string; key: string } }>("/api/reports/:kind/:key/context", async (req) => {
    const kind = asKind(req.params.kind);
    const c = collectContext(ctx.journal, kind, req.params.key);
    return { kind, key: req.params.key, label: periodLabel(kind, req.params.key), entries: c.entries.map((e) => e.title), previousReports: c.previousReports.map((e) => e.title), memory: c.memory.map((m) => m.title), stats: c.stats ?? null };
  });

  app.get("/api/reports/status", async () => ({ running: ctx.scheduler.status.running, log: ctx.scheduler.status.log.slice(-50), lastError: ctx.scheduler.state.lastError, unread: ctx.scheduler.state.unread }));

  // ---- memory & persona ----------------------------------------------------

  app.get("/api/memory", async () => ({ files: ctx.journal.listMemory().map((name) => ({ name, content: ctx.journal.readMemory(name) ?? "" })) }));

  app.put<{ Params: { name: string }; Body: { content?: string } }>("/api/memory/:name", async (req) => {
    if (typeof req.body?.content !== "string") bad("Inhalt fehlt.");
    ctx.journal.writeMemory(req.params.name, req.body.content);
    return { ok: true };
  });

  app.get("/api/persona", async () => ({ content: ctx.journal.readPersona() }));
  app.put<{ Body: { content?: string } }>("/api/persona", async (req) => {
    if (typeof req.body?.content !== "string") bad("Inhalt fehlt.");
    ctx.journal.writePersona(req.body.content);
    return { ok: true };
  });

  // ---- settings ------------------------------------------------------------

  app.get("/api/settings", async () => publicConfig(ctx.cfg));

  app.put<{ Body: Partial<AppConfig> }>("/api/settings", async (req) => {
    const patch = { ...(req.body ?? {}) } as Partial<AppConfig> & { providers?: AppConfig["providers"] };
    // Masked secrets from the UI mean "unchanged".
    const key = patch.providers?.["claude-api"]?.apiKey;
    if (typeof key === "string" && key.startsWith("••••")) {
      patch.providers!["claude-api"] = { ...patch.providers!["claude-api"], apiKey: ctx.cfg.providers["claude-api"].apiKey };
    }
    const tok = patch.providers?.["claude-cli"]?.oauthToken;
    if (typeof tok === "string" && tok.startsWith("••••")) {
      patch.providers!["claude-cli"] = { ...patch.providers!["claude-cli"], oauthToken: ctx.cfg.providers["claude-cli"].oauthToken };
    }
    if (patch.journalDir !== undefined) {
      if (typeof patch.journalDir !== "string" || !patch.journalDir.trim()) bad("Journal-Ordner fehlt.");
      patch.journalDir = path.resolve(patch.journalDir.replace(/^~(?=$|\/)/, process.env.HOME ?? ""));
      const parent = path.dirname(patch.journalDir);
      if (!fs.existsSync(parent)) bad(`Übergeordneter Ordner existiert nicht: ${parent}`);
    }
    if (patch.lockAfterMinutes !== undefined && (typeof patch.lockAfterMinutes !== "number" || patch.lockAfterMinutes < 1)) bad("Sperrzeit muss mindestens 1 Minute sein.");
    if (patch.provider !== undefined && !["claude-cli", "claude-api", "ollama"].includes(patch.provider)) bad("Unbekannter Anbieter.");
    const next = applyConfigPatch(ctx.cfg, patch);
    ctx.reload(next);
    return publicConfig(ctx.cfg);
  });

  app.post<{ Body: { provider?: ProviderKind } }>("/api/settings/test-provider", async (req) => {
    const kind = req.body?.provider ?? ctx.cfg.provider;
    const p = createProvider(ctx.cfg, kind);
    try {
      return { ok: true, message: await p.test() };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });
}
