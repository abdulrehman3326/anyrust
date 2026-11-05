import type { ChatMessage, Role } from '@/shared/api';

export type SessionPhase =
  | 'idle'
  | 'choosing'
  | 'waiting'
  | 'request'
  | 'connecting'
  | 'live'
  | 'interrupted'
  | 'ended';

export type QualityKey = 'balanced' | 'motion' | 'detail';

export interface QualityPreset {
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export interface StreamStats {
  resolution: string | null;
  fps: number | null;
  bitrateMbps: number | null;
  latencyMs: number | null;
}

export type ServiceStatus = 'checking' | 'ready' | 'offline';

export interface SessionState {
  phase: SessionPhase;
  role: Role;
  /** True while a share or ending operation is in flight. */
  busy: boolean;
  ending: boolean;
  sample: boolean;
  /** True when a room exists (either presenting or viewing). */
  active: boolean;
  chatReady: boolean;
  approvalOpen: boolean;
  service: ServiceStatus;
  canCapture: boolean;
  stream: MediaStream | null;
  sourceLabel: string | null;
  title: string;
  statusText: string;
  metricsText: string;
  notice: string;
  roomId: string | null;
  inviteLink: string;
  joinedLink: string;
  quality: QualityKey;
  stats: StreamStats;
  elapsedSeconds: number;
}

/** Record handed to the history feature when a session finishes. */
export interface SessionRecord {
  address: string;
  kind: string;
  seconds: number;
}

export interface SessionCallbacks {
  onToast: (message: string) => void;
  onChatMessage: (message: ChatMessage) => void;
  onChatReset: () => void;
  onSessionRecorded: (record: SessionRecord) => void;
}

export type JoinResult = { ok: true } | { ok: false; error: string };
