// The wire contract lives in /protocol so the server and the web client cannot drift apart.
export type {
  ChatMessage,
  DeviceConnectResponse,
  IceCandidate,
  IceConfigResponse,
  IceServer,
  OutgoingSignal,
  Role,
  RoomResponse,
  SessionDescription,
  SignalMessage,
  ViewerPermissions,
} from '../../../../protocol/signaling';

/** Credentials used for every call on a room. */
export interface RoomSession {
  id: string;
  token: string;
  viewerToken?: string;
}
