import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_VIEWER_PERMISSIONS, isChatPayload, isRecord, isViewerPermissions, MAX_CHAT_LENGTH, pickViewerPermissions } from './protocol/signaling.ts';
import type { ChatMessage, DeviceConnectResponse, IceConfigResponse, Role, RoomResponse, SignalEventType, ViewerPermissions } from './protocol/signaling.ts';
import { deviceIdFromSecret, isDeviceSecret, loadDeviceKey, RateLimiter } from './devices.ts';
import { buildIceServers, iceConfigWarning } from './iceConfig.ts';
import type { IceEnv } from './iceConfig.ts';
import { matchRoute } from './routes.ts';
import type { PublicHandler, RoomHandler } from './routes.ts';
import { createLogger } from './log.ts';
import type { Logger } from './log.ts';

interface Room {
  hostToken: string;
  viewerToken: string;
  approved: boolean;
  /** What the currently approved viewer may do; reset on every approval. */
  permissions: ViewerPermissions;
  expires: number;
  createdAt: number;
  /** The presenter's permanent device ID, if the room was created with a device secret. */
  deviceId?: string | undefined;
  host?: ServerResponse | null;
  viewer?: ServerResponse | null;
}

/** Parsed body of a POST to `/api/rooms/:id/signal`; fields are validated where used. */
interface SignalBody {
  token?: unknown;
  type?: unknown;
  data?: unknown;
  /** POST /api/rooms only: the presenter's device secret (see devices.ts). */
  deviceSecret?: unknown;
}

/** What a room-scoped route handler receives once the token has been verified. */
interface RoomContext {
  req: IncomingMessage;
  res: ServerResponse;
  id: string;
  room: Room;
  role: Role;
  payload: SignalBody;
}

export type DeskServer = http.Server & { disposeRooms(): void };

const ROOM_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_ROOMS = 32;
const MAX_BODY_BYTES = 100_000;
/** How long shutdown waits for open connections before closing them. */
const SHUTDOWN_GRACE_MS = 5_000;
/**
 * Browser features this app may use; everything else is denied. Screen capture, microphone,
 * picture-in-picture (incl. Document PiP), fullscreen, autoplay and clipboard are all self-only.
 */
const PERMISSIONS_POLICY = [
  'display-capture=(self)',
  'microphone=(self)',
  'picture-in-picture=(self)',
  'fullscreen=(self)',
  'autoplay=(self)',
  'clipboard-read=(self)',
  'clipboard-write=(self)',
  'camera=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'bluetooth=()',
  'serial=()',
  'hid=()',
  'interest-cohort=()',
].join(', ');

/** An error that maps to a specific HTTP status; anything else becomes a logged 500. */
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

const appShell = ['index.html', 'text/html; charset=utf-8'] as const;
const publicFiles = new Map<string, readonly [file: string, contentType: string]>([
  ['/', appShell],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
// Client-side routes: each is answered with the app shell so clean URLs survive a reload.
for (const view of ['share', 'join', 'session', 'history', 'help']) publicFiles.set(`/${view}`, appShell);

const secret = (): string => randomBytes(24).toString('base64url');

function equal(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<SignalBody> {
  const tooLarge = () => {
    // Discard the rest so the client can read our 413; a huge upload gets its connection closed instead.
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES * 10) req.socket.setTimeout(1, () => req.socket.destroy());
    else req.resume();
    return new HttpError(413, 'Request is too large');
  };
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge();
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw tooLarge();
  }
  let value: unknown;
  try {
    value = JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
  if (!isRecord(value)) throw new HttpError(400, 'Request body must be a JSON object');
  return value;
}

export interface DeskServerOptions {
  /** Source of STUN/TURN settings (see iceConfig.ts), `DEVICE_ID_KEY` and `TRUST_PROXY`. Defaults to `process.env`. */
  env?: IceEnv;
  /** HMAC key for device IDs. Defaults to `DEVICE_ID_KEY`, else a local key file (see devices.ts). */
  deviceKey?: Buffer;
  /** Structured logger (see log.ts). Defaults to JSON lines at `LOG_LEVEL`. */
  log?: Logger;
}

const DEVICE_KEY_FILE = new URL('./.deskstream-device-key', import.meta.url);

export function createDeskServer({ env = process.env, deviceKey, log = createLogger(env) }: DeskServerOptions = {}): DeskServer {
  const rooms = new Map<string, Room>();
  /** Device ID → room id, only while that device is sharing. */
  const devices = new Map<string, string>();
  const key = deviceKey ?? loadDeviceKey(env, DEVICE_KEY_FILE).key;
  // Device IDs are short numbers, so lookups are throttled per client and per device.
  const connectsPerClient = new RateLimiter(10, 60_000);
  const connectsPerDevice = new RateLimiter(20, 60_000);
  const roomsPerClient = new RateLimiter(30, 60_000);
  // Every API call (ICE candidates, chat, offers…) per client; generous for real use, stops floods.
  const apiPerClient = new RateLimiter(600, 60_000);
  const trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';
  const maxRooms = Number(env.MAX_ROOMS) > 0 ? Math.floor(Number(env.MAX_ROOMS)) : DEFAULT_MAX_ROOMS;

  /** True when the browser reached us over HTTPS (directly, or via a trusted proxy that says so). */
  function secureRequest(req: IncomingMessage): boolean {
    if ('encrypted' in req.socket && req.socket.encrypted) return true;
    return trustProxy && req.headers['x-forwarded-proto'] === 'https';
  }

  /** The caller's address; behind a reverse proxy (Render, nginx) set TRUST_PROXY=1 to use X-Forwarded-For. */
  function clientAddress(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    return (trustProxy && first) || req.socket.remoteAddress || 'unknown';
  }

  function limited(res: ServerResponse, retryAfter: number, req?: IncomingMessage): void {
    if (req) log('warn', 'rate_limited', { path: new URL(req.url ?? '/', 'http://x').pathname.replace(/\d{9}/g, ':id'), client: clientAddress(req) });
    res.setHeader('Retry-After', String(retryAfter));
    json(res, 429, { error: `Too many attempts. Try again in ${retryAfter} seconds.` });
  }

  function emit(room: Room, role: Role, type: SignalEventType, data: unknown = {}): void {
    room[role]?.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }

  function remove(id: string): void {
    const room = rooms.get(id);
    if (!room) return;
    emit(room, 'viewer', 'ended');
    room.host?.end();
    room.viewer?.end();
    rooms.delete(id);
    if (room.deviceId && devices.get(room.deviceId) === id) devices.delete(room.deviceId);
    log('info', 'room_ended', { rooms: rooms.size, minutes: Math.round((Date.now() - room.createdAt) / 60_000) });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('X-Frame-Options', 'DENY');
    // Same-origin isolation: other sites can't hold a window reference to us or embed our responses.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (secureRequest(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== url.host) return json(res, 403, { error: 'Origin not allowed' });
      }

      const file = req.method === 'GET' ? publicFiles.get(url.pathname) : undefined;
      if (file) {
        const [name, type] = file;
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        return res.end(await readFile(new URL(`./public/${name}`, import.meta.url)));
      }
      const hit = matchRoute(req.method ?? 'GET', url.pathname);
      if (!hit) return json(res, 404, { error: 'Not found' });
      if (hit.route.handler !== 'health') {
        const wait = apiPerClient.take(clientAddress(req));
        if (wait) return limited(res, wait, req);
      }
      if (hit.route.auth === false) {
        if (!hit.methodAllowed) return json(res, 405, { error: 'Method not allowed' });
        return await publicHandlers[hit.route.handler]({ req, res, id: hit.id });
      }

      const { id } = hit;
      const room = rooms.get(id);
      if (!room || room.expires < Date.now()) { remove(id); return json(res, 404, { error: 'This session has ended. Ask for a new invite.' }); }
      const payload: SignalBody = req.method === 'POST' ? await body(req) : {};
      const token = url.searchParams.get('token') || payload.token;
      const role: Role | null = equal(token, room.hostToken) ? 'host' : equal(token, room.viewerToken) ? 'viewer' : null;
      if (!role) return json(res, 403, { error: 'A valid invitation is required' });
      room.expires = Date.now() + ROOM_TTL_MS;

      if (!hit.methodAllowed) return json(res, 405, { error: 'Method not allowed' });
      return roomHandlers[hit.route.handler]({ req, res, id, room, role, payload });
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known) log('error', 'request_failed', { method: req.method, message: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) json(res, known ? error.status : 500, { error: known ? error.message : 'Something went wrong on the server. Please try again.' });
      else res.end();
    }
  });

  /** Room id of the live room a device is sharing in, or null. */
  function liveRoomOf(deviceId: string): string | null {
    const roomId = devices.get(deviceId);
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!roomId || !room || room.expires < Date.now()) {
      if (roomId) remove(roomId);
      devices.delete(deviceId);
      return null;
    }
    return roomId;
  }

  const publicHandlers: Record<PublicHandler, (ctx: { req: IncomingMessage; res: ServerResponse; id: string }) => void | Promise<void>> = {
    health: ({ res }) => json(res, 200, { status: 'ready' }),
    createRoom: async ({ req, res }) => {
      const wait = roomsPerClient.take(clientAddress(req));
      if (wait) return limited(res, wait, req);
      const { deviceSecret } = await body(req);
      let deviceId: string | undefined;
      if (deviceSecret !== undefined) {
        if (!isDeviceSecret(deviceSecret)) return json(res, 400, { error: 'Invalid device secret' });
        deviceId = deviceIdFromSecret(key, deviceSecret);
        if (liveRoomOf(deviceId)) return json(res, 409, { error: 'This device is already sharing in another tab or window. End that session first.' });
      }
      if (rooms.size >= maxRooms) {
        log('warn', 'room_limit_reached', { rooms: rooms.size });
        return json(res, 503, { error: 'The service is at capacity. Try again in a few minutes.' });
      }
      let id: string;
      do { id = String(randomInt(100_000_000, 999_999_999)); } while (rooms.has(id));
      const room: Room = { hostToken: secret(), viewerToken: secret(), approved: false, permissions: { ...DEFAULT_VIEWER_PERMISSIONS }, expires: Date.now() + ROOM_TTL_MS, createdAt: Date.now(), deviceId };
      rooms.set(id, room);
      if (deviceId) devices.set(deviceId, id);
      log('info', 'room_created', { rooms: rooms.size, device: Boolean(deviceId) });
      const created: RoomResponse = { id, hostToken: room.hostToken, viewerToken: room.viewerToken, ...(deviceId ? { deviceId } : {}) };
      json(res, 201, created);
    },
    connectDevice: ({ req, res, id: deviceId }) => {
      const wait = Math.max(connectsPerClient.take(clientAddress(req)), connectsPerDevice.take(deviceId));
      if (wait) return limited(res, wait, req);
      const roomId = liveRoomOf(deviceId);
      const room = roomId ? rooms.get(roomId) : undefined;
      // The same answer whether or not the ID exists, so IDs can't be enumerated.
      if (!roomId || !room?.host) return json(res, 404, { error: 'That device isn’t sharing right now. Ask the presenter to start a session, then try again.' });
      if (room.viewer) return json(res, 409, { error: 'Someone else is already viewing this device. Try again when they leave.' });
      const access: DeviceConnectResponse = { id: roomId, viewerToken: room.viewerToken };
      json(res, 200, access);
    },
  };

  const roomHandlers: Record<RoomHandler, (ctx: RoomContext) => void> = {
    events: ({ req, res, room, role }) => {
      if (room[role]) return json(res, 409, { error: 'This session is already open' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      room[role] = res;
      emit(room, role, 'ready');
      if (role === 'viewer') emit(room, 'host', 'viewer-request');
      if (role === 'host' && room.viewer) emit(room, 'host', 'viewer-request');
      const heartbeat = setInterval(() => {
        room.expires = Date.now() + ROOM_TTL_MS;
        res.write(': heartbeat\n\n');
      }, 15_000);
      req.on('close', () => {
        clearInterval(heartbeat);
        if (room[role] !== res) return;
        room[role] = null;
        room.approved = false;
        emit(room, role === 'host' ? 'viewer' : 'host', 'peer-left');
      });
    },
    ice: ({ res, id, room, role }) => {
      // TURN relays cost bandwidth, so a viewer only receives credentials once the presenter accepts it.
      if (role === 'viewer' && !room.approved) return json(res, 403, { error: 'The presenter must accept the viewer first' });
      const config: IceConfigResponse = { iceServers: buildIceServers(env, id) };
      json(res, 200, config);
    },
    deleteRoom: ({ res, id, role }) => {
      if (role !== 'host') return json(res, 405, { error: 'Method not allowed' });
      remove(id);
      json(res, 200, { ok: true });
    },
    signal: ({ res, room, role, payload }) => {
      const { type, data } = payload;
      if (role === 'host' && type === 'approve' && room.viewer) {
        let permissions: ViewerPermissions = { ...DEFAULT_VIEWER_PERMISSIONS };
        if (data !== undefined && data !== null) {
          if (!isRecord(data) || !isViewerPermissions(data.permissions)) return json(res, 400, { error: 'Invalid viewer permissions' });
          permissions = pickViewerPermissions(data.permissions);
        }
        room.approved = true;
        room.permissions = permissions;
        emit(room, 'viewer', 'approved', { permissions });
      } else if (role === 'host' && type === 'permissions' && room.approved && room.viewer) {
        if (!isViewerPermissions(data)) return json(res, 400, { error: 'Invalid viewer permissions' });
        room.permissions = pickViewerPermissions(data);
        emit(room, 'viewer', 'permissions', room.permissions);
      } else if (role === 'viewer' && type === 'chat' && room.approved && !room.permissions.chat) {
        return json(res, 403, { error: 'The presenter turned off chat for this session' });
      } else if (role === 'host' && type === 'reject') {
        room.approved = false;
        emit(room, 'viewer', 'rejected');
        room.viewer?.end();
      } else if (role === 'viewer' && type === 'leave') {
        room.approved = false;
        emit(room, 'host', 'peer-left');
        room.viewer?.end();
      } else if (type === 'chat' && room.approved && room.host && room.viewer) {
        if (!isChatPayload(data)) return json(res, 400, { error: `Messages must contain 1–${MAX_CHAT_LENGTH} characters` });
        const message: ChatMessage = { text: data.text, role, timestamp: Date.now() };
        emit(room, 'host', 'chat', message);
        emit(room, 'viewer', 'chat', message);
      } else if (room.approved && ((role === 'host' && type === 'offer') || (role === 'viewer' && type === 'answer') || type === 'ice')) {
        if (!isRecord(data)) return json(res, 400, { error: 'Invalid signaling data' });
        emit(room, role === 'host' ? 'viewer' : 'host', type, data);
      } else return json(res, 403, { error: 'The presenter must accept the viewer first' });
      return json(res, 200, { ok: true });
    },
  };

  const disposeRooms = (): void => { for (const id of rooms.keys()) remove(id); };
  const expiry = setInterval(() => {
    for (const [id, room] of rooms) if (room.expires < Date.now()) remove(id);
  }, 30_000);
  expiry.unref();
  server.on('close', () => { clearInterval(expiry); disposeRooms(); });
  return Object.assign(server, { disposeRooms });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = createLogger();
  const server = createDeskServer({ log });
  const warning = iceConfigWarning(process.env);
  if (warning) log('warn', 'config_warning', { message: warning });
  if (!process.env.DEVICE_ID_KEY) log('warn', 'config_warning', { message: 'DEVICE_ID_KEY is not set; device IDs use a local key file and change if it is lost.' });
  const port = Number(process.env.PORT || 4317);
  const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  server.listen(port, host, () => log('info', 'listening', { host, port, node: process.version }));

  // Graceful shutdown: tell viewers their sessions ended (closing the SSE streams), stop accepting
  // connections, and force-close whatever is still open after a short grace period.
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      log('info', 'shutting_down', { signal });
      server.disposeRooms();
      server.close(() => {
        log('info', 'stopped');
        process.exit(0);
      });
      setTimeout(() => {
        server.closeAllConnections();
        process.exit(0);
      }, SHUTDOWN_GRACE_MS).unref();
    });
  }
}
