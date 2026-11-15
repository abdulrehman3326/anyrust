# TURN relay for Deskstream (coturn)

Deskstream sends screens peer to peer. When either side is behind a strict NAT or firewall
(many offices, mobile networks, some home routers), the two browsers can't reach each other
directly and the session fails with "Couldn't establish a media connection". A TURN server
relays the media for those sessions. Media stays encrypted end to end (DTLS-SRTP); the relay
only forwards packets it can't read.

This folder runs [coturn](https://github.com/coturn/coturn) with Docker. Deskstream's server
already issues short-lived TURN credentials (`iceConfig.ts`), so the relay never needs a
static password.

## What you need

- A small Linux VPS with a public IPv4 address. 1 vCPU / 1 GB is enough for a few concurrent
  relayed sessions; relayed bandwidth is the real cost (roughly 1–4 Mbps per relayed viewer).
- A DNS name for it, e.g. `turn.example.com` → the VPS IP.
- Docker with the Compose plugin.

## Steps

1. **Firewall.** Allow inbound:
   - `3478/udp` and `3478/tcp` (STUN/TURN)
   - `5349/tcp` (TURN over TLS)
   - `49160-49200/udp` (relay ports; must match `min-port`/`max-port` in `turnserver.conf`)

2. **Certificate** for `turn.example.com` (needed for `turns:` on port 5349, which gets
   through networks that only allow TLS), e.g. with certbot:

   ```sh
   sudo certbot certonly --standalone -d turn.example.com
   ```

   coturn runs as an unprivileged user, so make the files readable to it, for example by
   copying them to a dedicated folder after each renewal (certbot `--deploy-hook`).

3. **Configure.** In this folder on the VPS:

   ```sh
   cp .env.example .env
   openssl rand -base64 48   # paste as TURN_SECRET
   nano .env                 # TURN_SECRET, TURN_REALM, EXTERNAL_IP, TURN_CERT_DIR
   docker compose up -d
   docker compose logs -f    # look for "Listener opened on" lines
   ```

4. **Point Deskstream at it.** On the Deskstream server (Render dashboard → Environment):

   | Variable | Value |
   |---|---|
   | `TURN_URLS` | `turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp` |
   | `TURN_SECRET` | the same secret as in `.env` |

   Redeploy. Browsers now receive the relay with credentials valid for one hour
   (`TURN_TTL_SECONDS`), and only viewers the presenter has approved receive them.

## Verify

1. Open a session in Deskstream, then in the presenter tab run in the browser console:
   `await (await fetch(location.origin + '/api/rooms/<id>/ice?token=<hostToken>')).json()`,
   or simply check the network tab for the `/ice` response: it should list your `turn:` URLs
   with a `username` and `credential`.
2. Paste those into WebRTC's
   [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) page
   and click *Gather candidates*. A `relay` candidate means the relay works.
3. End-to-end: join from a phone on mobile data while the presenter is on office Wi-Fi.

## Security notes

- The relay refuses to forward to private, loopback and link-local addresses
  (`denied-peer-ip` in `turnserver.conf`), so it can't be used to reach your internal network.
- Credentials expire; rotate `TURN_SECRET` by changing it in both places at once.
- `user-quota` and `total-quota` cap sessions per credential and in total.
- Keep `.env` out of version control (it is gitignored).
