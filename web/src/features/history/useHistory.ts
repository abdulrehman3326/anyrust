import { useCallback, useEffect, useState } from 'react';
import { HISTORY_KEY, HISTORY_LIMIT, loadHistory, saveHistory } from './historyStorage';
import type { HistoryEntry } from './historyStorage';

/**
 * Recent sessions, persisted in localStorage. New entries are merged with what is
 * already stored so two tabs ending a session at once do not overwrite each other,
 * and other tabs' changes are picked up through the `storage` event.
 */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_KEY || event.key === null) setEntries(loadHistory());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((record: { address: string; kind: string; seconds: number }) => {
    const next = [{ ...record, date: Date.now() }, ...loadHistory()].slice(0, HISTORY_LIMIT);
    saveHistory(next);
    setEntries(next);
  }, []);

  return { entries, add };
}
