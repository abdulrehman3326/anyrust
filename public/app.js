const $ = id => document.getElementById(id);
let session = null, events = null, peer = null, stream = null;
let role = 'host', timer = null, animation = null, started = null;
let busy = false, ending = false, sample = false, pendingIce = [];
let generation = 0, statsPrevious = null, lastSession = null;
const presets = {
  balanced: {width: 1920, height: 1080, fps: 30, bitrate: 4_000_000},
  motion: {width: 1280, height: 720, fps: 60, bitrate: 5_000_000},
  detail: {width: 2560, height: 1440, fps: 30, bitrate: 7_000_000},
};

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}
function state(message, live = false) {
  $('state').textContent = message;
  $('connection-dot').classList.toggle('live', live);
  $('live-indicator').classList.toggle('live', live);
  $('session-badge').classList.toggle('live', live);
  $('session-badge').textContent = live ? 'LIVE' : session ? 'CONNECTING' : 'STANDBY';
}
function controls() {
  const active = Boolean(session);
  $('share').disabled = busy || active;
  $('demo').disabled = busy || active;
  $('connect').disabled = busy || active;
  $('invite').disabled = active;
  $('copy').disabled = !active || role !== 'host';
  $('open-viewer').disabled = !active || role !== 'host';
  $('stop').disabled = !active;
  $('fullscreen').disabled = !stream;
  $('quality').disabled = active && role === 'viewer';
}
function showStream(value, label) {
  stream = value;
  $('screen').srcObject = value;
  $('screen').hidden = false;
  $('empty').hidden = true;
  $('source-label').hidden = false;
  $('source-label').textContent = label;
  $('screen').play().catch(() => toast('Press play in your browser to view the stream.'));
  controls();
}
async function request(path, options = {}) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed');
  return result;
}
const inviteUrl = () => `${location.origin}/#join=${session.id}:${session.viewerToken}`;
async function signal(type, data, selected = session) {
  if (!selected) return;
  return request(`/api/rooms/${selected.id}/signal`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({token: selected.token, type, data}),
  });
}
function listen() {
  const currentGeneration = generation;
  events = new EventSource(`/api/rooms/${session.id}/events?token=${encodeURIComponent(session.token)}`);
  let queue = Promise.resolve();
  events.onmessage = event => {
    queue = queue.then(async () => {
      if (currentGeneration !== generation || !session) return;
      const message = JSON.parse(event.data);
      await onSignal(message.type, message.data);
    }).catch(error => {
      if (currentGeneration === generation) { toast(error.message); endSession(); }
    });
  };
  events.onerror = () => {
    if (currentGeneration !== generation || ending) return;
    toast('The signaling connection closed. Start a new session to reconnect.');
    endSession();
  };
}
function closePeer() {
  if (peer) {
    peer.onconnectionstatechange = null;
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.close();
  }
  peer = null;
  pendingIce = [];
  clearInterval(timer);
  timer = null;
  clearTimeout(state.disconnectTimer);
  statsPrevious = null;
}
function makePeer() {
  closePeer();
  const pc = new RTCPeerConnection({iceServers: []});
  peer = pc;
  const selected = session;
  const currentGeneration = generation;
  pc.onicecandidate = event => {
    if (event.candidate) signal('ice', event.candidate.toJSON(), selected).catch(error => {
      if (currentGeneration === generation) toast(error.message);
    });
  };
  pc.ontrack = event => {
    const received = event.streams[0] || new MediaStream([event.track]);
    showStream(received, 'Viewing shared source · View only');
  };
  pc.onconnectionstatechange = () => {
    if (pc !== peer) return;
    if (pc.connectionState === 'connected') {
      clearTimeout(state.disconnectTimer);
      started ||= Date.now();
      state(role === 'host' ? 'Connected · Sharing screen' : 'Connected · Viewing screen', true);
      $('session-title').textContent = role === 'host' ? 'Your screen is shared' : 'Remote screen';
      timer ||= setInterval(updateStats, 1000);
    } else if (pc.connectionState === 'failed') {
      toast('The peer connection failed. This prototype has no TURN relay; try two local tabs.');
      endSession();
    } else if (pc.connectionState === 'disconnected') {
      state('Connection interrupted');
      state.disconnectTimer = setTimeout(() => {
        if (pc === peer && pc.connectionState === 'disconnected') { toast('The viewer disconnected.'); endSession(); }
      }, 10_000);
    }
  };
  return pc;
}
async function applyQuality() {
  const preset = presets[$('quality').value];
  const track = role === 'host' && stream?.getVideoTracks()[0];
  if (track && !sample) await track.applyConstraints({width: {ideal: preset.width}, height: {ideal: preset.height}, frameRate: {ideal: preset.fps}});
  const sender = peer?.getSenders().find(item => item.track?.kind === 'video');
  if (sender) {
    const parameters = sender.getParameters();
    parameters.encodings ||= [{}];
    for (const encoding of parameters.encodings) { encoding.maxBitrate = preset.bitrate; encoding.maxFramerate = preset.fps; }
    await sender.setParameters(parameters);
  }
}
async function onSignal(type, data) {
  if (type === 'ready') return;
  if (type === 'viewer-request' && role === 'host') {
    if (!$('approval').open) $('approval').showModal();
    state('Viewer requesting access');
  } else if (type === 'approved') {
    makePeer();
    state('Accepted · Establishing connection');
  } else if (type === 'offer' && role === 'viewer') {
    if (!peer) throw new Error('The presenter must approve this session first');
    await peer.setRemoteDescription(data);
    for (const candidate of pendingIce) await peer.addIceCandidate(candidate);
    pendingIce = [];
    await peer.setLocalDescription(await peer.createAnswer());
    await signal('answer', peer.localDescription.toJSON());
  } else if (type === 'answer' && role === 'host') {
    await peer.setRemoteDescription(data);
    for (const candidate of pendingIce) await peer.addIceCandidate(candidate);
    pendingIce = [];
  } else if (type === 'ice') {
    if (peer?.remoteDescription) await peer.addIceCandidate(data);
    else pendingIce.push(data);
  } else if (type === 'peer-left') {
    if ($('approval').open) $('approval').close();
    if (role === 'host') {
      closePeer();
      state('Viewer left · Waiting for a viewer');
      $('session-title').textContent = 'Screen ready to share';
      $('metrics').textContent = 'Invitation is still active';
    } else { toast('The presenter disconnected.'); await endSession(false); }
  } else if (type === 'ended' || type === 'rejected') {
    toast(type === 'rejected' ? 'The presenter declined your request.' : 'The presenter ended the session.');
    await endSession(false);
  }
}
async function approveViewer() {
  $('approval').close();
  try {
    await signal('approve');
    const pc = makePeer();
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    await pc.setLocalDescription(await pc.createOffer());
    await signal('offer', pc.localDescription.toJSON());
    await applyQuality();
    state('Connecting to viewer');
  } catch (error) { toast(error.message); await endSession(); }
}
function createSample() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const begin = performance.now();
  function frame(now) {
    const t = (now - begin) / 1000;
    ctx.fillStyle = '#e9edf1'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#263745'; ctx.fillRect(0, 0, 1280, 48);
    ctx.fillStyle = '#fff'; ctx.font = '500 16px Segoe UI'; ctx.fillText('Deskstream / sample workspace', 26, 30);
    ctx.fillStyle = '#fff'; ctx.fillRect(70, 100, 1140, 530);
    ctx.fillStyle = '#ef554b'; ctx.fillRect(70, 100, 9, 530);
    ctx.fillStyle = '#9aa5b0'; ctx.font = '14px Segoe UI'; ctx.fillText('A REAL WEBRTC STREAM · GENERATED DEMO SOURCE', 116, 155);
    ctx.fillStyle = '#273746'; ctx.font = '600 46px Segoe UI'; ctx.fillText('A screen worth sharing.', 115, 229);
    ctx.fillStyle = '#84929f'; ctx.font = '20px Segoe UI'; ctx.fillText('This moving illustration is streamed to your viewer.', 116, 274);
    for (let i = 0; i < 25; i++) {
      const height = 25 + 105 * (0.5 + Math.sin(t * 1.8 + i * 0.3) / 2);
      ctx.fillStyle = i % 4 === 0 ? '#ef554b' : '#d7e2e8';
      ctx.fillRect(118 + i * 39, 500 - height, 25, height);
    }
    ctx.fillStyle = '#9aa5b0'; ctx.font = '15px Segoe UI'; ctx.fillText(`LIVE MOTION  /  ${t.toFixed(1)} seconds`, 118, 556);
    animation = requestAnimationFrame(frame);
  }
  frame(begin);
  return canvas.captureStream(30);
}
async function share(useSample) {
  if (busy || session) return;
  busy = true; sample = useSample; controls();
  let acquired;
  try {
    if (!useSample && !navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing needs a desktop browser on localhost or HTTPS.');
    const preset = presets[$('quality').value];
    acquired = useSample ? createSample() : await navigator.mediaDevices.getDisplayMedia({video: {width: {ideal: preset.width}, height: {ideal: preset.height}, frameRate: {ideal: preset.fps}}, audio: false});
    role = 'host';
    session = await request('/api/rooms', {method: 'POST'});
    session.token = session.hostToken;
    generation++;
    started = null;
    lastSession = {address: session.id, kind: useSample ? 'Sample stream' : 'Screen share'};
    showStream(acquired, useSample ? 'Sample stream · Animated illustration' : 'Your screen · Local preview');
    acquired.getVideoTracks()[0].addEventListener('ended', () => endSession());
    $('address').textContent = session.id.match(/.{3}/g).join(' ');
    $('share-note').textContent = 'Copy the invitation to let someone request access.';
    $('session-title').textContent = 'Screen ready to share';
    $('metrics').textContent = useSample ? 'Sample source · 1280 × 720' : 'Source selected';
    state('Waiting for a viewer');
    listen();
    toast(useSample ? 'Sample stream ready. Open the viewer to test the connection.' : 'Screen selected. Copy your invitation to invite a viewer.');
  } catch (error) {
    acquired?.getTracks().forEach(track => track.stop());
    cancelAnimationFrame(animation);
    if (session) await endSession();
    toast(error.name === 'NotAllowedError' ? 'Screen sharing was cancelled. You can try again.' : error.message);
  } finally { busy = false; controls(); }
}
function parseInvitation(value) {
  let hash;
  try {
    const url = new URL(value);
    if (url.origin !== location.origin) throw new Error('Open the invitation on its original Deskstream server.');
    hash = url.hash;
  } catch (error) {
    if (!value.startsWith('#join=')) throw error.message.startsWith('Open the invitation') ? error : new Error('Paste the complete invitation link from the presenter.');
    hash = value;
  }
  const match = hash.match(/^#join=(\d{9}):([\w-]{32})$/);
  if (!match) throw new Error('This invitation is incomplete. Ask the presenter for a new link.');
  return {id: match[1], token: match[2]};
}
async function connect(value) {
  if (busy || session) return;
  try {
    const selected = parseInvitation(value);
    if (!window.RTCPeerConnection) throw new Error('This browser does not support WebRTC.');
    generation++;
    role = 'viewer'; session = selected; started = null;
    lastSession = {address: selected.id, kind: 'Viewed screen'};
    $('session-title').textContent = 'Waiting for presenter approval';
    $('share-note').textContent = 'You are viewing another desk.';
    $('metrics').textContent = 'Request sent';
    $('invite').value = value;
    history.replaceState(null, '', '/');
    controls(); state('Waiting for approval'); listen();
  } catch (error) { toast(error.message); }
}
async function endSession(notify = true) {
  if (ending || (!session && !stream)) return;
  ending = true;
  const selected = session;
  const wasHost = role === 'host';
  generation++;
  events?.close(); events = null;
  closePeer();
  cancelAnimationFrame(animation); animation = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  session = null;
  if ($('approval').open) $('approval').close();
  $('screen').srcObject = null; $('screen').hidden = true;
  $('empty').hidden = false; $('source-label').hidden = true;
  $('address').textContent = 'Ready when you are';
  $('share-note').textContent = 'You choose what to share. You stay in control.';
  $('session-title').textContent = 'Your shared workspace';
  $('metrics').textContent = 'Ready to connect';
  state('Session ended');
  if (lastSession) {
    const duration = started ? `${Math.max(1, Math.round((Date.now() - started) / 1000))} seconds` : 'No live connection';
    $('history-list').replaceChildren();
    const icon = document.createElement('span'); icon.className = 'history-icon'; icon.textContent = '▣';
    const container = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${lastSession.kind} · ${lastSession.address.match(/.{3}/g).join(' ')}`;
    const description = document.createElement('p'); description.textContent = `${duration} · Ended at ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
    container.append(title, description); $('history-list').append(icon, container);
    lastSession = null;
  }
  controls();
  try {
    if (selected && notify) {
      if (wasHost) await request(`/api/rooms/${selected.id}?token=${encodeURIComponent(selected.token)}`, {method: 'DELETE'});
      else await signal('leave', undefined, selected);
    }
  } catch { toast('The connection is closed. The server session may already have expired.'); }
  finally { ending = false; }
}
async function updateStats() {
  const pc = peer;
  if (!pc) return;
  try {
    const reports = await pc.getStats();
    if (pc !== peer) return;
    let rtp, rtt;
    reports.forEach(report => {
      if (report.type === (role === 'host' ? 'outbound-rtp' : 'inbound-rtp') && report.kind === 'video') rtp = report;
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) rtt = report.currentRoundTripTime;
    });
    if (!rtp) return;
    const bytes = rtp.bytesSent ?? rtp.bytesReceived;
    const elapsed = statsPrevious ? (rtp.timestamp - statsPrevious.timestamp) / 1000 : 0;
    const bitrate = elapsed > 0 ? (bytes - statsPrevious.bytes) * 8 / elapsed / 1e6 : 0;
    statsPrevious = {bytes, timestamp: rtp.timestamp};
    const resolution = rtp.frameWidth ? `${rtp.frameWidth} × ${rtp.frameHeight}` : 'Video';
    const fps = rtp.framesPerSecond == null ? '' : ` · ${Math.round(rtp.framesPerSecond)} fps`;
    $('metrics').textContent = `${resolution}${fps} · ${bitrate.toFixed(1)} Mbps${rtt == null ? '' : ` · ${Math.round(rtt * 1000)} ms`}`;
  } catch { /* A closed peer no longer has statistics. */ }
}
$('share').onclick = () => share(false);
$('demo').onclick = () => share(true);
$('stop').onclick = () => endSession();
$('connect').onclick = () => connect($('invite').value.trim());
$('invite').onkeydown = event => { if (event.key === 'Enter') connect($('invite').value.trim()); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(inviteUrl()); toast('Invitation copied. The viewer will need your approval.'); } catch { toast('Clipboard unavailable. Use Open viewer to test locally.'); } };
$('open-viewer').onclick = () => window.open(inviteUrl(), '_blank', 'noopener');
$('approve').onclick = approveViewer;
$('reject').onclick = async () => { $('approval').close(); try { await signal('reject'); state('Waiting for a viewer'); } catch (error) { toast(error.message); } };
$('approval').addEventListener('cancel', event => { event.preventDefault(); $('reject').click(); });
$('quality').onchange = () => applyQuality().catch(error => toast(`Quality could not be changed: ${error.message}`));
$('fullscreen').onclick = () => $('stage').requestFullscreen().catch(error => toast(error.message));
$('help').onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
$('home').onclick = () => window.scrollTo({top: 0, behavior: 'smooth'});
$('recent').onclick = () => $('history-list').scrollIntoView({behavior: 'smooth', block: 'center'});
window.addEventListener('pagehide', () => {
  stream?.getTracks().forEach(track => track.stop());
  if (!session) return;
  if (role === 'host') fetch(`/api/rooms/${session.id}?token=${encodeURIComponent(session.token)}`, {method: 'DELETE', keepalive: true}).catch(() => {});
  else fetch(`/api/rooms/${session.id}/signal`, {method: 'POST', keepalive: true, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: session.token, type: 'leave'})}).catch(() => {});
});
controls();
if (location.hash.startsWith('#join=')) connect(location.href);
