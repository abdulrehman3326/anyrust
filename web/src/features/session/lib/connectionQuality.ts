import type { BadgeTone } from '@/shared/ui';
import type { StreamStats } from '../model/types';

export type ConnectionQuality = 'good' | 'fair' | 'poor';

/**
 * Thresholds for interactive screen viewing. Round-trip time drives how laggy the stream feels;
 * packet loss drives freezes and smearing. Either one alone can make a connection poor.
 */
const LIMITS = {
  good: { latencyMs: 150, packetLossPercent: 2 },
  fair: { latencyMs: 400, packetLossPercent: 8 },
} as const;

/** Grades live stats, or returns null until there is something to grade. */
export function connectionQuality(stats: Pick<StreamStats, 'latencyMs' | 'packetLossPercent'>): ConnectionQuality | null {
  const { latencyMs, packetLossPercent } = stats;
  if (latencyMs == null && packetLossPercent == null) return null;
  const within = (limit: { latencyMs: number; packetLossPercent: number }) =>
    (latencyMs == null || latencyMs < limit.latencyMs) && (packetLossPercent == null || packetLossPercent < limit.packetLossPercent);
  if (within(LIMITS.good)) return 'good';
  if (within(LIMITS.fair)) return 'fair';
  return 'poor';
}

export const qualityBadge: Record<ConnectionQuality, { label: string; tone: BadgeTone }> = {
  good: { label: 'Good connection', tone: 'success' },
  fair: { label: 'Fair connection', tone: 'warning' },
  poor: { label: 'Poor connection', tone: 'danger' },
};

/** Packet loss over one stats interval, as a percentage, from cumulative counters. */
export function packetLossPercent(lostDelta: number, receivedDelta: number): number | null {
  const total = lostDelta + receivedDelta;
  if (total <= 0 || lostDelta < 0) return null;
  return (lostDelta / total) * 100;
}
