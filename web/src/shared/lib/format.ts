export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatConnected(seconds: number): string {
  return seconds ? `${Math.floor(seconds / 60)}m ${seconds % 60}s connected` : 'Not connected';
}

/** Groups a nine-digit room id as `123 456 789`. */
export function formatRoomId(id: string): string {
  return id.match(/.{1,3}/g)?.join(' ') ?? id;
}
