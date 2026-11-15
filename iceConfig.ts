import { createHmac } from 'node:crypto';
import type { IceServer } from './protocol/signaling.ts';

/**
 * Builds the STUN/TURN list handed to browsers, from environment variables:
 *
 * - `STUN_URLS`        comma-separated STUN URLs. Defaults to Google's public STUN server;
 *                      set to `none` to disable STUN (same-network sessions still work).
 * - `TURN_URLS`        comma-separated TURN URLs (e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`).
 * - `TURN_SECRET`      shared secret for coturn's `use-auth-secret` mode (TURN REST API). Each response gets
 *                      fresh credentials that expire after `TURN_TTL_SECONDS` (default 3600), so no long-lived
 *                      password ever reaches the browser.
 * - `TURN_USERNAME` / `TURN_CREDENTIAL`  static credentials, used only when `TURN_SECRET` is unset.
 */
export const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';
const DEFAULT_TURN_TTL_SECONDS = 3600;

export type IceEnv = Readonly<Record<string, string | undefined>>;

const list = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

/** TURN REST API credentials: username `<expiry>:<label>`, credential base64(HMAC-SHA1(secret, username)). */
export function turnRestCredentials(secret: string, label: string, ttlSeconds: number, nowMs: number): { username: string; credential: string } {
  const username = `${Math.floor(nowMs / 1000) + ttlSeconds}:${label}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

export function buildIceServers(env: IceEnv, label: string, nowMs: number = Date.now()): IceServer[] {
  const servers: IceServer[] = [];

  // Unset or blank (hosting dashboards often store empty values) means the default; `none` disables STUN.
  const stunSetting = env.STUN_URLS?.trim() ?? '';
  const stun = !stunSetting ? [DEFAULT_STUN_URL] : stunSetting.toLowerCase() === 'none' ? [] : list(stunSetting);
  if (stun.length) servers.push({ urls: stun });

  const turn = list(env.TURN_URLS);
  if (turn.length) {
    if (env.TURN_SECRET) {
      const ttl = Number(env.TURN_TTL_SECONDS) > 0 ? Number(env.TURN_TTL_SECONDS) : DEFAULT_TURN_TTL_SECONDS;
      servers.push({ urls: turn, ...turnRestCredentials(env.TURN_SECRET, label, ttl, nowMs) });
    } else if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
      servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
    }
  }
  return servers;
}

/** A configuration problem worth logging once at startup, or null. */
export function iceConfigWarning(env: IceEnv): string | null {
  if (list(env.TURN_URLS).length && !env.TURN_SECRET && !(env.TURN_USERNAME && env.TURN_CREDENTIAL)) {
    return 'TURN_URLS is set without TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL, so TURN is disabled.';
  }
  return null;
}
