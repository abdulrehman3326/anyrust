import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {createDeskServer} from './server.ts';
import {silentLogger} from './log.ts';
import {deviceIdFromSecret, isDeviceSecret, loadDeviceKey, RateLimiter} from './devices.ts';
import {buildIceServers, DEFAULT_STUN_URL, iceConfigWarning, turnRestCredentials} from './iceConfig.ts';
import type {IceConfigResponse, RoomResponse} from './protocol/signaling.ts';

/** A decoded SSE frame; `data` is loosely typed because tests inspect arbitrary payloads. */
interface Frame {
  type: string;
  data: {text: string; role: string; timestamp: number} & Record<string, unknown>;
}

test('invitation permissions, presenter approval, signaling and teardown', async t => {
  const server = createDeskServer({env: {TURN_URLS: 'turn:turn.example:3478', TURN_SECRET: 'test-secret'}, deviceKey: Buffer.from('k'.repeat(32)), log: silentLogger});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const abort = new AbortController();
  t.after(async () => { abort.abort(); server.disposeRooms(); await new Promise(resolve => server.close(resolve)); });
  const request = (path: string, options?: RequestInit) => fetch(origin + path, options);
  const send = (id: string, token: string, type: string, data?: unknown) => request(`/api/rooms/${id}/signal`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token, type, data})});
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') ?? '',/frame-ancestors 'none'/);
  assert.match(await page.text(), /Share my screen/);
  for (const route of ['/share', '/join', '/session', '/history', '/help']) {
    const shell = await request(route);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /Share my screen/);
  }
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), {status: 'ready'});
  const forbidden = await request('/api/rooms', {method: 'POST', headers: {Origin: 'https://unrelated.example'}});
  assert.equal(forbidden.status, 403);
  const created = await request('/api/rooms', {method: 'POST'});
  assert.equal(created.status, 201);
  const {id, hostToken, viewerToken} = await created.json() as RoomResponse;
  const tlsProxyRequest = await request(`/api/rooms/${id}/signal`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin.replace('http:', 'https:')}, body: JSON.stringify({token: 'invalid', type: 'ice', data: {}})});
  assert.equal((await tlsProxyRequest.json() as {error: string}).error,'A valid invitation is required');
  assert.match(id, /^\d{9}$/);
  assert.notEqual(hostToken, viewerToken);
  assert.equal((await send(id, 'wrong', 'ice', {})).status, 403);
  assert.equal((await send(id, viewerToken, 'offer', {type: 'offer', sdp: 'not-approved'})).status, 403);
  assert.equal((await send(id, hostToken, 'offer', {type: 'offer', sdp: 'not-approved'})).status, 403);
  assert.equal((await send(id, hostToken, 'chat', {text: 'Before approval'})).status, 403);
  assert.equal((await send(id, viewerToken, 'chat', {text: 'Before approval'})).status, 403);
  assert.equal((await send(id, 'wrong', 'chat', {text: 'Unauthorized'})).status, 403);
  assert.equal((await request(`/api/rooms/${id}?token=${viewerToken}`, {method: 'DELETE'})).status, 405);
  async function eventStream(token: string): Promise<() => Promise<Frame>> {
    const response = await request(`/api/rooms/${id}/events?token=${token}`, {signal: abort.signal});
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return async function next(): Promise<Frame> {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          if (frame.startsWith('data: ')) return JSON.parse(frame.slice(6)) as Frame;
        } else {
          const result = await reader.read();
          if (result.done) throw new Error('Unexpected end of signaling stream');
          buffer += decoder.decode(result.value, {stream: true});
        }
      }
    };
  }
  const host = await eventStream(hostToken);
  assert.equal((await host()).type, 'ready');
  const viewer = await eventStream(viewerToken);
  assert.equal((await viewer()).type, 'ready');
  assert.equal((await host()).type, 'viewer-request');
  const ice = (token: string) => request(`/api/rooms/${id}/ice?token=${token}`);
  assert.equal((await ice('wrong')).status, 403);
  assert.equal((await ice(viewerToken)).status, 403, 'unapproved viewers receive no TURN credentials');
  const hostIce = await ice(hostToken);
  assert.equal(hostIce.status, 200);
  assert.equal(hostIce.headers.get('cache-control'), 'no-store');
  const {iceServers} = await hostIce.json() as IceConfigResponse;
  assert.deepEqual(iceServers[0], {urls: [DEFAULT_STUN_URL]});
  assert.deepEqual(iceServers[1]?.urls, ['turn:turn.example:3478']);
  assert.equal(iceServers[1]?.username?.endsWith(`:${id}`), true);
  const duplicate = await request(`/api/rooms/${id}/events?token=${viewerToken}`);
  assert.equal(duplicate.status, 409);
  assert.equal((await send(id, viewerToken, 'approve')).status, 403);
  assert.equal((await send(id, hostToken, 'approve', {permissions: {chat: 'yes', files: false, pointer: true}})).status, 400, 'malformed permissions are rejected');
  assert.equal((await send(id, hostToken, 'approve')).status, 200);
  assert.deepEqual(await viewer(), {type: 'approved', data: {permissions: {chat: true, files: false, pointer: true}}}, 'approve without data grants defaults');
  assert.equal((await ice(viewerToken)).status, 200);
  const offer = {type: 'offer', sdp: 'test-offer'};
  assert.equal((await send(id, hostToken, 'offer', offer)).status, 200);
  assert.deepEqual(await viewer(), {type: 'offer', data: offer});
  const answer = {type: 'answer', sdp: 'test-answer'};
  assert.equal((await send(id, viewerToken, 'answer', answer)).status, 200);
  assert.deepEqual(await host(), {type: 'answer', data: answer});
  for (const invalid of [null, {}, {text: 4}, {text: ' \n '}, {text: 'x'.repeat(2001)}]) {
    assert.equal((await send(id, hostToken, 'chat', invalid)).status, 400);
  }
  const chatCases: Array<[token: string, role: string, text: string]> = [[hostToken, 'host', '<img src=x onerror=alert(1)>\nHello 👋'], [viewerToken, 'viewer', 'x'.repeat(2000)]];
  for (const [token, role, text] of chatCases) {
    const before = Date.now();
    assert.equal((await send(id, token, 'chat', {text, role: 'spoofed', timestamp: 0})).status, 200);
    const received = await host();
    assert.deepEqual(await viewer(), received);
    assert.equal(received.type, 'chat');
    assert.equal(received.data.text, text);
    assert.equal(received.data.role, role);
    assert.ok(received.data.timestamp >= before && received.data.timestamp <= Date.now());
  }
  // The presenter can turn viewer chat off and on mid-session; the server enforces it.
  assert.equal((await send(id, viewerToken, 'permissions', {chat: true, files: true, pointer: true})).status, 403, 'only the presenter sets permissions');
  assert.equal((await send(id, hostToken, 'permissions', {chat: 1, files: false, pointer: true})).status, 400);
  assert.equal((await send(id, hostToken, 'permissions', {chat: true})).status, 400, 'every permission must be present');
  assert.equal((await send(id, hostToken, 'permissions', {chat: false, files: true, pointer: true, extra: 'dropped'})).status, 200);
  assert.deepEqual(await viewer(), {type: 'permissions', data: {chat: false, files: true, pointer: true}}, 'only known fields are relayed');
  const blocked = await send(id, viewerToken, 'chat', {text: 'Muted viewer'});
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json() as {error: string}).error, 'The presenter turned off chat for this session');
  assert.equal((await send(id, hostToken, 'chat', {text: 'Presenter can still post'})).status, 200);
  assert.equal((await host()).data.text, 'Presenter can still post');
  assert.equal((await viewer()).data.text, 'Presenter can still post');
  assert.equal((await send(id, hostToken, 'permissions', {chat: true, files: false, pointer: true})).status, 200);
  assert.deepEqual(await viewer(), {type: 'permissions', data: {chat: true, files: false, pointer: true}});
  assert.equal((await send(id, viewerToken, 'chat', {text: 'Back on'})).status, 200);
  assert.equal((await host()).data.text, 'Back on');
  assert.equal((await viewer()).data.text, 'Back on');
  assert.equal((await send(id, viewerToken, 'leave')).status, 200);
  assert.equal((await host()).type, 'peer-left');
  assert.equal((await send(id, hostToken, 'chat', {text: 'After viewer leaves'})).status, 403);
  const replacementViewer = await eventStream(viewerToken);
  assert.equal((await replacementViewer()).type, 'ready');
  assert.equal((await host()).type, 'peer-left');
  assert.equal((await host()).type, 'viewer-request');
  assert.equal((await send(id, viewerToken, 'chat', {text: 'Approval does not carry over'})).status, 403);
  assert.equal((await request(`/api/rooms/${id}?token=${hostToken}`, {method: 'DELETE'})).status, 200);
  assert.equal((await replacementViewer()).type, 'ended');
  assert.equal((await send(id, viewerToken, 'ice', {})).status, 404);
  assert.equal((await send(id, hostToken, 'chat', {text: 'After session ends'})).status, 404);
});

test('ICE server configuration from environment', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.deepEqual(buildIceServers({}, 'r', now), [{urls: [DEFAULT_STUN_URL]}]);
  assert.deepEqual(buildIceServers({STUN_URLS: '  '}, 'r', now), [{urls: [DEFAULT_STUN_URL]}], 'blank means default');
  assert.deepEqual(buildIceServers({STUN_URLS: 'none'}, 'r', now), []);
  assert.deepEqual(buildIceServers({STUN_URLS: ' stun:a:1 , stun:b:2 '}, 'r', now), [{urls: ['stun:a:1', 'stun:b:2']}]);
  assert.deepEqual(buildIceServers({STUN_URLS: 'none', TURN_URLS: 'turn:t:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p'}, 'r', now), [{urls: ['turn:t:3478'], username: 'u', credential: 'p'}]);
  // TURN REST API (coturn use-auth-secret): username = expiry:label, credential = base64(HMAC-SHA1(secret, username)).
  const rest = turnRestCredentials('secret', 'room', 600, now);
  assert.equal(rest.username, `${now / 1000 + 600}:room`);
  assert.equal(rest.credential, 'e3W5qqXQv2RS2XwCd1wBeWpRIfI=');
  const [, turn] = buildIceServers({TURN_URLS: 'turn:t:3478', TURN_SECRET: 'secret', TURN_TTL_SECONDS: '600'}, 'room', now);
  assert.deepEqual(turn, {urls: ['turn:t:3478'], ...rest});
  assert.equal(buildIceServers({STUN_URLS: 'none', TURN_URLS: 'turn:t:3478'}, 'r', now).length, 0);
  assert.match(iceConfigWarning({TURN_URLS: 'turn:t:3478'}) ?? '', /TURN is disabled/);
  assert.equal(iceConfigWarning({}), null);
});

test('device IDs: derivation, key loading and rate limiting units', () => {
  const key = Buffer.from('k'.repeat(32));
  const secretA = 'A'.repeat(43);
  const idA = deviceIdFromSecret(key, secretA);
  assert.match(idA, /^[1-9]\d{8}$/);
  assert.equal(deviceIdFromSecret(key, secretA), idA, 'stable for the same secret');
  assert.notEqual(deviceIdFromSecret(key, 'B'.repeat(43)), idA, 'different secrets differ');
  assert.notEqual(deviceIdFromSecret(Buffer.from('z'.repeat(32)), secretA), idA, 'the server key matters');
  assert.equal(isDeviceSecret(secretA), true);
  for (const bad of ['short', 'A'.repeat(44), `${'A'.repeat(42)}=`, 42, null]) assert.equal(isDeviceSecret(bad), false);

  assert.deepEqual(loadDeviceKey({DEVICE_ID_KEY: 'x'.repeat(40)}, new URL('file:///unused')), {key: Buffer.from('x'.repeat(40)), source: 'env'});
  assert.throws(() => loadDeviceKey({DEVICE_ID_KEY: 'short'}, new URL('file:///unused')), /at least 32/);

  const limiter = new RateLimiter(2, 60_000);
  assert.equal(limiter.take('ip', 0), 0);
  assert.equal(limiter.take('ip', 1), 0);
  assert.equal(limiter.take('ip', 2), 60, 'third attempt waits for the window');
  assert.equal(limiter.take('other', 2), 0, 'keys are independent');
  assert.equal(limiter.take('ip', 60_000), 0, 'a new window resets');
});

test('device IDs: connect to a sharing device, one live room per device, rate limited', async t => {
  const deviceKey = Buffer.from('device-test-key-'.repeat(3));
  const server = createDeskServer({env: {STUN_URLS: 'none'}, deviceKey, log: silentLogger});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const abort = new AbortController();
  t.after(async () => { abort.abort(); server.disposeRooms(); await new Promise(resolve => server.close(resolve)); });
  const post = (path: string, payload?: unknown) => fetch(origin + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: payload === undefined ? undefined : JSON.stringify(payload)});
  const deviceSecret = 'S'.repeat(43);
  const deviceId = deviceIdFromSecret(deviceKey, deviceSecret);

  assert.equal((await post('/api/rooms', {deviceSecret: 'nope'})).status, 400);
  assert.equal((await post(`/api/devices/${deviceId}/connect`)).status, 404, 'not sharing yet');

  const created = await post('/api/rooms', {deviceSecret});
  assert.equal(created.status, 201);
  const room = await created.json() as RoomResponse;
  assert.equal(room.deviceId, deviceId);
  assert.equal((await post('/api/rooms', {deviceSecret})).status, 409, 'one live room per device');
  const plain = await (await post('/api/rooms')).json() as RoomResponse;
  assert.equal(plain.deviceId, undefined, 'rooms without a secret have no device ID');

  // Until the presenter's event stream is open, the device isn't really sharing.
  assert.equal((await post(`/api/devices/${deviceId}/connect`)).status, 404);
  const hostEvents = await fetch(`${origin}/api/rooms/${room.id}/events?token=${room.hostToken}`, {signal: abort.signal});
  assert.equal(hostEvents.status, 200);

  const connected = await post(`/api/devices/${deviceId}/connect`);
  assert.equal(connected.status, 200);
  assert.deepEqual(await connected.json(), {id: room.id, viewerToken: room.viewerToken});

  // While someone is viewing, other connects are refused.
  const viewerEvents = await fetch(`${origin}/api/rooms/${room.id}/events?token=${room.viewerToken}`, {signal: abort.signal});
  assert.equal(viewerEvents.status, 200);
  assert.equal((await post(`/api/devices/${deviceId}/connect`)).status, 409);

  // Ending the room frees the device ID.
  assert.equal((await fetch(`${origin}/api/rooms/${room.id}?token=${room.hostToken}`, {method: 'DELETE'})).status, 200);
  assert.equal((await post(`/api/devices/${deviceId}/connect`)).status, 404);
  assert.equal((await post('/api/rooms', {deviceSecret})).status, 201, 'the device can share again');

  // Lookups are rate-limited per client (10 per minute); 6 were used above.
  let last = 200;
  for (let i = 0; i < 6 && last !== 429; i++) last = (await post(`/api/devices/${'1'.repeat(9)}/connect`)).status;
  assert.equal(last, 429);
  const throttled = await post(`/api/devices/${deviceId}/connect`);
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
});

test('hardening: security headers, error statuses, request limits and capacity', async t => {
  const logged: string[] = [];
  const server = createDeskServer({env: {STUN_URLS: 'none', MAX_ROOMS: '2', TRUST_PROXY: '1'}, deviceKey: Buffer.from('h'.repeat(32)), log: (_level, event) => logged.push(event)});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => { server.disposeRooms(); await new Promise(resolve => server.close(resolve)); });

  const page = await fetch(origin + '/');
  assert.match(page.headers.get('permissions-policy') ?? '', /display-capture=\(self\)/);
  assert.match(page.headers.get('permissions-policy') ?? '', /camera=\(\)/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(page.headers.get('strict-transport-security'), null, 'no HSTS over plain HTTP');
  const viaTls = await fetch(origin + '/api/health', {headers: {'X-Forwarded-Proto': 'https'}});
  assert.match(viaTls.headers.get('strict-transport-security') ?? '', /max-age=31536000/, 'HSTS behind a trusted TLS proxy');

  // Malformed and oversized bodies get precise statuses instead of a generic 400.
  const post = (body: string, headers: Record<string, string> = {}) => fetch(origin + '/api/rooms', {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body});
  const badJson = await post('{nope');
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json() as {error: string}).error, 'Request body must be valid JSON');
  assert.equal((await post(JSON.stringify({pad: 'x'.repeat(200_000)}))).status, 413);

  // Capacity is configurable and answered with 503 (the service is full, not the client's fault).
  assert.equal((await post('{}')).status, 201);
  assert.equal((await post('{}')).status, 201);
  const full = await post('{}');
  assert.equal(full.status, 503);
  assert.ok(logged.includes('room_limit_reached'));

  // Clients are identified by X-Forwarded-For when TRUST_PROXY is set, so limits are per real client.
  let status = 0;
  for (let i = 0; i < 40 && status !== 429; i++) status = (await post('{}', {'X-Forwarded-For': '203.0.113.9'})).status;
  assert.equal(status, 429, 'room creation is rate-limited per client');
  assert.equal((await post('{}', {'X-Forwarded-For': '198.51.100.4'})).status, 503, 'another client is not affected by that limit');
  assert.ok(logged.includes('rate_limited'));
});

test('graceful shutdown: SIGTERM ends sessions and exits cleanly', {skip: process.platform === 'win32' && 'Windows has no catchable SIGTERM'}, async () => {
  const {spawn} = await import('node:child_process');
  const port = 40_000 + Math.floor(Math.random() * 10_000);
  const child = spawn(process.execPath, ['server.ts'], {
    env: {...process.env, PORT: String(port), HOST: '127.0.0.1', DEVICE_ID_KEY: 'shutdown-test-key-shutdown-test-key', LOG_LEVEL: 'info'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)));
  for (let i = 0; i < 100 && !output.includes('"listening"'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(output, /"event":"listening"/);

  const origin = `http://127.0.0.1:${port}`;
  const room = await (await fetch(`${origin}/api/rooms`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).json() as RoomResponse;
  const viewerEvents = await fetch(`${origin}/api/rooms/${room.id}/events?token=${room.viewerToken}`);
  const reader = viewerEvents.body!.getReader();
  await reader.read(); // ready

  child.kill('SIGTERM');
  let received = '';
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  assert.match(received, /"type":"ended"/, 'connected viewers are told the session ended');
  assert.equal(await exited, 0);
  assert.match(output, /"event":"shutting_down"/);
});
