import { api, ApiError, parseSignalMessage } from '@/shared/api';
import type { RoomSession, SignalMessage } from '@/shared/api';
import { createSampleStream } from '../lib/sampleStream';
import type { SampleStream } from '../lib/sampleStream';
import { buildInviteLink, InvitationError, parseInvitation } from '../lib/invitation';
import { qualityPresets } from '../lib/qualityPresets';
import type { JoinResult, QualityKey, SessionCallbacks, SessionPhase, SessionState, StreamStats } from './types';

const EMPTY_STATS: StreamStats = { resolution: null, fps: null, bitrateMbps: null, latencyMs: null };
const DISCONNECT_GRACE_MS = 10_000;

const initialState = (): SessionState => ({
  phase: 'idle',
  role: 'host',
  busy: false,
  ending: false,
  sample: false,
  active: false,
  chatReady: false,
  approvalOpen: false,
  service: 'checking',
  canCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
  stream: null,
  sourceLabel: null,
  title: 'Preview',
  statusText: 'Not connected',
  metricsText: 'Ready to connect',
  notice: '',
  roomId: null,
  inviteLink: '',
  joinedLink: '',
  quality: 'balanced',
  stats: EMPTY_STATS,
  elapsedSeconds: 0,
});

/**
 * Framework-free controller for a presenting or viewing session. React reads it
 * through `useSyncExternalStore`; every state change publishes a new immutable snapshot.
 *
 * A `generation` counter invalidates callbacks from earlier sessions so a late
 * event can never touch the current one.
 */
export class SessionEngine {
  private state: SessionState = initialState();
  private listeners = new Set<() => void>();
  private room: RoomSession | null = null;
  private events: EventSource | null = null;
  private peer: RTCPeerConnection | null = null;
  private sampleSource: SampleStream | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private statsPrevious: { bytes: number; timestamp: number } | null = null;
  private generation = 0;
  private startedAt: number | null = null;
  private lastSession: { address: string; kind: string } | null = null;
  private listening = false;

  constructor(private readonly callbacks: SessionCallbacks) {}

  // ---- external store -----------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionState => this.state;

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setPhase(statusText: string, phase: SessionPhase): void {
    this.set({ statusText, phase });
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Attaches window listeners, checks the service and opens a link in the URL hash. */
  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('online', this.checkService);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('pagehide', this.handlePageHide);
    void this.checkService();
    if (!this.state.canCapture) {
      this.set({ notice: 'This browser can join sessions but can’t share a screen. To present, use a desktop browser over HTTPS or localhost.' });
    }
    if (location.hash.startsWith('#join=')) void this.join(location.href);
  }

  dispose(): void {
    this.listening = false;
    window.removeEventListener('online', this.checkService);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('pagehide', this.handlePageHide);
  }

  checkService = async (): Promise<void> => {
    try {
      await api.health();
      this.set({ service: 'ready' });
    } catch {
      this.set({ service: 'offline', notice: 'Service unavailable. It may be starting up wait a moment, then refresh the page.' });
    }
  };

  private handleOffline = (): void => {
    this.set({ service: 'offline', notice: 'You’re offline. Reconnect to start or join a session.' });
  };

  private handlePageHide = (): void => {
    this.state.stream?.getTracks().forEach((track) => track.stop());
    const room = this.room;
    if (!room) return;
    if (this.state.role === 'host') void api.deleteRoom(room, { keepalive: true }).catch(() => undefined);
    else void api.signal(room, { type: 'leave' }, { keepalive: true }).catch(() => undefined);
  };

  // ---- simple setters -----------------------------------------------------

  dismissNotice = (): void => this.set({ notice: '' });

  setQuality = (quality: QualityKey): void => {
    this.set({ quality });
    this.applyQuality().catch((error: unknown) => this.callbacks.onToast(`Couldn’t change stream quality: ${errorMessage(error)}`));
  };

  // ---- presenting ---------------------------------------------------------

  share = async (useSample: boolean): Promise<void> => {
    if (this.state.busy || this.state.ending || this.room) return;
    this.set({ busy: true, sample: useSample, notice: '' });
    this.setPhase(useSample ? 'Preparing demo stream…' : 'Select a source in the browser dialog…', 'choosing');
    let acquired: MediaStream | undefined;
    try {
      if (!useSample && !navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing requires a desktop browser over HTTPS or localhost.');
      const preset = qualityPresets[this.state.quality];
      if (useSample) {
        this.sampleSource = createSampleStream();
        acquired = this.sampleSource.stream;
      } else {
        acquired = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps } },
          audio: false,
        });
      }
      this.set({ phase: 'connecting', role: 'host' });
      const created = await api.createRoom();
      this.room = { id: created.id, token: created.hostToken, viewerToken: created.viewerToken };
      this.generation++;
      this.startedAt = null;
      this.lastSession = { address: created.id, kind: useSample ? 'Demo stream' : 'Shared screen' };
      acquired.getVideoTracks()[0]?.addEventListener('ended', () => void this.endSession());
      this.set({
        active: true,
        roomId: created.id,
        inviteLink: buildInviteLink(location.origin, created.id, created.viewerToken),
        stream: acquired,
        sourceLabel: useSample ? 'Demo stream' : 'Local preview',
        title: 'Ready to share',
        metricsText: useSample ? 'Sample source · 1280 × 720' : 'Source selected',
      });
      this.setPhase('Waiting for a viewer to join', 'waiting');
      this.listen();
      this.callbacks.onToast(useSample ? 'Demo stream started. Open the viewer to test the connection.' : 'Sharing started. Copy the invite link to invite a viewer.');
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      this.sampleSource?.stop();
      this.sampleSource = null;
      if (this.room) await this.endSession();
      else this.setPhase('Not connected', 'idle');
      this.callbacks.onToast(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Screen selection was canceled.' : errorMessage(error));
    } finally {
      this.set({ busy: false });
    }
  };

  approveViewer = async (): Promise<void> => {
    this.set({ approvalOpen: false });
    const room = this.room;
    const stream = this.state.stream;
    if (!room || !stream) return;
    try {
      await api.signal(room, { type: 'approve' });
      this.set({ chatReady: true });
      const pc = this.makePeer();
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      await pc.setLocalDescription(await pc.createOffer());
      if (!pc.localDescription) throw new Error('Couldn’t prepare the connection. Try again.');
      await api.signal(room, { type: 'offer', data: pc.localDescription.toJSON() });
      await this.applyQuality();
      if (pc === this.peer && pc.connectionState !== 'connected') this.setPhase('Connecting to viewer…', 'connecting');
    } catch (error) {
      this.callbacks.onToast(errorMessage(error));
      await this.endSession();
    }
  };

  rejectViewer = async (): Promise<void> => {
    this.set({ approvalOpen: false });
    const room = this.room;
    if (!room) return;
    try {
      await api.signal(room, { type: 'reject' });
      this.setPhase('Waiting for a viewer to join', 'waiting');
    } catch (error) {
      this.callbacks.onToast(errorMessage(error));
    }
  };

  // ---- viewing ------------------------------------------------------------

  join = async (value: string): Promise<JoinResult> => {
    if (this.state.busy || this.state.ending || this.room) return { ok: false, error: 'A session is already active.' };
    try {
      if (!value) throw new InvitationError('Paste the presenter’s invite link to continue.');
      const invitation = parseInvitation(value, location.origin);
      if (!window.RTCPeerConnection) throw new InvitationError('This browser doesn’t support WebRTC.');
      this.generation++;
      this.room = { id: invitation.id, token: invitation.token };
      this.startedAt = null;
      this.lastSession = { address: invitation.id, kind: 'Viewed session' };
      history.replaceState(null, '', '/');
      this.set({ role: 'viewer', active: true, roomId: invitation.id, notice: '', joinedLink: value, title: 'Waiting for approval', metricsText: 'Request sent' });
      this.setPhase('Waiting for the presenter to approve', 'waiting');
      this.listen();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  };

  // ---- chat ---------------------------------------------------------------

  sendChat = async (text: string): Promise<void> => {
    const room = this.room;
    const { chatReady, ending, service } = this.state;
    if (!room || !chatReady || ending || service !== 'ready') throw new Error('Messaging is available once the viewer is approved.');
    await api.signal(room, { type: 'chat', data: { text } });
  };

  // ---- ending -------------------------------------------------------------

  endSession = async (notify = true): Promise<void> => {
    if (this.state.ending || (!this.room && !this.state.stream)) return;
    this.set({ ending: true });
    const selected = this.room;
    const wasHost = this.state.role === 'host';
    this.generation++;
    this.events?.close();
    this.events = null;
    this.closePeer();
    this.sampleSource?.stop();
    this.sampleSource = null;
    this.state.stream?.getTracks().forEach((track) => track.stop());
    this.room = null;
    this.callbacks.onChatReset();
    this.set({
      stream: null,
      sourceLabel: null,
      active: false,
      chatReady: false,
      approvalOpen: false,
      roomId: null,
      inviteLink: '',
      joinedLink: '',
      title: 'Preview',
      role: 'host',
      metricsText: 'Ready to connect',
    });
    this.setPhase('Session ended', 'ended');
    if (this.lastSession) {
      const seconds = this.startedAt ? Math.max(1, Math.round((Date.now() - this.startedAt) / 1000)) : 0;
      this.callbacks.onSessionRecorded({ ...this.lastSession, seconds });
      this.lastSession = null;
    }
    try {
      if (selected && notify) {
        if (wasHost) await api.deleteRoom(selected);
        else await api.signal(selected, { type: 'leave' });
      }
    } catch {
      this.callbacks.onToast('Connection closed. The session may have expired.');
    } finally {
      this.set({ ending: false });
    }
  };

  // ---- signaling ----------------------------------------------------------

  private listen(): void {
    const room = this.room;
    if (!room) return;
    const current = this.generation;
    const source = new EventSource(api.eventsUrl(room));
    this.events = source;
    let queue = Promise.resolve();
    source.onmessage = (event: MessageEvent<string>) => {
      queue = queue
        .then(async () => {
          if (current !== this.generation || !this.room) return;
          await this.onSignal(parseSignalMessage(event.data));
        })
        .catch((error: unknown) => {
          if (current === this.generation) {
            this.callbacks.onToast(errorMessage(error));
            void this.endSession();
          }
        });
    };
    source.onerror = () => {
      if (current !== this.generation || this.state.ending) return;
      this.set({ notice: 'This session is no longer available. Ask the presenter for a new invite link, or start your own session.' });
      void this.endSession();
    };
  }

  private async onSignal(message: SignalMessage): Promise<void> {
    const role = this.state.role;
    switch (message.type) {
      case 'ready':
        return;
      case 'viewer-request':
        if (role !== 'host') return;
        this.set({ approvalOpen: true });
        this.setPhase('A viewer is requesting access', 'request');
        return;
      case 'approved':
        this.set({ chatReady: true });
        this.makePeer();
        this.setPhase('Approved · Establishing secure connection…', 'connecting');
        return;
      case 'offer': {
        if (role !== 'viewer') return;
        const peer = this.peer;
        if (!peer) throw new Error('The presenter must approve this session first');
        await peer.setRemoteDescription(message.data);
        await this.flushIce(peer);
        await peer.setLocalDescription(await peer.createAnswer());
        if (!peer.localDescription || !this.room) return;
        await api.signal(this.room, { type: 'answer', data: peer.localDescription.toJSON() });
        return;
      }
      case 'answer': {
        if (role !== 'host' || !this.peer) return;
        await this.peer.setRemoteDescription(message.data);
        await this.flushIce(this.peer);
        return;
      }
      case 'ice':
        if (this.peer?.remoteDescription) await this.peer.addIceCandidate(message.data);
        else this.pendingIce.push(message.data);
        return;
      case 'chat':
        this.callbacks.onChatMessage(message.data);
        return;
      case 'peer-left':
        this.callbacks.onChatReset();
        this.set({ chatReady: false, approvalOpen: false });
        if (role === 'host') {
          this.closePeer();
          this.setPhase('Viewer left · Waiting for a new viewer', 'waiting');
          this.set({ title: 'Ready to share', metricsText: 'Invite link is still active' });
        } else {
          this.callbacks.onToast('The presenter left the session.');
          await this.endSession(false);
        }
        return;
      case 'ended':
      case 'rejected':
        this.callbacks.onToast(message.type === 'rejected' ? 'Your request was declined by the presenter.' : 'The presenter ended the session.');
        await this.endSession(false);
        return;
    }
  }

  private async flushIce(peer: RTCPeerConnection): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const candidate of queued) await peer.addIceCandidate(candidate);
  }

  // ---- peer connection ----------------------------------------------------

  private makePeer(): RTCPeerConnection {
    this.closePeer();
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.peer = pc;
    const room = this.room;
    const current = this.generation;
    pc.onicecandidate = (event) => {
      if (!event.candidate || !room) return;
      api.signal(room, { type: 'ice', data: event.candidate.toJSON() }).catch((error: unknown) => {
        if (current === this.generation) this.callbacks.onToast(errorMessage(error));
      });
    };
    pc.ontrack = (event) => {
      const received = event.streams[0] ?? new MediaStream([event.track]);
      this.set({ stream: received, sourceLabel: 'View only' });
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.peer) return;
      const role = this.state.role;
      if (pc.connectionState === 'connected') {
        this.clearDisconnectTimer();
        this.startedAt ??= Date.now();
        this.setPhase(role === 'host' ? 'Live · Sharing your screen' : 'Live · Viewing presenter’s screen', 'live');
        this.set({ title: role === 'host' ? 'Sharing your screen' : 'Presenter’s screen' });
        this.statsTimer ??= setInterval(() => void this.updateStats(), 1000);
      } else if (pc.connectionState === 'failed') {
        this.set({ notice: 'Couldn’t establish a media connection. Restrictive networks can block it try again on the same network, or configure a TURN relay on the server.' });
        void this.endSession();
      } else if (pc.connectionState === 'disconnected') {
        this.setPhase('Connection interrupted', 'interrupted');
        this.disconnectTimer = setTimeout(() => {
          if (pc === this.peer && pc.connectionState === 'disconnected') {
            this.callbacks.onToast('The viewer left the session.');
            void this.endSession();
          }
        }, DISCONNECT_GRACE_MS);
      }
    };
    return pc;
  }

  private closePeer(): void {
    if (this.peer) {
      this.peer.onconnectionstatechange = null;
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.close();
    }
    this.peer = null;
    this.pendingIce = [];
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.clearDisconnectTimer();
    this.statsPrevious = null;
    this.set({ stats: EMPTY_STATS, elapsedSeconds: 0 });
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  private async applyQuality(): Promise<void> {
    const preset = qualityPresets[this.state.quality];
    const track = this.state.role === 'host' ? this.state.stream?.getVideoTracks()[0] : undefined;
    if (track && !this.state.sample) {
      await track.applyConstraints({ width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps } });
    }
    const sender = this.peer?.getSenders().find((item) => item.track?.kind === 'video');
    if (sender) {
      const parameters = sender.getParameters();
      parameters.encodings ||= [{}];
      for (const encoding of parameters.encodings) {
        encoding.maxBitrate = preset.bitrate;
        encoding.maxFramerate = preset.fps;
      }
      await sender.setParameters(parameters);
    }
  }

  private async updateStats(): Promise<void> {
    const pc = this.peer;
    if (!pc || this.startedAt === null) return;
    try {
      const reports = await pc.getStats();
      if (pc !== this.peer || this.startedAt === null) return;
      const elapsedSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
      let rtp: Record<string, number | undefined> | undefined;
      let rtt: number | undefined;
      const wanted = this.state.role === 'host' ? 'outbound-rtp' : 'inbound-rtp';
      for (const entry of reports.values()) {
        const report = entry as Record<string, unknown>;
        if (report.type === wanted && report.kind === 'video') rtp = report as Record<string, number | undefined>;
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) rtt = report.currentRoundTripTime as number | undefined;
      }
      if (!rtp) {
        this.set({ elapsedSeconds });
        return;
      }
      const bytes = rtp.bytesSent ?? rtp.bytesReceived ?? 0;
      const timestamp = rtp.timestamp ?? 0;
      const interval = this.statsPrevious ? (timestamp - this.statsPrevious.timestamp) / 1000 : 0;
      const bitrateMbps = this.statsPrevious && interval > 0 ? ((bytes - this.statsPrevious.bytes) * 8) / interval / 1e6 : 0;
      this.statsPrevious = { bytes, timestamp };
      const resolution = rtp.frameWidth ? `${rtp.frameWidth} × ${rtp.frameHeight}` : null;
      const fps = rtp.framesPerSecond == null ? null : Math.round(rtp.framesPerSecond);
      const latencyMs = rtt == null ? null : Math.round(rtt * 1000);
      this.set({
        elapsedSeconds,
        stats: { resolution, fps, bitrateMbps, latencyMs },
        metricsText: [resolution ?? 'Video', fps == null ? null : `${fps} fps`, `${bitrateMbps.toFixed(1)} Mbps`, latencyMs == null ? null : `${latencyMs} ms`].filter(Boolean).join(' · '),
      });
    } catch {
      /* A closed peer no longer has statistics. */
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error || error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
