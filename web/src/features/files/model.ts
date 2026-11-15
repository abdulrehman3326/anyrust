/** Largest file either side may send. The receiver holds the whole file in memory to verify it. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
/** 16 KiB stays under every browser's SCTP message limit, so Chromium and Firefox interoperate. */
export const FILE_CHUNK_BYTES = 16 * 1024;
export const MAX_FILE_NAME_LENGTH = 255;

export type TransferDirection = 'incoming' | 'outgoing';

/**
 * - `offered`: incoming, waiting for this user to accept or decline.
 * - `awaiting`: outgoing, waiting for the other side to accept.
 * - `transferring` → `verifying` → `done`: bytes flowing, checksum check, saved/sent.
 * - `declined` / `cancelled` / `failed`: terminal without a file.
 */
export type TransferStatus = 'offered' | 'awaiting' | 'transferring' | 'verifying' | 'done' | 'declined' | 'cancelled' | 'failed';

export type DeclineReason = 'declined' | 'busy' | 'not-allowed' | 'too-large';

export interface FileTransfer {
  id: string;
  direction: TransferDirection;
  name: string;
  size: number;
  mime: string;
  status: TransferStatus;
  /** Bytes sent or received so far. */
  bytes: number;
  /** Human-readable reason for declined/cancelled/failed. */
  detail?: string | undefined;
  /** Incoming and verified: an object URL the user can save. Revoked when the transfer is cleared. */
  url?: string | undefined;
}

export const isFinished = (status: TransferStatus): boolean =>
  status === 'done' || status === 'declined' || status === 'cancelled' || status === 'failed';

export const declineMessages: Record<DeclineReason, { incoming: string; outgoing: string }> = {
  declined: { incoming: 'You declined this file.', outgoing: 'The other side declined this file.' },
  busy: { incoming: 'Declined: another file was already in progress.', outgoing: 'The other side is busy with another file. Try again shortly.' },
  'not-allowed': { incoming: 'Declined: the viewer isn’t allowed to send files.', outgoing: 'The presenter hasn’t allowed file transfer.' },
  'too-large': { incoming: 'Declined: the file is larger than 100 MB.', outgoing: 'The file is larger than the 100 MB limit.' },
};
