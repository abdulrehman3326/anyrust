import http from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const secret = () => randomBytes(24).toString('base64url');
function equal(a, b) {
  return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function json(res, status, value) {
  res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(value));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 100_000) throw new Error('Request is too large');
  }
  return JSON.parse(text || '{}');
}

export function createDeskServer() {
  const rooms = new Map();
  function emit(room, role, type, data = {}) {
    room[role]?.write(`data: ${JSON.stringify({type, data})}\n\n`);
  }
  function remove(id) {
    const room = rooms.get(id);
    if (!room) return;
    emit(room, 'viewer', 'ended');
    room.host?.end();
    room.viewer?.end();
    rooms.delete(id);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== url.host) return json(res, 403, {error: 'Origin not allowed'});
      }
      if (req.method === 'GET' && publicFiles.has(url.pathname)) {
        const [name, type] = publicFiles.get(url.pathname);
        res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
        return res.end(await readFile(new URL(`./public/${name}`, import.meta.url)));
      }
      if (req.method === 'POST' && url.pathname === '/api/rooms') {
        if (rooms.size >= 32) return json(res, 429, {error: 'Room limit reached. Stop an existing session first.'});
        let id;
        do { id = String(randomInt(100_000_000, 999_999_999)); } while (rooms.has(id));
        const room = {hostToken: secret(), viewerToken: secret(), approved: false, expires: Date.now() + 30 * 60_000};
        rooms.set(id, room);
        return json(res, 201, {id, hostToken: room.hostToken, viewerToken: room.viewerToken});
      }
      const match = url.pathname.match(/^\/api\/rooms\/(\d{9})(?:\/(events|signal))?$/);
      if (!match) return json(res, 404, {error: 'Not found'});
      const [, id, action] = match;
      const room = rooms.get(id);
      if (!room || room.expires < Date.now()) { remove(id); return json(res, 404, {error: 'This session has ended. Ask for a new invite.'}); }
      const payload = req.method === 'POST' ? await body(req) : {};
      const token = url.searchParams.get('token') || payload.token;
      const role = equal(token, room.hostToken) ? 'host' : equal(token, room.viewerToken) ? 'viewer' : null;
      if (!role) return json(res, 403, {error: 'A valid invitation is required'});
      room.expires = Date.now() + 30 * 60_000;
      if (req.method === 'GET' && action === 'events') {
        if (room[role]) return json(res, 409, {error: 'This session is already open'});
        res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'});
        room[role] = res;
        emit(room, role, 'ready');
        if (role === 'viewer') emit(room, 'host', 'viewer-request');
        if (role === 'host' && room.viewer) emit(room, 'host', 'viewer-request');
        const heartbeat = setInterval(() => {
          room.expires = Date.now() + 30 * 60_000;
          res.write(': heartbeat\n\n');
        }, 15_000);
        req.on('close', () => {
          clearInterval(heartbeat);
          if (room[role] !== res) return;
          room[role] = null;
          room.approved = false;
          emit(room, role === 'host' ? 'viewer' : 'host', 'peer-left');
        });
        return;
      }
      if (req.method === 'DELETE' && !action && role === 'host') { remove(id); return json(res, 200, {ok: true}); }
      if (req.method !== 'POST' || action !== 'signal') return json(res, 405, {error: 'Method not allowed'});
      const {type, data} = payload;
      if (role === 'host' && type === 'approve' && room.viewer) {
        room.approved = true;
        emit(room, 'viewer', 'approved');
      } else if (role === 'host' && type === 'reject') {
        room.approved = false;
        emit(room, 'viewer', 'rejected');
        room.viewer?.end();
      } else if (role === 'viewer' && type === 'leave') {
        room.approved = false;
        emit(room, 'host', 'peer-left');
        room.viewer?.end();
      } else if (room.approved && ((role === 'host' && type === 'offer') || (role === 'viewer' && type === 'answer') || type === 'ice')) {
        if (!data || typeof data !== 'object') return json(res, 400, {error: 'Invalid signaling data'});
        emit(room, role === 'host' ? 'viewer' : 'host', type, data);
      } else return json(res, 403, {error: 'The presenter must accept the viewer first'});
      return json(res, 200, {ok: true});
    } catch (error) {
      if (!res.headersSent) json(res, 400, {error: error.message});
      else res.end();
    }
  });
  const expiry = setInterval(() => {
    for (const [id, room] of rooms) if (room.expires < Date.now()) remove(id);
  }, 30_000);
  expiry.unref();
  server.on('close', () => { clearInterval(expiry); for (const id of rooms.keys()) remove(id); });
  server.disposeRooms = () => { for (const id of rooms.keys()) remove(id); };
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDeskServer();
  const port = Number(process.env.PORT || 4317);
  const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  server.listen(port, host, () => console.log(`Deskstream listening on ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.disposeRooms(); server.close(); });
}
