import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { type HeartBeatEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { callHeartBeat } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { getPeerContexts, getPeerIds } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The colour the notices about a peer's connection are written in. */
const NOTICE_COLOR = '#006633';
/** How long after a peer is heard again the notice of it is held back, in milliseconds. */
const RECONNECT_NOTICE_DELAY_MS = 1000;
/** How long a peer that was said goodbye to is not said goodbye to again, in milliseconds. */
const GOODBYE_HELD_MS = 60_000;

/**
 * Keeps the heartbeat between the seats of a room: beats for this seat, times the beats heard
 * from the others, counts a seat that went quiet as dropped, and tells this reader in the system
 * tab when a seat drops, comes back or leaves.
 *
 * One round runs per `heartbeatIntervalMs`. Through a room server nothing is sent or listened
 * for: the server's own ping keeps the connection, and a seat counts as dropped while the server
 * does not list it.
 */
@Injectable({ providedIn: 'root' })
export class PeerHeartbeatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly batchService = inject(BatchService);
  private readonly chatMessageService = inject(ChatMessageService);

  /** The cursors a round has seen, by identifier, so one that leaves the store can still be named. */
  private readonly watched = new Map<string, PeerCursor>();
  private readonly saidGoodbye = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectNotices = new Map<string, ReturnType<typeof setTimeout>>();
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private beatCounter = 0;
  private peerIndex = 0;

  /**
   * How often a heartbeat is sent and the others' silence checked, in milliseconds: 166 per
   * connected peer, never under 1000.
   */
  get heartbeatIntervalMs(): number {
    return Math.max(1000, getPeerIds().length * 166);
  }

  constructor() {
    this.objectChange.heartBeat$.subscribe((event) => this.hear(event), this.destroyRef);
    this.objectChange.objectRemoved$.subscribe((event) => {
      if (event.aliasName === PeerCursor.aliasName) this.left(event.identifier);
    }, this.destroyRef);
    this.scheduleRound();
    this.destroyRef.onDestroy(() => {
      if (this.roundTimer !== null) clearTimeout(this.roundTimer);
      this.roundTimer = null;
      for (const timer of this.reconnectNotices.values()) clearTimeout(timer);
      this.reconnectNotices.clear();
      for (const timer of this.saidGoodbye.values()) clearTimeout(timer);
      this.saidGoodbye.clear();
      for (const cursor of this.watched.values()) this.batchService.remove(cursor);
      this.watched.clear();
    });
  }

  private get relayedByServer(): boolean {
    return Network.authorityPeerId != null;
  }

  private scheduleRound(): void {
    this.roundTimer = setTimeout(() => {
      this.round();
      this.scheduleRound();
    }, this.heartbeatIntervalMs);
  }

  private round(): void {
    const cursors = this.objectStore.getObjects<PeerCursor>(PeerCursor);
    for (const cursor of cursors) this.watched.set(cursor.identifier, cursor);

    if (this.relayedByServer) {
      const listed = getPeerIds();
      for (const cursor of cursors) {
        if (!cursor.isMine) cursor.isDisConnect = !listed.includes(cursor.peerId);
      }
      return;
    }
    const mine = PeerCursor.myCursor;
    if (!mine) return;
    if (cursors.includes(mine)) this.beat();
    for (const cursor of cursors) {
      if (cursor.peerId !== mine.peerId) this.checkSilence(cursor);
    }
  }

  /** Sends this seat's heartbeat, answering one peer in turn with how late its last beat arrived here. */
  private beat(): void {
    const contexts = getPeerContexts();
    if (contexts.length < 1) return;
    if (contexts.length <= this.peerIndex) this.peerIndex = 0;
    const context = contexts[this.peerIndex];
    const answered = context?.isOpen ? context.peerId : '';
    const diffDown = PeerCursor.findByPeerId(answered)?.timeDiffDown ?? null;

    callHeartBeat([Date.now() + PeerCursor.myCursor.debugTimeShift, answered, diffDown, this.beatCounter]);
    this.peerIndex++;
    this.beatCounter++;
  }

  private hear(event: HeartBeatEvent): void {
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (cursor.peerId !== event.sendFrom) continue;
      this.batchService.add(() => this.time(cursor, event), cursor);
    }
  }

  private time(cursor: PeerCursor, event: HeartBeatEvent): void {
    cursor.timestampSend = event.timestamp;
    cursor.timestampReceive = Date.now();
    cursor.timeDiffDown = cursor.timestampReceive - cursor.timestampSend + PeerCursor.myCursor.debugReceiveDelay;
    cursor.lastTimeSignNo = event.secdCounter;
    if (cursor.firstTimeSignNo < 0) cursor.firstTimeSignNo = event.secdCounter;
    cursor.totalTimeSignNum++;

    if (event.id === PeerCursor.myCursor.peerId && event.diffDown != null) {
      cursor.timeDiffUp = event.diffDown;
      cursor.timeLatency = event.diffDown + cursor.timeDiffDown;
    }
  }

  private checkSilence(cursor: PeerCursor): void {
    const timeoutSeconds = PeerCursor.myCursor.timeout;
    const quiet = timeoutSeconds * 1000 <= Date.now() - cursor.timestampReceive;

    if (quiet) {
      if (cursor.isDisConnect) return;
      cursor.isDisConnect = true;
      this.notice('feature.lobby.peerCursor.noSignal', { name: nameOf(cursor), seconds: timeoutSeconds });
      return;
    }
    if (cursor.isDisConnect) this.noticeReconnection(cursor);
    cursor.isDisConnect = false;
  }

  private noticeReconnection(cursor: PeerCursor): void {
    const identifier = cursor.identifier;
    const waiting = this.reconnectNotices.get(identifier);
    if (waiting !== undefined) clearTimeout(waiting);
    this.reconnectNotices.set(
      identifier,
      setTimeout(() => {
        this.reconnectNotices.delete(identifier);
        this.notice('feature.lobby.peerCursor.reconnected', { name: nameOf(cursor) });
      }, RECONNECT_NOTICE_DELAY_MS)
    );
  }

  private left(identifier: string): void {
    const waiting = this.reconnectNotices.get(identifier);
    if (waiting !== undefined) clearTimeout(waiting);
    this.reconnectNotices.delete(identifier);

    const cursor = this.watched.get(identifier);
    if (!cursor) return;
    this.watched.delete(identifier);
    this.batchService.remove(cursor);
    if (cursor.isMine || this.saidGoodbye.has(identifier)) return;
    this.saidGoodbye.set(
      identifier,
      setTimeout(() => this.saidGoodbye.delete(identifier), GOODBYE_HELD_MS)
    );
    this.notice('feature.lobby.peerCursor.loggedOut', { name: nameOf(cursor) });
  }

  private notice(key: string, params: Record<string, string | number>): void {
    const systemTab = ChatTabList.instance.systemMessageTab;
    if (!systemTab || !PeerCursor.myCursor) return;
    this.chatMessageService.sendSystemMessageOnePlayer(
      systemTab,
      encodeI18nMessage(key, params),
      PeerCursor.myCursor.identifier,
      NOTICE_COLOR
    );
  }
}

function nameOf(cursor: PeerCursor): string {
  return cursor.name || cursor.userId.slice(0, 6);
}
