import { connectionQuality, packetLossPercent } from './connectionQuality';

describe('connectionQuality', () => {
  it('returns null before any stats exist', () => {
    expect(connectionQuality({ latencyMs: null, packetLossPercent: null })).toBeNull();
  });

  it.each([
    [{ latencyMs: 20, packetLossPercent: 0 }, 'good'],
    [{ latencyMs: 149, packetLossPercent: null }, 'good'],
    [{ latencyMs: null, packetLossPercent: 1.9 }, 'good'],
    [{ latencyMs: 150, packetLossPercent: 0 }, 'fair'],
    [{ latencyMs: 40, packetLossPercent: 5 }, 'fair'],
    [{ latencyMs: 400, packetLossPercent: 0 }, 'poor'],
    [{ latencyMs: 30, packetLossPercent: 8 }, 'poor'],
  ] as const)('grades %o as %s', (stats, expected) => {
    expect(connectionQuality(stats)).toBe(expected);
  });
});

describe('packetLossPercent', () => {
  it('computes loss over an interval', () => {
    expect(packetLossPercent(5, 95)).toBe(5);
    expect(packetLossPercent(0, 300)).toBe(0);
  });

  it('returns null when nothing was exchanged or counters went backwards', () => {
    expect(packetLossPercent(0, 0)).toBeNull();
    expect(packetLossPercent(-2, 10)).toBeNull();
  });
});
