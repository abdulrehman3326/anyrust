/**
 * Every HTTP API endpoint of the Deskstream server, in one place.
 * server.ts supplies the handler named by each entry; add a new endpoint here first.
 *
 * `auth: 'token'` routes live under a room and require `?token=` (or a body `token`)
 * matching the room's host or viewer token. `:id` is the 9-digit room id (or, under
 * `/api/devices`, the 9-digit device id).
 */
export type Method = 'GET' | 'POST' | 'DELETE';

export type PublicHandler = 'health' | 'createRoom' | 'connectDevice';
export type RoomHandler = 'events' | 'ice' | 'signal' | 'deleteRoom';

interface RouteBase { method: Method; path: string; summary: string }
export type Route =
  | (RouteBase & { auth: false; handler: PublicHandler })
  | (RouteBase & { auth: 'token'; handler: RoomHandler });

export const ROUTES: readonly Route[] = [
  { method: 'GET', path: '/api/health', auth: false, handler: 'health', summary: 'Readiness check' },
  { method: 'POST', path: '/api/rooms', auth: false, handler: 'createRoom', summary: 'Create a room; returns id, hostToken, viewerToken (and deviceId when a deviceSecret is sent)' },
  { method: 'POST', path: '/api/devices/:id/connect', auth: false, handler: 'connectDevice', summary: 'Request access to a sharing device by its 9-digit device ID; rate-limited' },
  { method: 'GET', path: '/api/rooms/:id/events', auth: 'token', handler: 'events', summary: 'Server-sent event stream for the host or viewer' },
  { method: 'POST', path: '/api/rooms/:id/signal', auth: 'token', handler: 'signal', summary: 'Send approve/reject/leave/chat/offer/answer/ice messages' },
  { method: 'GET', path: '/api/rooms/:id/ice', auth: 'token', handler: 'ice', summary: 'STUN/TURN servers (viewer only after approval)' },
  { method: 'DELETE', path: '/api/rooms/:id', auth: 'token', handler: 'deleteRoom', summary: 'End the room (host only)' },
];

const compiled = ROUTES.map((route) => ({
  route,
  pattern: new RegExp(`^${route.path.replace(':id', '(\\d{9})')}$`),
}));

export interface RouteMatch {
  route: Route;
  /** Room id for `:id` routes, otherwise an empty string. */
  id: string;
  /** False when the path exists but not for this HTTP method (answer 405). */
  methodAllowed: boolean;
}

/** Finds the route for a request, or null when no route has this path. */
export function matchRoute(method: string, pathname: string): RouteMatch | null {
  let pathOnly: RouteMatch | null = null;
  for (const { route, pattern } of compiled) {
    const found = pattern.exec(pathname);
    if (!found) continue;
    const match = { route, id: found[1] ?? '', methodAllowed: route.method === method };
    if (match.methodAllowed) return match;
    pathOnly ??= match;
  }
  return pathOnly;
}
