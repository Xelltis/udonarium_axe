import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { restoreStore, snapshotStore, StoreSnapshot } from '@axe/core/sync/store-snapshot';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

/** How long the start waits on the browser to say whether it keeps a room to start on, at most. */
const PREPARE_TIMEOUT_MS = 1500;

/** What travels with the seat rather than the table, and so is left as it is when the start room is put away. */
const SEAT_OWN = new Set(['PeerCursor', 'hotbar', 'hotbar-slot']);

/** The table as the page first set it out, before the start room went in, and what the start room brought. */
interface BeforeStartRoom {
  readonly store: StoreSnapshot;
  readonly images: ReadonlySet<string>;
  readonly audios: ReadonlySet<string>;
}

/**
 * The room this browser starts on in place of the sample: kept from the room as it stands, read
 * before the table is first set out, and forgotten again on request or with the rest of the
 * browser's data.
 *
 * It belongs to this browser alone. It is set out only while this seat has nobody else to share
 * the table with, and put away again, sample and all, before the seat goes into somebody else's
 * room, so that nothing of it goes there.
 */
@Injectable({ providedIn: 'root' })
export class StartRoomService {
  private readonly store = StartRoomStore.instance;
  private readonly saveDataService = inject(SaveDataService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly objectStore = inject(ObjectStore);
  private readonly snackbar = inject(SnackbarService);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly tabletopAction = inject(TabletopActionService);

  private readonly _isKept = signal(false);
  /** Whether this browser keeps a room to start on. */
  readonly isKept = this._isKept.asReadonly();

  private pending: Promise<Blob | null> | null = null;

  private loading: Promise<void> | null = null;
  private finishLoading: () => void = () => undefined;

  /** Set while the start room is on the table as the page left it, and so may still be put away. */
  private before: BeforeStartRoom | null = null;
  private brought: { images: readonly string[]; audios: readonly string[] } = { images: [], audios: [] };

  constructor() {
    const destroyRef = inject(DestroyRef);
    const refresh = () => void this.refreshKept();
    window.addEventListener('focus', refresh);
    destroyRef.onDestroy(() => window.removeEventListener('focus', refresh));
    // Once the seat is in a room, of its own making, what is on the table is that room's.
    inject(ObjectChangeService).networkOpen$.subscribe(() => {
      if (Network.peerContext?.isRoom) this.before = null;
    }, destroyRef);
  }

  /** Whether a room to start on was found at launch and waits to be set out in place of the sample pieces. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Resolves once the room to start on that was found at launch is set out, and at once where none
   * is being set out, so that whatever else loads a room meanwhile lands after it rather than among
   * it.
   */
  whenSettled(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  /** The start room being set out just now, to wait on, or null where none is. */
  settling(): Promise<void> | null {
    return this.loading;
  }

  /**
   * Puts the start room away before this seat goes into somebody else's room: the table goes back
   * to how the page set it out, versions and all, the pictures and sounds the start room brought go,
   * and the sample is set out, so the room joined finds this seat as it finds a browser that never
   * kept a room. The seat's own cursor and bar stay. Does nothing once the seat has been in a room,
   * or where no start room was set out.
   */
  putAway(): void {
    const before = this.before;
    if (!before || this.loading) return;
    this.before = null;
    restoreStore(before.store, (object) => SEAT_OWN.has(object.aliasName));
    for (const identifier of this.brought.images) {
      if (!before.images.has(identifier)) ImageStorage.instance.delete(identifier);
    }
    for (const identifier of this.brought.audios) {
      if (!before.audios.has(identifier)) AudioStorage.instance.delete(identifier);
    }
    this.brought = { images: [], audios: [] };
    this.tabletopAction.makeDefaultTabletopObjects();
  }

  /**
   * Asks, before the table is first set out, whether this browser keeps a room to start on, and
   * begins reading it where one is to be set out. Only whether it is kept holds the start up.
   *
   * A page opened with anything after its `#`, such as an invitation or the way back from a login,
   * is going somewhere of its own and is left the sample as before. A browser too slow to answer
   * starts on the sample too, and is told whether it keeps a room once the answer comes.
   */
  async prepare(hash: string = window.location.hash): Promise<void> {
    if (!this.store.isAvailable()) return;
    const asked = this.store.has(StartRoomStore.KEY);
    const timedOut = Symbol('timed out');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kept = await Promise.race([
      asked,
      new Promise<typeof timedOut>((resolve) => (timer = setTimeout(() => resolve(timedOut), PREPARE_TIMEOUT_MS))),
    ]);
    clearTimeout(timer);
    if (kept === timedOut) {
      void asked.then((late) => this._isKept.set(late));
      return;
    }
    this._isKept.set(kept);
    if (!kept || (hash !== '' && hash !== '#')) return;
    this.pending = this.store.get(StartRoomStore.KEY);
    this.loading = new Promise<void>((resolve) => (this.finishLoading = resolve));
  }

  /**
   * Sets out the room found at launch, as a room file dropped on the table would be.
   *
   * Once this seat is joined by others, or joins them, what remains of the start room is left: it is
   * this browser's, not theirs. Answers false only where there was a room to set out and its data
   * could not be read, which says so and leaves the table to the sample.
   */
  async loadPending(): Promise<boolean> {
    const reading = this.pending;
    this.pending = null;
    if (!reading) return false;
    try {
      const alone = () => Network.peerContexts.length < 1;
      if (!alone()) return true;
      let dataRead = false;
      try {
        const blob = await reading;
        if (blob) {
          this.objectStore.get<ReloadCheck>('ReloadCheck')?.reloadCheckStart(false);
          this.before = {
            store: snapshotStore(),
            images: new Set(ImageStorage.instance.images.map((image) => image.identifier)),
            audios: new Set(AudioStorage.instance.audios.map((audio) => audio.identifier)),
          };
          const file = new File([blob], 'start-room.zip', { type: 'application/zip' });
          const result = await this.fileArchiver.load([file], undefined, { stillWanted: alone });
          dataRead = result.dataRead;
          this.brought = { images: result.images, audios: result.audios };
        }
      } catch (reason) {
        Logger.warn('[StartRoom] could not set out the start room', reason);
      }
      if (!dataRead || !alone()) this.before = null;
      if (dataRead || !alone()) return true;
      this.snackbar.show(this.t('feature.roomArchive.startRoom.loadFailed'));
      return false;
    } finally {
      this.finishLoading();
      this.loading = null;
    }
  }

  /**
   * Keeps the room as it stands as the one this browser starts on, with every picture and sound
   * this browser holds, asking first before it replaces one kept already, in this tab or another.
   * A table holding some of it only in the shape a room server withholds is not kept, as it would
   * ask about that at every start. Answers whether it was kept.
   */
  async keepCurrent(): Promise<boolean> {
    if (!this.store.isAvailable()) {
      this.snackbar.show(this.t('feature.roomArchive.startRoom.unsupported'));
      return false;
    }
    if (isNetworkIsolated()) {
      this.snackbar.show(this.t('app.saveWhileReplayBoard'));
      return false;
    }
    if (this.saveDataService.isRoomWithheld()) {
      this.snackbar.show(this.t('feature.roomArchive.startRoom.withheld'));
      return false;
    }
    if (
      (await this.refreshKept()) &&
      !(await this.confirm.ask({
        title: this.t('feature.roomArchive.startRoom.replaceTitle'),
        message: this.t('feature.roomArchive.startRoom.replaceMessage'),
        okLabel: this.t('feature.roomArchive.startRoom.replaceOk'),
      }))
    ) {
      return false;
    }
    try {
      const blob = await this.saveDataService.createWholeRoomArchiveAsync();
      if (!(await this.store.put(StartRoomStore.KEY, blob))) throw new Error('the start room could not be written');
      this._isKept.set(true);
      this.snackbar.show(this.t('feature.roomArchive.startRoom.kept'));
      return true;
    } catch (reason) {
      Logger.warn('[StartRoom] could not keep the start room', reason);
      this.snackbar.show(this.t('feature.roomArchive.startRoom.keepFailed'));
      return false;
    }
  }

  /**
   * Forgets the room this browser starts on, once asked, so the next start sets out the sample
   * again. Answers whether it was forgotten.
   */
  async forget(): Promise<boolean> {
    if (!(await this.refreshKept())) return false;
    const agreed = await this.confirm.ask({
      title: this.t('feature.roomArchive.startRoom.forgetTitle'),
      message: this.t('feature.roomArchive.startRoom.forgetMessage'),
      okLabel: this.t('feature.roomArchive.startRoom.forgetOk'),
    });
    if (!agreed) return false;
    if (!(await this.store.remove(StartRoomStore.KEY))) {
      this.snackbar.show(this.t('feature.roomArchive.startRoom.forgetFailed'));
      return false;
    }
    this._isKept.set(false);
    this.snackbar.show(this.t('feature.roomArchive.startRoom.forgotten'));
    return true;
  }

  /** Asks the browser again whether a room is kept, as another tab may have kept or forgotten one. */
  private async refreshKept(): Promise<boolean> {
    if (!this.store.isAvailable()) return false;
    const kept = await this.store.has(StartRoomStore.KEY);
    this._isKept.set(kept);
    return kept;
  }
}
