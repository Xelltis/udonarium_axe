import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { PeerContext } from '@axe/core/network/peer-context';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { RangeArea } from '@axe/domain/tabletop/range';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The user id to reconnect under: the one used before, else the current one, else a new one, so the
 * reader keeps their identity across a reconnect.
 */
export function resolveReconnectUserId(previousUserId: string, currentUserId: string): string {
  if (previousUserId?.length) return previousUserId;
  if (currentUserId?.length) return currentUserId;
  return PeerContext.generateUserId();
}

/** The peers a reconnect waits to hear from: everyone listed for the room except this peer. */
export function createExpectedPeerIdSet(peerContexts: PeerContext[], selfPeerId: string): Set<string> {
  const set = new Set<string>();
  for (const ctx of peerContexts) {
    if (ctx.peerId !== selfPeerId) set.add(ctx.peerId);
  }
  return set;
}

/**
 * Whether every expected peer has been heard from, which ends the reconnect; true at once when none
 * is expected.
 */
export function isReconnectCompleted(expectedPeerIds: Set<string>, observedPeerIds: Set<string>): boolean {
  if (expectedPeerIds.size < 1) return true;
  for (const peerId of expectedPeerIds) {
    if (!observedPeerIds.has(peerId)) return false;
  }
  return true;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 're-connect',
  templateUrl: './re-connect.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class ReConnectComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);

  rooms: { alias: string; roomName: string; peerContexts: PeerContext[] }[] = [];

  readonly forceCleanup = signal(false);

  networkService = Network;
  roomName = '';
  roomId = '';
  reconnectUserId = '';

  /** The reader's own cursor, whose kept room password is reused to reconnect. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  constructor() {
    queueMicrotask(() => this.changeTitle());
    this.reconnectUserId = this.networkService.peerContext.userId;
    if (this.networkService.peerContext.isRoom) {
      this.roomName = this.networkService.peerContext.roomName;
      this.roomId = this.networkService.peerContext.roomId;
    }
    this.reload();
  }

  private changeTitle() {
    this.modalService.title = this.panelService.title = this.t('feature.lobby.reConnect.title');
    this.modalService.titleTooltip = this.panelService.titleTooltip = '';
    const truncated = this.roomName.length > 16 ? this.roomName.slice(0, 16) + '…' : this.roomName;
    this.modalService.title = this.panelService.title = '＜' + truncated + '/' + this.roomId + '＞';
    this.modalService.titleTooltip = this.panelService.titleTooltip = this.roomName + '/' + this.roomId;
  }

  /**
   * Drops every connection and joins the room this peer was in again, under the same user id.
   *
   * With force cleanup ticked, the local characters, ranges, notes, dice, masks and terrain are
   * thrown away first. When the room is no longer listed, it only logs a warning.
   */
  reConnect() {
    this.reconnectUserId = resolveReconnectUserId(this.reconnectUserId, this.networkService.peerContext.userId);
    this.disConnect();
    if (this.forceCleanup()) {
      Logger.warn('[Network] reconnecting with force-cleanup enabled');
      this.deleteObject();
    }

    for (const room of this.rooms) {
      if (room.alias == this.roomId + this.roomName) {
        Logger.info(`[Network] reconnect started (room: ${this.roomName})`);
        this.connect(room.peerContexts);
        return;
      }
    }
    Logger.warn(`[Network] reconnect target not found (room: ${this.roomName}/${this.roomId})`);
  }

  /** Fetches the open rooms a reconnect looks its room up in; a failed fetch leaves the list empty. */
  async reload() {
    this.rooms = [];
    try {
      const roomInfos = await Network.listAllRooms();
      for (const room of roomInfos) {
        this.rooms.push({
          alias: room.id + room.name,
          roomName: room.name,
          peerContexts: room.peers as PeerContext[],
        });
      }
      this.rooms.sort((a, b) => {
        if (a.alias < b.alias) return -1;
        if (a.alias > b.alias) return 1;
        return 0;
      });
    } catch (e) {
      Logger.error('[ReConnect] failed to fetch room list', e);
    }
  }

  /**
   * Opens the network in the given room and connects to each peer in it, using the password kept
   * from joining.
   *
   * Once every listed peer has connected or dropped, or after five seconds, the dialog closes if
   * anyone is connected. With nobody connected, this peer goes back on standby and the dialog stays
   * open.
   */
  async connect(peerContexts: PeerContext[]) {
    const context = peerContexts[0];
    let password = '';

    if (context.hasPassword) {
      password = this.myPeer.reConnectPass;
      if (password == null) password = '';
    }

    if (!(await context.verifyPassword(password))) return;

    const userId = resolveReconnectUserId(this.reconnectUserId, this.networkService.peerContext.userId);
    this.reconnectUserId = userId;
    Network.open(userId, context.roomId, context.roomName, password);
    PeerCursor.myCursor.peerId = Network.peerId;

    const expectedPeerIds = createExpectedPeerIdSet(peerContexts, this.networkService.peerId);
    const observedPeerIds: Set<string> = new Set();
    const offOpen = this.objectChange.networkOpen$.subscribe(() => {
      offOpen();
      Logger.info('[Network] peer connection started');
      this.objectStore.clearDeleteHistory();
      for (const context of peerContexts) {
        Network.connect(context);
      }
      const timeoutTimer = setTimeout(() => {
        Logger.warn('[Network] reconnect wait timed out');
        this.resetNetwork();
        this.closeIfConnected();
      }, 5000);

      const subs: { offConnect?: () => void; offDisconnect?: () => void } = {};
      const tryComplete = () => {
        if (isReconnectCompleted(expectedPeerIds, observedPeerIds)) {
          clearTimeout(timeoutTimer);
          subs.offConnect?.();
          subs.offDisconnect?.();
          this.resetNetwork();
          this.closeIfConnected();
        }
      };
      const handler = (event: { peerId: string }) => {
        if (expectedPeerIds.has(event.peerId)) {
          observedPeerIds.add(event.peerId);
        }
        Logger.info(`[Network] connect result (${observedPeerIds.size}/${expectedPeerIds.size})`, event.peerId);
        tryComplete();
      };
      subs.offConnect = this.objectChange.peerConnect$.subscribe(handler, this.destroyRef);
      subs.offDisconnect = this.objectChange.peerDisconnect$.subscribe(handler, this.destroyRef);
      tryComplete();
    }, this.destroyRef);
  }

  private resetNetwork() {
    if (Network.peerContexts.length < 1) {
      const userId = resolveReconnectUserId(this.reconnectUserId, this.networkService.peerContext.userId);
      this.reconnectUserId = userId;
      Network.openStandby(userId);
      PeerCursor.myCursor.peerId = Network.peerId;
    }
  }

  private closeIfConnected() {
    if (0 < Network.peerContexts.length) this.modalService.resolve();
  }

  /** Closes the connection to every peer. */
  disConnect() {
    Logger.info(`[Network] disconnecting (peers: ${this.networkService.peerIds.length})`);
    for (const peerContext of [...this.networkService.peerContexts]) {
      this.networkService.disconnect(peerContext);
    }
  }

  /**
   * Destroys the local characters, ranges, notes, dice, masks and terrain so a forced reconnect
   * takes the room's copies from the other peers, and forgets what was deleted so those copies are
   * not refused.
   */
  deleteObject() {
    Logger.info('[Network] dropping objects that may diverge from the new peers');

    const gameCharacters = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const obj of gameCharacters) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    const rangeAreas = this.objectStore.getObjects<RangeArea>(RangeArea);
    for (const obj of rangeAreas) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    const textNote = this.objectStore.getObjects<TextNote>(TextNote);
    for (const obj of textNote) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    const diceSymbol = this.objectStore.getObjects<DiceSymbol>(DiceSymbol);
    for (const obj of diceSymbol) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    const gameTableMask = this.objectStore.getObjects<GameTableMask>(GameTableMask);
    for (const obj of gameTableMask) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    const terrain = this.objectStore.getObjects<Terrain>(Terrain);
    for (const obj of terrain) {
      obj.setLocation('graveyard');
      this.deleteGameObject(obj);
    }

    this.objectStore.clearDeleteHistory();
  }

  private deleteGameObject(gameObject: GameObject) {
    gameObject.destroy();
  }
}
