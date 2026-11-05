export interface HistoryEntry {
  kind: string;
  address: string;
  date: number;
  seconds: number;
}

export const HISTORY_KEY = 'deskstream-history';
export const HISTORY_LIMIT = 8;

export function isHistoryEntry(item: unknown): item is HistoryEntry {
  if (typeof item !== 'object' || item === null) return false;
  const entry = item as Record<string, unknown>;
  return (
    typeof entry.kind === 'string' &&
    typeof entry.address === 'string' &&
    /^\d{9}$/.test(entry.address) &&
    typeof entry.date === 'number' &&
    Number.isFinite(entry.date) &&
    typeof entry.seconds === 'number' &&
    entry.seconds >= 0
  );
}

export function loadHistory(storage: Pick<Storage, 'getItem'> = localStorage): HistoryEntry[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(isHistoryEntry).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return []; // The workspace works when browser storage is disabled or corrupt.
  }
}

export function saveHistory(entries: HistoryEntry[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* Keep the in-memory history when storage is unavailable. */
  }
}
