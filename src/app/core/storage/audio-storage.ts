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
import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';
import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';

export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
  readonly name?: string;
};

export class AudioStorage {
  private static _instance: AudioStorage;
  /** The one audio store for the page, created on first use. */
  static get instance(): AudioStorage {
    if (!AudioStorage._instance) AudioStorage._instance = new AudioStorage();
    return AudioStorage._instance;
  }

  private readonly catalogSchedule = new CatalogSendSchedule((peer) =>
    networkSend('SYNCHRONIZE_AUDIO_LIST', this.getCatalog(), peer)
  );
  private hash: { [identifier: string]: AudioFile } = {};
  /** Audio added on this seat that is queued for the asset server or going up to it. */
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
   * Asked, by the app, whether this seat may put back for the room a sound the room removed, which
   * it does when it may. Only one chosen to be added is asked about, and none is put back until the
   * app says.
   */
  putBack: (identifier: string) => boolean = () => false;

  /** Told, by the app, when a sound chosen to be added was one the room removed, and could not be put back. */
  onRefused: (identifier: string) => void = () => {};

  /**
   * Told, by the app, when bytes the room has removed since reached the store all the same, as for an
   * upload already under way, so that they can be taken out again.
   */
  onUploadedWhileRemoved: (identifier: string) => void = () => {};

  /**
   * Told, by the app, when a sound made on this seat is taken in whole and may be named to peers, so
   * that the room learns who added it.
   */
  onAddedLocally: (identifier: string) => void = () => {};

  /** Every audio this seat knows of, including placeholders whose bytes have not arrived. */
  get audios(): AudioFile[] {
    return Object.values(this.hash);
  }

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.hash)) {
      this.delete(identifier);
    }
  }

  /**
   * Reads a file the user added into the store, keyed by the hash of its bytes, and
   * tells peers about it shortly after.
   *
   * Adding audio already held merges into the existing entry and returns that one.
   *
   * Null for one the room removed that is not taken in: added without being chosen, or chosen by a
   * seat that may not put it back.
   */
  async addAsync(arg: Blob, options: { putBack?: boolean } = {}): Promise<AudioFile | null> {
    const audio: AudioFile = await AudioFile.createAsync(arg);

    const kept = this._add(audio, true, options.putBack === true);
    if (!this.removed.has(audio.identifier)) return kept;
    audio.destroy();
    return null;
  }

  /**
   * Adds audio from a link, an entry or a context received from a peer,
   * returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. Complete audio also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   *
   * An entry made on this seat, rather than a context from a peer, also goes up to the asset server
   * when one is configured.
   */
  add(arg: string | AudioFile | AudioFileContext): AudioFile {
    let audio: AudioFile;
    let isLocal = false;
    if (typeof arg === 'string') {
      audio = AudioFile.create(arg);
    } else if (arg instanceof AudioFile) {
      audio = arg;
      isLocal = true;
    } else {
      if (this.update(arg)) return this.hash[arg.identifier];
      audio = AudioFile.create(arg);
    }
    return this._add(audio, isLocal);
  }

  /**
   * One the room removed is not taken in, but when it was chosen to be added here in full and this
   * seat may put it back, which puts it back for the room.
   */
  private _add(audio: AudioFile, isLocal: boolean = false, putBack: boolean = false): AudioFile {
    if (this.removed.has(audio.identifier) && !this.takeBack(audio, isLocal && putBack)) return audio;
    if (isLocal) this.uploadToAssetStore(audio, true);
    if (isLocal && AudioState.COMPLETE <= audio.state) this.addedHere(audio.identifier);
    if (AudioState.COMPLETE <= audio.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(audio)) return this.hash[audio.identifier];
    this.hash[audio.identifier] = audio;
    return audio;
  }

  /**
   * Puts every audio held in full up to the room just entered. The room server keeps each room's
   * sounds apart, so those added outside it, or brought from another room, are not there yet;
   * those that are only get asked about.
   */
  uploadAllToAssetStore(): void {
    this.uploadRetries.clear();
    this.missedUploads.clear();
    this.gaveUp.clear();
    this.clearLastTries();
    this.pausedUploads.clear();
    this.stopPausedRetry();
    for (const audio of this.audios) this.uploadToAssetStore(audio);
  }

  /**
   * Puts up what was added here while the room could not be reached, as on coming back on a new
   * link the server asked for, without asking again about all the rest.
   */
  uploadMissedToAssetStore(): void {
    for (const identifier of [...this.missedUploads]) {
      this.missedUploads.delete(identifier);
      const audio = this.hash[identifier];
      if (audio) this.uploadToAssetStore(audio);
    }
  }

  /**
   * How many of the room's GMs and PLs come before this seat in putting up one a peer sent, set by
   * the app. It waits a turn for each, long enough for the bytes to go up, so that the first has put
   * it up before the next looks.
   */
  receivedUploadTurn: () => number = () => 0;

  /**
   * Puts a sound a peer sent up to the room's asset store, for one the store was found to
   * lack: the seat that added it could not put it there, and once that seat leaves nobody else
   * might. Only a GM or a PL may put anything there, and each waits its turn among them; one that
   * finds it there by then puts nothing up. Nothing is put up for one only part of which has come,
   * such as a picture's thumbnail; the rest coming asks again.
   */
  uploadReceived(identifier: string): void {
    const held = this.hash[identifier];
    if (!held || held.state < AudioState.COMPLETE) return;
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
    const audio = this.hash[identifier];
    if (audio && (role === 'gm' || role === 'pl')) this.uploadToAssetStore(audio);
  }

  /**
   * Whether one the room removed comes in: chosen to be added in full, by a seat that may put it back.
   * One put back is asked about in the room's store again a while later, while the seat is still in
   * that room, as another seat's request to take it out may still have been under way.
   */
  private takeBack(audio: AudioFile, chosen: boolean): boolean {
    if (!chosen || audio.state < AudioState.COMPLETE) return false;
    if (!this.putBack(audio.identifier)) {
      this.onRefused(audio.identifier);
      return false;
    }
    this.removed.delete(audio.identifier);
    const { identifier } = audio;
    const roomKey = Network.roomKey;
    setTimeout(() => {
      if (Network.roomKey === roomKey) this.putUpAgain(identifier);
    }, ASSET_PUT_BACK_CHECK_MS);
    return true;
  }

  /**
   * Puts one up to the room's asset store, or keeps it for when the room is in reach. One that went
   * up to a room the seat has left meanwhile goes up to the room it is in now as well.
   */
  private uploadToAssetStore(audio: AudioFile, first = false, probe = false): void {
    const store = AssetHttpStore.instance;
    const blob = audio.blob;
    if (audio.state !== AudioState.COMPLETE || !blob) return;
    if (!store.isEnabled) {
      if (store.isConfigured && AssetHttpStore.isAssetId(audio.identifier)) this.missedUploads.add(audio.identifier);
      return;
    }
    if (!AssetHttpStore.isAssetId(audio.identifier) || this.uploading.has(audio.identifier)) return;
    const { identifier } = audio;
    const requestedIn = Network.roomKey;
    let wentUpElsewhere = false;
    this.uploading.add(identifier);
    void store
      .upload(identifier, blob, audio.name, { first, probe })
      .then((result) => {
        if (this.removed.has(identifier)) {
          if (result === 'stored' || result === 'exists') this.onUploadedWhileRemoved(identifier);
          return;
        }
        // Turned away for the room being out of reach, as while the link is down, it goes up once
        // the seat is back rather than spend its tries meanwhile.
        if (result === 'failed' && !store.isEnabled && store.isConfigured) {
          this.uploadRetries.forget(identifier);
          this.missedUploads.add(identifier);
          return;
        }
        const roomKey = Network.roomKey;
        // Stopped by the operator for a while, it waits here for the stop to be over; barred by the
        // operator, it stays here. Neither is named to peers, who would pass it on regardless.
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
        // One kept anew shows the stop is over; anything else leaves the rest to be tried later.
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
      const audio = this.hash[identifier];
      if (audio) this.uploadToAssetStore(audio);
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
   * Lets go of a sound the room's GM removed and keeps it from coming back: it is taken from no peer
   * or store, and named to nobody, until `unmarkRemoved`.
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
    const audio = this.hash[identifier];
    if (audio) this.uploadToAssetStore(audio);
  }

  /** Lets a sound the room put back be taken again. */
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
    const audio = this.hash[identifier];
    if (audio) this.uploadToAssetStore(audio, false, probe);
  }

  private update(audio: AudioFile | AudioFileContext): boolean {
    const updateAudio: AudioFile = this.hash[audio.identifier];
    if (updateAudio) {
      updateAudio.apply(audio instanceof AudioFile ? audio.toContext() : audio);
      return true;
    }
    return false;
  }

  /**
   * Removes the audio and revokes its object URLs, returning false when it was not held. Peers are
   * not told.
   */
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

  delete(identifier: string): boolean {
    this.forgetUpload(identifier);
    this.barred.delete(identifier);
    const audio: AudioFile = this.hash[identifier];
    if (audio) {
      audio.destroy();
      delete this.hash[identifier];
      return true;
    }
    return false;
  }

  /** The audio held under this identifier, or null when this seat has never heard of it. */
  get(identifier: string): AudioFile | null {
    return this.hash[identifier] ?? null;
  }

  /** Sends the catalogue now, to one peer or to everyone. */
  synchronize(peer?: string) {
    this.catalogSchedule.now(peer);
  }

  /** Sends the catalogue a little later, folded together with the calls made meanwhile. */
  lazySynchronize(ms: number, peer?: string) {
    this.catalogSchedule.later(ms, peer);
  }

  /**
   * Whether any sound this seat is to put up has yet to reach the room's asset store: going up,
   * waiting to be tried again, for the room to be in reach or for the operator's stop to be over, or
   * left after failing as often as it may be tried. A guest puts nothing up, so
   * only one going up counts for it.
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
   * room server once it is in the room's store, or the seat gave up putting it there, as a sound on
   * its way up is named to nobody.
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
   * Until it is there, peers are not
   * told of it, so that they fetch it from the store once it is rather than each from this seat.
   * A guest puts nothing up, so what it was to try again or put up once back is named to peers.
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
   * The audio this seat holds in full or as a link, which is what it advertises so that
   * peers can request what they lack. Audio still going up to the asset server is left out.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const audio of AudioStorage.instance.audios) {
      if (
        AudioState.COMPLETE <= audio.state &&
        !this.isOnItsWayUp(audio.identifier) &&
        !this.barred.has(audio.identifier)
      ) {
        catalog.push({ identifier: audio.identifier, state: audio.state, name: audio.name });
      }
    }
    return catalog;
  }
}
