import { act, renderHook } from '@testing-library/react';
import { useHistory } from './useHistory';
import { HISTORY_KEY, loadHistory } from './historyStorage';

describe('useHistory', () => {
  beforeEach(() => localStorage.clear());

  it('prepends new sessions and persists them', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.add({ address: '123456789', kind: 'Screen share', seconds: 12 }));
    expect(result.current.entries[0]?.kind).toBe('Screen share');
    expect(loadHistory()).toHaveLength(1);
  });

  it('merges with entries another tab already stored instead of overwriting them', () => {
    const { result } = renderHook(() => useHistory());
    // Another tab writes while this one still holds an empty list.
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ kind: 'Sample stream', address: '111111111', date: 1, seconds: 5 }]));
    act(() => result.current.add({ address: '222222222', kind: 'Viewed screen', seconds: 3 }));
    expect(loadHistory().map((entry) => entry.kind)).toEqual(['Viewed screen', 'Sample stream']);
  });
});
