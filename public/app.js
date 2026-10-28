const $ = id => document.getElementById(id);
let session = null, events = null, peer = null, stream = null;
let role = 'host', timer = null, animation = null, started = null;
let busy = false, ending = false, sample = false, pendingIce = [];
let generation = 0, statsPrevious = null, lastSession = null;
let phase = 'idle', serviceReady = false;
let chatReady = false, chatSending = false, chatUnread = 0;

function chatControls() {
  const enabled = chatReady && session && !ending && serviceReady;
  $('chat-input').disabled = !enabled || chatSending;
  $('chat-send').disabled = !enabled || chatSending || !$('chat-input').value.trim();
  $('chat-status').textContent = chatReady ? 'Presenter + viewer · Messages clear when either person leaves' : 'Chat opens after the presenter approves a viewer.';
}
function toggleChat(open) {
  $('chat-toggle').setAttribute('aria-expanded', String(open));
  $('chat-content').hidden = !open;
  $('session-panel').classList.toggle('chat-collapsed', !open);
  $('chat-chevron').textContent = open ? '−' : '+';
  if (open) {
    chatUnread = 0;
    $('chat-unread').hidden = true;
    $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
  }
}
function resetChat() {
  chatReady = false; chatSending = false; chatUnread = 0;
  $('chat-messages').replaceChildren($('chat-empty'));
  $('chat-empty').hidden = false;
  $('chat-input').value = '';
  $('chat-error').hidden = true;
  $('chat-unread').hidden = true;
  chatControls();
}
function receiveChat(message) {
  const log = $('chat-messages');
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  $('chat-empty').hidden = true;
  const row = document.createElement('article');
  row.className = 'chat-message' + (message.role === role ? ' own' : '');
  const meta = document.createElement('div'); meta.className = 'chat-meta';
  const sender = document.createElement('strong');
  sender.textContent = message.role === role ? 'You' : message.role === 'host' ? 'Presenter' : 'Viewer';
  const time = document.createElement('time');
  time.dateTime = new Date(message.timestamp).toISOString();
  time.textContent = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const text = document.createElement('p'); text.textContent = message.text;
  meta.append(sender, time); row.append(meta, text); log.append(row);
  // Keep a bounded live transcript; no messages are saved to browser storage.
  while (log.querySelectorAll('article').length > 100) log.querySelector('article').remove();
  if (nearBottom || message.role === role) log.scrollTop = log.scrollHeight;
  if ($('chat-content').hidden && message.role !== role) {
    $('chat-unread').textContent = String(++chatUnread);
    $('chat-unread').hidden = false;
  }
}
async function sendChat(event) {
  event.preventDefault();
  if (!chatReady || chatSending || !session || ending || !serviceReady) return;
  const text = $('chat-input').value;
  if (!text.trim()) return;
  const selectedGeneration = generation;
  chatSending = true; $('chat-error').hidden = true; chatControls();
  try {
    await signal('chat', {text});
    if (selectedGeneration === generation) $('chat-input').value = '';
  } catch (error) {
    if (selectedGeneration === generation) {
      $('chat-error').textContent = error.message + ' Your draft is still here.';
      $('chat-error').hidden = false;
    }
  } finally {
    if (selectedGeneration === generation) {
      chatSending = false; chatControls();
      if (!$('chat-content').hidden && !$('chat-input').disabled) $('chat-input').focus();
    }
  }
}
const canCapture = Boolean(navigator.mediaDevices?.getDisplayMedia);
const defaultHeading = $('page-title').innerHTML;
const defaultDescription = $('page-description').textContent;
let recentSessions = [];
try {
  const saved = JSON.parse(localStorage.getItem('deskstream-history') || '[]');
  if (Array.isArray(saved)) recentSessions = saved.filter(item =>
    item && typeof item.kind === 'string' && /^\d{9}$/.test(item.address) &&
    typeof item.date === 'number' && Number.isFinite(item.date) &&
    typeof item.seconds === 'number' && item.seconds >= 0
  ).slice(0, 8);
} catch { /* The workspace works when browser storage is disabled. */ }
const presets = {
  balanced: {width: 1920, height: 1080, fps: 30, bitrate: 4_000_000},
  motion: {width: 1280, height: 720, fps: 60, bitrate: 5_000_000},
  detail: {width: 2560, height: 1440, fps: 30, bitrate: 7_000_000},
};

function toast(message) {
  $('toast-text').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $('toast').classList.remove('visible'), 5500);
}
function notice(message) {
  $('notice-text').textContent = message;
  $('notice').hidden = !message;
}
function invitationError(message = '') {
  $('invite-error').textContent = message;
  $('invite-error').hidden = !message;
  $('invite-hint').hidden = Boolean(message);
  $('invite').setAttribute('aria-invalid', String(Boolean(message)));
}
function resetStats() {
  for (const name of ['resolution', 'fps', 'bitrate', 'latency']) $('stat-' + name).textContent = '—';
  $('elapsed').textContent = '00:00';
}
function setViewerMode(enabled) {
  document.body.classList.toggle('viewer-mode', enabled);
  $('page-title').innerHTML = enabled ? 'A shared view starts here.' : defaultHeading;
  $('page-description').textContent = enabled ? 'Your presenter will let you in. You’ll be able to view their selected screen.' : defaultDescription;
  const descriptions = enabled
    ? [['Invitation opened', 'Your invitation is ready.'], ['Await approval', 'Your presenter lets you in.'], ['View their screen', 'A live view, without remote control.']]
    : [['Choose your source', 'A screen, window, or browser tab.'], ['Share your invitation', 'One link brings them here.'], ['Let them in', 'Approve your viewer to connect.']];
  ['source', 'invite', 'connect'].forEach((name, index) => {
    $('step-' + name).querySelector('strong').textContent = descriptions[index][0];
    $('step-' + name).querySelector('p').textContent = descriptions[index][1];
  });
}
function state(message, nextPhase = 'idle') {
  phase = nextPhase;
  const live = phase === 'live';
  $('state').textContent = message;
  $('connection-dot').classList.toggle('live', live);
  $('live-indicator').classList.toggle('live', live);
  $('session-badge').classList.toggle('live', live);
  const badges = {idle: 'STANDBY', choosing: 'SELECT SOURCE', waiting: 'READY', request: 'REQUEST', connecting: 'CONNECTING', live: 'LIVE', interrupted: 'RECONNECTING', ended: 'ENDED'};
  $('session-badge').textContent = badges[phase] || 'STANDBY';
  $('session-panel').dataset.phase = phase;
  const step = !session ? 0 : ['request', 'connecting', 'live', 'interrupted'].includes(phase) ? 2 : 1;
  ['source', 'invite', 'connect'].forEach((name, index) => {
    const element = $('step-' + name);
    element.classList.toggle('active', index === step && !live);
    element.classList.toggle('complete', index < step || live);
    element.querySelector('.step-marker').textContent = index < step || live ? '✓' : String(index + 1);
  });
  const viewerWaiting = role === 'viewer' && session;
  $('empty-title').textContent = viewerWaiting ? (phase === 'connecting' ? 'Bringing you together…' : 'Your presenter has the next move.') : 'A shared view. A fresh perspective.';
  $('empty-description').textContent = viewerWaiting ? 'Keep this tab open. The selected source appears here after the presenter approves your request.' : 'Your screen appears here when you start sharing. Choose a window, a tab, or the whole picture.';
  $('empty-caption').textContent = viewerWaiting ? (phase === 'connecting' ? 'Establishing your connection' : 'Waiting for presenter approval') : 'Nothing is being shared';
  controls();
}
function controls() {
  chatControls();
  const active = Boolean(session);
  $('share').disabled = busy || ending || active || !canCapture || !serviceReady;
  $('demo').disabled = busy || ending || active || !serviceReady;
  $('connect').disabled = busy || ending || active || !serviceReady;
  $('invite').disabled = active;
  $('copy').disabled = ending || !active || role !== 'host';
  $('open-viewer').disabled = ending || !active || role !== 'host';
  $('stop').disabled = ending || !active;
  $('fullscreen').disabled = !stream;
  $('quality').disabled = active && role === 'viewer';
  $('share').setAttribute('aria-busy', String(busy));
  $('share-label').textContent = ending ? 'Ending session…' : busy ? (phase === 'choosing' ? 'Choose a source in your browser…' : 'Preparing your session…') : active && role === 'host' ? (sample ? 'Sample stream is ready' : 'Your source is selected') : canCapture ? 'Share my screen' : 'Present from a desktop browser';
  $('invitation-panel').hidden = !active || role !== 'host';
  $('address-badge').classList.toggle('active', active && role === 'host');
  $('address-badge').textContent = active && role === 'host' ? 'PRIVATE LINK' : 'NOT SHARING';
  $('address').classList.toggle('active-address', active && role === 'host');
}
function showStream(value, label) {
  stream = value;
  $('screen').srcObject = value;
  $('screen').hidden = false;
  $('empty').hidden = true;
  $('source-label').hidden = false;
  $('source-label').textContent = label;
  $('screen').play().catch(() => {
    $('screen').controls = true;
    notice('Automatic playback was paused by your browser. Press play on the stream to continue.');
  });
  controls();
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch(path, {signal: AbortSignal.timeout(12_000), ...options}); }
  catch { throw new Error('Couldn’t reach the service. Check your connection and try again.'); }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The service may be starting up. Wait a moment, then try again.');
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
    notice('This session is unavailable or the connection closed. Ask the presenter for a fresh invitation, or start a new session.');
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
  resetStats();
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
      state(role === 'host' ? 'Connected · Sharing screen' : 'Connected · Viewing screen', 'live');
      $('session-title').textContent = role === 'host' ? 'Your screen is shared' : 'Remote screen';
      timer ||= setInterval(updateStats, 1000);
    } else if (pc.connectionState === 'failed') {
      notice('We couldn’t establish a video connection. Try again on the same network. Connections between some networks require a TURN relay on the server.');
      endSession();
    } else if (pc.connectionState === 'disconnected') {
      state('Connection interrupted', 'interrupted');
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
    state('Viewer requesting access', 'request');
  } else if (type === 'approved') {
    chatReady = true; chatControls();
    makePeer();
    state('Accepted · Establishing connection', 'connecting');
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
  } else if (type === 'chat') {
    receiveChat(data);
  } else if (type === 'peer-left') {
    resetChat();
    if ($('approval').open) $('approval').close();
    if (role === 'host') {
      closePeer();
      state('Viewer left · Waiting for a viewer', 'waiting');
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
    chatReady = true; chatControls();
    const pc = makePeer();
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    await pc.setLocalDescription(await pc.createOffer());
    await signal('offer', pc.localDescription.toJSON());
    await applyQuality();
    if (pc === peer && pc.connectionState !== 'connected') state('Connecting to viewer', 'connecting');
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
  if (busy || ending || session) return;
  busy = true; sample = useSample;
  notice(''); invitationError();
  state(useSample ? 'Preparing a sample stream' : 'Choose a source in your browser', 'choosing');
  let acquired;
  try {
    if (!useSample && !navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing needs a desktop browser on localhost or HTTPS.');
    const preset = presets[$('quality').value];
    acquired = useSample ? createSample() : await navigator.mediaDevices.getDisplayMedia({video: {width: {ideal: preset.width}, height: {ideal: preset.height}, frameRate: {ideal: preset.fps}}, audio: false});
    phase = 'connecting'; controls();
    role = 'host';
    setViewerMode(false);
    session = await request('/api/rooms', {method: 'POST'});
    session.token = session.hostToken;
    generation++;
    started = null;
    lastSession = {address: session.id, kind: useSample ? 'Sample stream' : 'Screen share'};
    showStream(acquired, useSample ? 'Sample stream · Animated illustration' : 'Your screen · Local preview');
    acquired.getVideoTracks()[0].addEventListener('ended', () => endSession());
    $('address').textContent = session.id.match(/.{3}/g).join(' ');
    $('share-link').value = inviteUrl();
    $('share-note').textContent = 'Copy the invitation to let someone request access.';
    $('session-title').textContent = 'Screen ready to share';
    $('metrics').textContent = useSample ? 'Sample source · 1280 × 720' : 'Source selected';
    state('Waiting for a viewer', 'waiting');
    listen();
    toast(useSample ? 'Sample stream ready. Open the viewer to test the connection.' : 'Screen selected. Copy your invitation to invite a viewer.');
  } catch (error) {
    acquired?.getTracks().forEach(track => track.stop());
    cancelAnimationFrame(animation);
    if (session) await endSession();
    else state('No active session');
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
  if (busy || ending || session) return;
  try {
    invitationError();
    if (!value) throw new Error('Paste your presenter’s invitation link to join a session.');
    const selected = parseInvitation(value);
    if (!window.RTCPeerConnection) throw new Error('This browser does not support WebRTC.');
    generation++;
    role = 'viewer'; session = selected; started = null;
    notice(''); setViewerMode(true);
    lastSession = {address: selected.id, kind: 'Viewed screen'};
    $('session-title').textContent = 'Waiting for presenter approval';
    $('share-note').textContent = 'You are viewing another desk.';
    $('metrics').textContent = 'Request sent';
    $('invite').value = value;
    history.replaceState(null, '', '/');
    controls(); state('Waiting for approval', 'waiting'); listen();
    $('session-panel').scrollIntoView({behavior: 'smooth', block: 'center'});
  } catch (error) { invitationError(error.message); $('invite').focus(); }
}
async function endSession(notify = true) {
  if (ending || (!session && !stream)) return;
  ending = true;
  controls();
  const selected = session;
  const wasHost = role === 'host';
  generation++;
  events?.close(); events = null;
  closePeer();
  cancelAnimationFrame(animation); animation = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  session = null;
  resetChat();
  if (document.fullscreenElement === $('session-panel')) document.exitFullscreen().catch(() => {});
  if ($('approval').open) $('approval').close();
  $('screen').srcObject = null; $('screen').hidden = true;
  $('empty').hidden = false; $('source-label').hidden = true;
  $('address').textContent = 'Ready when you are';
  $('share-link').value = '';
  $('share-note').textContent = 'A private invitation is created when you choose a source.';
  $('session-title').textContent = 'Screen preview';
  $('screen').controls = false;
  $('invite').value = '';
  setViewerMode(false);
  $('metrics').textContent = 'Ready to connect';
  state('Session ended', 'ended');
  if (lastSession) {
    recentSessions.unshift({...lastSession, date: Date.now(), seconds: started ? Math.max(1, Math.round((Date.now() - started) / 1000)) : 0});
    recentSessions = recentSessions.slice(0, 8);
    try { localStorage.setItem('deskstream-history', JSON.stringify(recentSessions)); } catch { /* Keep the in-memory history when storage is unavailable. */ }
    renderHistory();
    lastSession = null;
  }
  controls();
  try {
    if (selected && notify) {
      if (wasHost) await request(`/api/rooms/${selected.id}?token=${encodeURIComponent(selected.token)}`, {method: 'DELETE'});
      else await signal('leave', undefined, selected);
    }
  } catch { toast('The connection is closed. The server session may already have expired.'); }
  finally { ending = false; controls(); }
}
function renderHistory() {
  if (!recentSessions.length) return;
  $('history-list').replaceChildren();
  for (const item of recentSessions) {
    const row = document.createElement('div'); row.className = 'history-row';
    const icon = document.createElement('span'); icon.className = 'feature-icon lavender';
    icon.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-screen"/></svg>';
    const description = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${item.kind} · ${item.address.match(/.{3}/g).join(' ')}`;
    const date = document.createElement('p'); date.textContent = new Date(item.date).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    const duration = document.createElement('span'); duration.className = 'history-duration'; duration.textContent = item.seconds ? `${Math.floor(item.seconds / 60)}m ${item.seconds % 60}s connected` : 'Not connected';
    description.append(title, date); row.append(icon, description, duration); $('history-list').append(row);
  }
}
async function updateStats() {
  const pc = peer;
  if (!pc) return;
  try {
    const reports = await pc.getStats();
    if (pc !== peer) return;
    const seconds = Math.floor((Date.now() - started) / 1000);
    $('elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
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
    $('stat-resolution').textContent = rtp.frameWidth ? `${rtp.frameWidth} × ${rtp.frameHeight}` : '—';
    $('stat-fps').textContent = rtp.framesPerSecond == null ? '—' : `${Math.round(rtp.framesPerSecond)} fps`;
    $('stat-bitrate').textContent = `${bitrate.toFixed(1)} Mbps`;
    $('stat-latency').textContent = rtt == null ? '—' : `${Math.round(rtt * 1000)} ms`;
  } catch { /* A closed peer no longer has statistics. */ }
}
$('share').onclick = () => share(false);
$('demo').onclick = () => share(true);
$('stop').onclick = () => endSession();
$('join-form').onsubmit = event => { event.preventDefault(); connect($('invite').value.trim()); };
$('invite').oninput = () => invitationError();
$('share-link').onclick = () => $('share-link').select();
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    $('copy-label').textContent = 'Copied!';
    toast('Invitation copied. Send it to the person you want to let in.');
    setTimeout(() => { $('copy-label').textContent = 'Copy link'; }, 2500);
  } catch {
    $('share-link').focus(); $('share-link').select();
    toast('Select and copy the invitation above with Ctrl+C or ⌘C.');
  }
};
$('open-viewer').onclick = () => window.open(inviteUrl(), '_blank', 'noopener');
$('approve').onclick = approveViewer;
$('reject').onclick = async () => { $('approval').close(); try { await signal('reject'); state('Waiting for a viewer', 'waiting'); } catch (error) { toast(error.message); } };
$('approval').addEventListener('cancel', event => { event.preventDefault(); $('reject').click(); });
$('quality').onchange = () => applyQuality().catch(error => toast(`Quality could not be changed: ${error.message}`));
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('session-panel').requestFullscreen) await $('session-panel').requestFullscreen();
    else toast('Fullscreen is unavailable in this browser.');
  } catch (error) { toast(error.message); }
};
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
  $('fullscreen').setAttribute('aria-label', label); $('fullscreen').title = label;
  toggleChat(!document.fullscreenElement);
});
$('chat-toggle').onclick = () => toggleChat($('chat-content').hidden);
$('chat-form').onsubmit = sendChat;
$('chat-input').oninput = chatControls;
$('chat-input').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('chat-form').requestSubmit();
  }
};
for (const id of ['help', 'nav-help', 'footer-help']) $(id).onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
$('dismiss-notice').onclick = () => notice('');
for (const id of ['home', 'recent']) $(id).onclick = () => {
  for (const name of ['home', 'recent']) {
    $(name).classList.toggle('selected', id === name);
    if (id === name) $(name).setAttribute('aria-current', 'location');
    else $(name).removeAttribute('aria-current');
  }
  if (id === 'home') window.scrollTo({top: 0, behavior: 'smooth'});
  else $('history-section').scrollIntoView({behavior: 'smooth', block: 'center'});
};
async function checkService() {
  try {
    await request('/api/health');
    serviceReady = true;
    $('service-status').dataset.status = 'ready';
    $('service-label').textContent = 'Service connected';
  } catch {
    serviceReady = false;
    $('service-status').dataset.status = 'offline';
    $('service-label').textContent = 'Service unavailable';
    notice('The service is unavailable or waking up. Check your connection, then refresh this page to try again.');
  }
  controls();
}
window.addEventListener('online', checkService);
window.addEventListener('offline', () => {
  serviceReady = false;
  $('service-status').dataset.status = 'offline'; $('service-label').textContent = 'You’re offline';
  notice('You’re offline. Reconnect to start a session.'); controls();
});
window.addEventListener('pagehide', () => {
  stream?.getTracks().forEach(track => track.stop());
  if (!session) return;
  if (role === 'host') fetch(`/api/rooms/${session.id}?token=${encodeURIComponent(session.token)}`, {method: 'DELETE', keepalive: true}).catch(() => {});
  else fetch(`/api/rooms/${session.id}/signal`, {method: 'POST', keepalive: true, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: session.token, type: 'leave'})}).catch(() => {});
});
controls();
renderHistory();
checkService();
if (!canCapture) notice('This browser can view streams. To present your screen, open Deskstream in a supported desktop browser on HTTPS or localhost.');
if (location.hash.startsWith('#join=')) connect(location.href);
