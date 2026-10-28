import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeskServer} from './server.mjs';

test('invitation permissions, presenter approval, signaling and teardown', async t => {
  const server = createDeskServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();
  t.after(async () => { abort.abort(); server.disposeRooms(); await new Promise(resolve => server.close(resolve)); });
  const request = (path, options) => fetch(origin + path, options);
  const send = (id, token, type, data) => request(`/api/rooms/${id}/signal`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token, type, data})});
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Share my screen/);
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), {status: 'ready'});
  const forbidden = await request('/api/rooms', {method: 'POST', headers: {Origin: 'https://unrelated.example'}});
  assert.equal(forbidden.status, 403);
  const created = await request('/api/rooms', {method: 'POST'});
  assert.equal(created.status, 201);
  const {id, hostToken, viewerToken} = await created.json();
  const tlsProxyRequest = await request(`/api/rooms/${id}/signal`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin.replace('http:', 'https:')}, body: JSON.stringify({token: 'invalid', type: 'ice', data: {}})});
  assert.equal((await tlsProxyRequest.json()).error, 'A valid invitation is required');
  assert.match(id, /^\d{9}$/);
  assert.notEqual(hostToken, viewerToken);
  assert.equal((await send(id, 'wrong', 'ice', {})).status, 403);
  assert.equal((await send(id, viewerToken, 'offer', {type: 'offer', sdp: 'not-approved'})).status, 403);
  assert.equal((await send(id, hostToken, 'offer', {type: 'offer', sdp: 'not-approved'})).status, 403);
  assert.equal((await send(id, hostToken, 'chat', {text: 'Before approval'})).status, 403);
  assert.equal((await send(id, viewerToken, 'chat', {text: 'Before approval'})).status, 403);
  assert.equal((await send(id, 'wrong', 'chat', {text: 'Unauthorized'})).status, 403);
  assert.equal((await request(`/api/rooms/${id}?token=${viewerToken}`, {method: 'DELETE'})).status, 405);
  async function eventStream(token) {
    const response = await request(`/api/rooms/${id}/events?token=${token}`, {signal: abort.signal});
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return async function next() {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          if (frame.startsWith('data: ')) return JSON.parse(frame.slice(6));
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
  const duplicate = await request(`/api/rooms/${id}/events?token=${viewerToken}`);
  assert.equal(duplicate.status, 409);
  assert.equal((await send(id, viewerToken, 'approve')).status, 403);
  assert.equal((await send(id, hostToken, 'approve')).status, 200);
  assert.equal((await viewer()).type, 'approved');
  const offer = {type: 'offer', sdp: 'test-offer'};
  assert.equal((await send(id, hostToken, 'offer', offer)).status, 200);
  assert.deepEqual(await viewer(), {type: 'offer', data: offer});
  const answer = {type: 'answer', sdp: 'test-answer'};
  assert.equal((await send(id, viewerToken, 'answer', answer)).status, 200);
  assert.deepEqual(await host(), {type: 'answer', data: answer});
  for (const invalid of [null, {}, {text: 4}, {text: ' \n '}, {text: 'x'.repeat(2001)}]) {
    assert.equal((await send(id, hostToken, 'chat', invalid)).status, 400);
  }
  for (const [token, role, text] of [[hostToken, 'host', '<img src=x onerror=alert(1)>\nHello 👋'], [viewerToken, 'viewer', 'x'.repeat(2000)]]) {
    const before = Date.now();
    assert.equal((await send(id, token, 'chat', {text, role: 'spoofed', timestamp: 0})).status, 200);
    const received = await host();
    assert.deepEqual(await viewer(), received);
    assert.equal(received.type, 'chat');
    assert.equal(received.data.text, text);
    assert.equal(received.data.role, role);
    assert.ok(received.data.timestamp >= before && received.data.timestamp <= Date.now());
  }
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
