import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Icon, Input, Label } from '@/shared/ui';
import { formatRoomId } from '@/shared/lib';
import type { SessionState } from '@/features/session';
import { useCopyInvite } from './useCopyInvite';

/** The host's invite link and session ID, shown while a hosted session is active. */
export function InvitePanel({ state }: { state: SessionState }) {
  const copy = useCopyInvite(state.inviteLink);

  return (
    <Card as="section" aria-label="Invite a viewer">
      <CardHeader>
        <CardTitle>Invite a viewer</CardTitle>
        <CardDescription>Nothing is shared until you approve the request.</CardDescription>
        <CardAction><Badge tone="success" dot>Active</Badge></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <span className="text-xs text-muted-foreground">Session ID</span>
          <strong className="font-mono text-sm font-medium tabular-nums">{state.roomId ? formatRoomId(state.roomId) : '—'}</strong>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-link">Invite link</Label>
          <div className="flex gap-2">
            <Input
              id="invite-link"
              readOnly
              value={state.inviteLink}
              className="font-mono text-xs md:text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" disabled={state.ending} onClick={() => void copy()}>
              <Icon name="copy" />
              Copy
            </Button>
          </div>
        </div>
        <Button variant="outline" block disabled={state.ending} onClick={() => window.open(state.inviteLink, '_blank', 'noopener')}>
          <Icon name="share" />
          Open viewer in new tab
        </Button>
      </CardContent>
    </Card>
  );
}
