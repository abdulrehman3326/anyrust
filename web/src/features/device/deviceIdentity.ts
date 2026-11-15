/**
 * This browser's permanent device secret. The server derives the public 9-digit device ID from
 * it (see ../../../../devices.ts), so the secret itself is never shown and must stay on this
 * device: whoever holds it can present as this device ID.
 */
export const DEVICE_SECRET_KEY = 'deskstream-device-secret';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Used when storage is blocked (private mode, cookies off): the ID then lasts for this tab only. */
let ephemeral: string | null = null;

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getDeviceSecret(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()): string {
  try {
    const stored = storage?.getItem(DEVICE_SECRET_KEY);
    if (stored && SECRET_PATTERN.test(stored)) return stored;
    const created = generateSecret();
    storage?.setItem(DEVICE_SECRET_KEY, created);
    if (storage?.getItem(DEVICE_SECRET_KEY) === created) return created;
  } catch {
    /* Storage unavailable; fall through to a per-tab secret. */
  }
  ephemeral ??= generateSecret();
  return ephemeral;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Accepts `123456789`, `123 456 789` or `123-456-789`; returns the 9 digits or null. */
export function parseDeviceId(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  return /^[1-9]\d{8}$/.test(digits) ? digits : null;
}
