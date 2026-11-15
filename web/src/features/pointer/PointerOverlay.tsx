import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { contentBox, fromFraction } from './geometry';
import type { Fit } from './geometry';

/** What the overlay draws, in fractions (0–1) of the video picture. */
export type PointerSignal = { type: 'move'; x: number; y: number } | { type: 'hide' } | { type: 'ping'; x: number; y: number };

export type PointerSubscribe = (listener: (signal: PointerSignal) => void) => () => void;

interface PointerOverlayProps {
  subscribe: PointerSubscribe;
  /** The video the coordinates refer to; the overlay must cover the same area as its parent stage. */
  videoRef: RefObject<HTMLVideoElement>;
  fit: Fit;
  /** Draw the moving dot (presenter side). The viewer only gets click ripples as feedback. */
  showDot?: boolean;
}

/** The dot disappears when the viewer stops moving for this long. */
const IDLE_MS = 4000;
const PING_MS = 1000;

/**
 * Draws a remote pointer and click ripples over a video. Positions are applied through CSSOM
 * (`element.style`), which the CSP allows, and the dot is moved without React re-renders so a
 * 30 Hz pointer stream stays cheap.
 */
export function PointerOverlay({ subscribe, videoRef, fit, showDot = true }: PointerOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const [pings, setPings] = useState<Array<{ id: number; left: number; top: number }>>([]);

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    let nextPing = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /** Maps picture fractions to a point inside the overlay layer. */
    const place = (fraction: { x: number; y: number }) => {
      const video = videoRef.current;
      const layer = layerRef.current;
      if (!video || !layer) return null;
      const videoRect = video.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const box = contentBox(videoRect, video.videoWidth, video.videoHeight, fit);
      const point = fromFraction(fraction, box);
      return { left: videoRect.left - layerRect.left + point.left, top: videoRect.top - layerRect.top + point.top };
    };

    const hideDot = () => {
      if (dotRef.current) dotRef.current.hidden = true;
    };

    const unsubscribe = subscribe((signal) => {
      if (signal.type === 'hide') {
        hideDot();
        return;
      }
      const point = place(signal);
      if (!point) return;
      if (signal.type === 'move') {
        const dot = dotRef.current;
        if (!dot || !showDot) return;
        dot.style.transform = `translate(${point.left}px, ${point.top}px)`;
        dot.hidden = false;
        clearTimeout(idle);
        idle = setTimeout(hideDot, IDLE_MS);
        return;
      }
      const id = nextPing++;
      setPings((current) => [...current.slice(-4), { id, ...point }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setPings((current) => current.filter((ping) => ping.id !== id));
      }, PING_MS);
      timers.add(timer);
    });

    return () => {
      unsubscribe();
      clearTimeout(idle);
      timers.forEach(clearTimeout);
    };
  }, [subscribe, videoRef, fit, showDot]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {showDot && (
        <span ref={dotRef} hidden className="absolute left-0 top-0 transition-transform duration-75 ease-linear" data-testid="remote-pointer">
          <span className="-ml-2 -mt-2 block size-4 rounded-full bg-brand shadow-lg ring-2 ring-stage-foreground/90" />
        </span>
      )}
      {pings.map((ping) => (
        <span key={ping.id} className="absolute" style={{ left: ping.left, top: ping.top }} data-testid="pointer-ping">
          <span className="-ml-5 -mt-5 block size-10 animate-ping rounded-full border-2 border-brand" />
        </span>
      ))}
    </div>
  );
}
