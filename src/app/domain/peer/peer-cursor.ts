import { domainPeerDisconnect$ } from '@axe/core/event/domain-events';
import { getMyPeerId, getPeerIds } from '@axe/core/network/peer-context-source';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_CHAT_BUBBLE_CODES, DEFAULT_CHAT_COLOR_CODES } from '@axe/domain/chat/constants';
import { DEFAULT_PEER_ROLE, PeerRole } from '@axe/domain/peer/peer-role';
import { Vote } from '@axe/domain/vote/vote';

const PEER_DISCONNECT_TIMEOUT_MS = 30_000;

type UserId = string;
type PeerId = string;
type ObjectIdentifier = string;

@SyncObject('PeerCursor')
export class PeerCursor extends GameObject {
  @SyncVar() userId: UserId = '';
  @SyncVar() peerId: PeerId = '';
  @SyncVar() name = '';
  @SyncVar() imageIdentifier = '';
  @SyncVar() role: PeerRole = DEFAULT_PEER_ROLE;

  @SyncVar() lastControlImageIdentifier = '';
  @SyncVar() lastControlCharacterName = '';
  @SyncVar() lastControlImageIndex = 0;
  @SyncVar() lastControlSendFrom = '';

  // The answer given to a vote or a roll call, and which vote it was.
  // The move this peer is working out under strict play, so the table watches it being made
  // rather than only seeing where the piece ended up. Cleared the moment the piece is set down.
  /** The piece being walked, or nothing where this peer is not walking one. */
  @SyncVar() movingCharacterIdentifier = '';
  /** The table it is being walked on, since a cell means nothing without the grid it is in. */
  @SyncVar() movingTableIdentifier = '';
  /** The way it is being walked, as cell numbers separated by commas. */
  @SyncVar() movingWay = '';
  /** Whether that move is being taken over what stands in the way. Written as a word, not a flag. */
  @SyncVar() movingJumping = '';

  @SyncVar() voteAnswer = -1; // 投票選択肢のindex値、-2:棄権
  @SyncVar() voteId = -1; // 回答した投票のID

  private _reConnectPass = '';

  private _timestampSend = -1;
  private _timestampReceive = -1;

  private _timeDiffUp = 0;
  private _timeDiffDown = 0;
  private _timeLatency = 99999;

  private _firstTimeSignNo = -1;
  private _lastTimeSignNo = -1;
  private _totalTimeSignNum = 0;

  private _timeout = 40; // 単位秒
  private _isDisConnect = true;

  private _debugTimeShift = 0;
  private _debugReceiveDelay = 0;

  /**
   * Whether this peer has gone silent: no heartbeat has arrived within the timeout.
   *
   * Local to each screen and not synced; true until the first heartbeat is heard.
   */
  get isDisConnect(): boolean {
    return this._isDisConnect;
  }
  set isDisConnect(flag: boolean) {
    this._isDisConnect = flag;
  }

  /** The send time, by the sender's clock, stamped on the last heartbeat received from this peer. */
  get timestampSend(): number {
    return this._timestampSend;
  }
  set timestampSend(time: number) {
    this._timestampSend = time;
  }

  /**
   * The local time the last heartbeat from this peer arrived, which the disconnect check measures from.
   *
   * Writing it adds the local debug receive delay.
   */
  get timestampReceive(): number {
    return this._timestampReceive;
  }
  set timestampReceive(time: number) {
    this._timestampReceive = time + this._debugReceiveDelay;
  }

  /** How far behind a heartbeat from us arrived at this peer, as that peer measured and reported it, in ms. */
  get timeDiffUp(): number {
    return this._timeDiffUp;
  }
  set timeDiffUp(time: number) {
    this._timeDiffUp = time;
  }

  /** How far this peer's last heartbeat arrived behind its send time, measured here, in ms. */
  get timeDiffDown(): number {
    return this._timeDiffDown;
  }
  set timeDiffDown(time: number) {
    this._timeDiffDown = time;
  }

  /**
   * The round-trip delay to this peer, the sum of the two one-way differences, in ms.
   *
   * Clock differences between the two machines cancel out in the sum. It stays at a very large placeholder
   * until the peer has reported a measurement back.
   */
  get timeLatency(): number {
    return this._timeLatency;
  }
  set timeLatency(time: number) {
    this._timeLatency = time;
  }

  /** Milliseconds added to the timestamps this user sends in heartbeats, to try out clock skew when debugging. */
  get debugTimeShift(): number {
    return this._debugTimeShift;
  }
  set debugTimeShift(time: number) {
    this._debugTimeShift = time;
  }

  /** Milliseconds added to heartbeat receive times, to try out a slow connection when debugging. */
  get debugReceiveDelay(): number {
    return this._debugReceiveDelay;
  }
  set debugReceiveDelay(time: number) {
    this._debugReceiveDelay = time;
  }

  /** Seconds without a heartbeat before a peer is announced as disconnected; never less than one. */
  get timeout(): number {
    return this._timeout > 0 ? this._timeout : 1;
  }
  set timeout(time: number) {
    this._timeout = time;
  }

  /** The sequence number of the first heartbeat received from this peer; -1 until one arrives. */
  get firstTimeSignNo(): number {
    return this._firstTimeSignNo;
  }
  set firstTimeSignNo(num: number) {
    this._firstTimeSignNo = num;
  }

  /** The sequence number of the latest heartbeat received from this peer. */
  get lastTimeSignNo(): number {
    return this._lastTimeSignNo;
  }
  set lastTimeSignNo(num: number) {
    this._lastTimeSignNo = num;
  }

  /**
   * How many heartbeats have been received from this peer.
   *
   * Compared with the span of sequence numbers, it shows how many were lost on the way.
   */
  get totalTimeSignNum(): number {
    return this._totalTimeSignNum;
  }
  set totalTimeSignNum(num: number) {
    this._totalTimeSignNum = num;
  }

  /** The room password this user joined with, kept locally and never synced so a reconnect can rejoin. */
  get reConnectPass(): string {
    return this._reConnectPass;
  }
  set reConnectPass(pass: string) {
    this._reConnectPass = pass;
  }

  /** The room's shared vote, which this peer's answer belongs to. */
  get vote(): Vote {
    return ObjectStore.instance.get<Vote>('Vote')!;
  }

  static myCursor: PeerCursor = null!;
  private static userIdMap: Map<UserId, ObjectIdentifier> = new Map();
  private static peerIdMap: Map<PeerId, ObjectIdentifier> = new Map();
  chatColorCode: string[] = [...DEFAULT_CHAT_COLOR_CODES];
  /** The bubble each colour is shown on, per theme. An empty entry is worked out instead. */
  chatBubbleLight: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  chatBubbleDark: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  private cleanups: (() => void)[] = [];

  /** Whether this cursor stands for the local user. */
  get isMine(): boolean {
    return PeerCursor.myCursor && PeerCursor.myCursor === this;
  }
  /** Whether this peer is the game master. */
  get isGameMaster(): boolean {
    return this.role === PeerRole.GameMaster;
  }
  /** Whether this peer joined as a guest who watches without changing anything. */
  get isGuest(): boolean {
    return this.role === PeerRole.Guest;
  }
  /** Whether this peer is a player. */
  get isPlayer(): boolean {
    return this.role === PeerRole.Player;
  }

  /** The local user's role; a player until their own cursor exists. */
  static get myRole(): PeerRole {
    return PeerCursor.myCursor?.role ?? DEFAULT_PEER_ROLE;
  }
  /** Whether the local user is the game master; false until their own cursor exists. */
  static get isMyselfGameMaster(): boolean {
    return PeerCursor.myCursor?.isGameMaster ?? false;
  }
  /** Whether the local user is a guest; false until their own cursor exists. */
  static get isMyselfGuest(): boolean {
    return PeerCursor.myCursor?.isGuest ?? false;
  }
  /** The peer's own avatar image, or null when none is set or it has not arrived. */
  get image(): ImageFile | null {
    return ImageStorage.instance.get(this.imageIdentifier);
  }
  /** The image of the character this peer last acted as, or null when none is known. */
  get lastControlImage(): ImageFile | null {
    return ImageStorage.instance.get(this.lastControlImageIdentifier);
  }

  // GameObject Lifecycle
  /**
   * For another peer's cursor, starts watching for that peer to drop out.
   *
   * When they disconnect and have not come back within 30 seconds, the cursor is removed from this peer's
   * object store.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    if (!this.isMine) {
      this.cleanups.push(
        domainPeerDisconnect$.subscribe((data) => {
          if (data.peerId !== this.peerId) return;
          setTimeout(() => {
            if (getPeerIds().includes(this.peerId)) return;
            PeerCursor.userIdMap.delete(this.userId);
            PeerCursor.peerIdMap.delete(this.peerId);
            ObjectStore.instance.remove(this);
          }, PEER_DISCONNECT_TIMEOUT_MS);
        })
      );
    }
  }

  // GameObject Lifecycle
  /** Stops watching for disconnects and forgets this cursor in the user and peer id lookups. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    PeerCursor.userIdMap.delete(this.userId);
    PeerCursor.peerIdMap.delete(this.peerId);
  }

  /**
   * The cursor of the user with this user id, which stays the same across reconnects.
   *
   * Null for an empty id or a user not in the room.
   */
  static findByUserId(userId: UserId): PeerCursor | null {
    return this.find(PeerCursor.userIdMap, userId, true);
  }

  /** The cursor for a connection's peer id, which changes when a user reconnects; null for an empty or unknown id. */
  static findByPeerId(peerId: PeerId): PeerCursor | null {
    return this.find(PeerCursor.peerIdMap, peerId, false);
  }

  private static find(map: Map<string, string>, key: string, isUserId: boolean): PeerCursor | null {
    if (key.length < 1) return null;

    const identifier = map.get(key);
    if (identifier != null && ObjectStore.instance.get(identifier))
      return ObjectStore.instance.get<PeerCursor>(identifier)!;
    const cursors = ObjectStore.instance.getObjects<PeerCursor>(PeerCursor);
    for (const cursor of cursors) {
      const id = isUserId ? cursor.userId : cursor.peerId;
      if (id === key) {
        map.set(id, cursor.identifier);
        return cursor;
      }
    }
    return null;
  }

  /**
   * The cursor that stands for whoever is reading, built afresh.
   *
   * One already in place is thrown away rather than handed back. It carries a name, a role
   * and a picture that were settled by whatever put it there, and a caller asking for its
   * own cursor is asking for one whose state it can count on.
   */
  static createMyCursor(): PeerCursor {
    const previous = PeerCursor.myCursor;
    if (previous) ObjectStore.instance.remove(previous);
    PeerCursor.myCursor = new PeerCursor();
    PeerCursor.myCursor.peerId = getMyPeerId();
    PeerCursor.myCursor.isDisConnect = false;
    PeerCursor.myCursor.initialize();
    return PeerCursor.myCursor;
  }

  /**
   * Takes in synced state, keeping the user and peer id lookups in step with it.
   *
   * When the peer has answered a different vote, the room's vote is checked to see whether it has finished.
   */
  override apply(context: ObjectContext) {
    const syncData = context.syncData as Record<string, unknown>;
    const userId = syncData['userId'] as string;
    const peerId = syncData['peerId'] as string;
    if (userId !== this.userId) {
      PeerCursor.userIdMap.set(userId, this.identifier);
      PeerCursor.userIdMap.delete(this.userId);
    }
    if (peerId !== this.peerId) {
      PeerCursor.peerIdMap.set(peerId, this.identifier);
      PeerCursor.peerIdMap.delete(this.peerId);
    }

    const voteId = this.voteId;
    super.apply(context);

    if (voteId != this.voteId) {
      this.vote.chkFinishVote();
    }
  }
}
