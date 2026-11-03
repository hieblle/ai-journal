export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `HTTP ${res.status}`;
    if (res.status === 401) window.dispatchEvent(new CustomEvent("aij:unauthorized"));
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export type ReportKind = "daily" | "weekly" | "monthly" | "quarterly";

export interface Entry {
  date: string;
  meta: { date: string; energy?: number; focus?: number; [k: string]: unknown };
  body: string;
  exists: boolean;
}

export interface Overview {
  today: string;
  dates: string[];
  templates: string[];
  defaultTemplate: string;
  unread: string[];
  lastError: { kind: ReportKind; key: string; message: string; at: string } | null;
  running: { kind: ReportKind; key: string; startedAt: string } | null;
  provider: string;
  current: Record<ReportKind, string>;
  due: Record<ReportKind, string | null>;
}

export interface ReportListItem {
  kind: ReportKind;
  key: string;
  mtime: number;
  label: string;
  unread: boolean;
}

export interface Settings {
  journalDir: string;
  port: number;
  host: string;
  pinSet: boolean;
  lockAfterMinutes: number;
  language: string;
  defaultTemplate: string;
  provider: "claude-cli" | "claude-api" | "ollama";
  providers: {
    "claude-cli": { command: string; model: string; oauthToken: string };
    "claude-api": { apiKey: string; model: string };
    ollama: { baseUrl: string; model: string };
  };
  schedule: {
    daily: { enabled: boolean; hour: number; minute: number };
    weekly: { enabled: boolean; weekday: number; hour: number; minute: number };
    monthly: { enabled: boolean; hour: number; minute: number };
    quarterly: { enabled: boolean; hour: number; minute: number };
  };
}

export const KIND_LABEL: Record<ReportKind, string> = {
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  quarterly: "Quartal",
};
