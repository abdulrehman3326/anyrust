# Deskstream

A web reconstruction of the requested AnyDesk-style interface and view-only screen streaming flow. Run it locally with Node.js 22.18 or newer (the server is TypeScript that Node runs directly via built-in type stripping):

```powershell
git clone https://github.com/abdulrehman3326/anyrust.git
cd anyrust
npm start
```

Open http://127.0.0.1:4317 in a desktop browser. No npm installation is needed.

1. Choose **Share my screen** and select a browser tab, window or display in the browser's picker.
2. Choose **Open viewer** to open a second local browser tab, or copy the invitation.
3. Return to the presenter and choose **Allow viewing**.
4. The selected source streams over WebRTC. **End session** closes the peer connection and stops the captured tracks. Stopping the browser's native sharing control also ends the session.

**Try a sample stream** generates an animated canvas source for testing. It is clearly labeled and still travels through a real WebRTC peer connection. It never captures the desktop.

**Presenter controls.** The approval dialog sets what the viewer may do (currently **Allow chat**), and **Session details** can change it mid-session. The server enforces it: a viewer whose chat is off gets `403` when posting, while the presenter can still post. **Pause** (stage toolbar) is a privacy pause: the capture track is disabled so only black frames are sent, and the viewer sees a "presenter paused sharing" screen until **Resume**. A viewer who joins or reconnects while paused sees the pause screen immediately.

**Viewer stage tools.** **Take screenshot** saves the current frame as a PNG at the stream's native resolution (disabled while paused). **Show at original size** toggles between fit-to-stage and 1:1 pixels with scrolling. **Picture-in-picture** appears where the browser supports it. Both sides show a **Good / Fair / Poor connection** badge, graded from round-trip time (under 150 ms good, under 400 ms fair) and video packet loss (under 2% good, under 8% fair); packet loss is also listed in Session details.

After approval, presenter and viewer can use **Session chat** below the video. Enter sends a message; Shift+Enter adds a new line. Fullscreen keeps the session controls visible and moves chat into a collapsible tray on the right, initially collapsed. The tray shows an unread count for incoming messages while closed. Exit fullscreen restores chat below the video.

Chat uses the authenticated HTTP/SSE session channel through the server. Messages are limited to 2,000 characters, displayed as plain text, and are not saved to disk or browser storage. Each tab retains only its latest 100 messages; leaving or ending a session clears the transcript for both participants. A replacement viewer must be approved again and receives no previous transcript.

## Frontend development

The UI is a React + TypeScript (strict) app in [`web/`](web/), organized feature-first (`web/src/features/*` for session, present, join, approval, chat, history, help, theme, addressbook, device, files, pointer; `web/src/shared/*` for the API client, UI primitives, layout and the app theme). Styling uses [shadcn/ui](https://ui.shadcn.com) (new-york, zinc) on Tailwind CSS v4, dark by default. The app is split into path-routed views (`/`, `/share`, `/join`, `/session`, `/history`, `/help`) sharing one page layout; invite links (`#join=…`) open the session view. Typography is self-hosted Inter (UI), Geist (headings) and Geist Mono (IDs, timers, stats), inlined into styles.css, which is why the CSP allows `font-src 'self' data:`. Buttons follow one rule set: four variants (primary, outline, ghost, danger) at a single 36px height. Every color is defined once in `web/src/shared/styles/globals.css` (light on `:root`, dark on `.dark`); components use only Tailwind theme tokens (`bg-card`, `text-muted-foreground`, `bg-brand`, …), and a test fails if a color literal appears elsewhere. Components that inject inline `<style>` (Radix Dialog/Select) are avoided because the server CSP is `style-src 'self'`; dialogs and selects use the native elements with shadcn styling. The server serves the app shell for each view path; its API is unchanged.

```powershell
cd web
npm install
npm run dev        # Vite dev server with /api proxied to http://127.0.0.1:4317 (run `npm start` in the repo root too)
npm run typecheck && npm run lint && npm test
npm run build      # writes public/index.html, app.js, styles.css
npx playwright install chromium   # once per machine
npm run test:e2e   # presenter + viewer in real Chromium against the built app (run after `npm run build`)
```

The server serves a fixed allowlist of three files and a strict CSP, so the build emits exactly those with stable names and no inline styles. **The built files in `public/` are committed**, so `npm start` and Render keep working without installing frontend tooling. Re-run `npm run build` after changing anything in `web/` and commit the result.

## Implementation and scope

The UI includes session setup, invitation copying, approval, local preview, remote playback, quality presets, full screen, live WebRTC statistics and in-memory session history. There is no remote input/control or unattended access.

**Device ID and address book.** Each presenter browser gets a permanent 9-digit **device ID**, shown on the invite panel. A viewer can type it into the join box, or save it with a nickname in the **Address book** on the Join page and click **Connect**. Connecting works only while that device is sharing, and the presenter still approves every request. A viewer who joined by ID is offered **Save device**. Under the hood the browser keeps a random 256-bit secret (`localStorage`, never displayed), and the server derives the ID as HMAC-SHA256 with `DEVICE_ID_KEY`, so an ID can't be claimed by brute-forcing secrets offline. The server stores nothing per device; it maps an ID to its live room only while sharing, allows one live room per device, and rate-limits lookups (10 per minute per client, 20 per device; `429` with `Retry-After`). Unknown and offline IDs get the same answer, so IDs can't be enumerated. Set `DEVICE_ID_KEY` (32+ characters) in production; without it the server creates a gitignored `.deskstream-device-key` file, and changing the key changes every device ID. Behind a reverse proxy, set `TRUST_PROXY=1` so rate limits use the real client address. The address book lives only in the viewer's browser.

**Viewer pointer.** With the **Allow pointer** permission (on by default, changeable in Session details), the viewer can turn on **Point at the screen**: the presenter sees a red dot that follows the viewer's mouse and a ripple on each click, drawn on their preview. Positions are sent as fractions of the video picture over the control channel, so they land on the same spot at any window size or letterboxing, and the presenter's app drops pointer messages without the permission. Because the presenter usually looks at the app they're sharing rather than the Deskstream tab, **Pop out preview** opens an always-on-top mini window (Document Picture-in-Picture) with the live preview and pointer; it is available in Chromium browsers and hidden elsewhere. The pointer is guidance only: it never controls the presenter's mouse or keyboard.

**File transfer.** Once a viewer is approved, both sides get a **Files** card (drag and drop or **Choose file**, up to 100 MB). Files go peer to peer over a dedicated `deskstream-files` data channel and are never uploaded to the server. The receiver must **Accept** each file before any bytes move; the sender's SHA-256 is announced in the offer and checked on arrival, and only a verified file can be saved (a mismatch is discarded and reported to both sides). The presenter can always send; the viewer can send only with the **Allow file transfer** permission, which is off by default and can be changed in Session details. The presenter's app enforces it by refusing offers, and turning it off stops a transfer in progress. Names from the other side are sanitized (no paths or control characters). Transfers run one per direction, in 16 KiB chunks with send-buffer backpressure; a 60 MB local transfer measured about 5 MB/s. Received files are held in memory only and are released when they are dismissed or the session ends. Integrity is checked, not content: only accept files you expect. Implementation: `web/src/features/session/model/FileTransferController.ts` and `web/src/features/files/`.

**Audio.** The screen picker offers to share audio; Chromium shares system audio for a whole screen on Windows and tab audio elsewhere, and other browsers may offer none, in which case the session simply has no computer audio. The presenter's **microphone** is off by default and can be turned on from the stage toolbar (headphones avoid echo); turning it off stops the device. Computer audio and microphone are mixed on the presenter's side into a single outgoing track (`web/src/features/session/lib/audioMixer.ts`), so toggling either never renegotiates the connection, and the presenter never hears their own audio back. Viewers start muted because browsers block autoplay with sound; **Turn on sound** enables it, with mute and volume in the toolbar. The presenter reports what is audible over the control channel (`audio-state`), so viewers only see sound controls when there is something to hear and see "Presenter mic on" while the mic is live. The demo stream includes a quiet two-note chime as stand-in computer audio. Audio uses the browser's default Opus settings (mono, voice-oriented bitrate), so music fidelity is limited.

The Node server relays SDP and ICE messages through same-origin HTTP and Server-Sent Events. It binds to loopback locally, or to `0.0.0.0` when the hosting platform provides `PORT`. Set `HOST` explicitly to override this. Invitation keys are randomly generated capabilities; an invitation holder must still be accepted by the presenter. Screens are peer-to-peer media, not relayed through the HTTP server. Session state is held in memory; restarting the server invalidates invitations. Only one viewer is supported per room.

This is a local, two-tab prototype. For access from another computer, deploy the server behind HTTPS on a reachable host and configure STUN/TURN (below). Internet traversal, production identity, durable storage and multi-viewer sharing are not implemented or verified. Browser display capture requires localhost or a secure HTTPS context, and user selection of a source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

## REA investigation

REA 6.8.0 inspected the installed `C:\Program Files (x86)\AnyDesk\AnyDesk.exe`, version 9.7.15. The original artifact was read only. Full evidence records are in [`investigations/anydesk/`](investigations/anydesk/).

- `installation.json`: `ev_157085b84017ad57a34ade5eb5bd73b91b579e88a07667cf58df328fa97987a0`. One executable was found; bounded header inspection identified a native PE image. No Electron/JavaScript runtime candidates were found within that scan.
- `resources.json`: `ev_f21f7068a345e8e79293531d391e5875d3d356879ebbd06e2a8cf82b907d2673`. PE32 x86, 11 resources and two icon groups. Opaque payload inventory does not establish screen layout or codec behavior.
- `exports.json`: `ev_f3bb08924011b362f092d713f2621ec614632b8fec3710c24895e2c506306ef2`. No export directory. This is not evidence that internal functionality is absent.
- Executable SHA-256 from the complete REA resource/export inspection: `89e0a41a37d360d81bb0bfd89537dbbb3bdf45917adfe88ae3cb19d4f6b3c81e`.

The native accessibility observation exposed a **New Session** tab. Window screenshot capture timed out twice. A native decompiler was unavailable, so no AnyDesk function bodies, compression code, network protocol or live streaming internals were recovered. The visual layout is an original AnyDesk-inspired approximation; it is not a pixel-verified copy. The streaming implementation is newly written browser WebRTC code. AnyDesk documents its own DeskRT codec at https://www.anydesk.com/en/features/screen-sharing.

## API routes

Every HTTP endpoint is declared in one table, [`routes.ts`](routes.ts): method, URL path, whether a room token is required, the handler name and a one-line summary. `server.ts` looks each request up in that table and supplies the handler, so add a new endpoint to `routes.ts` first. TypeScript then requires a matching handler in `server.ts`.

| Method | Path | Token | Purpose |
|---|---|---|---|
| GET | `/api/health` | no | Readiness check |
| POST | `/api/rooms` | no | Create a room; returns `id`, `hostToken`, `viewerToken` (and `deviceId` when a `deviceSecret` is sent) |
| POST | `/api/devices/:id/connect` | no | Request access to a sharing device by its 9-digit device ID; rate-limited |
| GET | `/api/rooms/:id/events` | yes | Server-sent event stream for the host or viewer |
| POST | `/api/rooms/:id/signal` | yes | Send approve, reject, leave, chat, offer, answer and ice messages |
| GET | `/api/rooms/:id/ice` | yes | STUN/TURN servers (viewer only after approval) |
| DELETE | `/api/rooms/:id` | yes | End the room (host only) |

`:id` is the 9-digit room id, except under `/api/devices`, where it is the 9-digit device id. The token is sent as `?token=` or in the body of a signal POST. Any other GET path is served from the built `public/` files.

## Validation

```powershell
npm install        # dev-only: TypeScript and @types/node for type-checking
npm run typecheck  # tsc over server.ts, routes.ts, server.test.ts and protocol/
npm test           # node --test server.test.ts
```

The server (`server.ts`), its route table (`routes.ts`), its test and the signaling contract (`protocol/signaling.ts`) are strict TypeScript using only erasable syntax (no enums, namespaces or parameter properties), so Node executes them without a build step and deploys need no runtime dependencies. The web client re-exports the same contract from `web/src/shared/api/types.ts`, so the server and client message types cannot drift apart.

The integration test exercises real HTTP/SSE behavior: invitation permissions, presenter approval, role restrictions, signaling delivery, duplicate-viewer rejection, reverse-proxy origin handling and teardown. Chat coverage includes approval requirements, both senders, invalid/oversized messages, server-owned sender identities and timestamps, replacement-viewer approval and rejection after teardown.

Chat browser validation used two local tabs with a generated sample stream: messages arrived in both directions, HTML-like content remained plain text, fullscreen chat collapsed to the right and showed an unread badge, expanding it revealed the messages, and exiting fullscreen placed chat below the video. Leaving as the viewer cleared both transcripts and disabled sending. Chat between different computers has not been verified.

Browser validation: the presenter generated a canvas sample, opened a separate viewer tab and explicitly approved it. The viewer reached **Connected · Viewing screen**, with decoded video reported at 320 × 180, 30 fps, approximately 0.2 Mbps and 1 ms round-trip time during the observation. This is one local sample, not a performance guarantee. Ending the presenter session returned the viewer to standby and recorded its session duration. The rendered mobile-width page was visually inspected. A real desktop capture, another physical computer and Internet traversal were not tested.

## Deploy on Render

Connect this repository to Render and create a **Blueprint** using `render.yaml`, or create a **Web Service** with Node, build command `npm install`, start command `npm start`, and the Free instance type. The repository root is the app root; leave Render's root directory blank. The server reads Render's `PORT` and listens on all interfaces in that environment.

Use the HTTPS URL Render supplies. Free hosting may sleep or restart; rooms are in memory and will be lost.

## STUN/TURN and connection recovery

Browsers fetch their ICE servers from `GET /api/rooms/:id/ice` (presenter at any time, viewer only after approval), so no relay credentials are ever built into `app.js`. Configure with environment variables:

| Variable | Meaning |
|---|---|
| `STUN_URLS` | Comma-separated STUN URLs. Default `stun:stun.l.google.com:19302`, which reveals participants' public IP addresses to Google. Set `none` to disable; same-network sessions still work. |
| `TURN_URLS` | Comma-separated TURN URLs, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`. Needed when either side is behind a strict NAT or firewall. |
| `TURN_SECRET` | Shared secret for coturn's `use-auth-secret` (TURN REST API). Each request receives fresh credentials valid for `TURN_TTL_SECONDS` (default 3600). Preferred. |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | Static TURN credentials, used only when `TURN_SECRET` is unset. Every approved viewer can read them. |

The server logs a warning at startup if `TURN_URLS` is set without credentials. STUN alone does not guarantee connectivity between arbitrary networks; test with TURN before relying on Internet sharing. A ready-to-run self-hosted relay (coturn + Docker Compose, shared-secret mode, private-network relaying blocked) is in [`deploy/turn/`](deploy/turn/README.md).

The presenter always makes the WebRTC offer, so renegotiation can't collide. If an established connection drops, both sides show **Reconnecting**: after 3 seconds the presenter restarts ICE (at most twice per interruption), and the session ends if it has not recovered within 20 seconds. A connection that never succeeds ends immediately with guidance to configure TURN.

Alongside the media, the presenter opens an ordered `deskstream-control` data channel for peer-to-peer control messages (`web/src/features/session/lib/controlProtocol.ts`). Each message type has an allowed sender that the receiver enforces, frames over 16 KB are dropped, and both sides exchange a protocol version on open to flag mismatched app versions.
