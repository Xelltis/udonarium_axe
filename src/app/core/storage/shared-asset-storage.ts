import { fileResourceUpdated$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import {
  ASSET_LAST_TRY_DELAY_MS,
  ASSET_PAUSE_RETRY_MS,
  ASSET_PUT_BACK_CHECK_MS,
  AssetRetries,
  receivedUploadTurnMs,
} from '@axe/core/storage/asset-retries';
import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';

/** One entry of the catalogue a seat names what it holds by. */
export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
  readonly name?: string;
};

/** The fields of a shared file, in the shape sent to peers. */
export interface SharedAssetContext {
  identifier: string;
  name: string;
  type: string;
  blob: Blob | null;
  url: string;
}

/** A file traded between peers and put up to the room's asset store, kept under the SHA-256 of its bytes. */
export interface SharedAssetFile<C extends SharedAssetContext> {
  readonly identifier: string;
  readonly name: string;
  /** The bytes, or null while this seat holds none. */
  readonly blob: Blob | null;
  /** A link to it: an object URL made for the bytes, or a link given in their stead. */
  readonly url: string;
  /** How much of it this seat holds, compared with peers' catalogues. */
  readonly state: number;
  /** Whether there is anything to use it by yet. */
  readonly isReady: boolean;
  /** Fills in what this entry still lacks from another context. */
  apply(context: C): void;
  /** The fields, in the shape sent to peers and handed to `apply`. */
  toContext(): C;
  /** Lets go of the object URLs made for it. */
  destroy(): void;
}

/** What tells one kind of shared file from another to the store that keeps them. */
export interface SharedAssetKind<F extends SharedAssetFile<C>, C extends SharedAssetContext> {
  /** The message a seat's catalogue of this kind is sent to peers as. */
  readonly catalogMessage: string;
  /** The state a file of this kind is held in full at, with its bytes. */
  readonly complete: number;
  /** Whether what is added is an entry rather than a context received from a peer. */
  readonly isFile: (arg: F | C) => arg is F;
  /** An entry made from a context received from a peer. */
  readonly fromContext: (context: C) => F;
  /** Reads an added file into an entry keyed by the SHA-256 of its bytes. */
  readonly readAsync: (blob: Blob) => Promise<F>;
  /** Whether one is neither put up nor named to peers, as one every seat holds beside its own page. */
  readonly keptHome?: (identifier: string) => boolean;
}

/**
 * The files of one kind this seat holds, as the sounds and the 3D models are kept: each under the
 * SHA-256 of its bytes, listed to peers once it is held in full, put up to the room server's asset
 * store where the room has one, and let go of where the room's GM removed it.
 */
export class SharedAssetStorage<F extends SharedAssetFile<C>, C extends SharedAssetContext> {
  private readonly catalogSchedule: CatalogSendSchedule;
  /** The files held, by identifier, on an object with no prototype, as a peer names the identifiers. */
  private hash: { [identifier: string]: F } = Object.create(null);
  /** Those added on this seat that are queued for the asset server or going up to it. */
  private readonly uploading = new Set<string>();
  /** What is to go up again once the upload under way ends, asked for while it was going up. */
  private readonly upAgain = new Set<string>();
  /**
   * Those added here while a room server's room could not be reached, as while the link was down,
   * which go up once the seat is back.
   */
  private readonly missedUploads = new Set<string>();
  /** What failed to go up as often as it may be tried, left for the seat's next chance. */
  private readonly gaveUp = new Set<string>();
  /** What was made on this seat and is on its way up, whose adder the room is told of once it may be named. */
  private readonly addedUnnamed = new Set<string>();
  /** What has been given its one last try in the room the seat is in, and the timers for those to come. */
  private readonly lastTries = new Map<string, ReturnType<typeof setTimeout> | null>();
  /** Uploads that failed for now, tried again a few times while the seat stays in the room. */
  private readonly uploadRetries = new AssetRetries();
  /**
   * What the room server's operator stopped from going up for a while, kept here and named to
   * nobody until it is there. One is tried again now and then; the rest follow once one goes up.
   */
  private readonly pausedUploads = new Set<string>();
  private pausedRetry: ReturnType<typeof setTimeout> | null = null;
  /** What the operator barred from every room, kept here and named to nobody. */
  private readonly barred = new Set<string>();
  /** What the room's GM removed: held here no more, and taken from no peer or store until put back. */
  private readonly removed = new Set<string>();

  /**
   * Asked, by the app, whether this seat may put back for the room one the room removed, which it
   * does when it may. Only one chosen to be added is asked about, and none is put back until the app
   * says.
   */
  putBack: (identifier: string) => boolean = () => false;

  /** Told, by the app, when one chosen to be added was one the room removed, and could not be put back. */
  onRefused: (identifier: string) => void = () => {};

  /**
   * Told, by the app, when bytes the room has removed since reached the store all the same, as for an
   * upload already under way, so that they can be taken out again.
   */
  onUploadedWhileRemoved: (identifier: string) => void = () => {};

  /**
   * Told, by the app, when one made on this seat is taken in whole and may be named to peers, so that
   * the room learns who added it.
   */
  onAddedLocally: (identifier: string) => void = () => {};

  /**
   * How many of the room's GMs and PLs come before this seat in putting up one a peer sent, set by
   * the app. It waits a turn for each, long enough for the bytes to go up, so that the first has put
   * it up before the next looks.
   */
  receivedUploadTurn: () => number = () => 0;

  protected constructor(private readonly kind: SharedAssetKind<F, C>) {
    this.catalogSchedule = new CatalogSendSchedule((peer) => networkSend(kind.catalogMessage, this.getCatalog(), peer));
  }

  /** The message this seat's catalogue is sent to peers as. */
  get catalogMessage(): string {
    return this.kind.catalogMessage;
  }

  /** The state a file is held in full at, with its bytes. */
  get complete(): number {
    return this.kind.complete;
  }

  /** Every file this seat knows of, including placeholders whose bytes have not arrived. */
  protected get files(): F[] {
    return Object.values(this.hash);
  }

  /**
   * Reads a file the user added into the store, keyed by the hash of its bytes, and tells peers
   * about it shortly after.
   *
   * Adding one already held merges into the existing entry and returns that one, letting go of the
   * object URL made for the bytes read again unless the entry took it up.
   *
   * Null for one the room removed that is not taken in: added without being chosen, or chosen by a
   * seat that may not put it back.
   */
  async addAsync(arg: Blob, options: { putBack?: boolean } = {}): Promise<F | null> {
    const file = await this.kind.readAsync(arg);
    const kept = this._add(file, true, options.putBack === true);
    if (this.removed.has(file.identifier)) {
      file.destroy();
      return null;
    }
    if (kept !== file && kept.url !== file.url) file.destroy();
    return kept;
  }

  /**
   * Adds an entry, or a context received from a peer, returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. One held in full also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   *
   * An entry made on this seat, rather than a context from a peer, also goes up to the asset server
   * when one is configured.
   */
  add(arg: F | C): F {
    if (this.kind.isFile(arg)) return this._add(arg, true);
    if (this.update(arg)) return this.hash[arg.identifier];
    return this._add(this.kind.fromContext(arg), false);
  }

  /**
   * Keeps an entry, made on this seat or not. One the room removed is not taken in, but when it was
   * chosen to be added here in full and this seat may put it back, which puts it back for the room.
   */
  protected _add(file: F, isLocal: boolean, putBack = false): F {
    if (this.removed.has(file.identifier) && !this.takeBack(file, isLocal && putBack)) return file;
    if (isLocal) this.uploadToAssetStore(file, true);
    if (isLocal && this.kind.complete <= file.state) this.addedHere(file.identifier);
    if (this.kind.complete <= file.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(file)) return this.hash[file.identifier];
    this.hash[file.identifier] = file;
    return file;
  }

  /**
   * Puts every one held in full up to the room just entered. The room server keeps each room's files
   * apart, so those added outside it, or brought from another room, are not there yet; those that
   * are only get asked about.
   */
  uploadAllToAssetStore(): void {
    this.uploadRetries.clear();
    this.missedUploads.clear();
    this.gaveUp.clear();
    this.clearLastTries();
    this.pausedUploads.clear();
    this.stopPausedRetry();
    for (const file of this.files) this.uploadToAssetStore(file);
  }

  /**
   * Puts up what was added here while the room could not be reached, as on coming back on a new
   * link the server asked for, without asking again about all the rest.
   */
  uploadMissedToAssetStore(): void {
    for (const identifier of [...this.missedUploads]) {
      this.missedUploads.delete(identifier);
      const file = this.hash[identifier];
      if (file) this.uploadToAssetStore(file);
    }
  }

  /**
   * Puts one a peer sent up to the room's asset store, for one the store was found to lack: the seat
   * that added it could not put it there, and once that seat leaves nobody else might. Only a GM or
   * a PL may put anything there, and each waits its turn among them; one that finds it there by then
   * puts nothing up. Nothing is put up for one only part of which has come; the rest coming asks
   * again.
   */
  uploadReceived(identifier: string): void {
    const held = this.hash[identifier];
    if (!held || held.state < this.kind.complete) return;
    const delay = this.receivedUploadTurn() * receivedUploadTurnMs(held.blob?.size ?? 0);
    if (delay <= 0) {
      this.putUpHeld(identifier);
      return;
    }
    const roomKey = Network.roomKey;
    setTimeout(() => {
      if (Network.roomKey === roomKey) this.putUpHeld(identifier);
    }, delay);
  }

  /** Puts one this seat holds up to the room's asset store, as a GM or a PL may. */
  private putUpHeld(identifier: string): void {
    const role = Network.serverRole;
    const file = this.hash[identifier];
    if (file && (role === 'gm' || role === 'pl')) this.uploadToAssetStore(file);
  }

  /**
   * Whether one the room removed comes in: chosen to be added in full, by a seat that may put it back.
   * One put back is asked about in the room's store again a while later, while the seat is still in
   * that room, as another seat's request to take it out may still have been under way.
   */
  private takeBack(file: F, chosen: boolean): boolean {
    if (!chosen || file.state < this.kind.complete) return false;
    if (!this.putBack(file.identifier)) {
      this.onRefused(file.identifier);
      return false;
    }
    this.removed.delete(file.identifier);
    const { identifier } = file;
    const roomKey = Network.roomKey;
    setTimeout(() => {
      if (Network.roomKey === roomKey) this.putUpAgain(identifier);
    }, ASSET_PUT_BACK_CHECK_MS);
    return true;
  }

  /**
   * Puts one up to the room's asset store, or keeps it for when the room is in reach. One that went
   * up to a room the seat has left meanwhile goes up to the room it is in now as well.
   *
   * One turned away for the room being out of reach, as while the link is down, goes up once the
   * seat is back rather than spend its tries meanwhile. One the operator stopped for a while waits
   * here for the stop to be over, and one the operator barred stays here; neither is named to peers,
   * who would pass it on regardless. One kept anew shows a stop is over. One every seat holds beside
   * its own page never goes up.
   */
  private uploadToAssetStore(file: F, first = false, probe = false): void {
    const store = AssetHttpStore.instance;
    const blob = file.blob;
    if (file.state !== this.kind.complete || !blob || this.kind.keptHome?.(file.identifier)) return;
    if (!store.isEnabled) {
      if (store.isConfigured && AssetHttpStore.isAssetId(file.identifier)) this.missedUploads.add(file.identifier);
      return;
    }
    if (!AssetHttpStore.isAssetId(file.identifier) || this.uploading.has(file.identifier)) return;
    const { identifier } = file;
    const requestedIn = Network.roomKey;
    let wentUpElsewhere = false;
    this.uploading.add(identifier);
    void store
      .upload(identifier, blob, file.name, { first, probe })
      .then((result) => {
        if (this.removed.has(identifier)) {
          if (result === 'stored' || result === 'exists') this.onUploadedWhileRemoved(identifier);
          return;
        }
        if (result === 'failed' && !store.isEnabled && store.isConfigured) {
          this.uploadRetries.forget(identifier);
          this.missedUploads.add(identifier);
          return;
        }
        const roomKey = Network.roomKey;
        if (result === 'paused' || result === 'blocked') {
          this.uploadRetries.forget(identifier);
          this.gaveUp.delete(identifier);
          if (result === 'blocked') {
            this.barred.add(identifier);
          } else {
            this.pausedUploads.add(identifier);
          }
          return;
        }
        if (result === 'stored' || result === 'exists') this.barred.delete(identifier);
        if (result === 'failed') {
          if (!this.uploadRetries.schedule(identifier, () => this.retryUpload(identifier, roomKey))) {
            this.giveUp(identifier, roomKey);
            this.tellAdded(identifier);
          }
        } else {
          this.tellAdded(identifier);
          this.uploadRetries.forget(identifier);
          this.gaveUp.delete(identifier);
        }
        if (result === 'stored') this.resumePaused();
        wentUpElsewhere = (result === 'stored' || result === 'exists') && roomKey !== requestedIn;
      })
      .finally(() => {
        this.uploading.delete(identifier);
        if (this.upAgain.delete(identifier)) this.putUpAgain(identifier);
        if (this.pausedUploads.size > 0) this.retryPausedLater(Network.roomKey);
        this.catalogSchedule.whenQuiet(100);
        if (wentUpElsewhere) this.putUpHeld(identifier);
      });
  }

  /**
   * Tries one the operator's stop held again a while later, in the room it was held in, to see
   * whether the stop is over. The smallest is tried, since the bytes may all be sent before the
   * server's answer that the stop goes on. One that does not go up after all, as when it is held no
   * more, leaves the rest to the next try, as the answer would have; while the seat may not put
   * anything up, as a guest or while it is getting back in, the try waits with all still held.
   */
  private retryPausedLater(roomKey: string | null): void {
    if (this.pausedRetry) return;
    this.pausedRetry = setTimeout(() => {
      this.pausedRetry = null;
      const next = this.smallestPaused();
      const role = Network.serverRole;
      if (next === undefined || Network.roomKey !== roomKey) return;
      if (role !== 'gm' && role !== 'pl') {
        this.retryPausedLater(roomKey);
        return;
      }
      this.pausedUploads.delete(next);
      this.retryUpload(next, roomKey, true);
      if (!this.uploading.has(next)) this.retryPausedLater(roomKey);
    }, ASSET_PAUSE_RETRY_MS);
  }

  private smallestPaused(): string | undefined {
    let smallest: string | undefined;
    let leastBytes = Infinity;
    for (const identifier of this.pausedUploads) {
      const bytes = this.hash[identifier]?.blob?.size ?? 0;
      if (bytes < leastBytes) {
        smallest = identifier;
        leastBytes = bytes;
      }
    }
    return smallest;
  }

  /**
   * Puts up everything the operator's stop held, now that one has gone up here or, as the app tells,
   * anywhere: the stop is over for every upload.
   */
  resumePaused(): void {
    this.stopPausedRetry();
    for (const identifier of [...this.pausedUploads]) {
      this.pausedUploads.delete(identifier);
      const file = this.hash[identifier];
      if (file) this.uploadToAssetStore(file);
    }
  }

  private stopPausedRetry(): void {
    if (this.pausedRetry) clearTimeout(this.pausedRetry);
    this.pausedRetry = null;
  }

  /**
   * Whether this seat holds one back from peers for the operator: stopped from going up for a while,
   * or barred. One asked for is not sent either. A guest, who puts nothing up, holds nothing back for
   * the stop, as it names to peers what it was to put up.
   */
  isHeldBack(identifier: string): boolean {
    return (Network.serverRole !== 'guest' && this.pausedUploads.has(identifier)) || this.barred.has(identifier);
  }

  /**
   * Lets go of one the room's GM removed and keeps it from coming back: it is taken from no peer or
   * store, and named to nobody, until `unmarkRemoved`.
   */
  markRemoved(identifier: string): void {
    this.removed.add(identifier);
    this.uploadRetries.cancel(identifier);
    if (this.delete(identifier)) fileResourceUpdated$.emit();
  }

  /**
   * Puts one held here up to the room's store again, as when a removal put back meanwhile had the
   * store take it out all the same. One going up just then goes up again once that ends, as the store
   * may have taken it out after it was found there.
   */
  putUpAgain(identifier: string): void {
    if (this.uploading.has(identifier)) {
      this.upAgain.add(identifier);
      return;
    }
    const file = this.hash[identifier];
    if (file) this.uploadToAssetStore(file);
  }

  /** Lets one the room put back be taken again. */
  unmarkRemoved(identifier: string): void {
    this.removed.delete(identifier);
  }

  /** Whether the room's GM removed it, so that it is to be taken from nobody. */
  isRemoved(identifier: string): boolean {
    return this.removed.has(identifier);
  }

  /** Tries a failed upload again, while the seat is still a GM or a PL in the room it failed for. */
  private retryUpload(identifier: string, roomKey: string | null, probe = false): void {
    const role = Network.serverRole;
    if (Network.roomKey !== roomKey || (role !== 'gm' && role !== 'pl')) return;
    const file = this.hash[identifier];
    if (file) this.uploadToAssetStore(file, false, probe);
  }

  private update(file: F | C): boolean {
    const held = this.hash[file.identifier];
    if (held) {
      held.apply(this.kind.isFile(file) ? file.toContext() : file);
      return true;
    }
    return false;
  }

  /**
   * Counts as up what the room's store was found to hold, though this seat could not put it there,
   * as when another seat has since. One the operator barred stays held back, as a room the takedown
   * missed may list it still.
   */
  forgetUploaded(identifiers: readonly string[]): void {
    for (const identifier of identifiers) this.forgetUpload(identifier);
  }

  /** Stops counting one as still to go up. */
  private forgetUpload(identifier: string): void {
    this.gaveUp.delete(identifier);
    this.missedUploads.delete(identifier);
    this.pausedUploads.delete(identifier);
    const lastTry = this.lastTries.get(identifier);
    if (lastTry) {
      clearTimeout(lastTry);
      this.lastTries.set(identifier, null);
    }
  }

  /**
   * Leaves one that failed as often as it may be tried for the seat's next chance, and gives it one
   * last try a while later, once in the room it failed for, so that a store that could not take it
   * for a time may take it yet.
   */
  private giveUp(identifier: string, roomKey: string | null): void {
    this.gaveUp.add(identifier);
    if (this.lastTries.has(identifier)) return;
    const timer = setTimeout(() => {
      this.lastTries.set(identifier, null);
      if (!this.gaveUp.has(identifier)) return;
      this.gaveUp.delete(identifier);
      this.retryUpload(identifier, roomKey);
    }, ASSET_LAST_TRY_DELAY_MS);
    this.lastTries.set(identifier, timer);
  }

  private clearLastTries(): void {
    for (const timer of this.lastTries.values()) if (timer) clearTimeout(timer);
    this.lastTries.clear();
  }

  /** Removes one and lets go of its object URLs, returning false when it was not held. Peers are not told. */
  delete(identifier: string): boolean {
    this.forgetUpload(identifier);
    this.barred.delete(identifier);
    const file = this.hash[identifier];
    if (file) {
      file.destroy();
      delete this.hash[identifier];
      return true;
    }
    return false;
  }

  /** The one held under this identifier, or null when this seat has never heard of it. */
  get(identifier: string): F | null {
    return this.hash[identifier] ?? null;
  }

  /** Sends the catalogue now, to one peer or to everyone. */
  synchronize(peer?: string): void {
    this.catalogSchedule.now(peer);
  }

  /** Sends the catalogue a little later, folded together with the calls made meanwhile. */
  lazySynchronize(ms: number, peer?: string): void {
    this.catalogSchedule.later(ms, peer);
  }

  /**
   * Whether any this seat is to put up has yet to reach the room's asset store: going up, waiting to
   * be tried again, for the room to be in reach or for the operator's stop to be over, or left after
   * failing as often as it may be tried. A guest puts nothing up, so only one going up counts for it.
   */
  get hasUploadsPending(): boolean {
    if (this.uploading.size > 0) return true;
    if (Network.serverRole === 'guest') return false;
    return (
      this.uploadRetries.hasWaiting ||
      this.missedUploads.size > 0 ||
      this.gaveUp.size > 0 ||
      this.pausedUploads.size > 0
    );
  }

  /**
   * Tells the room this seat added it, once it may be named to peers: between peers at once, and on a
   * room server once it is in the room's store, or the seat gave up putting it there, as one on its
   * way up is named to nobody.
   */
  private addedHere(identifier: string): void {
    if (this.isOnItsWayUp(identifier)) this.addedUnnamed.add(identifier);
    else this.onAddedLocally(identifier);
  }

  /** Tells the room who added one made on this seat that was waiting to be named, now that it may be. */
  private tellAdded(identifier: string): void {
    if (this.addedUnnamed.delete(identifier)) this.onAddedLocally(identifier);
  }

  /**
   * Whether this seat is still to put something up to the asset store: queued or going up, waiting
   * to be tried again, or waiting for the room to be in reach or the operator's stop to be over.
   * Until it is there, peers are not told of it, so that they fetch it from the store once it is
   * rather than each from this seat. A guest puts nothing up, so what it was to try again or put up
   * once back is named to peers.
   */
  private isOnItsWayUp(identifier: string): boolean {
    if (this.uploading.has(identifier)) return true;
    if (Network.serverRole === 'guest') return false;
    return (
      this.uploadRetries.isWaiting(identifier) ||
      this.missedUploads.has(identifier) ||
      this.pausedUploads.has(identifier)
    );
  }

  /**
   * What this seat holds in full, or by a link where a kind may be held so, which is what it
   * advertises so that peers can request what they lack. Those still going up to the asset server,
   * those the operator barred, and those every seat holds beside its own page are left out.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const file of this.files) {
      if (
        this.kind.complete <= file.state &&
        !this.isOnItsWayUp(file.identifier) &&
        !this.barred.has(file.identifier) &&
        !this.kind.keptHome?.(file.identifier)
      ) {
        catalog.push({ identifier: file.identifier, state: file.state, name: file.name });
      }
    }
    return catalog;
  }
}
