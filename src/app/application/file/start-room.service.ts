import { inject, Injectable, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

/** How long the start waits on the browser for the room to start on, at most. */
const PREPARE_TIMEOUT_MS = 1500;

/**
 * The room this browser starts on in place of the sample: kept from the room as it stands, read
 * before the table is first set out, and forgotten again on request or with the rest of the
 * browser's data.
 *
 * It belongs to this browser alone. Joining somebody's room replaces it as it replaces the sample.
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

  private readonly _isKept = signal(false);
  /** Whether this browser keeps a room to start on. */
  readonly isKept = this._isKept.asReadonly();

  private pending: Blob | null = null;

  /** Whether the room to start on was read at launch and waits to be set out in place of the sample pieces. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Reads the room to start on before the table is first set out, if this browser keeps one.
   *
   * A page opened with anything after its `#`, such as an invitation or the way back from a login,
   * is going somewhere of its own and is left the sample as before. A browser too slow to answer
   * starts on the sample too, and is told whether it keeps a room once the answer comes.
   */
  async prepare(hash: string = window.location.hash): Promise<void> {
    if (!this.store.isAvailable()) return;
    const read = this.store.get(StartRoomStore.KEY).catch((reason: unknown) => {
      Logger.warn('[StartRoom] could not read the start room', reason);
      return null;
    });
    const timedOut = Symbol('timed out');
    const blob = await Promise.race([
      read,
      new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), PREPARE_TIMEOUT_MS)),
    ]);
    if (blob === timedOut) {
      void read.then((late) => this._isKept.set(late !== null));
      return;
    }
    this._isKept.set(blob !== null);
    if (blob && (hash === '' || hash === '#')) this.pending = blob;
  }

  /**
   * Sets out the room read at launch, as a room file dropped on the table would be.
   *
   * A room the page goes into meanwhile is left as it is, and so is what remains of the start room
   * once it has. Answers false only where there was a room to set out and its data could not be
   * read, which says so and leaves the table to the sample.
   */
  async loadPending(): Promise<boolean> {
    const blob = this.pending;
    this.pending = null;
    if (!blob) return false;
    const outsideRoom = () => (Network.peerContext?.roomName ?? '') === '';
    if (!outsideRoom()) return true;
    let dataRead = false;
    try {
      this.objectStore.get<ReloadCheck>('ReloadCheck')?.reloadCheckStart(false);
      const file = new File([blob], 'start-room.zip', { type: 'application/zip' });
      dataRead = (await this.fileArchiver.load([file], undefined, { stillWanted: outsideRoom })).dataRead;
    } catch (reason) {
      Logger.warn('[StartRoom] could not set out the start room', reason);
    }
    if (dataRead || !outsideRoom()) return true;
    this.snackbar.show(this.t('feature.roomArchive.startRoom.loadFailed'));
    return false;
  }

  /**
   * Keeps the room as it stands as the one this browser starts on, with every picture and sound
   * this browser holds, asking first before it replaces one kept already. Answers whether it was
   * kept.
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
    if (
      this._isKept() &&
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
    if (!this._isKept()) return false;
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
}
