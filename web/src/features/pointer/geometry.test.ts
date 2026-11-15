import { contentBox, fromFraction, toFraction } from './geometry';

describe('contentBox', () => {
  it('letterboxes a wide frame in a tall element (bars top and bottom)', () => {
    expect(contentBox({ width: 400, height: 400 }, 1600, 900, 'contain')).toEqual({ left: 0, top: 87.5, width: 400, height: 225 });
  });

  it('pillarboxes a tall frame in a wide element (bars left and right)', () => {
    expect(contentBox({ width: 800, height: 450 }, 900, 900, 'contain')).toEqual({ left: 175, top: 0, width: 450, height: 450 });
  });

  it('uses the whole element at natural size, or before the video has dimensions', () => {
    expect(contentBox({ width: 1920, height: 1080 }, 1920, 1080, 'none')).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    expect(contentBox({ width: 300, height: 200 }, 0, 0, 'contain')).toEqual({ left: 0, top: 0, width: 300, height: 200 });
  });
});

describe('toFraction / fromFraction', () => {
  const box = { left: 0, top: 87.5, width: 400, height: 225 };

  it('maps points in the picture to fractions and back', () => {
    expect(toFraction(200, 200, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(fromFraction({ x: 0.5, y: 0.5 }, box)).toEqual({ left: 200, top: 200 });
    expect(toFraction(0, 87.5, box)).toEqual({ x: 0, y: 0 });
  });

  it('returns null in the letterbox bars and for empty boxes', () => {
    expect(toFraction(200, 40, box)).toBeNull();
    expect(toFraction(200, 360, box)).toBeNull();
    expect(toFraction(1, 1, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });

  it('is consistent across differently sized stages (viewer vs presenter)', () => {
    const viewer = contentBox({ width: 1000, height: 562.5 }, 1280, 720, 'contain');
    const presenter = contentBox({ width: 480, height: 300 }, 1280, 720, 'contain');
    const fraction = toFraction(750, 200, viewer)!;
    const point = fromFraction(fraction, presenter);
    expect(point.left).toBeCloseTo(360);
    expect(point.top).toBeCloseTo(15 + (200 / 562.5) * 270);
  });
});
