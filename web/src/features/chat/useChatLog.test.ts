import { act, renderHook } from '@testing-library/react';
import { MAX_MESSAGES, useChatLog } from './useChatLog';

const message = (n: number, role: 'host' | 'viewer' = 'viewer') => ({ role, text: `m${n}`, timestamp: n });

describe('useChatLog', () => {
  it('counts unread messages from the other participant only', () => {
    const { result } = renderHook(() => useChatLog());
    act(() => {
      result.current.receive(message(1, 'viewer'));
      result.current.receive(message(2, 'host'));
    });
    expect(result.current.unreadFor('host')).toBe(1);
    act(() => result.current.markRead());
    expect(result.current.unreadFor('host')).toBe(0);
  });

  it('keeps only the latest 100 messages', () => {
    const { result } = renderHook(() => useChatLog());
    act(() => {
      for (let i = 0; i < MAX_MESSAGES + 5; i++) result.current.receive(message(i));
    });
    expect(result.current.messages).toHaveLength(MAX_MESSAGES);
    expect(result.current.messages[0]?.text).toBe('m5');
  });

  it('clears everything on reset', () => {
    const { result } = renderHook(() => useChatLog());
    act(() => result.current.receive(message(1, 'host')));
    act(() => result.current.reset());
    expect(result.current.messages).toEqual([]);
    expect(result.current.unreadFor('viewer')).toBe(0);
  });
});
