import type { AppConfig, ProviderKind } from "../config.js";
import { ClaudeCliProvider } from "./claudeCli.js";
import { ClaudeApiProvider } from "./claudeApi.js";
import { OllamaProvider } from "./ollama.js";

export interface GenerateRequest {
  system: string;
  prompt: string;
  /** Soft hint for providers that need an output cap. */
  maxTokens?: number;
}

export interface AiProvider {
  readonly kind: ProviderKind;
  readonly label: string;
  generate(req: GenerateRequest): Promise<string>;
  /** Cheap connectivity check; throws with a readable message on failure. */
  test(): Promise<string>;
}

export function createProvider(cfg: AppConfig, kind: ProviderKind = cfg.provider): AiProvider {
  if (process.env.AI_JOURNAL_FAKE_PROVIDER) return new FakeProvider(kind);
  switch (kind) {
    case "claude-cli":
      return new ClaudeCliProvider(cfg.providers["claude-cli"]);
    case "claude-api":
      return new ClaudeApiProvider(cfg.providers["claude-api"]);
    case "ollama":
      return new OllamaProvider(cfg.providers.ollama);
    default:
      throw new Error(`Unbekannter KI-Anbieter: ${kind}`);
  }
}

/** Test double, active only with AI_JOURNAL_FAKE_PROVIDER=1. Echoes a canned report. */
class FakeProvider implements AiProvider {
  readonly label = "Fake (Test)";
  constructor(public readonly kind: ProviderKind) {}
  async generate(req: GenerateRequest): Promise<string> {
    if (req.prompt.includes("Aktualisiere dein Gedächtnis")) {
      return "=== DATEI: themen.md ===\n# Themen\n\n| Thema | Erstes Auftreten | Letztes Auftreten | Wochen | Status | Notiz |\n|---|---|---|---|---|---|\n| Test | heute | heute | 1 | offen | Fake |\n=== ENDE ===";
    }
    const head = /Überschrift: `(.+?)`/.exec(req.prompt)?.[1] ?? "# Bericht";
    const docs = (req.prompt.match(/^## /gm) ?? []).length;
    return `${head}\n\n## Was ich wahrnehme\n\nFake-Bericht über ${docs} Abschnitte im Kontext. System-Prompt hat ${req.system.length} Zeichen.\n\n## Fragen\n\n1. Funktioniert das?`;
  }
  async test(): Promise<string> {
    return "Fake-Anbieter aktiv.";
  }
}
