// Signaling contract shared by the Node server (server.ts) and the web client (web/src/shared/api).
// Keep this file dependency-free and erasable-syntax-only: Node runs it directly via type stripping,
// and it must not rely on DOM types so the server can compile it without the DOM lib.

export type Role = 'host' | 'viewer';

/** Maximum chat message length, enforced by the server. */
export const MAX_CHAT_LENGTH = 2000;

/** Structural equivalent of the DOM `RTCSessionDescriptionInit`. */
export interface SessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

/** Structural equivalent of the DOM `RTCIceCandidateInit`. */
export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface RoomResponse {
  id: string;
  hostToken: string;
  viewerToken: string;
  /** The presenter's permanent device ID, when the room was created with a device secret. */
  deviceId?: string;
}

/** Response of `POST /api/devices/:id/connect`: credentials to request access to that device's live room. */
export interface DeviceConnectResponse {
  id: string;
  viewerToken: string;
}

/** Structural equivalent of the DOM `RTCIceServer`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Response of `GET /api/rooms/:id/ice`: the STUN/TURN servers a peer connection should use. */
export interface IceConfigResponse {
  iceServers: IceServer[];
}

export interface ChatMessage {
  role: Role;
  text: string;
  timestamp: number;
}

/**
 * What the presenter lets an approved viewer do. New permissions are added here with their feature.
 * Each is enforced where the data flows, so a modified client cannot bypass it:
 * - `chat`: by the server, which relays chat.
 * - `files`: by the presenter's app, which refuses file offers from the viewer (files go peer to peer).
 * - `pointer`: by the presenter's app, which ignores pointer messages from the viewer.
 */
export interface ViewerPermissions {
  chat: boolean;
  /** The viewer may send files to the presenter. Off by default: incoming files are a risk. */
  files: boolean;
  /** The viewer may point at the shared screen (shown on the presenter's preview). */
  pointer: boolean;
}

export const DEFAULT_VIEWER_PERMISSIONS: Readonly<ViewerPermissions> = { chat: true, files: false, pointer: true };

export function isViewerPermissions(value: unknown): value is ViewerPermissions {
  return isRecord(value) && typeof value.chat === 'boolean' && typeof value.files === 'boolean' && typeof value.pointer === 'boolean';
}

/** Copies only the known fields, so stray properties from a client are never stored or relayed. */
export const pickViewerPermissions = (value: ViewerPermissions): ViewerPermissions => ({ chat: value.chat, files: value.files, pointer: value.pointer });

/** Events the server pushes over the SSE stream. */
export type SignalMessage =
  | { type: 'ready' }
  | { type: 'viewer-request' }
  | { type: 'approved'; data: { permissions: ViewerPermissions } }
  | { type: 'permissions'; data: ViewerPermissions }
  | { type: 'rejected' }
  | { type: 'ended' }
  | { type: 'peer-left' }
  | { type: 'offer'; data: SessionDescription }
  | { type: 'answer'; data: SessionDescription }
  | { type: 'ice'; data: IceCandidate }
  | { type: 'chat'; data: ChatMessage };

export type SignalEventType = SignalMessage['type'];

/** Messages a client posts to `/api/rooms/:id/signal`. */
export type OutgoingSignal =
  /** `data` is optional for older clients; the server then applies DEFAULT_VIEWER_PERMISSIONS. */
  | { type: 'approve'; data?: { permissions: ViewerPermissions } }
  /** Presenter changes the approved viewer's permissions mid-session. */
  | { type: 'permissions'; data: ViewerPermissions }
  | { type: 'reject' }
  | { type: 'leave' }
  | { type: 'offer'; data: SessionDescription }
  | { type: 'answer'; data: SessionDescription }
  | { type: 'ice'; data: IceCandidate }
  | { type: 'chat'; data: { text: string } };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** True when `data` is a valid chat payload: non-blank text up to MAX_CHAT_LENGTH characters. */
export function isChatPayload(data: unknown): data is { text: string } {
  return isRecord(data) && typeof data.text === 'string' && data.text.trim() !== '' && data.text.length <= MAX_CHAT_LENGTH;
}
