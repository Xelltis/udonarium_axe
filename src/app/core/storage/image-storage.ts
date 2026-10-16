import { Network } from '@axe/core/network/network';
import { networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_LAST_TRY_DELAY_MS, AssetRetries, receivedUploadTurnMs } from '@axe/core/storage/asset-retries';
import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';

export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
};

export class ImageStorage {
  private static _instance: ImageStorage;
  /** The one image store for the page, created on first use. */
  static get instance(): ImageStorage {
    if (!ImageStorage._instance) ImageStorage._instance = new ImageStorage();
    return ImageStorage._instance;
  }

  private imageHash: { [identifier: string]: ImageFile } = {};
  /** Images added on this seat that are queued for the asset server or going up to it. */
  private readonly uploading = new Set<string>();
  /**
   * Those added here while a room server's room could not be reached, as while the link was down,
   * which go up once the seat is back.
   */
  private readonly missedUploads = new Set<string>();
  /** What failed to go up as often as it may be tried, left for the seat's next chance. */
  private readonly gaveUp = new Set<string>();
  /** What has been given its one last try in the room the seat is in, and the timers for those to come. */
  private readonly lastTries = new Map<string, ReturnType<typeof setTimeout> | null>();
  /** Uploads that failed for now, tried again a few times while the seat stays in the room. */
  private readonly uploadRetries = new AssetRetries();

  /** Every image this seat knows of, including placeholders whose data has not arrived. */
  get images(): ImageFile[] {
    return Object.values(this.imageHash);
  }

  private readonly catalogSchedule = new CatalogSendSchedule((peer) =>
    networkSend('SYNCHRONIZE_FILE_LIST', this.getCatalog(), peer)
  );

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.imageHash)) {
      this.delete(identifier);
    }
  }

  /**
   * Reads a file the user added into the store, with its thumbnail, and tells peers about it
   * shortly after.
   *
   * Adding an image already held merges into the existing entry and returns that one.
   */
  async addAsync(arg: Blob): Promise<ImageFile> {
    const image: ImageFile = await ImageFile.createAsync(arg);

    return this._add(image, true);
  }

  /**
   * Adds an image from a link, an entry or a context received from a peer,
   * returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. A complete image also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   *
   * An entry made on this seat, rather than a context from a peer, also goes up to the asset server
   * when one is configured.
   */
  add(arg: string | ImageFile | ImageContext): ImageFile {
    let image: ImageFile;
    let isLocal = false;
    if (typeof arg === 'string') {
      image = ImageFile.create(arg);
    } else if (arg instanceof ImageFile) {
      image = arg;
      isLocal = true;
    } else {
      if (this.update(arg)) return this.imageHash[arg.identifier];
      image = ImageFile.create(arg);
    }
    return this._add(image, isLocal);
  }

  private _add(image: ImageFile, isLocal: boolean = false): ImageFile {
    if (isLocal) this.uploadToAssetStore(image, true);
    if (ImageState.COMPLETE <= image.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(image)) return this.imageHash[image.identifier];
    this.imageHash[image.identifier] = image;
    return image;
  }

  /**
   * Puts every image held in full up to the room just entered. The room server keeps each room's
   * pictures apart, so those added outside it, or brought from another room, are not there yet;
   * those that are only get asked about.
   */
  uploadAllToAssetStore(): void {
    this.uploadRetries.clear();
    this.missedUploads.clear();
    this.gaveUp.clear();
    this.clearLastTries();
    for (const image of this.images) this.uploadToAssetStore(image);
  }

  /**
   * Puts up what was added here while the room could not be reached, as on coming back on a new
   * link the server asked for, without asking again about all the rest.
   */
  uploadMissedToAssetStore(): void {
    for (const identifier of [...this.missedUploads]) {
      this.missedUploads.delete(identifier);
      const image = this.imageHash[identifier];
      if (image) this.uploadToAssetStore(image);
    }
  }

  /**
   * How many of the room's GMs and PLs come before this seat in putting up one a peer sent, set by
   * the app. It waits a turn for each, long enough for the bytes to go up, so that the first has put
   * it up before the next looks.
   */
  receivedUploadTurn: () => number = () => 0;

  /**
   * Puts an image a peer sent up to the room's asset store, for one the store was found to
   * lack: the seat that added it could not put it there, and once that seat leaves nobody else
   * might. Only a GM or a PL may put anything there, and each waits its turn among them; one that
   * finds it there by then puts nothing up. Nothing is put up for one only part of which has come,
   * such as a picture's thumbnail; the rest coming asks again.
   */
  uploadReceived(identifier: string): void {
    const held = this.imageHash[identifier];
    if (!held || held.state < ImageState.COMPLETE) return;
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
    const image = this.imageHash[identifier];
    if (image && (role === 'gm' || role === 'pl')) this.uploadToAssetStore(image);
  }

  /**
   * Puts one up to the room's asset store, or keeps it for when the room is in reach. One that went
   * up to a room the seat has left meanwhile goes up to the room it is in now as well.
   */
  private uploadToAssetStore(image: ImageFile, first = false): void {
    const store = AssetHttpStore.instance;
    const blob = image.blob;
    if (image.state !== ImageState.COMPLETE || !blob) return;
    if (!store.isEnabled) {
      if (store.isConfigured && AssetHttpStore.isAssetId(image.identifier)) this.missedUploads.add(image.identifier);
      return;
    }
    if (!AssetHttpStore.isAssetId(image.identifier) || this.uploading.has(image.identifier)) return;
    const { identifier } = image;
    const requestedIn = Network.roomKey;
    let wentUpElsewhere = false;
    this.uploading.add(identifier);
    void store
      .upload(identifier, blob, image.name, { first })
      .then((result) => {
        // Turned away for the room being out of reach, as while the link is down, it goes up once
        // the seat is back rather than spend its tries meanwhile.
        if (result === 'failed' && !store.isEnabled && store.isConfigured) {
          this.uploadRetries.forget(identifier);
          this.missedUploads.add(identifier);
          return;
        }
        const roomKey = Network.roomKey;
        if (result === 'failed') {
          if (!this.uploadRetries.schedule(identifier, () => this.retryUpload(identifier, roomKey))) {
            this.giveUp(identifier, roomKey);
          }
        } else {
          this.uploadRetries.forget(identifier);
          this.gaveUp.delete(identifier);
        }
        wentUpElsewhere = (result === 'stored' || result === 'exists') && roomKey !== requestedIn;
      })
      .finally(() => {
        this.uploading.delete(identifier);
        this.catalogSchedule.whenQuiet(100);
        if (wentUpElsewhere) this.putUpHeld(identifier);
      });
  }

  /** Tries a failed upload again, while the seat is still a GM or a PL in the room it failed for. */
  private retryUpload(identifier: string, roomKey: string | null): void {
    const role = Network.serverRole;
    if (Network.roomKey !== roomKey || (role !== 'gm' && role !== 'pl')) return;
    const image = this.imageHash[identifier];
    if (image) this.uploadToAssetStore(image);
  }

  private update(image: ImageFile | ImageContext): boolean {
    const updatingImage: ImageFile = this.imageHash[image.identifier];
    if (updatingImage) {
      updatingImage.apply(image instanceof ImageFile ? image.toContext() : image);
      return true;
    }
    return false;
  }

  /**
   * Removes the image and revokes its object URLs, returning false when it was not held. Peers are
   * not told.
   */
  /**
   * Counts as up what the room's store was found to hold, though this seat could not put it there,
   * as when another seat has since.
   */
  forgetUploaded(identifiers: readonly string[]): void {
    for (const identifier of identifiers) this.forgetUpload(identifier);
  }

  /** Stops counting one as still to go up. */
  private forgetUpload(identifier: string): void {
    this.gaveUp.delete(identifier);
    this.missedUploads.delete(identifier);
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
    const deleteImage: ImageFile = this.imageHash[identifier];
    if (deleteImage) {
      deleteImage.destroy();
      delete this.imageHash[identifier];
      return true;
    }
    return false;
  }

  /** The image held under this identifier, or null when this seat has never heard of it. */
  get(identifier: string): ImageFile | null {
    return this.imageHash[identifier] ?? null;
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
   * Whether any picture this seat is to put up has yet to reach the room's asset store: going up,
   * waiting to be tried again or for the room to be in reach, or left after failing as often as it
   * may be tried. A guest puts nothing up, so
   * only one going up counts for it.
   */
  get hasUploadsPending(): boolean {
    if (this.uploading.size > 0) return true;
    if (Network.serverRole === 'guest') return false;
    return this.uploadRetries.hasWaiting || this.missedUploads.size > 0 || this.gaveUp.size > 0;
  }

  /**
   * Whether this seat is still to put something up to the asset store: queued or going up, waiting
   * to be tried again, or waiting for the room to be in reach. Until it is there, peers are not
   * told of it, so that they fetch it from the store once it is rather than each from this seat.
   * A guest puts nothing up, so what it was to try again or put up once back is named to peers.
   */
  private isOnItsWayUp(identifier: string): boolean {
    if (this.uploading.has(identifier)) return true;
    if (Network.serverRole === 'guest') return false;
    return this.uploadRetries.isWaiting(identifier) || this.missedUploads.has(identifier);
  }

  /**
   * The images this seat holds in full or as a link, which is what it advertises so that peers can
   * request what they lack. Thumbnail-only images are left out, and so are images still going up to
   * the asset server.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const image of this.images) {
      if (ImageState.COMPLETE <= image.state && !this.isOnItsWayUp(image.identifier)) {
        catalog.push({ identifier: image.identifier, state: image.state });
      }
    }
    return catalog;
  }
}
