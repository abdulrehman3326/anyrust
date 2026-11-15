import type { Role } from '@/shared/api';
import { MAX_FILE_NAME_LENGTH } from '@/features/files';
import type { DeclineReason } from '@/features/files';

/**
 * Peer-to-peer control messages, carried on an ordered RTCDataChannel that the presenter opens
 * next to the media tracks. Unlike chat (which goes through the server), these never leave the
 * WebRTC connection.
 *
 * Every message type has an allowed sender. The receiver enforces it, so a modified viewer can
 * never make the presenter act on a presenter-only message.
 */
export const CONTROL_CHANNEL_LABEL = 'deskstream-control';
export const CONTROL_PROTOCOL_VERSION = 1;
/** Larger frames are dropped unread; control messages are small by design. */
export const MAX_CONTROL_MESSAGE_BYTES = 16 * 1024;

export type ControlMessage =
  /** Sent by both sides when the channel opens, so mismatched app versions are detected. */
  | { type: 'hello'; version: number }
  /** Presenter paused (or resumed) the outgoing video for privacy. */
  | { type: 'privacy-pause'; paused: boolean }
  /** What the presenter's single audio track currently carries. */
  | { type: 'audio-state'; system: boolean; mic: boolean }
  // File transfer (either direction; the bytes travel on the separate files channel).
  /** Sender proposes a file. Nothing is sent until the receiver accepts. */
  | { type: 'file-offer'; id: string; name: string; size: number; mime: string; sha256: string }
  | { type: 'file-accept'; id: string }
  | { type: 'file-decline'; id: string; reason: DeclineReason }
  /** Either side stops a pending or running transfer. */
  | { type: 'file-cancel'; id: string }
  /** Receiver reports whether the checksum matched. */
  | { type: 'file-complete'; id: string; ok: boolean }
  // Viewer pointer. Coordinates are fractions (0–1) of the shared video frame, so they map onto
  // the presenter's preview at any size. The presenter ignores them without the `pointer` permission.
  | { type: 'pointer-move'; x: number; y: number }
  | { type: 'pointer-hide' }
  /** A click: the presenter sees a ripple at that spot. */
  | { type: 'pointer-ping'; x: number; y: number };

export type ControlMessageType = ControlMessage['type'];

/** Who may send each message type. */
const allowedSenders: Record<ControlMessageType, readonly Role[]> = {
  hello: ['host', 'viewer'],
  'privacy-pause': ['host'],
  'audio-state': ['host'],
  // Both roles may use the file messages; the presenter additionally refuses viewer offers
  // unless the viewer has the `files` permission (enforced in the engine, which knows it).
  'file-offer': ['host', 'viewer'],
  'file-accept': ['host', 'viewer'],
  'file-decline': ['host', 'viewer'],
  'file-cancel': ['host', 'viewer'],
  'file-complete': ['host', 'viewer'],
  'pointer-move': ['viewer'],
  'pointer-hide': ['viewer'],
  'pointer-ping': ['viewer'],
};

const isFraction = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const declineReasons: readonly DeclineReason[] = ['declined', 'busy', 'not-allowed', 'too-large'];
const isTransferId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,64}$/i.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isControlMessage(value: Record<string, unknown>): value is ControlMessage {
  switch (value.type) {
    case 'hello':
      return Number.isInteger(value.version);
    case 'privacy-pause':
      return typeof value.paused === 'boolean';
    case 'audio-state':
      return typeof value.system === 'boolean' && typeof value.mic === 'boolean';
    case 'file-offer':
      return (
        isTransferId(value.id) &&
        typeof value.name === 'string' && value.name.length > 0 && value.name.length <= MAX_FILE_NAME_LENGTH * 4 &&
        // Size limits are the engine's job, so it can answer 'too-large' instead of ignoring the offer.
        Number.isSafeInteger(value.size) && (value.size as number) > 0 &&
        typeof value.mime === 'string' && value.mime.length <= 255 &&
        typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256)
      );
    case 'file-accept':
    case 'file-cancel':
      return isTransferId(value.id);
    case 'file-decline':
      return isTransferId(value.id) && declineReasons.includes(value.reason as DeclineReason);
    case 'file-complete':
      return isTransferId(value.id) && typeof value.ok === 'boolean';
    case 'pointer-move':
    case 'pointer-ping':
      return isFraction(value.x) && isFraction(value.y);
    case 'pointer-hide':
      return true;
    default:
      return false;
  }
}

/**
 * Decodes a frame received from `from`. Returns null for anything malformed, oversized,
 * unknown, or not permitted for that sender; callers ignore null.
 */
export function parseControlMessage(raw: unknown, from: Role): ControlMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_CONTROL_MESSAGE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isControlMessage(value)) return null;
  return allowedSenders[value.type].includes(from) ? value : null;
}

/** True when `role` may send `message`; used to refuse sending what the peer would drop. */
export function canSend(role: Role, message: ControlMessage): boolean {
  return allowedSenders[message.type].includes(role);
}
