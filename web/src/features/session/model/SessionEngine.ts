import { api, ApiError, DEFAULT_VIEWER_PERMISSIONS, isViewerPermissions, parseSignalMessage } from '@/shared/api';
import type { RoomSession, SignalMessage, ViewerPermissions } from '@/shared/api';
import { packetLossPercent } from '../lib/connectionQuality';
import { createAudioMixer } from '../lib/audioMixer';
import { getDeviceSecret, parseDeviceId } from '@/features/device';
import { formatRoomId } from '@/shared/lib';
import type { AudioMixer } from '../lib/audioMixer';
import { FILES_CHANNEL_LABEL, FileTransferController } from './FileTransferController';
import { createSampleStream } from '../lib/sampleStream';
import type { SampleStream } from '../lib/sampleStream';
import { buildInviteLink, InvitationError, parseInvitation } from '../lib/invitation';
import { qualityPresets } from '../lib/qualityPresets';
import { canSend, CONTROL_CHANNEL_LABEL, CONTROL_PROTOCOL_VERSION, parseControlMessage } from '../lib/controlProtocol';
import type { ControlMessage } from '../lib/controlProtocol';
import type { EndReason, JoinResult, QualityKey, SessionCallbacks, SessionPhase, SessionState, StreamStats } from './types';

const EMPTY_STATS: StreamStats = { resolution: null, fps: null, bitrateMbps: null, latencyMs: null, packetLossPercent: null };
/** How long a dropped connection may try to recover before the session ends. */
const RECONNECT_TIMEOUT_MS = 20_000;
/** A disconnected link often recovers by itself; the presenter restarts ICE only if it has not by then. */
const ICE_RESTART_DELAY_MS = 3_000;
/** ICE restarts the presenter attempts per interruption before giving up. */
const MAX_ICE_RESTARTS = 2;
const CONNECTION_FAILED_NOTICE =
  'Couldn’t establish a media connection. Restrictive networks can block it. Try again on the same network, or configure a TURN relay on the server.';

const initialState = (): SessionState => ({
  phase: 'idle',
  role: 'host',
  busy: false,
  ending: false,
  sample: false,
  active: false,
  chatReady: false,
  controlReady: false,
  viewerPermissions: { ...DEFAULT_VIEWER_PERMISSIONS },
  paused: false,
  systemAudio: null,
  micOn: false,
  deviceId: null,
  transfers: [],
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
  endSummary: null,
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
  /** The presenter's own capture, kept apart from `state.stream` so it is always stopped on teardown. */
  private captured: MediaStream | null = null;
  /** Presenter only: mixes computer audio and microphone into the one outgoing audio track. */
  private mixer: AudioMixer | null = null;
  /** Peer-to-peer file transfer; owns the files data channel. */
  private readonly files = new FileTransferController({
    role: () => this.state.role,
    viewerMaySendFiles: () => this.state.viewerPermissions.files,
    sendControl: (message) => this.sendControl(message),
    publish: (transfers) => this.set({ transfers }),
    toast: (message, tone) => this.callbacks.onToast(message, tone),
  });
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestarts = 0;
  private control: RTCDataChannel | null = null;
  private controlListeners = new Set<(message: ControlMessage) => void>();
  private pendingIce: RTCIceCandidateInit[] = [];
  private statsPrevious: { bytes: number; timestamp: number; lost: number; received: number } | null = null;
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
    // Capture must never outlive the controller that owns it.
    if (this.room || this.captured) void this.endSession(true, 'local', { silent: true });
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
    this.stopCapture();
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
    this.applyQuality().catch((error: unknown) => this.callbacks.onToast(`Couldn’t change stream quality: ${errorMessage(error)}`, 'error'));
  };

  // ---- presenting ---------------------------------------------------------

  /** Starts a hosted session. Resolves with the invite link once live, or `null` if it did not start. */
  share = async (useSample: boolean): Promise<string | null> => {
    if (this.state.busy || this.state.ending || this.room) return null;
    this.set({ busy: true, sample: useSample, notice: '', endSummary: null });
    this.setPhase(useSample ? 'Preparing demo stream…' : 'Select a source in the browser dialog…', 'choosing');
    let acquired: MediaStream | undefined;
    try {
      if (!useSample && !navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing requires a desktop browser over HTTPS or localhost.');
      const preset = qualityPresets[this.state.quality];
      if (useSample) {
        this.sampleSource = createSampleStream();
        acquired = this.sampleSource.stream;
      } else {
        // Audio is offered, not required: the picker shows a "share audio" checkbox the user controls.
        // Chromium shares system audio for whole screens on Windows and tab audio elsewhere.
        // Processing tuned for voice would damage music and video sound, so it is off.
        const options: DisplayMediaStreamOptions & { systemAudio?: 'include' | 'exclude' } = {
          video: { width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps } },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: 'include',
        };
        acquired = await navigator.mediaDevices.getDisplayMedia(options);
      }
      this.mixer = createAudioMixer();
      const hasSystemAudio = this.mixer?.setSystemStream(acquired) ?? false;
      this.set({ phase: 'connecting', role: 'host', systemAudio: hasSystemAudio ? true : null, micOn: false });
      const created = await api.createRoom(getDeviceSecret());
      this.room = { id: created.id, token: created.hostToken, viewerToken: created.viewerToken };
      this.generation++;
      this.startedAt = null;
      this.lastSession = { address: created.id, kind: useSample ? 'Demo stream' : 'Shared screen' };
      this.captured = acquired;
      // The browser's own "Stop sharing" control ends the track; treat that as ending the session.
      acquired.getVideoTracks()[0]?.addEventListener('ended', this.handleSourceEnded, { once: true });
      this.set({
        active: true,
        roomId: created.id,
        deviceId: created.deviceId ?? null,
        inviteLink: buildInviteLink(location.origin, created.id, created.viewerToken),
        stream: acquired,
        sourceLabel: useSample ? 'Demo stream' : 'Local preview',
        title: 'Ready to share',
        metricsText: useSample ? 'Sample source · 1280 × 720' : 'Source selected',
      });
      this.setPhase('Waiting for a viewer to join', 'waiting');
      this.listen();
      return this.state.inviteLink;
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      this.sampleSource?.stop();
      this.sampleSource = null;
      this.captured = null;
      this.mixer?.close();
      this.mixer = null;
      this.set({ systemAudio: null, micOn: false });
      if (this.room) await this.endSession(true, 'connection', { silent: true });
      else this.setPhase('Not connected', 'idle');
      this.callbacks.onToast(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Screen selection was canceled.' : errorMessage(error));
      return null;
    } finally {
      this.set({ busy: false });
    }
  };

  approveViewer = async (permissions: ViewerPermissions = DEFAULT_VIEWER_PERMISSIONS): Promise<void> => {
    this.set({ approvalOpen: false });
    const room = this.room;
    const stream = this.state.stream;
    if (!room || !stream) return;
    const current = this.generation;
    try {
      await api.signal(room, { type: 'approve', data: { permissions } });
      this.set({ chatReady: true, viewerPermissions: { ...permissions } });
      const iceServers = await this.loadIceServers(room);
      if (current !== this.generation) return;
      const pc = this.makePeer(iceServers);
      // Video from the capture plus the single mixed audio track (never the raw capture audio).
      // Adding tracks fires `negotiationneeded`; `negotiate` sends the offer.
      const audio = this.mixer?.track;
      const outgoing = new MediaStream([...stream.getVideoTracks(), ...(audio ? [audio] : [])]);
      for (const track of outgoing.getTracks()) pc.addTrack(track, outgoing);
      this.setPhase('Connecting to viewer…', 'connecting');
    } catch (error) {
      this.callbacks.onToast(errorMessage(error), 'error');
      await this.endSession(true, 'connection', { silent: true });
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
      this.callbacks.onToast(errorMessage(error), 'error');
    }
  };

  /** Presenter: changes what the approved viewer may do. The server enforces it and tells the viewer. */
  setViewerPermissions = async (permissions: ViewerPermissions): Promise<void> => {
    const room = this.room;
    if (!room || this.state.role !== 'host' || !this.state.chatReady) return;
    const previous = this.state.viewerPermissions;
    this.set({ viewerPermissions: { ...permissions } });
    if (previous.files && !permissions.files) this.files.onViewerPermissionRevoked();
    if (previous.pointer && !permissions.pointer) for (const listener of this.controlListeners) listener({ type: 'pointer-hide' });
    try {
      await api.signal(room, { type: 'permissions', data: permissions });
    } catch (error) {
      this.set({ viewerPermissions: previous });
      this.callbacks.onToast(`Couldn’t update viewer permissions: ${errorMessage(error)}`, 'error');
    }
  };

  /**
   * Presenter: privacy pause. Disabling the capture track makes the encoder send black frames,
   * so nothing on screen leaves the device while paused; the viewer is told via the control channel.
   */
  setPrivacyPause = (paused: boolean): void => {
    if (this.state.role !== 'host' || !this.captured) return;
    for (const track of this.captured.getVideoTracks()) track.enabled = !paused;
    this.set({ paused });
    this.sendControl({ type: 'privacy-pause', paused });
  };

  /** Presenter: mutes or unmutes computer audio (only when the picker supplied some). */
  setSystemAudio = (enabled: boolean): void => {
    if (this.state.role !== 'host' || !this.mixer?.hasSystemAudio) return;
    this.mixer.setSystemEnabled(enabled);
    this.set({ systemAudio: enabled });
    this.sendAudioState();
  };

  /** Presenter: turns the microphone on (asking permission) or fully off. */
  setMicrophone = async (enabled: boolean): Promise<void> => {
    const mixer = this.mixer;
    if (this.state.role !== 'host' || !mixer) return;
    if (!enabled) {
      mixer.disableMic();
      this.set({ micOn: false });
      this.sendAudioState();
      return;
    }
    try {
      await mixer.enableMic();
    } catch (error) {
      const blocked = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.callbacks.onToast(
        blocked ? 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.' : `Couldn’t start the microphone: ${errorMessage(error)}`,
        'error',
      );
      return;
    }
    if (mixer !== this.mixer) return;
    this.set({ micOn: true });
    this.sendAudioState();
  };

  private sendAudioState(): void {
    this.sendControl({ type: 'audio-state', system: this.state.systemAudio === true, mic: this.state.micOn });
  }

  // ---- file transfer --------------------------------------------------------

  sendFile = (file: File): Promise<void> => this.files.send(file);
  acceptFile = (id: string): void => this.files.accept(id);
  declineFile = (id: string): void => this.files.decline(id);
  cancelFile = (id: string): void => this.files.cancel(id);
  dismissFile = (id: string): void => this.files.dismiss(id);

  // ---- viewing ------------------------------------------------------------

  join = async (value: string): Promise<JoinResult> => {
    if (this.state.busy || this.state.ending || this.room) return { ok: false, error: 'A session is already active.' };
    try {
      if (!value) throw new InvitationError('Paste the presenter’s invite link or device ID to continue.');
      if (!window.RTCPeerConnection) throw new InvitationError('This browser doesn’t support WebRTC.');
      // A 9-digit device ID reaches whatever that device is sharing now; a link is a one-time invite.
      const deviceId = parseDeviceId(value);
      let invitation: { id: string; token: string };
      if (deviceId) {
        this.set({ busy: true });
        try {
          const access = await api.connectDevice(deviceId);
          invitation = { id: access.id, token: access.viewerToken };
        } finally {
          this.set({ busy: false });
        }
        if (this.room) return { ok: false, error: 'A session is already active.' };
      } else {
        invitation = parseInvitation(value, location.origin);
      }
      this.generation++;
      this.room = { id: invitation.id, token: invitation.token };
      this.startedAt = null;
      this.lastSession = deviceId ? { address: deviceId, kind: 'Viewed device' } : { address: invitation.id, kind: 'Viewed session' };
      history.replaceState(null, '', '/');
      this.set({
        role: 'viewer',
        active: true,
        endSummary: null,
        roomId: invitation.id,
        deviceId,
        notice: '',
        joinedLink: deviceId ? formatRoomId(deviceId) : value,
        title: 'Waiting for approval',
        metricsText: 'Request sent',
      });
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
    if (this.state.role === 'viewer' && !this.state.viewerPermissions.chat) throw new Error('The presenter turned off chat for this session.');
    await api.signal(room, { type: 'chat', data: { text } });
  };

  // ---- control channel ----------------------------------------------------

  /** Subscribes to validated control messages from the other side. Returns an unsubscribe function. */
  onControl = (listener: (message: ControlMessage) => void): (() => void) => {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  };

  /** Sends a control message if the channel is open and this role may send it. Returns whether it was sent. */
  sendControl = (message: ControlMessage): boolean => {
    const channel = this.control;
    if (!channel || channel.readyState !== 'open' || !canSend(this.state.role, message)) return false;
    channel.send(JSON.stringify(message));
    return true;
  };

  // ---- ending -------------------------------------------------------------

  /**
   * Tears a session down. Capture is stopped first and synchronously, before any network
   * call, so the browser's sharing indicator disappears the moment the session ends.
   */
  endSession = async (notify = true, reason: EndReason = 'local', options: { silent?: boolean } = {}): Promise<void> => {
    if (this.state.ending || (!this.room && !this.state.stream && !this.captured)) return;
    const selected = this.room;
    const role = this.state.role;
    const wasHost = role === 'host';
    const seconds = this.startedAt ? Math.max(1, Math.round((Date.now() - this.startedAt) / 1000)) : 0;
    this.stopCapture();
    this.state.stream?.getTracks().forEach((track) => track.stop());
    this.set({ ending: true });
    this.generation++;
    this.events?.close();
    this.events = null;
    this.closePeer();
    // Received files live only in memory for the session; ending it releases them.
    this.files.reset();
    this.room = null;
    this.callbacks.onChatReset();
    this.set({
      stream: null,
      sourceLabel: null,
      active: false,
      chatReady: false,
      paused: false,
      systemAudio: null,
      micOn: false,
      viewerPermissions: { ...DEFAULT_VIEWER_PERMISSIONS },
      approvalOpen: false,
      roomId: null,
      deviceId: null,
      inviteLink: '',
      joinedLink: '',
      title: 'Preview',
      role: 'host',
      metricsText: 'Ready to connect',
      endSummary: { role, reason, seconds },
    });
    this.setPhase(wasHost ? 'Session ended · Screen sharing stopped' : 'Session ended', 'ended');
    if (this.lastSession) {
      this.callbacks.onSessionRecorded({ ...this.lastSession, seconds });
      this.lastSession = null;
    }
    if (wasHost && !options.silent) {
      if (reason === 'local') this.callbacks.onToast('Session ended. Your screen is no longer being shared.', 'success');
      else if (reason === 'source-stopped') this.callbacks.onToast('You stopped sharing from the browser, so the session has ended.', 'info');
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

  private handleSourceEnded = (): void => {
    void this.endSession(true, 'source-stopped');
  };

  /** Stops the presenter's capture (screen or demo source) and detaches its end listener. */
  private stopCapture(): void {
    const captured = this.captured;
    this.captured = null;
    captured?.getVideoTracks()[0]?.removeEventListener('ended', this.handleSourceEnded);
    captured?.getTracks().forEach((track) => track.stop());
    this.sampleSource?.stop();
    this.sampleSource = null;
    // Closing the mixer also stops the microphone, so its recording indicator goes away too.
    this.mixer?.close();
    this.mixer = null;
  }

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
            this.callbacks.onToast(errorMessage(error), 'error');
            void this.endSession(true, 'connection');
          }
        });
    };
    source.onerror = () => {
      if (current !== this.generation || this.state.ending) return;
      this.set({ notice: 'This session is no longer available. Ask the presenter for a new invite link, or start your own session.' });
      void this.endSession(true, 'connection');
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
      case 'approved': {
        const granted = message.data?.permissions;
        this.set({ chatReady: true, viewerPermissions: isViewerPermissions(granted) ? { ...granted } : { ...DEFAULT_VIEWER_PERMISSIONS } });
        const room = this.room;
        const current = this.generation;
        if (!room) return;
        // Signals are processed in order, so the offer waits until this peer exists.
        const iceServers = await this.loadIceServers(room);
        if (current !== this.generation) return;
        this.makePeer(iceServers);
        this.setPhase('Approved · Establishing secure connection…', 'connecting');
        return;
      }
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
        // A late answer to a superseded offer (e.g. after an ICE restart) is ignored.
        if (role !== 'host' || !this.peer || this.peer.signalingState !== 'have-local-offer') return;
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
      case 'permissions': {
        if (role !== 'viewer' || !isViewerPermissions(message.data)) return;
        const chatChanged = message.data.chat !== this.state.viewerPermissions.chat;
        const filesChanged = message.data.files !== this.state.viewerPermissions.files;
        const previousPointer = this.state.viewerPermissions.pointer;
        this.set({ viewerPermissions: { ...message.data } });
        if (chatChanged) this.callbacks.onToast(message.data.chat ? 'The presenter turned chat back on.' : 'The presenter turned off chat for this session.', 'info');
        else if (filesChanged) this.callbacks.onToast(message.data.files ? 'The presenter allowed you to send files.' : 'The presenter turned off file sending.', 'info');
        else if (message.data.pointer !== previousPointer) this.callbacks.onToast(message.data.pointer ? 'The presenter allowed you to point at their screen.' : 'The presenter turned off your pointer.', 'info');
        return;
      }
      case 'peer-left':
        this.callbacks.onChatReset();
        // A privacy pause stays on for the next viewer; their permissions are chosen at approval.
        this.set({ chatReady: false, approvalOpen: false, viewerPermissions: { ...DEFAULT_VIEWER_PERMISSIONS } });
        if (role === 'host') {
          this.closePeer();
          this.setPhase('Viewer left · Waiting for a new viewer', 'waiting');
          this.set({ title: 'Ready to share', metricsText: 'Invite link is still active' });
        } else {
          this.callbacks.onToast('The presenter left the session.');
          await this.endSession(false, 'remote');
        }
        return;
      case 'ended':
      case 'rejected':
        this.callbacks.onToast(message.type === 'rejected' ? 'Your request was declined by the presenter.' : 'The presenter ended the session.');
        await this.endSession(false, message.type === 'rejected' ? 'declined' : 'remote');
        return;
    }
  }

  private async flushIce(peer: RTCPeerConnection): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const candidate of queued) await peer.addIceCandidate(candidate);
  }

  // ---- peer connection ----------------------------------------------------

  /**
   * STUN/TURN servers from the server's /ice endpoint. If it can't be reached the session still
   * works on the same network, so fall back to host candidates rather than failing.
   */
  private async loadIceServers(room: RoomSession): Promise<RTCIceServer[]> {
    try {
      return await api.iceServers(room);
    } catch {
      return [];
    }
  }

  /**
   * Creates the peer connection. The presenter is always the offerer: it opens the control
   * channel and answers every `negotiationneeded` (tracks added, ICE restarts) with a new offer.
   * The viewer only answers, so offers can never collide.
   */
  private makePeer(iceServers: RTCIceServer[]): RTCPeerConnection {
    this.closePeer();
    const pc = new RTCPeerConnection({ iceServers });
    this.peer = pc;
    const room = this.room;
    const current = this.generation;
    pc.onicecandidate = (event) => {
      if (!event.candidate || !room) return;
      api.signal(room, { type: 'ice', data: event.candidate.toJSON() }).catch((error: unknown) => {
        if (current === this.generation) this.callbacks.onToast(errorMessage(error), 'error');
      });
    };
    pc.ontrack = (event) => {
      const received = event.streams[0] ?? new MediaStream([event.track]);
      this.set({ stream: received, sourceLabel: 'View only' });
    };
    if (this.state.role === 'host') {
      this.attachControl(pc.createDataChannel(CONTROL_CHANNEL_LABEL, { ordered: true }), pc);
      // File bytes get their own channel so a large transfer never delays control messages.
      this.files.attach(pc.createDataChannel(FILES_CHANNEL_LABEL, { ordered: true }));
      pc.onnegotiationneeded = () => void this.negotiate(pc);
    } else {
      pc.ondatachannel = (event) => {
        if (pc !== this.peer) return;
        if (event.channel.label === CONTROL_CHANNEL_LABEL) this.attachControl(event.channel, pc);
        else if (event.channel.label === FILES_CHANNEL_LABEL) this.files.attach(event.channel);
      };
    }
    pc.onconnectionstatechange = () => this.onConnectionState(pc);
    return pc;
  }

  /** Presenter only: sends a fresh offer for the current state of `pc`. */
  private async negotiate(pc: RTCPeerConnection): Promise<void> {
    const room = this.room;
    if (!room || pc !== this.peer || pc.signalingState !== 'stable') return;
    try {
      // With no argument this creates the right offer, including after `restartIce()`.
      await pc.setLocalDescription();
      if (pc !== this.peer || !pc.localDescription) return;
      await api.signal(room, { type: 'offer', data: pc.localDescription.toJSON() });
    } catch (error) {
      if (pc !== this.peer) return;
      this.callbacks.onToast(errorMessage(error), 'error');
      await this.endSession(true, 'connection', { silent: true });
      return;
    }
    this.applyQuality().catch((error: unknown) => this.callbacks.onToast(`Couldn’t apply stream quality: ${errorMessage(error)}`, 'error'));
  }

  private onConnectionState(pc: RTCPeerConnection): void {
    if (pc !== this.peer) return;
    const role = this.state.role;
    switch (pc.connectionState) {
      case 'connected':
        this.clearReconnectTimer();
        this.iceRestarts = 0;
        this.startedAt ??= Date.now();
        this.setPhase(role === 'host' ? 'Live · Sharing your screen' : 'Live · Viewing presenter’s screen', 'live');
        this.set({ title: role === 'host' ? 'Sharing your screen' : 'Presenter’s screen' });
        this.statsTimer ??= setInterval(() => void this.updateStats(), 1000);
        return;
      case 'disconnected':
        // Often transient (Wi-Fi roaming, a brief drop). Give it a moment, then restart ICE.
        this.setPhase('Connection interrupted · Reconnecting…', 'interrupted');
        this.armReconnectTimer(pc);
        setTimeout(() => {
          if (pc === this.peer && pc.connectionState === 'disconnected') this.restartIce(pc);
        }, ICE_RESTART_DELAY_MS);
        return;
      case 'failed':
        if (this.startedAt === null) {
          // Never connected: the networks can't reach each other, and a restart won't change that.
          this.set({ notice: CONNECTION_FAILED_NOTICE });
          void this.endSession(true, 'connection');
          return;
        }
        this.setPhase('Connection interrupted · Reconnecting…', 'interrupted');
        this.armReconnectTimer(pc);
        this.restartIce(pc);
        return;
      default:
        return;
    }
  }

  /** Presenter only, bounded: `restartIce()` fires `negotiationneeded`, which sends an ICE-restart offer. */
  private restartIce(pc: RTCPeerConnection): void {
    if (this.state.role !== 'host' || this.iceRestarts >= MAX_ICE_RESTARTS) return;
    this.iceRestarts++;
    pc.restartIce();
  }

  /** Ends the session if the connection hasn't recovered within RECONNECT_TIMEOUT_MS. */
  private armReconnectTimer(pc: RTCPeerConnection): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (pc !== this.peer || pc.connectionState === 'connected') return;
      const other = this.state.role === 'host' ? 'viewer' : 'presenter';
      this.callbacks.onToast(`The connection to the ${other} was lost.`);
      void this.endSession(true, 'connection', { silent: true });
    }, RECONNECT_TIMEOUT_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private attachControl(channel: RTCDataChannel, pc: RTCPeerConnection): void {
    this.control = channel;
    const from = this.state.role === 'host' ? 'viewer' : 'host';
    channel.onopen = () => {
      if (pc !== this.peer) return;
      this.set({ controlReady: true });
      this.sendControl({ type: 'hello', version: CONTROL_PROTOCOL_VERSION });
      // A viewer that joins (or reconnects) while paused must see the pause screen immediately.
      if (this.state.role === 'host') {
        this.sendControl({ type: 'privacy-pause', paused: this.state.paused });
        this.sendAudioState();
      }
    };
    channel.onclose = () => {
      if (pc === this.peer) this.set({ controlReady: false });
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (pc !== this.peer) return;
      const message = parseControlMessage(event.data, from);
      if (!message) return;
      if (message.type === 'hello' && message.version !== CONTROL_PROTOCOL_VERSION) {
        this.set({ notice: 'The other side is running a different version of Deskstream. Refresh both pages to use every feature.' });
      }
      if (message.type === 'privacy-pause') this.set({ paused: message.paused });
      if (message.type === 'audio-state') this.set({ systemAudio: message.system, micOn: message.mic });
      if (message.type.startsWith('file-')) this.files.onControl(message as Parameters<FileTransferController['onControl']>[0]);
      // The presenter enforces the pointer permission: without it, pointer messages are dropped unread.
      if (message.type.startsWith('pointer-') && this.state.role === 'host' && !this.state.viewerPermissions.pointer) return;
      for (const listener of this.controlListeners) listener(message);
    };
  }

  private closePeer(): void {
    this.files.detach();
    if (this.control) {
      this.control.onopen = null;
      this.control.onclose = null;
      this.control.onmessage = null;
      this.control.close();
      this.control = null;
    }
    if (this.peer) {
      this.peer.onconnectionstatechange = null;
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.onnegotiationneeded = null;
      this.peer.ondatachannel = null;
      this.peer.close();
    }
    this.peer = null;
    this.pendingIce = [];
    this.iceRestarts = 0;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.clearReconnectTimer();
    this.statsPrevious = null;
    this.set({ stats: EMPTY_STATS, elapsedSeconds: 0, controlReady: false });
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
      // The presenter learns its loss from the viewer's RTCP reports (remote-inbound-rtp).
      let remoteFractionLost: number | undefined;
      const wanted = this.state.role === 'host' ? 'outbound-rtp' : 'inbound-rtp';
      for (const entry of reports.values()) {
        const report = entry as Record<string, unknown>;
        if (report.type === wanted && report.kind === 'video') rtp = report as Record<string, number | undefined>;
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video' && typeof report.fractionLost === 'number') remoteFractionLost = report.fractionLost;
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
      const lost = rtp.packetsLost ?? 0;
      const received = rtp.packetsReceived ?? 0;
      const loss =
        this.state.role === 'host'
          ? remoteFractionLost == null ? null : remoteFractionLost * 100
          : this.statsPrevious ? packetLossPercent(lost - this.statsPrevious.lost, received - this.statsPrevious.received) : null;
      this.statsPrevious = { bytes, timestamp, lost, received };
      const resolution = rtp.frameWidth ? `${rtp.frameWidth} × ${rtp.frameHeight}` : null;
      const fps = rtp.framesPerSecond == null ? null : Math.round(rtp.framesPerSecond);
      const latencyMs = rtt == null ? null : Math.round(rtt * 1000);
      this.set({
        elapsedSeconds,
        stats: { resolution, fps, bitrateMbps, latencyMs, packetLossPercent: loss },
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
