import { MAX_FILE_NAME_LENGTH } from './model';

/** Lowercase hex SHA-256 of the given bytes (Web Crypto). */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Makes a name from the other side safe to show and to use as a download name: no path
 * separators, control characters or leading dots, and a bounded length that keeps the extension.
 */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let clean = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/^[.\s]+/, '').trim();
  if (!clean) clean = 'file';
  if (clean.length > MAX_FILE_NAME_LENGTH) {
    const dot = clean.lastIndexOf('.');
    const extension = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : '';
    clean = clean.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
  }
  return clean;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** Collision-resistant transfer id, safe for the control protocol's id pattern. */
export const newTransferId = (): string => crypto.randomUUID();
