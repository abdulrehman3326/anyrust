import { useEffect, useRef } from 'react';
import { PointerOverlay } from '@/features/pointer';
import type { PointerSubscribe } from '@/features/pointer';

interface PopOutStageProps {
  stream: MediaStream;
  subscribe: PointerSubscribe;
  paused: boolean;
}

/**
 * Content of the presenter's floating Document Picture-in-Picture window: their own live preview
 * with the viewer's pointer on top, so it stays visible over whatever app they are sharing.
 * Rendered through a portal into another document, where React event handlers don't fire, so
 * this component is display-only.
 */
export function PopOutStage({ stream, subscribe, paused }: PopOutStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className="relative grid h-screen w-screen place-items-center overflow-hidden bg-stage text-stage-foreground">
      <video ref={videoRef} className="size-full object-contain" autoPlay playsInline muted aria-label="Your shared screen" />
      <PointerOverlay subscribe={subscribe} videoRef={videoRef} fit="contain" />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-stage/80 px-2.5 py-0.5 text-xs backdrop-blur">
        {paused ? 'Paused · viewer sees a pause screen' : 'Viewer’s pointer'}
      </span>
    </div>
  );
}
