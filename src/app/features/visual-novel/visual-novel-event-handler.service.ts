import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VnStage } from '@axe/domain/visual-novel/vn-stage';

const STAGE_IDENTIFIER = 'VnStage';

/**
 * Looks after novel mode's stage on every screen, whether novel mode is open there or not.
 *
 * A screening whose director is no longer a game master has nobody to run it. It is ended on the
 * stage by a game master who sees it, or by the director where it may still write, so that it does
 * not start again by itself should the director be made one again.
 */
@Injectable({ providedIn: 'root' })
export class VisualNovelEventHandlerService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  /** Whether the screening on the stage was started by a seat that is no longer a game master. */
  readonly directorDemoted = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    const stage = this.stage;
    if (stage?.isDirected !== true) return false;
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const director = PeerCursor.findByPeerId(stage.directorPeerId);
    if (!director) return false;
    this.objectChange.versionOf(director.identifier)();
    return !director.isGameMaster;
  });

  constructor() {
    effect(() => {
      this.objectChange.trackMyCursor();
      if (!this.directorDemoted()) return;
      untracked(() => {
        const stage = this.stage;
        if (!stage) return;
        const mine = stage.directorPeerId === getMyPeerId();
        if (PeerCursor.isMyselfGameMaster || (mine && !PeerCursor.isMyselfKeptOffTable)) stage.stopDirecting();
      });
    });
  }

  private get stage(): VnStage | null {
    return this.objectStore.get<VnStage>(STAGE_IDENTIFIER) ?? null;
  }
}
