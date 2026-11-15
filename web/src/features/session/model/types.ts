import type { ChatMessage, Role, ViewerPermissions } from '@/shared/api';
import type { FileTransfer } from '@/features/files';

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
  /** Video packets lost over the last stats interval, in percent. */
  packetLossPercent: number | null;
}

export type ServiceStatus = 'checking' | 'ready' | 'offline';

/**
 * Why a session ended, so the UI can confirm it accurately.
 * - `local`: this user chose End session / Leave.
 * - `source-stopped`: the presenter stopped capture from the browser's own sharing bar.
 * - `remote`: the other side ended or left.
 * - `declined`: the presenter declined the viewer's request.
 * - `connection`: signaling or media was lost, or setup failed.
 */
export type EndReason = 'local' | 'source-stopped' | 'remote' | 'declined' | 'connection';

/** Shown in the stage after a session ends; cleared when the next one starts. */
export interface EndSummary {
  role: Role;
  reason: EndReason;
  seconds: number;
}

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
  /** True while the peer-to-peer control channel is open (see lib/controlProtocol.ts). */
  controlReady: boolean;
  /**
   * Presenter: what the approved viewer may do. Viewer: what the presenter allows this viewer.
   * The server enforces it; this copy drives the UI.
   */
  viewerPermissions: ViewerPermissions;
  /**
   * Privacy pause. Presenter: their outgoing video is blanked. Viewer: the presenter has paused.
   * While paused the presenter sends black frames, so nothing on screen reaches the viewer.
   */
  paused: boolean;
  /**
   * Computer audio. Presenter: null when the screen picker supplied none, otherwise whether it
   * is being sent. Viewer: what the presenter reports (null until known or when there is none).
   */
  systemAudio: boolean | null;
  /** Presenter: their microphone is live. Viewer: the presenter's microphone is live. */
  micOn: boolean;
  /** File transfers in either direction, newest first (see FileTransferController). */
  transfers: FileTransfer[];
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
  /**
   * Permanent device ID. Presenter: this device's ID (viewers can save it). Viewer: the device
   * connected to, when joined by device ID rather than an invite link.
   */
  deviceId: string | null;
  inviteLink: string;
  joinedLink: string;
  quality: QualityKey;
  stats: StreamStats;
  elapsedSeconds: number;
  endSummary: EndSummary | null;
}

/** Record handed to the history feature when a session finishes. */
export interface SessionRecord {
  address: string;
  kind: string;
  seconds: number;
}

export interface SessionCallbacks {
  onToast: (message: string, tone?: 'success' | 'info' | 'error') => void;
  onChatMessage: (message: ChatMessage) => void;
  onChatReset: () => void;
  onSessionRecorded: (record: SessionRecord) => void;
}

export type JoinResult = { ok: true } | { ok: false; error: string };
