import type { OutgoingSignal, RoomResponse, RoomSession, SignalMessage } from './types';

const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  } catch {
    throw new ApiError('Couldn’t reach the service. Check your connection and try again.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('The service may be starting up. Wait a moment, then try again.');
  }
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : 'The request failed';
    throw new ApiError(message);
  }
  return body as T;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isRoomResponse(value: unknown): value is RoomResponse {
  return isRecord(value) && typeof value.id === 'string' && typeof value.hostToken === 'string' && typeof value.viewerToken === 'string';
}

export const api = {
  async health(): Promise<void> {
    await request('/api/health');
  },

  async createRoom(): Promise<RoomResponse> {
    const room = await request<unknown>('/api/rooms', { method: 'POST' });
    if (!isRoomResponse(room)) throw new ApiError('The service returned an unexpected response.');
    return room;
  },

  deleteRoom(room: RoomSession, options: { keepalive?: boolean } = {}): Promise<unknown> {
    return request(`/api/rooms/${room.id}?token=${encodeURIComponent(room.token)}`, { method: 'DELETE', ...options });
  },

  signal(room: RoomSession, message: OutgoingSignal, options: { keepalive?: boolean } = {}): Promise<unknown> {
    const { type } = message;
    const data = 'data' in message ? message.data : undefined;
    return request(`/api/rooms/${room.id}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: room.token, type, data }),
      ...options,
    });
  },

  eventsUrl(room: RoomSession): string {
    return `/api/rooms/${room.id}/events?token=${encodeURIComponent(room.token)}`;
  },
};

export function parseSignalMessage(raw: string): SignalMessage {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.type !== 'string') throw new ApiError('Received an unreadable message from the service.');
  return value as unknown as SignalMessage;
}
