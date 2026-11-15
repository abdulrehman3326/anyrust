import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Icon } from '@/shared/ui';
import type { BadgeTone } from '@/shared/ui';
import { cn } from '@/shared/lib';
import { formatBytes } from './lib';
import { isFinished, MAX_FILE_BYTES } from './model';
import type { FileTransfer, TransferStatus } from './model';

interface FileTransferPanelProps {
  transfers: FileTransfer[];
  /** Whether this user can send right now (connection live, and permitted for viewers). */
  canSend: boolean;
  /** Shown instead of the drop zone hint when sending is unavailable. */
  unavailableReason?: string | undefined;
  /** Who files go to, for copy: "the viewer" / "the presenter". */
  peerLabel: string;
  onSend: (file: File) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

const statusBadge: Record<TransferStatus, { label: string; tone: BadgeTone }> = {
  offered: { label: 'Needs your OK', tone: 'warning' },
  awaiting: { label: 'Waiting', tone: 'neutral' },
  transferring: { label: 'Transferring', tone: 'info' },
  verifying: { label: 'Verifying', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

/**
 * Peer-to-peer file transfer. Files go straight to the other participant over the WebRTC
 * connection; the receiver accepts each one, and its SHA-256 is checked before it can be saved.
 */
export function FileTransferPanel({ transfers, canSend, unavailableReason, peerLabel, onSend, onAccept, onDecline, onCancel, onDismiss }: FileTransferPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onSend(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (canSend) pick(event.dataTransfer.files);
  };

  return (
    <Card as="section" aria-label="File transfer">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="file" size={16} className="text-muted-foreground" />
          <CardTitle>Files</CardTitle>
        </div>
        <CardDescription>Sent directly to {peerLabel}, never uploaded to the server. Up to {formatBytes(MAX_FILE_BYTES)}.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div
          className={cn(
            'flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-center transition-colors',
            dragging && canSend && 'border-ring bg-accent/50',
            !canSend && 'opacity-60',
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (canSend) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="text-sm text-muted-foreground">{canSend ? 'Drop a file here, or' : unavailableReason}</p>
          <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} aria-label="Choose a file to send" disabled={!canSend} onChange={(event) => pick(event.target.files)} />
          <Button variant="outline" disabled={!canSend} onClick={() => inputRef.current?.click()}>
            <Icon name="fileOutgoing" />
            Choose file
          </Button>
        </div>

        {transfers.length > 0 && (
          <ul className="flex flex-col gap-3" aria-label="Transfers">
            {transfers.map((transfer) => (
              <TransferRow
                key={transfer.id}
                transfer={transfer}
                onAccept={onAccept}
                onDecline={onDecline}
                onCancel={onCancel}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface TransferRowProps {
  transfer: FileTransfer;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

function TransferRow({ transfer, onAccept, onDecline, onCancel, onDismiss }: TransferRowProps) {
  const { id, direction, name, size, status, bytes, detail, url } = transfer;
  const badge = statusBadge[status];
  const finished = isFinished(status);
  const incoming = direction === 'incoming';
  const showProgress = status === 'transferring' || status === 'verifying';

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3" aria-label={`${incoming ? 'Incoming' : 'Outgoing'} file ${name}`}>
      <div className="flex items-start gap-3">
        <Icon name={incoming ? 'fileIncoming' : 'fileOutgoing'} size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={name}>{name}</p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {showProgress ? `${formatBytes(bytes)} of ${formatBytes(size)}` : formatBytes(size)}
          </p>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      {showProgress && (
        <progress
          className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
          max={size}
          value={bytes}
          aria-label={`Progress for ${name}`}
        />
      )}

      {detail && <p className={cn('text-xs text-muted-foreground', status === 'failed' && 'text-destructive')} role={status === 'failed' ? 'alert' : undefined}>{detail}</p>}

      {status === 'offered' && (
        <>
          <p className="text-xs text-muted-foreground">Only accept files you expect. The transfer is checked for errors, not for viruses.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onDecline(id)}>Decline</Button>
            <Button variant="primary" onClick={() => onAccept(id)}>
              <Icon name="check" />
              Accept
            </Button>
          </div>
        </>
      )}

      {(status === 'awaiting' || status === 'transferring') && (
        <div className="flex">
          <Button variant="ghost" onClick={() => onCancel(id)}>
            <Icon name="close" />
            Cancel
          </Button>
        </div>
      )}

      {finished && (
        <div className="flex gap-2">
          {status === 'done' && incoming && url && (
            <Button variant="primary" asChild>
              <a href={url} download={name}>
                <Icon name="save" />
                Save file
              </a>
            </Button>
          )}
          <Button variant="ghost" onClick={() => onDismiss(id)} aria-label={`Remove ${name} from the list`}>
            Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}
