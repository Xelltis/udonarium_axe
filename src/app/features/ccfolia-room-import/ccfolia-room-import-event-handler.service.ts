import { DestroyRef, inject, Injectable, Injector } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LOAD_FAILURE_NOTICE } from '@axe/application/ui/overlay-components';
import { CcfoliaRoomDroppedEvent } from '@axe/core/event/domain-events';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import type { CcfoliaRoomImportShape } from '@axe/features/ccfolia-room-import/ccfolia-room-import.service';
import { buildRoomImportMessages } from '@axe/features/ccfolia-room-import/ccfolia-room-import-message';

const PREFIX = 'feature.tabletop.ccfoliaImport.';

@Injectable({ providedIn: 'root' })
export class CcfoliaRoomImportEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly injector = inject(Injector);
  private readonly loadFailureNotice = inject(LOAD_FAILURE_NOTICE);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    this.objectChange.ccfoliaRoomDropped$.subscribe((event) => void this.importRoom(event), this.destroyRef);
  }

  /**
   * Asks how a room of two scenes or more comes across: on one table as scenes of it, or each as
   * a table of its own, which is how it always came across and what saying no, or Escape, keeps.
   */
  private async askShape(count: number): Promise<CcfoliaRoomImportShape> {
    const asScenes = await this.confirm.ask({
      title: this.t(`${PREFIX}shapeTitle`),
      message: this.t(`${PREFIX}shapeQuestion`, { count }),
      okLabel: this.t(`${PREFIX}shapeScenes`),
      cancelLabel: this.t(`${PREFIX}shapeTables`),
    });
    return asScenes ? 'scenes' : 'tables';
  }

  private async importRoom(event: CcfoliaRoomDroppedEvent): Promise<void> {
    if (!this.rolePermission.canEditTabletop()) {
      this.chatMessageService.sendSystemNotice('room', encodeI18nMessage(`${PREFIX}errors.denied`));
      return;
    }

    // The import is fetched with the first room dropped, being seldom wanted.
    const roomImport = await import('@axe/features/ccfolia-room-import/ccfolia-room-import.service').then(
      (m) => this.injector.get(m.CcfoliaRoomImportService),
      () => null
    );
    if (!roomImport) {
      this.loadFailureNotice();
      return;
    }
    const result = await roomImport.importAsync(event.entries, (count) => this.askShape(count));
    if (!result.summary) {
      this.chatMessageService.sendSystemNotice('room', encodeI18nMessage(`${PREFIX}errors.${result.error}`));
      return;
    }

    for (const message of buildRoomImportMessages(result.summary)) {
      this.chatMessageService.sendSystemNotice('room', encodeI18nMessage(message.key, message.params));
    }
    SoundEffect.play(PresetSound.piecePut);
  }
}
