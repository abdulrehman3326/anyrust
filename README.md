# Deskstream

A web reconstruction of the requested AnyDesk-style interface and view-only screen streaming flow. Run it locally with Node.js 22 or newer:

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

After approval, presenter and viewer can use **Session chat** below the video. Enter sends a message; Shift+Enter adds a new line. Fullscreen keeps the session controls visible and moves chat into a collapsible tray on the right, initially collapsed. The tray shows an unread count for incoming messages while closed. Exit fullscreen restores chat below the video.

Chat uses the authenticated HTTP/SSE session channel through the server. Messages are limited to 2,000 characters, displayed as plain text, and are not saved to disk or browser storage. Each tab retains only its latest 100 messages; leaving or ending a session clears the transcript for both participants. A replacement viewer must be approved again and receives no previous transcript.

## Implementation and scope

The UI includes session setup, invitation copying, approval, local preview, remote playback, quality presets, full screen, live WebRTC statistics and in-memory session history. There is no remote input/control or unattended access. Audio capture is outside this prototype's scope.

The Node server relays SDP and ICE messages through same-origin HTTP and Server-Sent Events. It binds to loopback locally, or to `0.0.0.0` when the hosting platform provides `PORT`. Set `HOST` explicitly to override this. Invitation keys are randomly generated capabilities; an invitation holder must still be accepted by the presenter. Screens are peer-to-peer media, not relayed through the HTTP server. Session state is held in memory; restarting the server invalidates invitations. Only one viewer is supported per room.

This is a local, two-tab prototype. For access from another computer, deploy the server behind HTTPS on a reachable host, then configure and test STUN/TURN as appropriate. No public STUN or TURN service is configured here. Internet traversal, production identity, durable storage and multi-viewer sharing are not implemented or verified. Browser display capture requires localhost or a secure HTTPS context, and user selection of a source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

## REA investigation

REA 6.8.0 inspected the installed `C:\Program Files (x86)\AnyDesk\AnyDesk.exe`, version 9.7.15. The original artifact was read only. Full evidence records are in [`investigations/anydesk/`](investigations/anydesk/).

- `installation.json`: `ev_157085b84017ad57a34ade5eb5bd73b91b579e88a07667cf58df328fa97987a0`. One executable was found; bounded header inspection identified a native PE image. No Electron/JavaScript runtime candidates were found within that scan.
- `resources.json`: `ev_f21f7068a345e8e79293531d391e5875d3d356879ebbd06e2a8cf82b907d2673`. PE32 x86, 11 resources and two icon groups. Opaque payload inventory does not establish screen layout or codec behavior.
- `exports.json`: `ev_f3bb08924011b362f092d713f2621ec614632b8fec3710c24895e2c506306ef2`. No export directory. This is not evidence that internal functionality is absent.
- Executable SHA-256 from the complete REA resource/export inspection: `89e0a41a37d360d81bb0bfd89537dbbb3bdf45917adfe88ae3cb19d4f6b3c81e`.

The native accessibility observation exposed a **New Session** tab. Window screenshot capture timed out twice. A native decompiler was unavailable, so no AnyDesk function bodies, compression code, network protocol or live streaming internals were recovered. The visual layout is an original AnyDesk-inspired approximation; it is not a pixel-verified copy. The streaming implementation is newly written browser WebRTC code. AnyDesk documents its own DeskRT codec at https://www.anydesk.com/en/features/screen-sharing.

## Validation

```powershell
npm test
```

The integration test exercises real HTTP/SSE behavior: invitation permissions, presenter approval, role restrictions, signaling delivery, duplicate-viewer rejection, reverse-proxy origin handling and teardown. Chat coverage includes approval requirements, both senders, invalid/oversized messages, server-owned sender identities and timestamps, replacement-viewer approval and rejection after teardown.

Chat browser validation used two local tabs with a generated sample stream: messages arrived in both directions, HTML-like content remained plain text, fullscreen chat collapsed to the right and showed an unread badge, expanding it revealed the messages, and exiting fullscreen placed chat below the video. Leaving as the viewer cleared both transcripts and disabled sending. Chat between different computers has not been verified.

Browser validation: the presenter generated a canvas sample, opened a separate viewer tab and explicitly approved it. The viewer reached **Connected · Viewing screen**, with decoded video reported at 320 × 180, 30 fps, approximately 0.2 Mbps and 1 ms round-trip time during the observation. This is one local sample, not a performance guarantee. Ending the presenter session returned the viewer to standby and recorded its session duration. The rendered mobile-width page was visually inspected. A real desktop capture, another physical computer and Internet traversal were not tested.

## Deploy on Render

Connect this repository to Render and create a **Blueprint** using `render.yaml`, or create a **Web Service** with Node, build command `npm install`, start command `npm start`, and the Free instance type. The repository root is the app root; leave Render's root directory blank. The server reads Render's `PORT` and listens on all interfaces in that environment.

Use the HTTPS URL Render supplies. Free hosting may sleep or restart; rooms are in memory and will be lost. Deployment alone does not add STUN/TURN or verify connectivity between different networks. Configure and test that separately before relying on Internet screen sharing.
