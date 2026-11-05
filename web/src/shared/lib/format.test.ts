import { formatClock, formatConnected, formatRoomId } from './format';

describe('format', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(125)).toBe('02:05');
    expect(formatClock(-4)).toBe('00:00');
  });
  it('formats connected time', () => {
    expect(formatConnected(0)).toBe('Not connected');
    expect(formatConnected(75)).toBe('1m 15s connected');
  });
  it('groups room ids', () => {
    expect(formatRoomId('123456789')).toBe('123 456 789');
  });
});
