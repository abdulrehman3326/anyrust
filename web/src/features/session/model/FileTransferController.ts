import type { Role } from '@/shared/api';
import { FILE_CHUNK_BYTES, MAX_FILE_BYTES, declineMessages, formatBytes, isFinished, newTransferId, sanitizeFileName, sha256Hex } from '@/features/files';
import type { DeclineReason, FileTransfer } from '@/features/files';
import type { ControlMessage } from '../lib/controlProtocol';

export const FILES_CHANNEL_LABEL = 'deskstream-files';

/** Pause sending above this much queued data; resume once it drains below the low mark. */
const BUFFER_HIGH_BYTES = 1024 * 1024;
const BUFFER_LOW_BYTES = 256 * 1024;
/** Progress updates are throttled so a fast transfer doesn't re-render thousands of times. */
const PROGRESS_INTERVAL_MS = 100;
/** Finished transfers kept in the list. */
const HISTORY_LIMIT = 20;

type FileMessage = Extract<ControlMessage, { type: `file-${string}` }>;

/** What the controller needs from the session; implemented by SessionEngine. */
export interface TransferHost {
  role(): Role;
  /** Presenter side: whether the approved viewer may send files. */
  viewerMaySendFiles(): boolean;
  sendControl(message: ControlMessage): boolean;
  publish(transfers: FileTransfer[]): void;
  toast(message: string, tone?: 'success' | 'info' | 'error'): void;
}

interface Incoming {
  id: string;
  size: number;
  mime: string;
  sha256: string;
  chunks: ArrayBuffer[];
  received: number;
  accepted: boolean;
}

/**
 * Peer-to-peer file transfer over a dedicated ordered data channel.
 *
 * Protocol (control channel): sender `file-offer` (name, size, type, SHA-256) → receiver
 * `file-accept` or `file-decline` → sender streams raw 16 KiB chunks on the files channel →
 * receiver verifies the SHA-256 and replies `file-complete`. Either side may `file-cancel`.
 *
 * Nothing is sent before the receiver accepts. At most one transfer runs per direction, which
 * lets chunks carry no header: the receiver knows they belong to its single accepted transfer.
 */
export class FileTransferController {
  private channel: RTCDataChannel | null = null;
  private transfers: FileTransfer[] = [];
  private outgoingFile: { id: string; file: File } | null = null;
  private incoming: Incoming | null = null;
  private lastProgress = 0;

  constructor(private readonly host: TransferHost) {}

  // ---- channel lifecycle ----------------------------------------------------

  attach(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (channel === this.channel && event.data instanceof ArrayBuffer) void this.onChunk(event.data);
    };
    channel.onclose = () => {
      if (channel === this.channel) this.failActive('The connection closed before the file finished.');
    };
  }

  /** The peer connection is going away (viewer left, reconnect, session end). */
  detach(): void {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.onclose = null;
      this.channel.close();
    }
    this.channel = null;
    this.failActive('The connection closed before the file finished.');
  }

  /** Forgets everything, releasing any received files held in memory. */
  reset(): void {
    this.detach();
    for (const transfer of this.transfers) if (transfer.url) URL.revokeObjectURL(transfer.url);
    this.transfers = [];
    this.publish();
  }

  // ---- user actions ---------------------------------------------------------

  async send(file: File): Promise<void> {
    const role = this.host.role();
    if (role === 'viewer' && !this.host.viewerMaySendFiles()) {
      this.host.toast(declineMessages['not-allowed'].outgoing, 'error');
      return;
    }
    if (!this.channelOpen()) {
      this.host.toast('Files can be sent once the connection is live.', 'error');
      return;
    }
    if (file.size === 0) {
      this.host.toast('Empty files can’t be sent.', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.host.toast(`“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`, 'error');
      return;
    }
    if (this.outgoingFile) {
      this.host.toast('Wait for the current file to finish before sending another.', 'info');
      return;
    }
    const id = newTransferId();
    // Claim the slot before hashing, so a double click can't start two transfers.
    this.outgoingFile = { id, file };
    const name = sanitizeFileName(file.name);
    const mime = file.type || 'application/octet-stream';
    this.upsert({ id, direction: 'outgoing', name, size: file.size, mime, status: 'awaiting', bytes: 0, detail: 'Preparing…' });
    let sha256: string;
    try {
      sha256 = await sha256Hex(file);
    } catch {
      this.outgoingFile = null;
      this.update(id, { status: 'failed', detail: 'Couldn’t read the file.' });
      return;
    }
    if (this.outgoingFile?.id !== id) return; // cancelled while hashing
    if (!this.host.sendControl({ type: 'file-offer', id, name, size: file.size, mime, sha256 })) {
      this.outgoingFile = null;
      this.update(id, { status: 'failed', detail: 'The connection isn’t ready. Try again.' });
      return;
    }
    this.update(id, { detail: 'Waiting for the other side to accept…' });
  }

  accept(id: string): void {
    const incoming = this.incoming;
    if (!incoming || incoming.id !== id || incoming.accepted) return;
    incoming.accepted = true;
    this.update(id, { status: 'transferring', detail: undefined });
    this.host.sendControl({ type: 'file-accept', id });
  }

  decline(id: string): void {
    if (this.incoming?.id !== id || this.incoming.accepted) return;
    this.incoming = null;
    this.host.sendControl({ type: 'file-decline', id, reason: 'declined' });
    this.update(id, { status: 'declined', detail: declineMessages.declined.incoming });
  }

  cancel(id: string): void {
    const transfer = this.find(id);
    if (!transfer || isFinished(transfer.status)) return;
    if (transfer.direction === 'outgoing' && this.outgoingFile?.id === id) this.outgoingFile = null;
    if (transfer.direction === 'incoming' && this.incoming?.id === id) this.incoming = null;
    this.host.sendControl({ type: 'file-cancel', id });
    this.update(id, { status: 'cancelled', detail: 'You cancelled this transfer.' });
  }

  /** Removes a finished transfer from the list and frees its memory. */
  dismiss(id: string): void {
    const transfer = this.find(id);
    if (!transfer || !isFinished(transfer.status)) return;
    if (transfer.url) URL.revokeObjectURL(transfer.url);
    this.transfers = this.transfers.filter((item) => item.id !== id);
    this.publish();
  }

  /** Presenter turned file sending off: stop anything the viewer is sending. */
  onViewerPermissionRevoked(): void {
    const incoming = this.incoming;
    if (this.host.role() !== 'host' || !incoming) return;
    this.incoming = null;
    this.host.sendControl({ type: 'file-decline', id: incoming.id, reason: 'not-allowed' });
    this.update(incoming.id, { status: 'cancelled', detail: 'Stopped: you turned off file transfer for the viewer.' });
  }

  // ---- protocol -------------------------------------------------------------

  onControl(message: FileMessage): void {
    switch (message.type) {
      case 'file-offer':
        this.onOffer(message);
        return;
      case 'file-accept':
        if (this.outgoingFile?.id === message.id && this.find(message.id)?.status === 'awaiting') {
          this.update(message.id, { status: 'transferring', detail: undefined });
          void this.stream(message.id);
        }
        return;
      case 'file-decline':
        if (this.outgoingFile?.id === message.id) this.outgoingFile = null;
        // A presenter can also revoke a running transfer, which arrives as a decline.
        this.updateIfActive(message.id, { status: 'declined', detail: declineMessages[message.reason].outgoing });
        return;
      case 'file-cancel':
        if (this.outgoingFile?.id === message.id) this.outgoingFile = null;
        if (this.incoming?.id === message.id) this.incoming = null;
        this.updateIfActive(message.id, { status: 'cancelled', detail: 'The other side cancelled this transfer.' });
        return;
      case 'file-complete':
        if (this.outgoingFile?.id !== message.id) return;
        this.outgoingFile = null;
        this.updateIfActive(
          message.id,
          message.ok
            ? { status: 'done', detail: 'Delivered and verified.' }
            : { status: 'failed', detail: 'The file arrived damaged (checksum mismatch). Try sending it again.' },
        );
        return;
    }
  }

  private onOffer(offer: Extract<FileMessage, { type: 'file-offer' }>): void {
    const name = sanitizeFileName(offer.name);
    const entry: FileTransfer = { id: offer.id, direction: 'incoming', name, size: offer.size, mime: offer.mime || 'application/octet-stream', status: 'offered', bytes: 0 };
    let refusal: DeclineReason | null = null;
    if (this.host.role() === 'host' && !this.host.viewerMaySendFiles()) refusal = 'not-allowed';
    else if (offer.size > MAX_FILE_BYTES) refusal = 'too-large';
    else if (this.incoming) refusal = 'busy';
    if (refusal) {
      this.host.sendControl({ type: 'file-decline', id: offer.id, reason: refusal });
      // Busy offers aren't shown; the others tell this user what was blocked and why.
      if (refusal !== 'busy') this.upsert({ ...entry, status: 'declined', detail: declineMessages[refusal].incoming });
      return;
    }
    this.incoming = { id: offer.id, size: offer.size, mime: entry.mime, sha256: offer.sha256, chunks: [], received: 0, accepted: false };
    this.upsert(entry);
    const from = this.host.role() === 'host' ? 'The viewer' : 'The presenter';
    this.host.toast(`${from} wants to send you “${name}” (${formatBytes(offer.size)}).`, 'info');
  }

  private async onChunk(chunk: ArrayBuffer): Promise<void> {
    const incoming = this.incoming;
    if (!incoming?.accepted) return; // stray bytes after a cancel
    incoming.chunks.push(chunk);
    incoming.received += chunk.byteLength;
    if (incoming.received > incoming.size) {
      this.incoming = null;
      this.host.sendControl({ type: 'file-complete', id: incoming.id, ok: false });
      this.update(incoming.id, { status: 'failed', detail: 'Received more data than announced; the file was discarded.' });
      return;
    }
    this.progress(incoming.id, incoming.received, incoming.received === incoming.size);
    if (incoming.received < incoming.size) return;

    this.incoming = null;
    this.update(incoming.id, { status: 'verifying', detail: 'Checking integrity…' });
    const blob = new Blob(incoming.chunks, { type: incoming.mime });
    incoming.chunks = [];
    let ok = false;
    try {
      ok = (await sha256Hex(blob)) === incoming.sha256;
    } catch {
      ok = false;
    }
    if (this.find(incoming.id)?.status !== 'verifying') return; // reset meanwhile
    this.host.sendControl({ type: 'file-complete', id: incoming.id, ok });
    if (ok) this.update(incoming.id, { status: 'done', detail: 'Verified. Ready to save.', url: URL.createObjectURL(blob) });
    else this.update(incoming.id, { status: 'failed', detail: 'The file arrived damaged (checksum mismatch) and was discarded.' });
  }

  private async stream(id: string): Promise<void> {
    const outgoing = this.outgoingFile;
    const channel = this.channel;
    if (!outgoing || outgoing.id !== id || !channel) return;
    const { file } = outgoing;
    try {
      for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
        if (this.outgoingFile?.id !== id) return; // cancelled or declined mid-way
        if (channel.readyState !== 'open') throw new Error('closed');
        if (channel.bufferedAmount > BUFFER_HIGH_BYTES) await drained(channel);
        const chunk = await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
        if (this.outgoingFile?.id !== id) return;
        channel.send(chunk);
        const sent = Math.min(offset + chunk.byteLength, file.size);
        this.progress(id, sent, sent === file.size);
      }
      if (this.outgoingFile?.id === id) this.update(id, { status: 'verifying', detail: 'Waiting for the other side to verify…' });
    } catch {
      if (this.outgoingFile?.id !== id) return;
      this.outgoingFile = null;
      this.update(id, { status: 'failed', detail: 'The connection dropped while sending.' });
    }
  }

  // ---- state ----------------------------------------------------------------

  private channelOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  private failActive(detail: string): void {
    this.outgoingFile = null;
    this.incoming = null;
    let changed = false;
    this.transfers = this.transfers.map((transfer) => {
      if (isFinished(transfer.status)) return transfer;
      changed = true;
      return { ...transfer, status: 'failed', detail };
    });
    if (changed) this.publish();
  }

  private progress(id: string, bytes: number, final: boolean): void {
    const now = performance.now();
    if (!final && now - this.lastProgress < PROGRESS_INTERVAL_MS) return;
    this.lastProgress = now;
    this.update(id, { bytes });
  }

  private find(id: string): FileTransfer | undefined {
    return this.transfers.find((transfer) => transfer.id === id);
  }

  private upsert(transfer: FileTransfer): void {
    const rest = this.transfers.filter((item) => item.id !== transfer.id);
    const next = [transfer, ...rest];
    // Drop the oldest finished entries beyond the limit, freeing their memory.
    while (next.length > HISTORY_LIMIT) {
      const index = next.map((item) => isFinished(item.status)).lastIndexOf(true);
      if (index < 0) break;
      const [removed] = next.splice(index, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
    }
    this.transfers = next;
    this.publish();
  }

  private update(id: string, patch: Partial<FileTransfer>): void {
    let changed = false;
    this.transfers = this.transfers.map((transfer) => {
      if (transfer.id !== id) return transfer;
      changed = true;
      return { ...transfer, ...patch };
    });
    if (changed) this.publish();
  }

  private updateIfActive(id: string, patch: Partial<FileTransfer>): void {
    const transfer = this.find(id);
    if (transfer && !isFinished(transfer.status)) this.update(id, patch);
  }

  private publish(): void {
    this.host.publish(this.transfers);
  }
}

/** Resolves when the channel's send buffer drains below its low threshold; rejects if it closes. */
function drained(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      channel.removeEventListener('bufferedamountlow', done);
      channel.removeEventListener('close', fail);
      resolve();
    };
    const fail = () => {
      channel.removeEventListener('bufferedamountlow', done);
      channel.removeEventListener('close', fail);
      reject(new Error('closed'));
    };
    channel.addEventListener('bufferedamountlow', done);
    channel.addEventListener('close', fail);
  });
}
