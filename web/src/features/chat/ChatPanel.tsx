import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Role } from '@/shared/api';
import { Button, Icon, TextArea, buttonVariants } from '@/shared/ui';
import { cn } from '@/shared/lib';
import { MAX_LENGTH } from './useChatLog';
import type { ChatLog } from './useChatLog';

interface ChatPanelProps {
  log: ChatLog;
  selfRole: Role;
  /** Chat is available once the presenter has approved a viewer. */
  ready: boolean;
  open: boolean;
  /** Fullscreen shows chat as a right-hand tray. */
  tray: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (text: string) => Promise<void>;
}

const senderLabel = (role: Role, selfRole: Role) => (role === selfRole ? 'You' : role === 'host' ? 'Presenter' : 'Viewer');

export function ChatPanel({ log, selfRole, ready, open, tray, onOpenChange, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { markRead, messages } = log;
  const unread = log.unreadFor(selfRole);

  // Keep the newest message in view and clear the unread count while open.
  useEffect(() => {
    if (!open) return;
    markRead();
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [open, messages, markRead]);

  useEffect(() => {
    if (!ready) {
      setDraft('');
      setError('');
    }
  }, [ready]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || sending || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      await onSend(draft);
      setDraft('');
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Message not sent.'} Your draft is still here.`);
    } finally {
      setSending(false);
      queueMicrotask(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const contentId = 'chat-content';
  return (
    <aside
      className={cn('flex min-w-0 flex-col bg-card', tray && 'w-[340px]', tray && !open && 'w-auto')}
      aria-label="Session chat"
    >
      <button
        type="button"
        className={cn(buttonVariants({ variant: 'ghost' }), 'h-12 w-full justify-between rounded-none px-4 has-[>svg]:px-4')}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="chat" size={16} className="text-muted-foreground" />
          Messages
          {!open && !ready && <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· Available once a viewer is approved</span>}
          {!open && unread > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground"
              aria-label={`${unread} unread`}
            >
              {unread}
            </span>
          )}
        </span>
        <Icon name={open ? 'close' : 'chevron'} size={16} className="text-muted-foreground" />
      </button>

      {open && (
        <div id={contentId} className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            {ready ? 'Private to this session · Cleared when either participant leaves' : 'Available once a viewer is approved.'}
          </p>
          <div
            ref={logRef}
            className={cn('flex h-48 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3', tray && 'h-auto flex-1')}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
          >
            {messages.length === 0 && (
              <p className="m-auto text-center text-sm text-muted-foreground">
                No messages yet.
              </p>
            )}
            {messages.map((message, index) => {
              const own = message.role === selfRole;
              return (
                <article
                  key={`${message.timestamp}-${index}`}
                  className={cn(
                    'max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground',
                    own && 'self-end bg-chat-own text-chat-own-foreground',
                  )}
                >
                  <div className="flex gap-2 text-xs opacity-75">
                    <strong className="font-medium">{senderLabel(message.role, selfRole)}</strong>
                    <time dateTime={new Date(message.timestamp).toISOString()}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
                </article>
              );
            })}
          </div>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
            <div className="flex items-end gap-2 rounded-lg border border-border/80 bg-card p-2 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 [&>div]:min-w-0 [&>div]:flex-1">
              <TextArea
                ref={inputRef}
                label="Message"
                hideLabel
                rows={2}
                className="max-h-32 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                maxLength={MAX_LENGTH}
                placeholder="Type a message…"
                value={draft}
                disabled={!ready || sending}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <Button type="submit" variant="primary" iconOnly aria-label="Send message" title="Send message" disabled={!ready || sending || !draft.trim()}>
                <Icon name="send" />
              </Button>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Enter to send · Shift+Enter for a new line</span>
              <span className="font-mono tabular-nums">{draft.length} / {MAX_LENGTH.toLocaleString()}</span>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
