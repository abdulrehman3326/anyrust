export interface SampleStream {
  stream: MediaStream;
  stop: () => void;
}

const WIDTH = 1280;
const HEIGHT = 720;

const paletteKeys = ['canvas', 'header', 'panel', 'accent', 'bar', 'heading', 'body', 'caption'] as const;
type SamplePalette = Record<(typeof paletteKeys)[number], string>;

/** Reads the fixed sample palette (--sample-* tokens in globals.css). */
function readSamplePalette(): SamplePalette {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(paletteKeys.map((key) => [key, style.getPropertyValue(`--sample-${key}`).trim()])) as SamplePalette;
}

/**
 * Animated canvas used by "Try a sample stream". It never captures the desktop.
 * One fixed palette in both themes.
 */
export function createSampleStream(): SampleStream {
  const colors = readSamplePalette();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the sample stream.');

  const begin = performance.now();
  let handle = 0;
  const draw = (now: number) => {
    const t = (now - begin) / 1000;
    ctx.fillStyle = colors.canvas; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = colors.header; ctx.fillRect(0, 0, WIDTH, 48);
    ctx.fillStyle = colors.panel; ctx.font = "500 16px 'Inter Variable', sans-serif"; ctx.fillText('Deskstream · Demo workspace', 26, 30);
    ctx.fillStyle = colors.panel; ctx.fillRect(70, 100, 1140, 530);
    ctx.fillStyle = colors.accent; ctx.fillRect(70, 100, 9, 530);
    ctx.fillStyle = colors.caption; ctx.font = "500 14px 'Geist Mono Variable', monospace"; ctx.fillText('LIVE WEBRTC STREAM · GENERATED DEMO SOURCE', 116, 155);
    ctx.fillStyle = colors.heading; ctx.font = "600 46px 'Geist Variable', sans-serif"; ctx.fillText('Secure screen sharing, on your terms.', 115, 229);
    ctx.fillStyle = colors.body; ctx.font = "20px 'Inter Variable', sans-serif"; ctx.fillText('This generated source streams to your viewer. Your screen is never captured.', 116, 274);
    for (let i = 0; i < 25; i++) {
      const height = 25 + 105 * (0.5 + Math.sin(t * 1.8 + i * 0.3) / 2);
      ctx.fillStyle = i % 4 === 0 ? colors.accent : colors.bar;
      ctx.fillRect(118 + i * 39, 500 - height, 25, height);
    }
    ctx.fillStyle = colors.caption; ctx.font = "15px 'Geist Mono Variable', monospace"; ctx.fillText(`LIVE  ·  ${t.toFixed(1)} s`, 118, 556);
    handle = requestAnimationFrame(draw);
  };
  draw(begin);

  const video = canvas.captureStream(30);
  const chime = createChime();
  const stream = new MediaStream([...video.getVideoTracks(), ...(chime ? [chime.track] : [])]);
  return {
    stream,
    stop: () => {
      cancelAnimationFrame(handle);
      chime?.stop();
    },
  };
}

const CHIME_INTERVAL_MS = 2000;

/**
 * Stands in for "computer audio" in the demo: a quiet two-note chime every two seconds, so
 * audio can be tested end to end without capturing anything. Null where Web Audio is missing.
 */
function createChime(): { track: MediaStreamTrack; stop: () => void } | null {
  if (typeof AudioContext === 'undefined') return null;
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  const destination = context.createMediaStreamDestination();
  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    void context.close();
    return null;
  }
  void context.resume().catch(() => undefined);
  const ring = () => {
    const start = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.18;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain).connect(destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
  };
  ring();
  const timer = setInterval(ring, CHIME_INTERVAL_MS);
  return {
    track,
    stop: () => {
      clearInterval(timer);
      track.stop();
      void context.close().catch(() => undefined);
    },
  };
}
