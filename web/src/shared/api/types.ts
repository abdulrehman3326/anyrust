export type Role = 'host' | 'viewer';

export interface RoomResponse {
  id: string;
  hostToken: string;
  viewerToken: string;
}

/** Credentials used for every call on a room. */
export interface RoomSession {
  id: string;
  token: string;
  viewerToken?: string;
}

export interface ChatMessage {
  role: Role;
  text: string;
  timestamp: number;
}

export type SignalMessage =
  | { type: 'ready' }
  | { type: 'viewer-request' }
  | { type: 'approved' }
  | { type: 'rejected' }
  | { type: 'ended' }
  | { type: 'peer-left' }
  | { type: 'offer'; data: RTCSessionDescriptionInit }
  | { type: 'answer'; data: RTCSessionDescriptionInit }
  | { type: 'ice'; data: RTCIceCandidateInit }
  | { type: 'chat'; data: ChatMessage };

export type OutgoingSignal =
  | { type: 'approve' }
  | { type: 'reject' }
  | { type: 'leave' }
  | { type: 'offer'; data: RTCSessionDescriptionInit }
  | { type: 'answer'; data: RTCSessionDescriptionInit }
  | { type: 'ice'; data: RTCIceCandidateInit }
  | { type: 'chat'; data: { text: string } };
