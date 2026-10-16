import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VnStage } from '@axe/domain/visual-novel/vn-stage';
import { VisualNovelEventHandlerService } from '@axe/features/visual-novel/visual-novel-event-handler.service';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';

const STAGE_IDENTIFIER = 'VnStage';

@Injectable({ providedIn: 'root' })
export class VisualNovelDirectorService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly playback = inject(VisualNovelPlaybackService);

  private readonly _following = signal(true);

  readonly following = this._following.asReadonly();

  /** Whether the screening on the stage was started by a seat no longer a game master. */
  private readonly directorDemoted = inject(VisualNovelEventHandlerService).directorDemoted;

  /**
   * Whether a screening is running. One whose director was made a player or a guest meanwhile has
   * nobody left to run it, so it counts as over, and every screen goes back to reading alone.
   */
  readonly isDirected = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.isDirected === true && !this.directorDemoted();
  });

  readonly directorPeerId = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.directorPeerId ?? '';
  });

  private readonly playheadIdentifier = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.playheadIdentifier ?? '';
  });

  private readonly playheadTabIdentifier = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.playheadTabIdentifier ?? '';
  });

  readonly canDirect = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  /** Whether this seat runs the screening: it started it, and is a game master still. */
  readonly isDirector = computed(
    () => this.isDirected() && this.directorPeerId() === getMyPeerId() && this.canDirect()
  );

  readonly isFollowing = computed(() => this.isDirected() && !this.isDirector() && this._following());

  readonly isDetached = computed(() => this.isDirected() && !this.isDirector() && !this._following());

  private get stage(): VnStage | null {
    return this.objectStore.get<VnStage>(STAGE_IDENTIFIER) ?? null;
  }

  constructor() {
    effect(() => {
      const message = this.playback.currentMessage();
      const tabIdentifier = this.playback.chatTabIdentifier();
      if (!this.isDirector()) return;
      untracked(() => this.stage?.setPlayhead(tabIdentifier, message?.identifier ?? ''));
    });

    effect(() => {
      const identifier = this.playheadIdentifier();
      const tabIdentifier = this.playheadTabIdentifier();
      if (!this.isFollowing()) return;
      untracked(() => {
        if (tabIdentifier.length > 0 && tabIdentifier !== this.playback.chatTabIdentifier()) {
          // A tab this reader may not read is not followed into; they stay on the one they are on.
          if (!this.playback.availableChatTabs().some((tab) => tab.identifier === tabIdentifier)) return;
          this.playback.setChatTab(tabIdentifier);
        }
        this.playback.jumpToIdentifier(identifier);
      });
    });

    effect(() => {
      if (this.isDirected()) return;
      untracked(() => this._following.set(true));
    });
  }

  /**
   * Starts directing the room's novel stage from this peer, or stops if this peer is already directing.
   *
   * While directing, every other screen follows the line this one is reading. Only the game master
   * may direct; starting takes the stage over from whoever was directing before.
   */
  toggleDirecting(): void {
    if (!this.canDirect()) return;
    const stage = this.stage;
    if (!stage) return;
    if (stage.isDirected && stage.directorPeerId === getMyPeerId()) {
      stage.stopDirecting();
      return;
    }
    stage.startDirecting(getMyPeerId());
  }

  /**
   * Stops this screen following the director, so the reader can move through the lines alone.
   *
   * Called whenever the reader steps, jumps or opens the backlog. Does nothing unless following.
   */
  leaveFollowing(): void {
    if (!this.isFollowing()) return;
    this._following.set(false);
  }

  /** Goes back to following the director's line, from the rejoin button; does nothing when nobody directs. */
  rejoinFollowing(): void {
    if (!this.isDirected()) return;
    this._following.set(true);
  }
}
