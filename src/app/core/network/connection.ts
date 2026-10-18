import { IPeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import {
  AssetUploadPolicy,
  CreateRoomResponse,
  InviteMessage,
  ServerRole,
} from '@axe/core/network/server/server-protocol';

/**
 * Where a dropped link stands: being tried again, back, given up on, or back on a new link the room
 * server asked for, which nobody is told of but everything that follows a return still runs for.
 */
export type PeerReconnectState = 'retrying' | 'recovered' | 'failed' | 'resumed';

/**
 * Where a seat stands on being let out of its room for the page left alone: about to be, back in use
 * before that, or let out, to come back only when its reader asks.
 */
export type IdleState = 'soon' | 'back' | 'left';

export class ConnectionCallback {
  onOpen!: (peer: IPeerContext) => void;
  onClose!: (peer: IPeerContext) => void;
  onConnect!: (peer: IPeerContext) => void;
  onDisconnect!: (peer: IPeerContext) => void;
  onReconnect!: (peer: IPeerContext, state: PeerReconnectState) => void;
  onData!: (peer: IPeerContext | null, data: unknown[]) => void;
  onError!: (peer: IPeerContext, errorType: string, errorMessage: string, errorObject: unknown) => void;
  /** The room server gave this seat another role while it is in the room. */
  onRoleChange?: (role: ServerRole) => void;
  /** The seat is about to be let out, or was, for the page left alone, or the page is in use again. */
  onIdle?: (state: IdleState) => void;
}

/** How a seat reaches its room's pictures and sounds on the room server: the room and its token. */
export interface AssetAccess {
  roomKey: string;
  token: string;
  /** How the room server takes bytes, when its requests carry only so much; none for a single PUT. */
  upload?: AssetUploadPolicy;
  /** How far the room server's clock is ahead of this page's, for the times it hands out. */
  clockOffset?: number;
}

/** Who a hello to a room server says is connecting, when somebody is logged in. */
export interface ServerCredentials {
  userId: string;
  accessToken: string;
}

/**
 * The login a room server connection draws on, which lives above core: credentials for each hello,
 * a token for requests, and a new token after the server turned one down.
 */
export interface ServerCredentialSource {
  credentials(): Promise<ServerCredentials | null>;
  accessToken(): Promise<string | null>;
  replaceRejected(rejected: string): Promise<string | null>;
  /** Whether a user id is that of an account logged in while the page has been open, logged out or not. */
  isAccountUserId(userId: string): boolean;
}

export interface Connection {
  readonly peerId: string;
  readonly peerIds: string[];
  readonly peer: IPeerContext;
  readonly peers: IPeerContext[];
  readonly callback: ConnectionCallback;
  readonly bandwidthUsage: number;
  /**
   * The peer id of the room server, which keeps the table and is the one peer to trade catalogs
   * with. Only a connection through a room server has one; it is never among `peers`.
   */
  readonly authorityPeerId?: string;
  /** Whether the link to the room server is up just now; false while it is down and being tried again. */
  readonly authorityOpen?: boolean;
  /** How far the room server's clock runs ahead of this one, once it has let the seat in. */
  readonly serverClockOffset?: number;
  /** The key a room server finds the open room by; SkyWay rooms have none. */
  readonly roomKey?: string;
  /** The role a room server gave this seat on letting it in; SkyWay leaves roles to the peers. */
  readonly serverRole?: ServerRole;
  /** Whether a room server connection is holding sends back for seconds, to keep inside the server's limits. */
  readonly sendsPending?: boolean;

  configure(config: Record<string, unknown>): void;
  openStandby(userId?: string): void;
  /** Opens a session in a room. A room server finds the room by its key, which SkyWay does not use. */
  open(userId: string, roomId: string, roomName: string, password: string, roomKey?: string): void;
  close(): void;
  leaveImmediately?(): void;
  rejoinAfterLeave?(): Promise<void>;
  connect(peer: IPeerContext): boolean | Promise<boolean>;
  disconnect(peer: IPeerContext): boolean;
  disconnectAll(): void;
  send(data: unknown, sendTo?: string): void;
  listAllPeers(): Promise<string[]>;
  listAllRooms(): Promise<IRoomInfo[]>;
  /** One room found by its key on a room server, null when there is none; SkyWay rooms have no key. */
  findRoom?(roomKey: string): Promise<IRoomInfo | null>;
  /** Creates a room on a room server; SkyWay rooms come into being as somebody opens them. */
  createRoom?(name: string, password: string): Promise<CreateRoomResponse>;
  /** The room's pictures and sounds as this seat may reach them, while it is in a room server's room. */
  readonly assetAccess?: AssetAccess | null;
  /** Asks the room server for a fresh asset token, for one it turned down, and gives the access then. */
  refreshAssetAccess?(): Promise<AssetAccess | null>;
  deleteRoom?(roomKey: string): Promise<void>;
  /** Takes a seat let out of its room for the page left alone back in, when its reader asks. */
  comeBackFromIdle?(): void;
  /** Gives a room server connection the login to say hello with. */
  useCredentials?(source: ServerCredentialSource | null): void;
  /** An invitation for the next room opened, from a link, sent with its hello. */
  useInvite?(invite: string): void;
  /** Asks the room server for an invitation in a role. */
  requestInvite?(role: ServerRole): Promise<InviteMessage>;
}
