import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, GenerateRequest } from "./provider.js";

export class ClaudeApiProvider implements AiProvider {
  readonly kind = "claude-api" as const;
  readonly label = "Claude API";

  constructor(private opts: { apiKey: string; model: string }) {}

  private client(): Anthropic {
    if (!this.opts.apiKey) throw new Error("Für die Claude API ist kein API-Key hinterlegt.");
    return new Anthropic({ apiKey: this.opts.apiKey, timeout: 15 * 60 * 1000 });
  }

  async generate(req: GenerateRequest): Promise<string> {
    const client = this.client();
    const stream = client.messages.stream({
      model: this.opts.model || "claude-opus-5-5",
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") {
      throw new Error("Die Claude API hat die Anfrage abgelehnt (refusal).");
    }
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Die Claude API hat keinen Text geliefert.");
    return text;
  }

  async test(): Promise<string> {
    const reply = await this.generate({ system: "Antworte mit genau einem Wort.", prompt: "Sag OK.", maxTokens: 256 });
    return `Modell ${this.opts.model} · Antwort: ${reply.slice(0, 40)}`;
  }
}
