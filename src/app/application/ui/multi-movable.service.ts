import { inject, Injectable } from '@angular/core';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isLockedInPlace } from '@axe/domain/tabletop/lockable';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface MovableLike {
  readonly identifier: string;
  readonly tabletopObject: TabletopObject | undefined;
  posX: number;
  posY: number;
  /** Writes where it stands to its object now, rather than when it next would; none for one that writes at once. */
  commitPosition?(): void;
}

interface FollowerSnapshot {
  ref: MovableLike;
  startX: number;
  startY: number;
}

@Injectable({ providedIn: 'root' })
export class MultiMovableService {
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly links = inject(PieceLinksService);

  private readonly registry = new Map<string, MovableLike>();

  private leaderId: string | null = null;
  private leaderStartX = 0;
  private leaderStartY = 0;
  private followers: FollowerSnapshot[] = [];
  /** Whether the pieces following the current leader have already brought along what goes with them. */
  private followersCarried = false;

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
    this.clear();
    if (!leader.identifier || !selected.has(leader.identifier)) return false;
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

  /**
   * Ends the group drag, if this piece is the one leading it. A piece leading it has its followers
   * bring along what goes with them as it is let go of, through {@link carriedFollowersFor}; where
   * they have not, as where a card, a die or a board led, and the leader moved, each piece that
   * followed is written where it stands and brings along its parts, those riding it and those it
   * holds, here.
   */
  endDrag(leader: MovableLike): void {
    if (this.leaderId !== leader.identifier) return;
    if (!this.followersCarried && (leader.posX !== this.leaderStartX || leader.posY !== this.leaderStartY)) {
      this.links.carryBoundAll(this.carriedFollowersFor(leader.identifier));
    }
    this.clear();
  }

  /**
   * The pieces following a leader in the current group drag, each written where it now stands, for
   * what goes with them to be brought along, once a drag: none for any other leader, or once they
   * have been taken. A piece leading the drag takes them as it is let go of, to bring them along
   * with its own before what it was put down on is settled, and the end of the drag then leaves them.
   */
  carriedFollowersFor(leaderIdentifier: string): readonly GameCharacter[] {
    if (!leaderIdentifier || this.leaderId !== leaderIdentifier || this.followersCarried) return [];
    this.followersCarried = true;
    return this.settledFollowersFor(leaderIdentifier).filter(
      (object): object is GameCharacter => object instanceof GameCharacter
    );
  }

  /**
   * The objects following a leader in the current group drag, as {@link followerTabletopObjectsFor}
   * lists them, each written where it now stands first, so what reads them as the drag is let go of
   * reads where they were let go.
   */
  settledFollowersFor(leaderIdentifier: string): readonly TabletopObject[] {
    if (!leaderIdentifier || this.leaderId !== leaderIdentifier) return [];
    for (const f of this.followers) f.ref.commitPosition?.();
    return this.followerTabletopObjectsFor(leaderIdentifier);
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
    this.followersCarried = false;
  }

  private isLocked(ref: MovableLike): boolean {
    const obj = ref.tabletopObject;
    if (!obj) return false;
    return isLockedInPlace(obj);
  }
}
