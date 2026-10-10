import { inject, Injectable } from '@angular/core';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { isLockedInPlace } from '@axe/domain/tabletop/lockable';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface MovableLike {
  readonly identifier: string;
  readonly tabletopObject: TabletopObject | undefined;
  posX: number;
  posY: number;
}

interface FollowerSnapshot {
  ref: MovableLike;
  startX: number;
  startY: number;
}

@Injectable({ providedIn: 'root' })
export class MultiMovableService {
  private readonly selectionSignalService = inject(SelectionSignalService);

  private readonly registry = new Map<string, MovableLike>();

  private leaderId: string | null = null;
  private leaderStartX = 0;
  private leaderStartY = 0;
  private followers: FollowerSnapshot[] = [];

  /**
   * Makes a movable piece reachable by identifier, so it can follow along when a selection it
   * belongs to is dragged.
   */
  register(ref: MovableLike): void {
    if (!ref.identifier) return;
    this.registry.set(ref.identifier, ref);
  }

  /**
   * Forgets a movable piece that is going away, ending the group drag if the piece was leading it.
   */
  unregister(ref: MovableLike): void {
    if (!ref.identifier) return;
    if (this.registry.get(ref.identifier) === ref) {
      this.registry.delete(ref.identifier);
    }
    if (this.leaderId === ref.identifier) {
      this.clear();
    } else {
      this.followers = this.followers.filter((f) => f.ref.identifier !== ref.identifier);
    }
  }

  /**
   * Starts a group drag led by one piece, and says whether anything will follow it.
   *
   * Only a selected piece leads. The other selected pieces that are registered and not locked
   * become followers, with their starting positions noted. A leader outside the selection clears
   * any earlier group and answers false.
   */
  beginDrag(leader: MovableLike): boolean {
    const selected = this.selectionSignalService.selectedObjects();
    if (!leader.identifier || !selected.has(leader.identifier)) {
      this.clear();
      return false;
    }
    this.leaderId = leader.identifier;
    this.leaderStartX = leader.posX;
    this.leaderStartY = leader.posY;
    this.followers = [];
    for (const id of selected) {
      if (id === leader.identifier) continue;
      const ref = this.registry.get(id);
      if (!ref) continue;
      if (this.isLocked(ref)) continue;
      this.followers.push({ ref, startX: ref.posX, startY: ref.posY });
    }
    return this.followers.length > 0;
  }

  /**
   * Moves every follower by however far the leader has come since the drag began. Ignored for
   * anything but the current leader.
   */
  applyLeaderDelta(leader: MovableLike): void {
    if (this.leaderId !== leader.identifier) return;
    const dx = leader.posX - this.leaderStartX;
    const dy = leader.posY - this.leaderStartY;
    for (const f of this.followers) {
      f.ref.posX = f.startX + dx;
      f.ref.posY = f.startY + dy;
    }
  }

  /** Ends the group drag, if this piece is the one leading it. */
  endDrag(leader: MovableLike): void {
    if (this.leaderId !== leader.identifier) return;
    this.clear();
  }

  /**
   * The objects following a leader in the current group drag, or nothing when that piece is not
   * leading one.
   */
  followerTabletopObjectsFor(leaderIdentifier: string): readonly TabletopObject[] {
    if (!leaderIdentifier || this.leaderId !== leaderIdentifier) return [];
    const result: TabletopObject[] = [];
    for (const f of this.followers) {
      const obj = f.ref.tabletopObject;
      if (obj) result.push(obj);
    }
    return result;
  }

  private clear(): void {
    this.leaderId = null;
    this.followers = [];
  }

  private isLocked(ref: MovableLike): boolean {
    const obj = ref.tabletopObject;
    if (!obj) return false;
    return isLockedInPlace(obj);
  }
}
