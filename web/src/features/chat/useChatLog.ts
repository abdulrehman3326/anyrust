import { useCallback, useMemo, useState } from 'react';
import type { ChatMessage, Role } from '@/shared/api';

export const MAX_MESSAGES = 100;
export const MAX_LENGTH = 2000;

export interface ChatLog {
  messages: ChatMessage[];
  /** Messages from the other participant that have not been seen yet. */
  unreadFor: (selfRole: Role) => number;
  receive: (message: ChatMessage) => void;
  reset: () => void;
  markRead: () => void;
}

/**
 * In-memory transcript only. Nothing is written to browser storage, and the log
 * is capped at the latest 100 messages.
 */
export function useChatLog(): ChatLog {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readCount, setReadCount] = useState(0);

  const receive = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const next = [...current, message];
      if (next.length <= MAX_MESSAGES) return next;
      setReadCount((count) => Math.max(0, count - (next.length - MAX_MESSAGES)));
      return next.slice(-MAX_MESSAGES);
    });
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setReadCount(0);
  }, []);

  const markRead = useCallback(() => setReadCount(messages.length), [messages.length]);

  const unreadFor = useCallback(
    (selfRole: Role) => messages.slice(readCount).filter((message) => message.role !== selfRole).length,
    [messages, readCount],
  );

  return useMemo(() => ({ messages, unreadFor, receive, reset, markRead }), [messages, unreadFor, receive, reset, markRead]);
}
