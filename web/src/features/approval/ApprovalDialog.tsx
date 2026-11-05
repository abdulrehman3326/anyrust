import { Button, Dialog, Icon, IconChip } from '@/shared/ui';

interface ApprovalDialogProps {
  open: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

const terms = [
  { icon: 'eye', text: 'Can view your shared screen', tone: 'text-success' },
  { icon: 'lock', text: 'No control of your mouse or keyboard', tone: 'text-muted-foreground' },
  { icon: 'close', text: 'You can end the session at any time', tone: 'text-muted-foreground' },
] as const;

export function ApprovalDialog({ open, onApprove, onDecline }: ApprovalDialogProps) {
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
          <Button variant="primary" onClick={onApprove}>
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
    </Dialog>
  );
}
