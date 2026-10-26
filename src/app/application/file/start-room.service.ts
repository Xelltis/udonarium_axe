import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { JukeboxEngineService } from '@axe/application/media/jukebox-engine.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver, LoadResult } from '@axe/core/storage/file-archiver';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isOrSitsUnder, restoreStore, snapshotStore, StoreSnapshot } from '@axe/core/sync/store-snapshot';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

/** How long the start waits on the browser to say whether it keeps a room to start on, at most. */
const PREPARE_TIMEOUT_MS = 1500;

/** The kinds that travel with the seat rather than the table, and so are left as they are when the start room is put away. */
const SEAT_OWN = new Set(['PeerCursor', 'hotbar', 'hotbar-slot']);

/** Whether an object is of a kind that travels with the seat. */
const isSeatOwnKind = (object: GameObject): boolean => SEAT_OWN.has(object.aliasName);

/** The table as the page first set it out, before the start room went in. */
interface TableBefore {
  readonly store: StoreSnapshot;
  readonly images: ReadonlySet<string>;
  readonly audios: ReadonlySet<string>;
}

/** Every text value somewhere in a piece of sync data, to tell what a picture or a sound is still shown by. */
function textsIn(value: unknown, into: Set<string>): Set<string> {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const item of value) textsIn(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) textsIn(item, into);
  return into;
}

/** Whether this seat is in a room, or is going into one that has yet to open. */
function isInOrGoingIntoRoom(): boolean {
  return Network.requestedRoomId !== '' || !!Network.peerContext?.isRoom;
}

/** Whether this seat has the table to itself, with nobody else connected. */
function hasTableToItself(): boolean {
  return Network.peerContexts.length < 1;
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
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly snackbar = inject(SnackbarService);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly tabletopAction = inject(TabletopActionService);
  private readonly personalVolumes = inject(PersonalVolumeService);
  private readonly jukeboxEngine = inject(JukeboxEngineService);

  private readonly _isKept = signal(false);
  /** Whether this browser keeps a room to start on. */
  readonly isKept = this._isKept.asReadonly();

  private pending: Promise<Blob | null> | null = null;

  private loading: Promise<void> | null = null;
  private finishLoading: () => void = () => undefined;

  /** The table as the page first set it out, kept while the seat has been in no room, to put the start room away by. */
  private original: TableBefore | null = null;
  /** Whether the start room is on the table just now, rather than put away for a join. */
  private startRoomOut = false;
  /** Whether the start room was put away for joins that came to nothing, and waits to be set out again. */
  private putAway = false;
  private brought: { images: readonly string[]; audios: readonly string[] } = { images: [], audios: [] };
  /** How many joins are under way, whether or not they put a start room away. */
  private joinsUnderWay = 0;
  /** How many joins have begun, to tell whether one did while the room was being kept. */
  private joinsBegun = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const refresh = () => void this.refreshKept();
    window.addEventListener('focus', refresh);
    destroyRef.onDestroy(() => window.removeEventListener('focus', refresh));
    inject(ObjectChangeService).networkOpen$.subscribe(() => {
      if (this.joinsUnderWay > 0) return;
      if (Network.peerContext?.isRoom) this.letGo();
      else this.comeBackIfOutside();
    }, destroyRef);
  }

  /** Whether a room to start on was found at launch and waits to be set out in place of the sample pieces. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Whether the room to start on found at launch is being set out just now. */
  get isSettling(): boolean {
    return this.loading !== null;
  }

  /**
   * Resolves once the room to start on that was found at launch is set out, and at once where none
   * is being set out, so that whatever else loads a room meanwhile lands after it rather than among
   * it.
   */
  whenSettled(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  /**
   * Puts the start room away before this seat goes into somebody else's room, and answers what to
   * call once the join is over. Every join calls it, whether or not a start room is out.
   *
   * The track playing stops, the table goes back to how the page set it out, versions and all, the
   * pictures and sounds the start room brought go, and the sample is set out, so the room joined
   * finds this seat as it finds a browser that never kept a room. The seat's own cursor and bar
   * stay, and so do the pictures they show, though not the start room's speaker the cursor last
   * spoke as. Told the join came to something, it lets the start room go; told it came to nothing,
   * it sets the kept start room out again, as at launch, once no join is under way and the seat
   * waits outside any room. See {@link comeBackIfOutside}.
   */
  putAwayForJoin(): (joined: boolean) => void {
    this.joinsUnderWay++;
    this.joinsBegun++;
    const original = this.original;
    if (original !== null && this.startRoomOut && !this.loading) {
      const jukebox = this.objectStore.get<Jukebox>('Jukebox');
      if (jukebox?.isPlaying) jukebox.stop();
      this.takeAway(original);
      this.tabletopAction.makeDefaultTabletopObjects();
      this.startRoomOut = false;
      this.putAway = true;
    }
    let over = false;
    return (joined) => {
      if (over) return;
      over = true;
      this.joinsUnderWay--;
      if (joined) this.letGo();
      else this.comeBackIfOutside();
    };
  }

  /**
   * Asks, before the table is first set out, whether this browser keeps a room to start on, and
   * begins reading it where one is to be set out. Only whether it is kept holds the start up, and a
   * browser that will not be asked holds nothing up at all.
   *
   * A page opened with anything after its `#`, such as an invitation or the way back from a login,
   * is going somewhere of its own and is left the sample as before. A browser too slow to answer
   * starts on the sample too, and is told whether it keeps a room once the answer comes.
   */
  async prepare(hash: string = window.location.hash): Promise<void> {
    try {
      if (!this.store.isAvailable()) return;
      const asked = this.store.has(StartRoomStore.KEY).catch(() => null);
      const timedOut = Symbol('timed out');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const kept = await Promise.race([
        asked,
        new Promise<typeof timedOut>((resolve) => (timer = setTimeout(() => resolve(timedOut), PREPARE_TIMEOUT_MS))),
      ]);
      clearTimeout(timer);
      if (kept === timedOut) {
        void asked.then((late) => {
          if (late !== null) this._isKept.set(late);
        });
        return;
      }
      if (kept !== null) this._isKept.set(kept);
      if (!kept || (hash !== '' && hash !== '#')) return;
      this.pending = this.store.get(StartRoomStore.KEY);
      this.loading = new Promise<void>((resolve) => (this.finishLoading = resolve));
    } catch (reason) {
      Logger.warn('[StartRoom] could not ask for the start room', reason);
    }
  }

  /**
   * Sets out the room found at launch, as a room file dropped on the table would be.
   *
   * Once this seat is joined by others, or joins them, what remains of the start room is left: it is
   * this browser's, not theirs. Where its data cannot be read, whatever of it came in is put away
   * again, the reader is told, and false leaves the table to the sample; a seat that made a room of
   * its own meanwhile keeps what came in, as its room has it already.
   */
  async loadPending(): Promise<boolean> {
    const reading = this.pending;
    this.pending = null;
    if (!reading) return false;
    try {
      if (!hasTableToItself()) return true;
      const before = this.tableNow();
      const result = await this.setOutKept(await reading);
      if (!hasTableToItself()) return true;
      if (result?.dataRead) {
        if (!isInOrGoingIntoRoom()) {
          this.original = before;
          this.startRoomOut = true;
        }
        return true;
      }
      if (isInOrGoingIntoRoom()) return true;
      this.takeAway(before);
      this.snackbar.show(this.t('feature.roomArchive.startRoom.loadFailed'));
      return false;
    } finally {
      this.finishLoading();
      this.loading = null;
    }
  }

  /**
   * Keeps the room as it stands as the one this browser starts on, with every picture and sound
   * this browser holds, asking first before it replaces one kept already, in this tab or another,
   * or where the browser cannot say. A start room still being set out is let finish first, and the
   * room is not kept while a join is under way, as the table is then not this seat's own: one that
   * starts while the room is being kept stops the keeping. A table holding some of it only in the
   * shape a room server withholds is not kept, as it would ask about that at every start. Answers
   * whether it was kept.
   */
  async keepCurrent(): Promise<boolean> {
    if (!this.store.isAvailable()) {
      this.snackbar.show(this.t('feature.roomArchive.startRoom.unsupported'));
      return false;
    }
    await this.whenSettled();
    if (this.joinsUnderWay > 0) {
      this.snackbar.show(this.t('feature.roomArchive.startRoom.whileJoining'));
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
    const joinsBefore = this.joinsBegun;
    const joinedMeanwhile = () => this.joinsUnderWay > 0 || this.joinsBegun !== joinsBefore;
    if (
      (await this.refreshKept()) !== false &&
      !(await this.confirm.ask({
        title: this.t('feature.roomArchive.startRoom.replaceTitle'),
        message: this.t('feature.roomArchive.startRoom.replaceMessage'),
        okLabel: this.t('feature.roomArchive.startRoom.replaceOk'),
      }))
    ) {
      return false;
    }
    try {
      if (joinedMeanwhile()) throw new JoinedMeanwhile();
      const blob = await this.saveDataService.createWholeRoomArchiveAsync();
      if (joinedMeanwhile()) throw new JoinedMeanwhile();
      if (!(await this.store.put(StartRoomStore.KEY, blob))) throw new Error('the start room could not be written');
      this._isKept.set(true);
      this.snackbar.show(this.t('feature.roomArchive.startRoom.kept'));
      return true;
    } catch (reason) {
      if (reason instanceof JoinedMeanwhile) {
        this.snackbar.show(this.t('feature.roomArchive.startRoom.whileJoining'));
        return false;
      }
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
    if ((await this.refreshKept()) === false) return false;
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

  /** The table as it stands, with the pictures and sounds held, to put a start room set out on it away by. */
  private tableNow(): TableBefore {
    return {
      store: snapshotStore(),
      images: new Set(this.imageStorage.images.map((image) => image.identifier)),
      audios: new Set(this.audioStorage.audios.map((audio) => audio.identifier)),
    };
  }

  /**
   * Sets the kept archive out on the table, as a room file dropped on it would be, stopping once the
   * table is shared, and notes what it brought; null where there was none to set out or it threw.
   */
  private async setOutKept(blob: Blob | null): Promise<LoadResult | null> {
    if (!blob) return null;
    try {
      this.objectStore.get<ReloadCheck>('ReloadCheck')?.reloadCheckStart(false);
      const file = new File([blob], 'start-room.zip', { type: 'application/zip' });
      const result = await this.fileArchiver.load([file], undefined, { stillWanted: hasTableToItself });
      this.brought = { images: result.images, audios: result.audios };
      return result;
    } catch (reason) {
      Logger.warn('[StartRoom] could not set out the start room', reason);
      return null;
    }
  }

  /** Forgets the table the page first set out, and any start room put away, once the seat is in a room. */
  private letGo(): void {
    this.original = null;
    this.putAway = false;
  }

  /**
   * Sets a start room put away for joins that came to nothing out again, once none is under way
   * and the seat waits outside any room, and lets it go where the seat is open in a room. A seat
   * still asked into a room, as one whose failed join leaves it trying again after a while, or
   * given up on, is left to the next time the network opens: into a room, or outside any.
   */
  private comeBackIfOutside(): void {
    if (!this.putAway || this.joinsUnderWay > 0) return;
    const self = Network.peerContext;
    if (self?.isRoom && self.isOpen) {
      this.letGo();
      return;
    }
    if (Network.requestedRoomId !== '') return;
    this.putAway = false;
    void this.setOutAgain();
  }

  /**
   * Sets the kept start room out again after a join that came to nothing, as at launch: what was
   * changed on it since it was kept is not put back, while what the failed join said in the chat
   * stays. A join asked for meanwhile waits for it, and a seat that is in or going into a room, or
   * shares the table, meanwhile is left as it is. Where it cannot be set out, the sample stays and
   * the reader is told.
   */
  private async setOutAgain(): Promise<void> {
    this.loading = new Promise<void>((resolve) => (this.finishLoading = resolve));
    try {
      const blob = await this.store.get(StartRoomStore.KEY);
      if (!hasTableToItself() || isInOrGoingIntoRoom()) return;
      const result = await this.setOutKept(blob);
      if (result?.dataRead) {
        this.startRoomOut = true;
        this.snackbar.show(this.t('feature.roomArchive.startRoom.backAfterJoin'));
      } else if (hasTableToItself() && !isInOrGoingIntoRoom()) {
        this.snackbar.show(this.t('feature.roomArchive.startRoom.loadFailed'));
      }
    } finally {
      this.finishLoading();
      this.loading = null;
    }
  }

  /**
   * Takes the table back to how it stood before the start room went in, with the room's volumes as
   * they were then, and lets go of the pictures and sounds the start room brought, but those the
   * seat's own things still show. The cursor's note of the speaker it last spoke as is cleared
   * first, as that speaker is the start room's.
   */
  private takeAway(before: TableBefore): void {
    const cursor = PeerCursor.myCursor;
    if (cursor) {
      cursor.lastControlImageIdentifier = '';
      cursor.lastControlCharacterName = '';
      cursor.lastControlSendFrom = '';
    }
    const shown = new Set<string>();
    for (const object of this.objectStore.getObjects<GameObject>()) {
      if (isOrSitsUnder(object, isSeatOwnKind)) textsIn(object.toContext().syncData, shown);
    }
    restoreStore(before.store, isSeatOwnKind);
    this.personalVolumes.applyToChannels();
    this.jukeboxEngine.refreshMix();
    for (const identifier of this.brought.images) {
      if (!before.images.has(identifier) && !shown.has(identifier)) this.imageStorage.delete(identifier);
    }
    for (const identifier of this.brought.audios) {
      if (!before.audios.has(identifier) && !shown.has(identifier)) this.audioStorage.delete(identifier);
    }
  }

  /**
   * Asks the browser again whether a room is kept, as another tab may have kept or forgotten one.
   * Null where the browser could not be asked, which leaves what was known as it was.
   */
  private async refreshKept(): Promise<boolean | null> {
    if (!this.store.isAvailable()) return false;
    try {
      const kept = await this.store.has(StartRoomStore.KEY);
      if (kept !== null) this._isKept.set(kept);
      return kept;
    } catch {
      return null;
    }
  }
}

/** A join began while the room was being kept as the start room, so what was taken down is not the seat's own. */
class JoinedMeanwhile extends Error {}
