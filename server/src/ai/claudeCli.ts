import { spawn } from "node:child_process";
import type { AiProvider, GenerateRequest } from "./provider.js";

/**
 * Runs the Claude Code CLI in headless mode. Uses the user's existing login
 * (Pro/Max subscription), no API key. Tools are disabled, nothing is persisted.
 */
export class ClaudeCliProvider implements AiProvider {
  readonly kind = "claude-cli" as const;
  readonly label = "Claude Code CLI";

  constructor(private opts: { command: string; model: string }) {}

  async generate(req: GenerateRequest): Promise<string> {
    const args = ["-p", "--bare", "--no-session-persistence", "--tools", "", "--output-format", "text", "--system-prompt", req.system];
    if (this.opts.model) args.push("--model", this.opts.model);
    const out = await run(this.opts.command || "claude", args, req.prompt, 15 * 60 * 1000);
    const text = out.trim();
    if (!text) throw new Error("Claude CLI hat eine leere Antwort geliefert.");
    return text;
  }

  async test(): Promise<string> {
    const version = await run(this.opts.command || "claude", ["--version"], "", 20_000);
    const reply = await this.generate({ system: "Antworte mit genau einem Wort.", prompt: "Sag OK." });
    return `${version.trim()} · Antwort: ${reply.slice(0, 40)}`;
  }
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // Never let the headless call inherit a nested-session marker.
    delete env.CLAUDECODE;
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Claude CLI hat nach ${Math.round(timeoutMs / 1000)}s nicht geantwortet.`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI konnte nicht gestartet werden (${cmd}): ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Claude CLI endete mit Code ${code}: ${stderr.trim() || stdout.trim() || "keine Ausgabe"}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}
