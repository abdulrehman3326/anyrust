/** A rectangle in CSS pixels, relative to some element. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** `contain` = scaled to fit with letterboxing (object-contain); `none` = natural size (1:1). */
export type Fit = 'contain' | 'none';

/**
 * Where the video picture actually sits inside its element. With `object-contain` the frame is
 * letterboxed, so pointer coordinates must be measured against this box, not the element.
 */
export function contentBox(element: { width: number; height: number }, videoWidth: number, videoHeight: number, fit: Fit): Box {
  if (!videoWidth || !videoHeight || fit === 'none') return { left: 0, top: 0, width: element.width, height: element.height };
  const scale = Math.min(element.width / videoWidth, element.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { left: (element.width - width) / 2, top: (element.height - height) / 2, width, height };
}

/** Converts a point (relative to the element) to fractions of the picture, or null outside it. */
export function toFraction(x: number, y: number, box: Box): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const fx = (x - box.left) / box.width;
  const fy = (y - box.top) / box.height;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
  return { x: fx, y: fy };
}

/** Converts picture fractions back to a point relative to the element. */
export function fromFraction(fraction: { x: number; y: number }, box: Box): { left: number; top: number } {
  return { left: box.left + fraction.x * box.width, top: box.top + fraction.y * box.height };
}
