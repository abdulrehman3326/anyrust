import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Permanent device addresses (like an AnyDesk ID).
 *
 * A presenter's browser keeps a random 256-bit secret. The server derives the public 9-digit
 * device ID as HMAC-SHA256(serverKey, secret). Because the key never leaves the server, nobody
 * can compute a secret that maps to someone else's ID offline, so an ID can't be hijacked by
 * brute force; online attempts are rate-limited. The server stores nothing per device: an ID
 * resolves only while that device is sharing, and the presenter still approves every viewer.
 */

/** 32 random bytes, base64url without padding. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const isDeviceSecret = (value: unknown): value is string => typeof value === 'string' && SECRET_PATTERN.test(value);

/** Nine digits, never starting with 0, like room ids. */
export function deviceIdFromSecret(key: Buffer, secret: string): string {
  const digest = createHmac('sha256', key).update(secret).digest();
  return String(100_000_000 + Number(digest.readBigUInt64BE(0) % 900_000_000n));
}

export type DeviceKeyEnv = Readonly<Record<string, string | undefined>>;

/**
 * The HMAC key, from `DEVICE_ID_KEY` (set it in production so IDs survive redeploys), else from
 * a local key file created on first run. Changing the key changes every device ID.
 */
export function loadDeviceKey(env: DeviceKeyEnv, keyFile: URL): { key: Buffer; source: 'env' | 'file' | 'new-file' } {
  if (env.DEVICE_ID_KEY) {
    if (env.DEVICE_ID_KEY.length < 32) throw new Error('DEVICE_ID_KEY must be at least 32 characters.');
    return { key: Buffer.from(env.DEVICE_ID_KEY), source: 'env' };
  }
  try {
    const stored = readFileSync(keyFile, 'utf8').trim();
    if (stored.length >= 32) return { key: Buffer.from(stored), source: 'file' };
  } catch {
    /* No key file yet. */
  }
  const generated = randomBytes(32).toString('base64url');
  writeFileSync(keyFile, `${generated}\n`, { mode: 0o600 });
  return { key: Buffer.from(generated), source: 'new-file' };
}

/**
 * Fixed-window rate limiter keyed by an arbitrary string (client address, device id).
 * Memory is bounded by pruning expired windows.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Records one attempt. Returns 0 if allowed, otherwise the seconds until the next allowed attempt. */
  take(key: string, now: number = Date.now()): number {
    if (this.windows.size > 10_000) this.prune(now);
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return 0;
    }
    if (window.count >= this.limit) return Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000));
    window.count++;
    return 0;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (now - window.start >= this.windowMs) this.windows.delete(key);
  }
}
