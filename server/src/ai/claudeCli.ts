import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HOME_DIR } from "../config.js";
import type { AiProvider, GenerateRequest } from "./provider.js";

/**
 * Runs the Claude Code CLI in headless mode. Uses the user's existing login
 * (Pro/Max subscription, read from the keychain), no API key. Tools are
 * disabled, nothing is persisted. Do not add --bare: it disables OAuth and
 * keychain reads. Instead the CLI runs in an empty working directory so it
 * picks up no CLAUDE.md, hooks or project settings.
 */
export class ClaudeCliProvider implements AiProvider {
  readonly kind = "claude-cli" as const;
  readonly label = "Claude Code CLI";

  constructor(private opts: { command: string; model: string }) {}

  async generate(req: GenerateRequest): Promise<string> {
    const args = ["-p", "--no-session-persistence", "--tools", "", "--output-format", "text", "--system-prompt", req.system];
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

/** Empty directory the CLI runs in, so it never sees the app's own repo. */
function cliCwd(): string {
  const dir = path.join(HOME_DIR, "cli-cwd");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    // Never let the headless call inherit a nested-session marker.
    delete env.CLAUDECODE;
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env, cwd: cliCwd() });
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
