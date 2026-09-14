import { DestroyRef, inject, Injectable, Signal, signal, WritableSignal } from '@angular/core';
import {
  type CoinFlipEvent,
  type CursorMoveEvent,
  type FileSyncEvent,
  type HeartBeatEvent,
  type IdentifierEvent,
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  type ObjectDeleteEvent,
  type PeerReconnectEvent,
  subscribeNetworkBindings,
  type WritingMessageEvent,
} from '@axe/application/sync/object-change-network-helpers';
import {
  alarmPop$,
  alarmTimeUp$,
  cardStackDecreased$,
  ccfoliaRoomDropped$,
  endOldVote$,
  fileLoaded$,
  fileResourceUpdated$ as domainFileResourceUpdated$,
  finishVote$,
  imageDropped$,
  loadConfig$,
  messageAdded$,
  selectFile$,
  soundOnlyCutIn$,
  startCutIn$,
  startVote$,
  stopCutIn$,
  stopCutInByBgm$,
  xmlLoaded$,
} from '@axe/core/event/domain-events';
import { EventChannel, ReadableChannel } from '@axe/core/event/event-channel';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { peerStatsUpdated$ } from '@axe/core/network/peer-stats-events';
import {
  childrenChanged$,
  type ChildrenChangeEvent,
  objectAdded$,
  objectChanged$,
  type ObjectChangeEvent,
  objectRemoved$,
  type ObjectStoreEvent,
} from '@axe/core/sync/object-event-extension';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

export type {
  CoinFlipEvent,
  CursorMoveEvent,
  FileSyncEvent,
  HeartBeatEvent,
  IdentifierEvent,
  NetworkErrorEvent,
  NetworkPeerEvent,
  ObjectDeleteEvent,
  PeerReconnectEvent,
  WritingMessageEvent,
} from '@axe/application/sync/object-change-network-helpers';
export type {
  AlarmPopEvent,
  AlarmTimeUpEvent,
  CardStackDecreasedEvent,
  CutInEvent,
  FileSelectedEvent,
  FinishVoteEvent,
  ImageDroppedEvent,
  LoadConfigEvent,
  MessageAddedEvent,
  XmlLoadedEvent,
} from '@axe/core/event/domain-events';
export type { ObjectChangeEvent } from '@axe/core/sync/object-event-extension';

@Injectable({
  providedIn: 'root',
})
export class ObjectChangeService {
  private readonly destroyRef = inject(DestroyRef);

  /** Batched object change notifications (from both local and network sources) */
  readonly objectChanged$: ReadableChannel<ObjectChangeEvent> = objectChanged$;
  /** Batched children hierarchy change notifications */
  readonly childrenChanged$: ReadableChannel<ChildrenChangeEvent> = childrenChanged$;
  /** Emitted synchronously when an object is added to ObjectStore. */
  readonly objectAdded$: ReadableChannel<ObjectStoreEvent> = objectAdded$;
  /** Emitted synchronously when an object is removed from ObjectStore. */
  readonly objectRemoved$: ReadableChannel<ObjectStoreEvent> = objectRemoved$;

  private readonly _versions = new Map<string, WritableSignal<number>>();

  /** Bumps both for its own properties and for anything below it. */
  versionOf(identifier: string): Signal<number> {
    let sig = this._versions.get(identifier);
    if (!sig) {
      sig = signal(0);
      this._versions.set(identifier, sig);
    }
    return sig.asReadonly();
  }

  /** A coin you flipped starts spinning here, without waiting for the round trip. */
  notifyCoinFlipped(identifier: string, face: string): void {
    this._flipCoin$.emit({ identifier, face });
  }

  /** A die you threw starts rolling here, without waiting for the round trip. */
  notifyDiceRolled(identifier: string): void {
    this._rollDiceSymbol$.emit({ identifier });
  }

  /**
   * Bumps the `versionOf` signal for an object by hand, for a change no sync var reports.
   *
   * Nothing is sent to other peers, and nothing happens until something has followed that
   * identifier.
   */
  notifyChanged(identifier: string): void {
    this._versions.get(identifier)?.update((v) => v + 1);
  }

  private readonly _collections = new Map<string, WritableSignal<number>>();

  /**
   * Additions and removals bump it automatically.
   * An apparent change to a filtered collection, such as a move or a reparent, needs
   * notifyCollectionChanged() to bump it by hand.
   */
  collectionOf(aliasName: string): Signal<number> {
    let sig = this._collections.get(aliasName);
    if (!sig) {
      sig = signal(0);
      this._collections.set(aliasName, sig);
    }
    return sig.asReadonly();
  }

  /**
   * Bumps the `collectionOf` signal for an alias by hand, for a move or reparent that changes which
   * objects a filtered view holds.
   */
  notifyCollectionChanged(aliasName: string): void {
    this._collections.get(aliasName)?.update((v) => v + 1);
  }

  /**
   * Follow the cursor of whoever is reading, for anything that answers by their role.
   *
   * The cursor is a static that is absent until a room has been joined, so following only
   * the one that can be seen follows nothing at all while there is none. A computation that
   * did so kept the default role for as long as it held its answer, and never heard the
   * cursor arrive. The set of cursors is followed as well, which is how it hears.
   */
  trackMyCursor(): void {
    this.collectionOf(PeerCursor.aliasName)();
    const cursor = PeerCursor.myCursor;
    if (cursor) this.versionOf(cursor.identifier)();
  }

  /**
   * `getIdentifiers` runs on every event, so only changes to the current set reach the
   * listener. It is a callback so that the set can move, as it does when a component follows something.
   * @returns the unsubscribe function. Passing a `destroyRef` cleans it up automatically.
   */
  onObjectChangedFor(
    getIdentifiers: () => readonly string[],
    listener: (event: ObjectChangeEvent) => void,
    destroyRef?: DestroyRef
  ): () => void {
    return this.objectChanged$.subscribe((event) => {
      const ids = getIdentifiers();
      if (ids.includes(event.identifier)) listener(event);
    }, destroyRef);
  }

  /**
   * Listens for batched change events on objects of any of the given aliases.
   *
   * Returns the unsubscribe function; passing a `destroyRef` calls it automatically. For a single
   * fixed alias, `onObjectChangedForSingleAlias` dispatches without filtering each event.
   */
  onObjectChangedForAlias(
    aliasNames: readonly string[],
    listener: (event: ObjectChangeEvent) => void,
    destroyRef?: DestroyRef
  ): () => void {
    return this.objectChanged$.subscribe((event) => {
      if (aliasNames.includes(event.aliasName)) listener(event);
    }, destroyRef);
  }

  private readonly _listenersByIdentifier = new Map<string, Set<(event: ObjectChangeEvent) => void>>();
  private readonly _listenersByAlias = new Map<string, Set<(event: ObjectChangeEvent) => void>>();

  /**
   * An indexed subscription for one identifier. Unlike `onObjectChangedFor` there is no
   * per-event filtering, so dispatch is constant time. Use it when the identifier is fixed.
   */
  onObjectChangedForIdentifier(
    identifier: string,
    listener: (event: ObjectChangeEvent) => void,
    destroyRef?: DestroyRef
  ): () => void {
    let set = this._listenersByIdentifier.get(identifier);
    if (!set) {
      set = new Set();
      this._listenersByIdentifier.set(identifier, set);
    }
    set.add(listener);
    const off = () => {
      const s = this._listenersByIdentifier.get(identifier);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this._listenersByIdentifier.delete(identifier);
    };
    destroyRef?.onDestroy(off);
    return off;
  }

  /**
   * An indexed subscription for one alias, the fixed-alias form of `onObjectChangedForAlias`.
   */
  onObjectChangedForSingleAlias(
    aliasName: string,
    listener: (event: ObjectChangeEvent) => void,
    destroyRef?: DestroyRef
  ): () => void {
    let set = this._listenersByAlias.get(aliasName);
    if (!set) {
      set = new Set();
      this._listenersByAlias.set(aliasName, set);
    }
    set.add(listener);
    const off = () => {
      const s = this._listenersByAlias.get(aliasName);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this._listenersByAlias.delete(aliasName);
    };
    destroyRef?.onDestroy(off);
    return off;
  }

  private dispatchIndexed(event: ObjectChangeEvent): void {
    const idListeners = this._listenersByIdentifier.get(event.identifier);
    if (idListeners && idListeners.size > 0) {
      // Like the event channel, a listener unsubscribed mid-iteration is skipped
      const snapshot = Array.from(idListeners);
      for (const listener of snapshot) {
        if (idListeners.has(listener)) listener(event);
      }
    }
    const aliasListeners = this._listenersByAlias.get(event.aliasName);
    if (aliasListeners && aliasListeners.size > 0) {
      const snapshot = Array.from(aliasListeners);
      for (const listener of snapshot) {
        if (aliasListeners.has(listener)) listener(event);
      }
    }
  }

  private readonly _objectDeleted$ = new EventChannel<ObjectDeleteEvent>();
  private readonly _fileSyncList$ = new EventChannel<FileSyncEvent>();
  private readonly _fileResourceUpdated$ = new EventChannel<FileSyncEvent>();
  private readonly _peerConnect$ = new EventChannel<NetworkPeerEvent>();
  private readonly _peerDisconnect$ = new EventChannel<NetworkPeerEvent>();
  private readonly _peerReconnect$ = new EventChannel<PeerReconnectEvent>();
  private readonly _networkOpen$ = new EventChannel<NetworkPeerEvent>();
  private readonly _writingMessage$ = new EventChannel<WritingMessageEvent>();
  private readonly _shuffleCardStack$ = new EventChannel<IdentifierEvent>();
  private readonly _rollDiceSymbol$ = new EventChannel<IdentifierEvent>();
  private readonly _flipCoin$ = new EventChannel<CoinFlipEvent>();
  private readonly _cursorMove$ = new EventChannel<CursorMoveEvent>();
  private readonly _heartBeat$ = new EventChannel<HeartBeatEvent>();
  private readonly _eventActivity$ = new EventChannel<void>();
  private readonly _localObjectUpdated$ = new EventChannel<void>();
  private readonly _audioSyncList$ = new EventChannel<FileSyncEvent>();
  private readonly _networkError$ = new EventChannel<NetworkErrorEvent>();

  readonly objectDeleted$: ReadableChannel<ObjectDeleteEvent> = this._objectDeleted$;
  readonly fileSyncList$: ReadableChannel<FileSyncEvent> = this._fileSyncList$;
  readonly fileResourceUpdated$: ReadableChannel<FileSyncEvent> = this._fileResourceUpdated$;
  readonly peerConnect$: ReadableChannel<NetworkPeerEvent> = this._peerConnect$;
  readonly peerDisconnect$: ReadableChannel<NetworkPeerEvent> = this._peerDisconnect$;
  readonly peerReconnect$: ReadableChannel<PeerReconnectEvent> = this._peerReconnect$;
  readonly networkOpen$: ReadableChannel<NetworkPeerEvent> = this._networkOpen$;
  readonly writingMessage$: ReadableChannel<WritingMessageEvent> = this._writingMessage$;
  readonly shuffleCardStack$: ReadableChannel<IdentifierEvent> = this._shuffleCardStack$;
  readonly rollDiceSymbol$: ReadableChannel<IdentifierEvent> = this._rollDiceSymbol$;
  readonly flipCoin$: ReadableChannel<CoinFlipEvent> = this._flipCoin$;
  readonly selectFile$ = selectFile$;
  readonly cursorMove$: ReadableChannel<CursorMoveEvent> = this._cursorMove$;
  readonly heartBeat$: ReadableChannel<HeartBeatEvent> = this._heartBeat$;
  /** Fires on every networkMessage$ event (wildcard). Used for network activity monitoring. */
  readonly eventActivity$: ReadableChannel<void> = this._eventActivity$;
  readonly localObjectUpdated$: ReadableChannel<void> = this._localObjectUpdated$;
  readonly audioSyncList$: ReadableChannel<FileSyncEvent> = this._audioSyncList$;
  readonly networkError$: ReadableChannel<NetworkErrorEvent> = this._networkError$;

  readonly messageAdded$ = messageAdded$;
  readonly cardStackDecreased$ = cardStackDecreased$;
  readonly startCutIn$ = startCutIn$;
  readonly soundOnlyCutIn$ = soundOnlyCutIn$;
  readonly stopCutInByBgm$ = stopCutInByBgm$;
  readonly stopCutIn$ = stopCutIn$;
  readonly endOldVote$ = endOldVote$;
  readonly startVote$ = startVote$;
  readonly finishVote$ = finishVote$;
  readonly alarmTimeUp$ = alarmTimeUp$;
  readonly alarmPop$ = alarmPop$;
  readonly fileLoaded$ = fileLoaded$;
  readonly xmlLoaded$ = xmlLoaded$;
  readonly imageDropped$ = imageDropped$;
  readonly ccfoliaRoomDropped$ = ccfoliaRoomDropped$;
  readonly loadConfig$ = loadConfig$;
  readonly domainFileResourceUpdated$ = domainFileResourceUpdated$;

  /** Signal that updates when any file-related event occurs (throttled 100ms, leading + trailing). */
  readonly fileVersion = signal<number>(0);

  /** Signal that updates when network peer events occur (debounced 100ms). */
  readonly networkVersion = signal<number>(0);

  /** Signal that updates when WebRTC link statistics are refreshed (every 2-8s while connected). */
  readonly peerStatsVersion = signal<number>(0);

  constructor() {
    objectChanged$.subscribe((e) => {
      this._versions.get(e.identifier)?.update((v) => v + 1);
      this.dispatchIndexed(e);
    }, this.destroyRef);

    childrenChanged$.subscribe((e) => {
      this._versions.get(e.identifier)?.update((v) => v + 1);
    }, this.destroyRef);

    objectAdded$.subscribe((e) => {
      this._collections.get(e.aliasName)?.update((v) => v + 1);
    }, this.destroyRef);

    // A removal bumps the collection and the object's own version, then drops the version entry.
    // The parent hears of it only on the next microtask, so this is what reaches a computation
    // that followed the object itself at once.
    objectRemoved$.subscribe((e) => {
      this._collections.get(e.aliasName)?.update((v) => v + 1);
      this._versions.get(e.identifier)?.update((v) => v + 1);
      this._versions.delete(e.identifier);
    }, this.destroyRef);

    const offNetworkBindings = subscribeNetworkBindings(networkMessage$, {
      objectDeleted$: this._objectDeleted$,
      fileSyncList$: this._fileSyncList$,
      fileResourceUpdated$: this._fileResourceUpdated$,
      peerConnect$: this._peerConnect$,
      peerDisconnect$: this._peerDisconnect$,
      peerReconnect$: this._peerReconnect$,
      networkOpen$: this._networkOpen$,
      writingMessage$: this._writingMessage$,
      shuffleCardStack$: this._shuffleCardStack$,
      rollDiceSymbol$: this._rollDiceSymbol$,
      flipCoin$: this._flipCoin$,
      cursorMove$: this._cursorMove$,
      heartBeat$: this._heartBeat$,
      localObjectUpdated$: this._localObjectUpdated$,
      audioSyncList$: this._audioSyncList$,
      networkError$: this._networkError$,
      eventActivity$: this._eventActivity$,
    });
    this.destroyRef.onDestroy(offNetworkBindings);

    // Throttled at both ends over 100ms: file events are gathered into one bump.
    let fileTimer: ReturnType<typeof setTimeout> | null = null;
    let filePending = false;
    const flushFileVersion = () => {
      fileTimer = null;
      if (filePending) {
        filePending = false;
        this.fileVersion.update((v) => v + 1);
        fileTimer = setTimeout(flushFileVersion, 100);
      }
    };
    const bumpFileVersion = () => {
      if (fileTimer === null) {
        this.fileVersion.update((v) => v + 1);
        fileTimer = setTimeout(flushFileVersion, 100);
      } else {
        filePending = true;
      }
    };
    this._fileSyncList$.subscribe(bumpFileVersion, this.destroyRef);
    this._fileResourceUpdated$.subscribe(bumpFileVersion, this.destroyRef);
    fileLoaded$.subscribe(bumpFileVersion, this.destroyRef);
    this._audioSyncList$.subscribe(bumpFileVersion, this.destroyRef);
    domainFileResourceUpdated$.subscribe(bumpFileVersion, this.destroyRef);
    this.destroyRef.onDestroy(() => {
      if (fileTimer !== null) clearTimeout(fileTimer);
    });

    // Debounced over 100ms: peer events are gathered into one bump.
    let netTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpNetworkVersion = () => {
      if (netTimer !== null) clearTimeout(netTimer);
      netTimer = setTimeout(() => {
        netTimer = null;
        this.networkVersion.update((v) => v + 1);
      }, 100);
    };
    this._networkOpen$.subscribe(bumpNetworkVersion, this.destroyRef);
    this._peerConnect$.subscribe(bumpNetworkVersion, this.destroyRef);
    this._peerDisconnect$.subscribe(bumpNetworkVersion, this.destroyRef);
    peerStatsUpdated$.subscribe(() => this.peerStatsVersion.update((v) => v + 1), this.destroyRef);
    this.destroyRef.onDestroy(() => {
      if (netTimer !== null) clearTimeout(netTimer);
    });
  }
}
