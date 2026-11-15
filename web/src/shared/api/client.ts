import type { DeviceConnectResponse, IceConfigResponse, OutgoingSignal, RoomResponse, RoomSession, SignalMessage } from './types';

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

const isStringList = (value: unknown): boolean =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

function isIceConfig(value: unknown): value is IceConfigResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.iceServers) &&
    value.iceServers.every((server) => isRecord(server) && isStringList(server.urls))
  );
}

export const api = {
  async health(): Promise<void> {
    await request('/api/health');
  },

  /** Creates a room; with a device secret the room is also reachable by this device's permanent ID. */
  async createRoom(deviceSecret?: string): Promise<RoomResponse> {
    const room = await request<unknown>('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceSecret ? { deviceSecret } : {}),
    });
    if (!isRoomResponse(room)) throw new ApiError('The service returned an unexpected response.');
    return room;
  },

  /** Asks for access to the live room of a sharing device. The presenter still approves. */
  async connectDevice(deviceId: string): Promise<DeviceConnectResponse> {
    const access = await request<unknown>(`/api/devices/${encodeURIComponent(deviceId)}/connect`, { method: 'POST' });
    if (!isRecord(access) || typeof access.id !== 'string' || typeof access.viewerToken !== 'string') {
      throw new ApiError('The service returned an unexpected response.');
    }
    return { id: access.id, viewerToken: access.viewerToken };
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

  /** STUN/TURN servers for this room. Viewers may call it only after the presenter approves them. */
  async iceServers(room: RoomSession): Promise<RTCIceServer[]> {
    const config = await request<unknown>(`/api/rooms/${room.id}/ice?token=${encodeURIComponent(room.token)}`);
    if (!isIceConfig(config)) throw new ApiError('The service returned an unexpected response.');
    return config.iceServers;
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
