import { useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Icon, IconChip, TextField } from '@/shared/ui';
import type { JoinResult, SessionState } from '@/features/session';

interface JoinCardProps {
  state: SessionState;
  onJoin: (value: string) => Promise<JoinResult>;
}

export function JoinCard({ state, onJoin }: JoinCardProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const locked = state.busy || state.ending || state.active;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await onJoin(value.trim());
    if (result.ok) {
      setValue('');
      setError(undefined);
    } else {
      setError(result.error);
    }
  };

  const handlePaste = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setValue(text.trim());
          setError(undefined);
        }
      }
    } catch {
      // Clipboard read not permitted; user can paste manually.
    }
  };

  return (
    <Card as="article">
      <CardHeader>
        <div className="flex items-start gap-4">
          <IconChip icon="join" />
          <div className="space-y-1.5">
            <CardTitle>Request access</CardTitle>
            <CardDescription>Paste the presenter’s invite link, or enter their 9-digit device ID.</CardDescription>
          </div>
        </div>
        <CardAction><Badge tone="outline">Viewer</Badge></CardAction>
      </CardHeader>

      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-6">
        <CardContent>
          <TextField
            label="Invite link or device ID"
            hint="The presenter approves each request before you connect."
            error={error}
            autoComplete="off"
            spellCheck={false}
            placeholder="Invite link or device ID (e.g. 123 456 789)"
            className="font-mono text-xs md:text-xs"
            value={state.active && state.role === 'viewer' ? state.joinedLink : value}
            disabled={state.active}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
          />
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3 border-t">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap shrink-0">
            <Icon name="lock" size={14} />
            View-only
          </span>
          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            {!state.active && (
              <Button type="button" variant="ghost" onClick={() => void handlePaste()} aria-label="Paste from clipboard">
                <Icon name="copy" />
                Paste
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={locked || state.service !== 'ready' || !value.trim()}>
              Request access
              <Icon name="arrow" />
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
