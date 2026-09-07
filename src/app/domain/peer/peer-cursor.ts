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

  get isDisConnect(): boolean {
    return this._isDisConnect;
  }
  set isDisConnect(flag: boolean) {
    this._isDisConnect = flag;
  }

  get timestampSend(): number {
    return this._timestampSend;
  }
  set timestampSend(time: number) {
    this._timestampSend = time;
  }

  get timestampReceive(): number {
    return this._timestampReceive;
  }
  set timestampReceive(time: number) {
    this._timestampReceive = time + this._debugReceiveDelay;
  }

  get timeDiffUp(): number {
    return this._timeDiffUp;
  }
  set timeDiffUp(time: number) {
    this._timeDiffUp = time;
  }

  get timeDiffDown(): number {
    return this._timeDiffDown;
  }
  set timeDiffDown(time: number) {
    this._timeDiffDown = time;
  }

  get timeLatency(): number {
    return this._timeLatency;
  }
  set timeLatency(time: number) {
    this._timeLatency = time;
  }

  get debugTimeShift(): number {
    return this._debugTimeShift;
  }
  set debugTimeShift(time: number) {
    this._debugTimeShift = time;
  }

  get debugReceiveDelay(): number {
    return this._debugReceiveDelay;
  }
  set debugReceiveDelay(time: number) {
    this._debugReceiveDelay = time;
  }

  get timeout(): number {
    return this._timeout > 0 ? this._timeout : 1;
  }
  set timeout(time: number) {
    this._timeout = time;
  }

  get firstTimeSignNo(): number {
    return this._firstTimeSignNo;
  }
  set firstTimeSignNo(num: number) {
    this._firstTimeSignNo = num;
  }

  get lastTimeSignNo(): number {
    return this._lastTimeSignNo;
  }
  set lastTimeSignNo(num: number) {
    this._lastTimeSignNo = num;
  }

  get totalTimeSignNum(): number {
    return this._totalTimeSignNum;
  }
  set totalTimeSignNum(num: number) {
    this._totalTimeSignNum = num;
  }

  get reConnectPass(): string {
    return this._reConnectPass;
  }
  set reConnectPass(pass: string) {
    this._reConnectPass = pass;
  }

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

  private _diceImageType = '';
  private _diceImageIndex = -1;

  get diceImageType(): string {
    return this._diceImageType;
  }
  get diceImageIndex(): number {
    return this._diceImageIndex;
  }

  set diceImageType(type: string) {
    this._diceImageType = type;
  }
  set diceImageIndex(index: number) {
    this._diceImageIndex = index;
  }

  get diceImageIdentifier(): string {
    if (this.diceImageType != '') {
      return `${this.diceImageType}_dice[${this.diceImageIndex.toString().padStart(2, '0')}]`;
    } else {
      return '';
    }
  }

  get isMine(): boolean {
    return PeerCursor.myCursor && PeerCursor.myCursor === this;
  }
  get isGameMaster(): boolean {
    return this.role === PeerRole.GameMaster;
  }
  get isGuest(): boolean {
    return this.role === PeerRole.Guest;
  }
  get isPlayer(): boolean {
    return this.role === PeerRole.Player;
  }

  static get myRole(): PeerRole {
    return PeerCursor.myCursor?.role ?? DEFAULT_PEER_ROLE;
  }
  static get isMyselfGameMaster(): boolean {
    return PeerCursor.myCursor?.isGameMaster ?? false;
  }
  static get isMyselfGuest(): boolean {
    return PeerCursor.myCursor?.isGuest ?? false;
  }
  get image(): ImageFile | null {
    return ImageStorage.instance.get(this.imageIdentifier);
  }
  get lastControlImage(): ImageFile | null {
    return ImageStorage.instance.get(this.lastControlImageIdentifier);
  }

  // GameObject Lifecycle
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
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    PeerCursor.userIdMap.delete(this.userId);
    PeerCursor.peerIdMap.delete(this.peerId);
  }

  static findByUserId(userId: UserId): PeerCursor | null {
    return this.find(PeerCursor.userIdMap, userId, true);
  }

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

  isPeerAUdon(): boolean {
    return /u.*d.*o.*n/gi.exec(this.peerId) != null;
  }
}
