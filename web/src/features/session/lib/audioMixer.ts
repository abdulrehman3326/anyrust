/**
 * Presenter-side audio mixer. Computer audio (from the screen picker) and the optional
 * microphone are mixed into ONE outgoing track, so:
 *
 * - toggling the microphone never renegotiates the peer connection;
 * - the viewer plays a single track through the <video> element, which owns volume and mute.
 *
 * The outgoing track always exists while sharing (silent when both inputs are off); the
 * presenter tells the viewer what is actually audible via the `audio-state` control message.
 */

/** The subset of AudioContext the mixer uses; injectable for tests. */
export interface MixerContext {
  createMediaStreamDestination(): MediaStreamAudioDestinationNode;
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
  createGain(): GainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type GetMicrophone = () => Promise<MediaStream>;

/** Speech-tuned capture; echo cancellation matters because the presenter may be on speakers. */
export const defaultGetMicrophone: GetMicrophone = () =>
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });

export class AudioMixer {
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly systemGain: GainNode;
  private readonly micGain: GainNode;
  private systemSource: MediaStreamAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private closed = false;

  constructor(
    private readonly context: MixerContext,
    private readonly getMicrophone: GetMicrophone = defaultGetMicrophone,
  ) {
    this.destination = context.createMediaStreamDestination();
    this.systemGain = context.createGain();
    this.micGain = context.createGain();
    this.systemGain.connect(this.destination);
    this.micGain.connect(this.destination);
    // Contexts created outside a user gesture start suspended.
    void context.resume().catch(() => undefined);
  }

  /** The single mixed track to send to the viewer. */
  get track(): MediaStreamTrack | undefined {
    return this.destination.stream.getAudioTracks()[0];
  }

  /** True when the screen picker delivered computer audio. */
  get hasSystemAudio(): boolean {
    return this.systemSource !== null;
  }

  get micOn(): boolean {
    return this.micStream !== null;
  }

  /** Feeds the captured computer audio, if the picker supplied any. Returns whether it did. */
  setSystemStream(stream: MediaStream): boolean {
    if (this.closed || !stream.getAudioTracks().length) return false;
    this.systemSource?.disconnect();
    this.systemSource = this.context.createMediaStreamSource(stream);
    this.systemSource.connect(this.systemGain);
    return true;
  }

  setSystemEnabled(enabled: boolean): void {
    this.systemGain.gain.value = enabled ? 1 : 0;
  }

  /** Asks for the microphone and mixes it in. Rejects if the user or the browser refuses. */
  async enableMic(): Promise<void> {
    if (this.closed || this.micStream) return;
    const stream = await this.getMicrophone();
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.micStream = stream;
    this.micSource = this.context.createMediaStreamSource(stream);
    this.micSource.connect(this.micGain);
  }

  /** Stops the microphone entirely, so the browser's recording indicator turns off. */
  disableMic(): void {
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.disableMic();
    this.systemSource?.disconnect();
    this.systemSource = null;
    this.destination.stream.getTracks().forEach((track) => track.stop());
    void this.context.close().catch(() => undefined);
  }
}

/** Creates a mixer, or null where Web Audio is unavailable (the share then carries no audio). */
export function createAudioMixer(): AudioMixer | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return new AudioMixer(new AudioContext());
  } catch {
    return null;
  }
}
