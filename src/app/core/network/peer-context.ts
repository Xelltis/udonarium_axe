import { Logger } from '@axe/core/logging/logger';
import { MutablePeerSessionState, PeerSessionGrade, PeerSessionState } from '@axe/core/network/peer-session-state';
import { sha256 } from '@axe/core/util/crypto-util';
import base from 'base-x';

const Base62 = base('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

// peerId format: digestUserId(6) + roomId(3) + digestRoomName(8) + '-' + digestPassword(0 or 7)
// the length is fixed: twenty-five characters with a password, eighteen without
// the room name travels in the member metadata
const roomIdPattern = /^(\w{6})(\w{3})(\w{8})-(\w*)/i;

export interface IPeerContext {
  readonly peerId: string;
  readonly userId: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly password: string;
  readonly digestUserId: string;
  readonly digestRoomName: string;
  readonly digestPassword: string;
  readonly isOpen: boolean;
  readonly isRoom: boolean;
  readonly hasPassword: boolean;
  readonly session: PeerSessionState;
}

export class PeerContext implements IPeerContext {
  peerId: string = '';
  userId: string = '';
  roomId: string = '';
  roomName: string = '';
  password: string = '';
  digestUserId: string = '';
  digestRoomName: string = '';
  digestPassword: string = '';
  isOpen: boolean = false;
  session: MutablePeerSessionState = {
    grade: PeerSessionGrade.UNSPECIFIED,
    ping: 0,
    health: 0,
    speed: 0,
    description: '',
  };

  /** Whether the peer id carries a room, as opposed to a peer on standby. */
  get isRoom(): boolean {
    return this.roomId.length > 0;
  }
  /** Whether the room has a password, known from the password or from the digest in the peer id. */
  get hasPassword(): boolean {
    return this.password.length + this.digestPassword.length > 0;
  }

  private constructor(peerId: string) {
    try {
      this.peerId = peerId;
      const regArray = roomIdPattern.exec(peerId);
      if (regArray != null) {
        this.digestUserId = regArray[1];
        this.roomId = regArray[2];
        this.digestRoomName = regArray[3];
        this.digestPassword = regArray[4];
        return;
      }
    } catch (e) {
      Logger.warn('[PeerContext] ピアIDパースエラー', e);
    }
    this.digestUserId = peerId;
  }

  /**
   * Whether the password matches the digests in this peer's id.
   *
   * The room name is part of the digest and is not in the id, so it must be set first.
   */
  async verifyPassword(password: string): Promise<boolean> {
    const digest = await calcDigestPassword(this.digestUserId, this.roomId, this.roomName, password);
    return digest === this.digestPassword && (await this.verifyRoomId(password));
  }

  private async verifyRoomId(password: string): Promise<boolean> {
    const checksumedRoomId = await calcChecksumedRoomId(this.roomId, this.roomName, password);
    return checksumedRoomId === this.roomId;
  }

  /**
   * Whether another peer id belongs to the same room, checking the password digest when there is one.
   *
   * For a room with a password this context must hold the password itself, or the check fails.
   */
  async verifyPeer(peerId: string): Promise<boolean> {
    const peer = PeerContext.parse(peerId);
    if (
      this.roomId !== peer.roomId ||
      this.digestRoomName !== peer.digestRoomName ||
      this.hasPassword !== peer.hasPassword
    ) {
      return false;
    }

    if (!this.hasPassword) {
      return true;
    }

    if (this.password.length === 0) {
      Logger.error('[PeerContext] パスワードが未設定です');
      return false;
    }

    peer.roomName = this.roomName;
    return peer.verifyPassword(this.password);
  }

  /**
   * Reads a peer id into a context; an id not in room form is taken as a standby peer.
   *
   * The id does not carry the user id, room name or password, so those stay empty.
   */
  static parse(peerId: string): PeerContext {
    return new PeerContext(peerId);
  }

  /** A standby context for the user, whose peer id is the digest of the user id. */
  static async create(userId: string = ''): Promise<PeerContext> {
    const digestUserId = await calcDigest(userId);
    const peer = new PeerContext(digestUserId);
    peer.userId = userId;
    return peer;
  }

  /**
   * A context for joining a room, its peer id built from digests of the user, room name and password.
   *
   * The room id carries a checksum of the password. The plain room name and password stay on the
   * context for verifying other peers; the id alone does not give them away.
   */
  static async createRoom(
    userId: string = '',
    roomId: string = '',
    roomName: string = '',
    password: string = ''
  ): Promise<PeerContext> {
    const digestUserId = await calcDigest(userId, 6);
    const checksumedRoomId = await calcChecksumedRoomId(roomId, roomName, password);
    const digestRoomName = await calcDigestRoomName(roomName);
    const digestPassword = await calcDigestPassword(digestUserId, checksumedRoomId, roomName, password);
    const peerId = `${digestUserId}${checksumedRoomId}${digestRoomName}-${digestPassword}`;
    const peer = new PeerContext(peerId);
    peer.userId = userId;
    peer.roomName = roomName;
    peer.password = password;
    return peer;
  }

  /** A random base62 string in the format, each * replaced by one character; used for room ids. */
  static generateId(format: string = '********'): string {
    const h = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return format.replace(/\*/g, () => h[Math.floor(Math.random() * h.length)]);
  }

  /** A new random user id (a UUID) for a device that does not have one yet. */
  static generateUserId(): string {
    return crypto.randomUUID();
  }
}

async function calcDigestRoomName(roomName: string): Promise<string> {
  return calcDigest(roomName, 8);
}

async function calcDigestPassword(
  digestUserId: string,
  roomId: string,
  roomName: string,
  password: string
): Promise<string> {
  return password.length > 0 ? calcDigest(digestUserId + roomId + roomName + password, 7) : '';
}

async function calcChecksumedRoomId(roomId: string, roomName: string, password: string): Promise<string> {
  if (password.length === 0) return roomId;
  const salt = roomId.slice(0, 2);
  return salt + (await calcDigest(salt + roomName + password, 1));
}

async function calcDigest(str: string, truncateLength: number = -1): Promise<string> {
  const array = await sha256(str);
  const base62 = Base62.encode(array);
  return base62.slice(0, truncateLength < 0 ? base62.length : truncateLength);
}
