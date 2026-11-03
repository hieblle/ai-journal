import { api, type Overview } from "./api";

export type Route =
  | { view: "entry"; date: string }
  | { view: "reports"; kind?: string; key?: string }
  | { view: "search"; q?: string }
  | { view: "settings"; tab?: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  const [seg, a, b] = h.split("/");
  if (seg === "reports") return { view: "reports", kind: a || undefined, key: b ? decodeURIComponent(b) : undefined };
  if (seg === "search") return { view: "search", q: a ? decodeURIComponent(a) : undefined };
  if (seg === "settings") return { view: "settings", tab: a || undefined };
  if (seg === "entry" && a) return { view: "entry", date: a };
  return { view: "entry", date: localToday() };
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function routeHref(r: Route): string {
  switch (r.view) {
    case "entry":
      return `#/entry/${r.date}`;
    case "reports":
      return r.kind && r.key ? `#/reports/${r.kind}/${encodeURIComponent(r.key)}` : "#/reports";
    case "search":
      return r.q ? `#/search/${encodeURIComponent(r.q)}` : "#/search";
    case "settings":
      return r.tab ? `#/settings/${r.tab}` : "#/settings";
  }
}

export function navigate(r: Route): void {
  location.hash = routeHref(r);
}

class AppState {
  route = $state<Route>(parseHash());
  locked = $state(true);
  pinSet = $state(true);
  lockAfterMinutes = $state(10);
  overview = $state<Overview | null>(null);
  sidebarOpen = $state(readSidebar());
  toast = $state<{ text: string; kind: "info" | "error" } | null>(null);
  private toastTimer: number | undefined;
  private lastActivity = Date.now();

  constructor() {
    window.addEventListener("hashchange", () => (this.route = parseHash()));
    window.addEventListener("aij:unauthorized", () => (this.locked = true));
    for (const ev of ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"]) {
      window.addEventListener(ev, () => (this.lastActivity = Date.now()), { passive: true });
    }
    window.setInterval(() => this.checkIdle(), 15_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.checkIdle();
    });
  }

  private checkIdle() {
    if (this.locked || !this.pinSet) return;
    if (Date.now() - this.lastActivity > this.lockAfterMinutes * 60_000) void this.lock();
  }

  async lock() {
    this.locked = true;
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
  }

  async refreshAuth() {
    const s = await api.get<{ pinSet: boolean; authenticated: boolean; lockAfterMinutes: number }>("/api/auth/status");
    this.pinSet = s.pinSet;
    this.lockAfterMinutes = s.lockAfterMinutes;
    this.locked = !s.authenticated;
    this.lastActivity = Date.now();
    if (!this.locked) await this.refreshOverview();
  }

  async refreshOverview() {
    try {
      this.overview = await api.get<Overview>("/api/overview");
    } catch (err) {
      if (!(err instanceof Error && err.message === "Nicht angemeldet.")) this.notify((err as Error).message, "error");
    }
  }

  notify(text: string, kind: "info" | "error" = "info") {
    this.toast = { text, kind };
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = null), kind === "error" ? 6000 : 2500);
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    try {
      localStorage.setItem("aij.sidebar", this.sidebarOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}

function readSidebar(): boolean {
  try {
    const v = localStorage.getItem("aij.sidebar");
    if (v === null) return window.innerWidth > 800;
    return v === "1";
  } catch {
    return true;
  }
}

export const app = new AppState();
