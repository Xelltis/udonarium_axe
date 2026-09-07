import { DestroyRef, inject, Injectable } from '@angular/core';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SNAPSHOT_BUSY_RETRY_MS, snapshotDelays } from '@axe/features/room-archive/room-snapshot-schedule';

const IDLE_CALLBACK_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class RoomArchiveEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly roomSnapshot = inject(RoomSnapshotService);
  private readonly pointerDevice = inject(PointerDeviceService);

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private isDirty = false;

  constructor() {
    this.objectChange.objectChanged$.subscribe(() => this.markDirty(), this.destroyRef);
    this.objectChange.objectAdded$.subscribe(() => this.markDirty(), this.destroyRef);
    this.objectChange.objectRemoved$.subscribe(() => this.markDirty(), this.destroyRef);
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  async flush(): Promise<void> {
    this.clearTimers();
    if (!this.isDirty) return;
    if (!this.roomSnapshot.isKeeping()) return;
    if (!this.rolePermission.canEditTabletop) return;
    if (this.roomSnapshot.isRestoring() || this.isBusy()) {
      this.retryLater();
      return;
    }
    await this.whenIdle();
    if (this.roomSnapshot.isRestoring() || this.isBusy()) {
      this.retryLater();
      return;
    }
    this.isDirty = false;
    await this.roomSnapshot.capture();
  }

  private isBusy(): boolean {
    return this.pointerDevice.isDragging;
  }

  private whenIdle(): Promise<void> {
    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback !== 'function') return Promise.resolve();
    return new Promise<void>((resolve) => idleCallback(() => resolve(), { timeout: IDLE_CALLBACK_TIMEOUT_MS }));
  }

  private retryLater(): void {
    this.isDirty = true;
    this.clearTimers();
    this.idleTimer = setTimeout(() => void this.flush(), SNAPSHOT_BUSY_RETRY_MS);
  }

  private markDirty(): void {
    if (!this.roomSnapshot.isSupported || !this.roomSnapshot.isKeeping()) return;
    this.isDirty = true;
    const { idle, max } = snapshotDelays(this.roomSnapshot.lastCaptureMs());
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.flush(), idle);
    if (this.maxTimer === null) this.maxTimer = setTimeout(() => void this.flush(), max);
  }

  private clearTimers(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    if (this.maxTimer !== null) clearTimeout(this.maxTimer);
    this.idleTimer = null;
    this.maxTimer = null;
  }
}
