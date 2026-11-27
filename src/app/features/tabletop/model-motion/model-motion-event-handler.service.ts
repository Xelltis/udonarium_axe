import { DestroyRef, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ModelActsService } from '@axe/application/tabletop/model-acts.service';
import { modelMotion$ } from '@axe/core/event/domain-events';

/**
 * Plays on this screen a motion a seat asks a piece's model to play on every screen, as a gesture
 * from the piece's menu or a line of chat, but only as asked by a seat that may change the table:
 * asked by a guest, or by a peer nobody knows, nothing is played.
 */
@Injectable({ providedIn: 'root' })
export class ModelMotionEventHandlerService {
  private readonly modelActs = inject(ModelActsService);
  private readonly permission = inject(RolePermissionService);

  constructor() {
    modelMotion$.subscribe((event) => {
      if (this.permission.canPeerEditTabletop(event.from))
        this.modelActs.play(event.identifier, event.motion, { named: event.named === true });
    }, inject(DestroyRef));
  }
}
