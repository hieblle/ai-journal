import crypto from "node:crypto";
import fs from "node:fs";
import { HOME_DIR, SECRET_PATH } from "./config.js";

const SCRYPT_N = 16384;

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pin, salt, 32, { N: SCRYPT_N });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPin(pin: string, hash: string | null): boolean {
  if (!hash) return false;
  const [algo, saltHex, keyHex] = hash.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), 32, { N: SCRYPT_N });
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function validPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,12}$/.test(pin);
}

/** Session secret persisted in the home dir so sessions survive restarts. */
export function loadSessionSecret(): Buffer {
  fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  if (fs.existsSync(SECRET_PATH)) {
    const s = fs.readFileSync(SECRET_PATH, "utf8").trim();
    if (s.length >= 32) return Buffer.from(s, "hex");
  }
  const secret = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_PATH, secret.toString("hex"), { mode: 0o600 });
  return secret;
}

/** Brute-force guard: delay grows with consecutive failures, resets on success. */
export class LoginGuard {
  private failures = 0;
  private lockedUntil = 0;

  check(): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = Date.now();
    if (now < this.lockedUntil) return { ok: false, retryAfterSec: Math.ceil((this.lockedUntil - now) / 1000) };
    return { ok: true };
  }

  fail(): number {
    this.failures += 1;
    if (this.failures >= 3) {
      const wait = Math.min(300, 5 * 2 ** (this.failures - 3)); // 5s, 10s, 20s ... max 5 min
      this.lockedUntil = Date.now() + wait * 1000;
      return wait;
    }
    return 0;
  }

  success(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }
}

/** Minimal signed, stateless session tokens: base64(payload).hmac */
export class Sessions {
  constructor(private secret: Buffer, private ttlMs: number) {}

  setTtl(ms: number) {
    this.ttlMs = ms;
  }

  issue(): string {
    const payload = Buffer.from(JSON.stringify({ iat: Date.now(), n: crypto.randomBytes(8).toString("hex") })).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns a refreshed token if valid (sliding expiry), else null. */
  verify(token: string | undefined): string | null {
    if (!token) return null;
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = this.sign(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const { iat } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof iat !== "number" || Date.now() - iat > this.ttlMs) return null;
      return this.issue();
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}
