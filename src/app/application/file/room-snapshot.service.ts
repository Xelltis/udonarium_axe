import { inject, Injectable, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { RoomSnapshotMeta, RoomSnapshotStore, selectExpiredSnapshots } from '@axe/core/storage/room-snapshot-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

const STOPPED_KEY = 'room-snapshot-stopped';

@Injectable({ providedIn: 'root' })
export class RoomSnapshotService {
  private readonly store = inject(RoomSnapshotStore);
  private readonly saveDataService = inject(SaveDataService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly objectStore = inject(ObjectStore);

  private readonly _snapshots = signal<readonly RoomSnapshotMeta[]>([]);
  readonly snapshots = this._snapshots.asReadonly();

  private readonly _isCapturing = signal(false);
  readonly isCapturing = this._isCapturing.asReadonly();

  private readonly _isRestoring = signal(false);
  readonly isRestoring = this._isRestoring.asReadonly();

  private readonly _lastCaptureMs = signal(0);
  readonly lastCaptureMs = this._lastCaptureMs.asReadonly();

  /**
   * Whether the room is being kept as it goes.
   *
   * Written down here rather than in the room, since the snapshots are this browser's own:
   * one seat turning the keeping off is not a decision to make for everybody else's.
   */
  readonly isKeeping = signal(!storedStopped());

  setKeeping(keeping: boolean): void {
    this.isKeeping.set(keeping);
    try {
      localStorage.setItem(STOPPED_KEY, keeping ? '' : '1');
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }

  get isSupported(): boolean {
    return this.store.isAvailable();
  }

  get latest(): RoomSnapshotMeta | null {
    return this._snapshots()[0] ?? null;
  }

  async refresh(): Promise<readonly RoomSnapshotMeta[]> {
    if (!this.isSupported) return [];
    const metas = await this.store.list();
    this._snapshots.set(metas);
    return metas;
  }

  async capture(): Promise<RoomSnapshotMeta | null> {
    if (!this.isSupported || this._isCapturing()) return null;
    this._isCapturing.set(true);
    const startedAt = performance.now();
    try {
      const blob = await this.saveDataService.createRoomArchiveAsync();
      const id = await this.store.put({ roomName: this.currentRoomName(), savedAt: Date.now(), blob });
      if (id == null) return null;
      await this.prune();
      const metas = await this.refresh();
      return metas.find((meta) => meta.id === id) ?? null;
    } catch (reason) {
      Logger.warn('[RoomSnapshot] スナップショットの保存に失敗しました', reason);
      return null;
    } finally {
      this._lastCaptureMs.set(performance.now() - startedAt);
      this._isCapturing.set(false);
    }
  }

  async restore(id: number): Promise<boolean> {
    if (!this.isSupported || this._isRestoring()) return false;
    this._isRestoring.set(true);
    try {
      const record = await this.store.get(id);
      if (!record) return false;

      const reloadCheck = this.objectStore.get<ReloadCheck>('ReloadCheck');
      reloadCheck?.reloadCheckStart(this.currentRoomName() !== '');

      await this.fileArchiver.load([new File([record.blob], 'room-snapshot.zip', { type: 'application/zip' })]);
      return true;
    } catch (reason) {
      Logger.warn('[RoomSnapshot] スナップショットの復元に失敗しました', reason);
      return false;
    } finally {
      this._isRestoring.set(false);
    }
  }

  async remove(id: number): Promise<void> {
    if (!this.isSupported) return;
    await this.store.remove(id);
    await this.refresh();
  }

  async clear(): Promise<void> {
    if (!this.isSupported) return;
    await this.store.clear();
    await this.refresh();
  }

  private async prune(): Promise<void> {
    const expired = selectExpiredSnapshots(await this.store.list());
    for (const id of expired) {
      await this.store.remove(id);
    }
  }

  private currentRoomName(): string {
    return Network.peerContext?.roomName ?? '';
  }
}

function storedStopped(): boolean {
  try {
    return localStorage.getItem(STOPPED_KEY) === '1';
  } catch {
    return false;
  }
}
