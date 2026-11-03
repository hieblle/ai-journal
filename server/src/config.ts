import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ProviderKind = "claude-cli" | "claude-api" | "ollama";

export interface ScheduleConfig {
  daily: { enabled: boolean; hour: number; minute: number };
  weekly: { enabled: boolean; weekday: number; hour: number; minute: number }; // 0 = Sonntag
  monthly: { enabled: boolean; hour: number; minute: number };
  quarterly: { enabled: boolean; hour: number; minute: number };
}

export interface AppConfig {
  journalDir: string;
  port: number;
  host: string;
  pinHash: string | null;
  lockAfterMinutes: number;
  language: string;
  defaultTemplate: string;
  provider: ProviderKind;
  providers: {
    "claude-cli": { command: string; model: string; oauthToken: string };
    "claude-api": { apiKey: string; model: string };
    ollama: { baseUrl: string; model: string };
  };
  schedule: ScheduleConfig;
}

export const HOME_DIR = process.env.AI_JOURNAL_HOME || path.join(os.homedir(), ".ai-journal");
export const CONFIG_PATH = path.join(HOME_DIR, "config.json");
export const STATE_PATH = path.join(HOME_DIR, "state.json");
export const SECRET_PATH = path.join(HOME_DIR, "session-secret");

export function defaultConfig(): AppConfig {
  return {
    journalDir: process.env.AI_JOURNAL_DIR || path.join(os.homedir(), "Journal"),
    port: Number(process.env.AI_JOURNAL_PORT || 8787),
    host: process.env.AI_JOURNAL_HOST || "127.0.0.1",
    pinHash: null,
    lockAfterMinutes: 10,
    language: "de",
    defaultTemplate: "standard",
    provider: "claude-cli",
    providers: {
      "claude-cli": { command: "claude", model: "", oauthToken: "" },
      "claude-api": { apiKey: "", model: "claude-opus-5-5" },
      ollama: { baseUrl: "http://127.0.0.1:11434", model: "llama3.1" },
    },
    schedule: {
      daily: { enabled: true, hour: 21, minute: 0 },
      weekly: { enabled: true, weekday: 0, hour: 20, minute: 0 },
      monthly: { enabled: true, hour: 9, minute: 0 },
      quarterly: { enabled: true, hour: 9, minute: 0 },
    },
  };
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(cur, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(): AppConfig {
  const base = defaultConfig();
  if (!fs.existsSync(CONFIG_PATH)) return base;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return deepMerge(base, raw);
  } catch (err) {
    console.error(`Konfiguration in ${CONFIG_PATH} ist nicht lesbar, Standardwerte werden verwendet:`, err);
    return base;
  }
}

export function saveConfig(cfg: AppConfig): void {
  fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  const tmp = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_PATH);
}

/** Merges a partial update from the settings UI into the current config. */
export function applyConfigPatch(cfg: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const next = deepMerge(cfg, patch);
  // pinHash is never set via the generic patch, only via the PIN endpoints
  next.pinHash = cfg.pinHash;
  return next;
}

/** Config as sent to the browser: secrets masked. */
export function publicConfig(cfg: AppConfig) {
  return {
    ...cfg,
    pinHash: undefined,
    pinSet: Boolean(cfg.pinHash),
    providers: {
      ...cfg.providers,
      "claude-cli": {
        ...cfg.providers["claude-cli"],
        oauthToken: cfg.providers["claude-cli"].oauthToken ? "••••" + cfg.providers["claude-cli"].oauthToken.slice(-4) : "",
      },
      "claude-api": {
        ...cfg.providers["claude-api"],
        apiKey: cfg.providers["claude-api"].apiKey ? "••••" + cfg.providers["claude-api"].apiKey.slice(-4) : "",
      },
    },
  };
}
