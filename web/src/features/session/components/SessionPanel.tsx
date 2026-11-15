import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PointerOverlay, contentBox, popOutSupported, toFraction, usePopOut } from '@/features/pointer';
import type { PointerSignal, PointerSubscribe } from '@/features/pointer';
import { Badge, Button, Icon, useToast } from '@/shared/ui';
import { cn, formatClock } from '@/shared/lib';
import { connectionQuality, qualityBadge } from '../lib/connectionQuality';
import type { ControlMessage } from '../lib/controlProtocol';
import { PopOutStage } from './PopOutStage';
import { emptyState, phaseBadge } from '../lib/presentation';
import { captureFrame, downloadBlob, pictureInPictureSupported, screenshotFileName } from '../lib/stageTools';
import type { SessionState } from '../model/types';

export interface ChatSlotContext {
  open: boolean;
  fullscreen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SessionPanelProps {
  state: SessionState;
  /** The chat feature renders here so it travels with the panel into fullscreen. */
  renderChat: (context: ChatSlotContext) => ReactNode;
  /** Shown under the empty-stage message while no session is active, e.g. the start-sharing buttons. */
  idleActions?: ReactNode;
  /** Presenter only: pause or resume the outgoing video for privacy. */
  onPrivacyPauseChange?: (paused: boolean) => void;
  /** Presenter only: mute or unmute the captured computer audio. */
  onSystemAudioChange?: (enabled: boolean) => void;
  /** Presenter only: turn the microphone on or off. */
  onMicrophoneChange?: (enabled: boolean) => void;
  /** Peer-to-peer control channel (pointer). Omit to disable the pointer entirely. */
  onControl?: (listener: (message: ControlMessage) => void) => () => void;
  sendControl?: (message: ControlMessage) => boolean;
}

/** Turns control-channel pointer messages into overlay signals (presenter side). */
function pointerSignal(message: ControlMessage): PointerSignal | null {
  if (message.type === 'pointer-move') return { type: 'move', x: message.x, y: message.y };
  if (message.type === 'pointer-ping') return { type: 'ping', x: message.x, y: message.y };
  if (message.type === 'pointer-hide') return { type: 'hide' };
  return null;
}

const microphoneSupported = (): boolean => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/** How the remote screen fits the stage: scaled to fit, or pixel-for-pixel with scrolling. */
type ScaleMode = 'fit' | 'original';

export function SessionPanel({ state, renderChat, idleActions, onPrivacyPauseChange, onSystemAudioChange, onMicrophoneChange, onControl, sendControl }: SessionPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toast = useToast();
  const [fullscreen, setFullscreen] = useState(false);
  // Chat starts collapsed and opens itself once a viewer is approved.
  const [chatOpen, setChatOpen] = useState(state.chatReady);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [scale, setScale] = useState<ScaleMode>('fit');
  const [pip, setPip] = useState(false);
  // Viewers start muted: browsers block autoplay with sound until the user interacts.
  const [listening, setListening] = useState(false);
  const [volume, setVolume] = useState(1);

  const { stream, phase, role, active, paused, systemAudio, micOn } = state;
  const live = phase === 'live';
  const hosting = active && role === 'host';
  const viewing = active && role === 'viewer' && Boolean(stream);
  const badge = phaseBadge[phase];
  const empty = emptyState(role, active, phase, state.endSummary);
  const endedCleanly = phase === 'ended' && state.endSummary?.role === 'host';
  const quality = live ? connectionQuality(state.stats) : null;
  /** Viewer: the presenter's audio track currently carries something worth hearing. */
  const audible = viewing && (systemAudio === true || micOn);
  const fit = scale === 'original' ? 'none' : 'contain';

  // ---- pointer ------------------------------------------------------------
  const [pointing, setPointing] = useState(false);
  const popOut = usePopOut();
  const canPoint = viewing && live && state.controlReady && state.viewerPermissions.pointer && Boolean(sendControl);
  const showRemotePointer = hosting && Boolean(stream) && Boolean(onControl) && state.viewerPermissions.pointer;
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef(0);
  const localPings = useRef(new Set<(signal: PointerSignal) => void>());

  /** Presenter: pointer signals from the viewer, via the control channel. */
  const remotePointer = useCallback<PointerSubscribe>(
    (listener) => onControl?.((message) => {
      const signal = pointerSignal(message);
      if (signal) listener(signal);
    }) ?? (() => undefined),
    [onControl],
  );

  /** Viewer: their own clicks, echoed locally as ripples for feedback. */
  const ownPings = useCallback<PointerSubscribe>((listener) => {
    localPings.current.add(listener);
    return () => localPings.current.delete(listener);
  }, []);

  const stopPointing = useCallback(() => {
    cancelAnimationFrame(moveFrame.current);
    pendingMove.current = null;
    sendControl?.({ type: 'pointer-hide' });
  }, [sendControl]);

  // Pointing ends when it becomes unavailable (permission revoked, paused, session over).
  useEffect(() => {
    if (pointing && !canPoint) {
      setPointing(false);
      stopPointing();
    }
  }, [pointing, canPoint, stopPointing]);

  /** Maps a mouse event on the stage to fractions of the video picture, or null outside it. */
  const pictureFraction = (event: ReactPointerEvent) => {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return toFraction(event.clientX - rect.left, event.clientY - rect.top, contentBox(rect, video.videoWidth, video.videoHeight, fit));
  };

  const onStagePointerMove = (event: ReactPointerEvent) => {
    if (!pointing) return;
    const fraction = pictureFraction(event);
    if (!fraction) {
      sendControl?.({ type: 'pointer-hide' });
      return;
    }
    // At most one message per animation frame (~60 Hz), always the latest position.
    pendingMove.current = fraction;
    if (moveFrame.current) return;
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = 0;
      const next = pendingMove.current;
      if (next) sendControl?.({ type: 'pointer-move', ...next });
    });
  };

  const onStagePointerDown = (event: ReactPointerEvent) => {
    if (!pointing || event.button !== 0) return;
    const fraction = pictureFraction(event);
    if (!fraction) return;
    sendControl?.({ type: 'pointer-ping', ...fraction });
    for (const listener of localPings.current) listener({ type: 'ping', ...fraction });
  };

  // Close the pop-out when there is nothing left to show in it.
  const closePopOut = popOut.close;
  useEffect(() => {
    if (!(hosting && stream)) closePopOut();
  }, [hosting, stream, closePopOut]);

  // The presenter never plays their own audio back (that would echo); the viewer controls theirs.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !(viewing && listening);
    video.volume = volume;
  }, [viewing, listening, volume, stream]);

  // Each new stream starts muted again.
  useEffect(() => {
    if (!stream) setListening(false);
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    setNeedsPlay(false);
    if (stream) video.play().catch(() => setNeedsPlay(true));
  }, [stream]);

  useEffect(() => {
    if (state.chatReady && document.fullscreenElement !== panelRef.current) setChatOpen(true);
  }, [state.chatReady]);

  useEffect(() => {
    const onChange = () => {
      const isFullscreen = document.fullscreenElement === panelRef.current;
      setFullscreen(isFullscreen);
      setChatOpen(!isFullscreen);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const enter = () => setPip(true);
    const leave = () => setPip(false);
    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', leave);
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', leave);
    };
  }, []);

  // Leave fullscreen and picture-in-picture as soon as the session ends, and reset the scale.
  useEffect(() => {
    if (stream && active) return;
    if (document.fullscreenElement === panelRef.current) void document.exitFullscreen().catch(() => undefined);
    if (document.pictureInPictureElement && document.pictureInPictureElement === videoRef.current) {
      void document.exitPictureInPicture().catch(() => undefined);
    }
    setScale('fit');
  }, [stream, active]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await panelRef.current?.requestFullscreen();
    } catch {
      /* Fullscreen can be refused by the browser; the panel simply stays inline. */
    }
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch {
      toast('Picture-in-picture isn’t available right now.', 'error');
    }
  };

  const takeScreenshot = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      downloadBlob(await captureFrame(video), screenshotFileName(state.roomId, new Date()));
      toast('Screenshot saved to your downloads.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Couldn’t take a screenshot.', 'error');
    }
  };

  return (
    <section
      ref={panelRef}
      aria-label="Screen session"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 dark:border-transparent bg-card text-card-foreground shadow-card',
        fullscreen && 'rounded-none border-0',
      )}
    >
      <div className="flex h-14 items-center justify-between gap-3 border-b dark:border-white/[0.06] px-4">
        <div className="flex min-w-0 items-center gap-3">
          {fullscreen && <Badge tone={badge.tone} dot pulse={live}>{badge.label}</Badge>}
          <h3 className="truncate text-sm font-medium">{state.title}</h3>
        </div>
        <div role="toolbar" aria-label="Stage controls" className="flex shrink-0 items-center gap-1">
          {hosting && stream && onPrivacyPauseChange && (
            <Button
              variant="ghost"
              aria-pressed={paused}
              aria-label={paused ? 'Resume sharing' : 'Pause sharing'}
              title={paused ? 'Resume sharing' : 'Pause sharing for privacy'}
              onClick={() => onPrivacyPauseChange(!paused)}
            >
              <Icon name={paused ? 'play' : 'privacy'} />
              <span className="hidden sm:inline">{paused ? 'Resume' : 'Pause'}</span>
            </Button>
          )}
          {hosting && stream && onSystemAudioChange && systemAudio !== null && (
            <Button
              variant="ghost"
              iconOnly
              aria-pressed={systemAudio}
              aria-label="Share computer audio"
              title={systemAudio ? 'Mute computer audio for the viewer' : 'Share computer audio with the viewer'}
              onClick={() => onSystemAudioChange(!systemAudio)}
            >
              <Icon name={systemAudio ? 'audio' : 'audioOff'} />
            </Button>
          )}
          {hosting && stream && onMicrophoneChange && microphoneSupported() && (
            <Button
              variant="ghost"
              iconOnly
              aria-pressed={micOn}
              aria-label="Microphone"
              title={micOn ? 'Turn off your microphone' : 'Talk to the viewer (use headphones to avoid echo)'}
              onClick={() => onMicrophoneChange(!micOn)}
            >
              <Icon name={micOn ? 'mic' : 'micOff'} className={cn(micOn && 'text-brand')} />
            </Button>
          )}
          {showRemotePointer && popOutSupported() && (
            <Button
              variant="ghost"
              iconOnly
              aria-pressed={Boolean(popOut.popOut)}
              aria-label="Pop out preview"
              title={popOut.popOut ? 'Close the floating preview' : 'Float a small preview with the viewer’s pointer over other apps'}
              onClick={() => {
                if (popOut.popOut) popOut.close();
                else popOut.open().catch(() => toast('Couldn’t open the floating preview.', 'error'));
              }}
            >
              <Icon name="popOut" />
            </Button>
          )}
          {audible && (
            <>
              <Button
                variant="ghost"
                iconOnly
                aria-pressed={listening}
                aria-label="Sound"
                title={listening ? 'Mute' : 'Turn on sound'}
                onClick={() => setListening(!listening)}
              >
                <Icon name={listening ? 'audio' : 'audioOff'} />
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                disabled={!listening}
                aria-label="Volume"
                className="hidden h-1.5 w-20 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 sm:block"
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </>
          )}
          {canPoint && (
            <Button
              variant="ghost"
              iconOnly
              aria-pressed={pointing}
              aria-label="Point at the screen"
              title={pointing ? 'Stop pointing' : 'Point at the screen (the presenter sees your pointer and clicks)'}
              onClick={() => {
                if (pointing) stopPointing();
                setPointing(!pointing);
              }}
            >
              <Icon name="pointer" className={cn(pointing && 'text-brand')} />
            </Button>
          )}
          {viewing && (
            <>
              <Button
                variant="ghost"
                iconOnly
                disabled={!live || paused}
                aria-label="Take screenshot"
                title="Take screenshot"
                onClick={() => void takeScreenshot()}
              >
                <Icon name="screenshot" />
              </Button>
              <Button
                variant="ghost"
                iconOnly
                aria-pressed={scale === 'original'}
                aria-label="Show at original size"
                title={scale === 'original' ? 'Fit to stage' : 'Show at original size (1:1)'}
                onClick={() => setScale(scale === 'original' ? 'fit' : 'original')}
              >
                <Icon name="actualSize" />
              </Button>
              {pictureInPictureSupported() && (
                <Button
                  variant="ghost"
                  iconOnly
                  aria-pressed={pip}
                  aria-label="Picture-in-picture"
                  title={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'}
                  onClick={() => void togglePictureInPicture()}
                >
                  <Icon name="pictureInPicture" />
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            iconOnly
            disabled={!stream}
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
          </Button>
        </div>
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col', fullscreen && 'flex-row')}>
        <div
          className={cn(
            'relative grid aspect-video overflow-hidden bg-stage text-stage-foreground',
            scale === 'original' && stream ? 'place-items-start overflow-auto' : 'place-items-center',
            fullscreen && 'aspect-auto h-full min-w-0 flex-1',
            pointing && 'cursor-crosshair',
          )}
          onPointerMove={onStagePointerMove}
          onPointerDown={onStagePointerDown}
          onPointerLeave={() => {
            if (pointing) stopPointing();
          }}
        >
          <video
            ref={videoRef}
            className={cn('bg-stage', scale === 'original' ? 'size-auto max-w-none' : 'size-full object-contain')}
            autoPlay
            playsInline
            muted
            controls={needsPlay}
            aria-label="Shared screen stream"
            hidden={!stream}
          />
          {showRemotePointer && <PointerOverlay subscribe={remotePointer} videoRef={videoRef} fit={fit} />}
          {viewing && pointing && <PointerOverlay subscribe={ownPings} videoRef={videoRef} fit={fit} showDot={false} />}
          {stream && paused && (
            <div className="absolute inset-0 grid place-items-center bg-stage p-6 text-center" role="status">
              <div className="grid max-w-sm justify-items-center gap-2">
                <span className="mb-2 flex size-14 items-center justify-center rounded-xl border border-stage-foreground/10 bg-stage-foreground/5">
                  <Icon name="privacy" size={26} />
                </span>
                <h3 className="text-base font-semibold">{hosting ? 'Sharing paused' : 'The presenter paused sharing'}</h3>
                <p className="text-sm text-stage-foreground/70">
                  {hosting
                    ? 'Nothing on your screen is being sent. Your viewer sees this pause screen until you resume.'
                    : 'The stream will continue automatically when the presenter resumes.'}
                </p>
              </div>
            </div>
          )}
          {!stream && (
            <div className="grid max-w-sm justify-items-center gap-2 p-6 text-center" role={phase === 'ended' ? 'status' : undefined}>
              <span
                className={cn(
                  'mb-2 flex size-14 items-center justify-center rounded-xl border border-stage-foreground/10 bg-stage-foreground/5',
                  endedCleanly && 'border-success/25 bg-success/10 text-success',
                )}
              >
                <Icon name={empty.icon} size={26} />
              </span>
              <h3 className="text-base font-semibold">{empty.title}</h3>
              <p className="text-sm text-stage-foreground/70">{empty.description}</p>
              <span className="mt-2 text-xs uppercase tracking-wider text-stage-foreground/50">{empty.caption}</span>
              {!active && idleActions && <div className="mt-3 flex justify-center">{idleActions}</div>}
            </div>
          )}
          {stream && state.sourceLabel && (
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-stage/80 px-3 py-1 text-xs text-stage-foreground backdrop-blur">
              {paused && hosting ? 'Paused' : state.sourceLabel}
              {micOn && (hosting ? ' · Mic on' : ' · Presenter mic on')}
            </span>
          )}
          {audible && !listening && !paused && (
            <Button variant="stage" className="absolute bottom-3 right-3" onClick={() => setListening(true)}>
              <Icon name="audio" />
              Turn on sound
            </Button>
          )}
        </div>
        <div className={cn('border-t dark:border-white/[0.06]', fullscreen && 'flex border-l border-t-0')}>
          {renderChat({ open: chatOpen, fullscreen, onOpenChange: setChatOpen })}
        </div>
      </div>

      <div className="flex h-12 items-center gap-4 border-t dark:border-white/[0.06] px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className={cn('size-2 shrink-0 rounded-full', live ? 'animate-pulse bg-brand' : 'bg-muted-foreground/40')} data-live={live} />
          <span className="truncate">{state.statusText}</span>
        </div>
        {quality && (
          <span title="Based on round-trip time and packet loss">
            <Badge tone={qualityBadge[quality].tone} dot>{qualityBadge[quality].label}</Badge>
          </span>
        )}
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{formatClock(state.elapsedSeconds)}</span>
      </div>
      {popOut.popOut && stream && createPortal(<PopOutStage stream={stream} subscribe={remotePointer} paused={paused} />, popOut.popOut.document.body)}
    </section>
  );
}
