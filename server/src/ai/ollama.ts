import type { AiProvider, GenerateRequest } from "./provider.js";

export class OllamaProvider implements AiProvider {
  readonly kind = "ollama" as const;
  readonly label = "Ollama (lokal)";

  constructor(private opts: { baseUrl: string; model: string }) {}

  private url(p: string): string {
    return (this.opts.baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "") + p;
  }

  async generate(req: GenerateRequest): Promise<string> {
    if (!this.opts.model) throw new Error("Für Ollama ist kein Modell eingestellt.");
    const res = await fetch(this.url("/api/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.opts.model,
        stream: false,
        options: { num_ctx: 32768, num_predict: req.maxTokens ?? 8192 },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    }).catch((err) => {
      throw new Error(`Ollama ist nicht erreichbar (${this.opts.baseUrl}): ${err.message}`);
    });
    if (!res.ok) throw new Error(`Ollama antwortete mit ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const text = (data.message?.content ?? "").trim();
    if (!text) throw new Error("Ollama hat eine leere Antwort geliefert.");
    return text;
  }

  async test(): Promise<string> {
    const res = await fetch(this.url("/api/tags"), { signal: AbortSignal.timeout(10_000) }).catch((err) => {
      throw new Error(`Ollama ist nicht erreichbar (${this.opts.baseUrl}): ${err.message}`);
    });
    if (!res.ok) throw new Error(`Ollama antwortete mit ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const has = names.some((n) => n === this.opts.model || n.split(":")[0] === this.opts.model);
    return `Erreichbar. Modelle: ${names.join(", ") || "keine"}${has ? "" : ` · Achtung: "${this.opts.model}" ist nicht installiert`}`;
  }
}
