import { IPeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { CreateRoomResponse } from '@axe/core/network/server/server-protocol';

export type PeerReconnectState = 'retrying' | 'recovered' | 'failed';

export class ConnectionCallback {
  onOpen!: (peer: IPeerContext) => void;
  onClose!: (peer: IPeerContext) => void;
  onConnect!: (peer: IPeerContext) => void;
  onDisconnect!: (peer: IPeerContext) => void;
  onReconnect!: (peer: IPeerContext, state: PeerReconnectState) => void;
  onData!: (peer: IPeerContext | null, data: unknown[]) => void;
  onError!: (peer: IPeerContext, errorType: string, errorMessage: string, errorObject: unknown) => void;
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
  /** The key a room server finds the open room by; SkyWay rooms have none. */
  readonly roomKey?: string;

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
  /** Creates a room on a room server; SkyWay rooms come into being as somebody opens them. */
  createRoom?(name: string, password: string): Promise<CreateRoomResponse>;
}
