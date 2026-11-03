import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoginGuard, loadSessionSecret, Sessions } from "./auth.js";
import { CONFIG_PATH, loadConfig, saveConfig, type AppConfig } from "./config.js";
import { Journal } from "./journal.js";
import { registerRoutes, type AppContext } from "./routes.js";
import { Scheduler } from "./scheduler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// server/dist/index.js or server/src/index.ts -> repo root
const repoRoot = path.resolve(here, "..", "..");
const webDist = path.join(repoRoot, "web", "dist");

export async function buildServer(): Promise<{ app: ReturnType<typeof Fastify>; ctx: AppContext }> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, bodyLimit: 10 * 1024 * 1024 });
  await app.register(fastifyCookie);

  let cfg = loadConfig();
  if (!fs.existsSync(CONFIG_PATH)) saveConfig(cfg);
  let journal = new Journal(cfg.journalDir);
  journal.init();

  const sessions = new Sessions(loadSessionSecret(), cfg.lockAfterMinutes * 60 * 1000);
  const guard = new LoginGuard();
  const scheduler = new Scheduler(() => journal, () => cfg);

  const ctx: AppContext = {
    get cfg() {
      return cfg;
    },
    get journal() {
      return journal;
    },
    sessions,
    guard,
    scheduler,
    reload(next: AppConfig) {
      const dirChanged = next.journalDir !== cfg.journalDir;
      cfg = next;
      saveConfig(cfg);
      sessions.setTtl(cfg.lockAfterMinutes * 60 * 1000);
      if (dirChanged) {
        journal = new Journal(cfg.journalDir);
        journal.init();
        app.log.info(`Journal-Ordner gewechselt: ${cfg.journalDir}`);
      }
    },
  };

  registerRoutes(app, ctx);

  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: "Nicht gefunden." });
      return reply.sendFile("index.html");
    });
  } else {
    app.log.warn(`Kein Frontend-Build in ${webDist}. Im Dev-Modus übernimmt Vite die Oberfläche.`);
  }

  return { app, ctx };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { app, ctx } = await buildServer();
  await app.listen({ port: ctx.cfg.port, host: ctx.cfg.host });
  app.log.info(`Journal: ${ctx.cfg.journalDir}`);
  app.log.info(`Konfiguration: ${CONFIG_PATH}`);
  ctx.scheduler.start();
}
