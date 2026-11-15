import { useEffect, useState } from 'react';
import { DEFAULT_VIEWER_PERMISSIONS } from '@/shared/api';
import type { ViewerPermissions } from '@/shared/api';
import { Button, Dialog, Icon, IconChip, Switch } from '@/shared/ui';

interface ApprovalDialogProps {
  open: boolean;
  onApprove: (permissions: ViewerPermissions) => void;
  onDecline: () => void;
}

const terms = [
  { icon: 'eye', text: 'Can view your shared screen', tone: 'text-success' },
  { icon: 'lock', text: 'No control of your mouse or keyboard', tone: 'text-muted-foreground' },
  { icon: 'privacy', text: 'You can pause the stream or end the session at any time', tone: 'text-muted-foreground' },
] as const;

export function ApprovalDialog({ open, onApprove, onDecline }: ApprovalDialogProps) {
  const [permissions, setPermissions] = useState<ViewerPermissions>({ ...DEFAULT_VIEWER_PERMISSIONS });

  // Every request starts from the defaults, never from the previous viewer's choices.
  useEffect(() => {
    if (open) setPermissions({ ...DEFAULT_VIEWER_PERMISSIONS });
  }, [open]);

  return (
    <Dialog
      open={open}
      title="Allow this viewer to see your screen?"
      onClose={onDecline}
      headerAccessory={
        <>
          <IconChip icon="userCheck" tone="brand" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Access request</span>
        </>
      }
      footer={
        <>
          <Button variant="outline" autoFocus onClick={onDecline}>Decline</Button>
          <Button variant="primary" onClick={() => onApprove(permissions)}>
            <Icon name="check" />
            Approve access
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground">
        Someone opened your invite link and is requesting access to your shared source. Only approve people you’re expecting.
      </p>
      <ul className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
        {terms.map((term) => (
          <li key={term.text} className="flex items-center gap-3">
            <Icon name={term.icon} size={16} className={term.tone} />
            {term.text}
          </li>
        ))}
      </ul>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Viewer permissions</legend>
        <Switch
          label="Allow chat"
          description="The viewer can send you messages. You can change this during the session."
          checked={permissions.chat}
          onChange={(event) => setPermissions((current) => ({ ...current, chat: event.target.checked }))}
        />
        <Switch
          label="Allow file transfer"
          description="The viewer can offer you files. You still accept each one. You can always send files to them."
          checked={permissions.files}
          onChange={(event) => setPermissions((current) => ({ ...current, files: event.target.checked }))}
        />
        <Switch
          label="Allow pointer"
          description="The viewer can point at your screen; you see their pointer and clicks on your preview."
          checked={permissions.pointer}
          onChange={(event) => setPermissions((current) => ({ ...current, pointer: event.target.checked }))}
        />
      </fieldset>
    </Dialog>
  );
}
