import { HISTORY_KEY, HISTORY_LIMIT, loadHistory, saveHistory } from './historyStorage';

const entry = (n: number) => ({ kind: 'Screen share', address: String(100000000 + n), date: n, seconds: n });

describe('historyStorage', () => {
  it('returns an empty list for missing or corrupt data', () => {
    expect(loadHistory({ getItem: () => null })).toEqual([]);
    expect(loadHistory({ getItem: () => '{not json' })).toEqual([]);
  });

  it('drops malformed entries and caps the list', () => {
    const stored = JSON.stringify([...Array.from({ length: 12 }, (_, i) => entry(i)), { kind: 1 }, { ...entry(1), address: 'abc' }]);
    const loaded = loadHistory({ getItem: () => stored });
    expect(loaded).toHaveLength(HISTORY_LIMIT);
    expect(loaded.every((item) => /^\d{9}$/.test(item.address))).toBe(true);
  });

  it('survives a storage that throws', () => {
    expect(() => saveHistory([entry(1)], { setItem: () => { throw new Error('denied'); } })).not.toThrow();
  });

  it('writes under the original key', () => {
    const setItem = vi.fn();
    saveHistory([entry(1)], { setItem });
    expect(setItem).toHaveBeenCalledWith(HISTORY_KEY, expect.any(String));
  });
});
