import { AudioMixer } from './audioMixer';
import type { MixerContext } from './audioMixer';

/** Minimal fakes: enough Web Audio surface to observe wiring and track lifecycles. */
function fakeTrack(kind: 'audio' | 'video') {
  return { kind, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
  } as unknown as MediaStream;
}

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}

function setup(getMicrophone = vi.fn(async () => fakeStream([fakeTrack('audio')]))) {
  const outgoing = fakeTrack('audio');
  const sources: Array<ReturnType<typeof fakeNode>> = [];
  const gains: Array<ReturnType<typeof fakeNode>> = [];
  const context = {
    createMediaStreamDestination: () => ({ stream: fakeStream([outgoing]) }),
    createMediaStreamSource: () => {
      const node = fakeNode();
      sources.push(node);
      return node;
    },
    createGain: () => {
      const node = fakeNode();
      gains.push(node);
      return node;
    },
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as MixerContext;
  const mixer = new AudioMixer(context, getMicrophone);
  const [systemGain, micGain] = gains as [ReturnType<typeof fakeNode>, ReturnType<typeof fakeNode>];
  return { mixer, context, outgoing, sources, systemGain, micGain, getMicrophone };
}

describe('AudioMixer', () => {
  it('always exposes one outgoing track', () => {
    const { mixer, outgoing } = setup();
    expect(mixer.track).toBe(outgoing);
    expect(mixer.hasSystemAudio).toBe(false);
  });

  it('mixes computer audio only when the picker supplied it', () => {
    const { mixer, sources, systemGain } = setup();
    expect(mixer.setSystemStream(fakeStream([fakeTrack('video')]))).toBe(false);
    expect(mixer.hasSystemAudio).toBe(false);
    expect(mixer.setSystemStream(fakeStream([fakeTrack('video'), fakeTrack('audio')]))).toBe(true);
    expect(mixer.hasSystemAudio).toBe(true);
    expect(sources[0]?.connect).toHaveBeenCalledWith(systemGain);
  });

  it('mutes computer audio through its gain', () => {
    const { mixer, systemGain } = setup();
    mixer.setSystemEnabled(false);
    expect(systemGain.gain.value).toBe(0);
    mixer.setSystemEnabled(true);
    expect(systemGain.gain.value).toBe(1);
  });

  it('starts and fully stops the microphone', async () => {
    const micTrack = fakeTrack('audio');
    const { mixer, sources, micGain } = setup(vi.fn(async () => fakeStream([micTrack])));
    await mixer.enableMic();
    expect(mixer.micOn).toBe(true);
    expect(sources[0]?.connect).toHaveBeenCalledWith(micGain);
    mixer.disableMic();
    expect(mixer.micOn).toBe(false);
    expect(sources[0]?.disconnect).toHaveBeenCalled();
    expect(micTrack.stop).toHaveBeenCalled();
  });

  it('propagates a refused microphone and stays off', async () => {
    const { mixer } = setup(vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    }));
    await expect(mixer.enableMic()).rejects.toThrow('denied');
    expect(mixer.micOn).toBe(false);
  });

  it('close stops every track and the context, and ignores a late microphone', async () => {
    const micTrack = fakeTrack('audio');
    let resolveMic: (stream: MediaStream) => void = () => undefined;
    const { mixer, context, outgoing } = setup(vi.fn(() => new Promise<MediaStream>((resolve) => (resolveMic = resolve))));
    const pending = mixer.enableMic();
    mixer.close();
    resolveMic(fakeStream([micTrack]));
    await pending;
    expect(mixer.micOn).toBe(false);
    expect(micTrack.stop).toHaveBeenCalled();
    expect(outgoing.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
});
