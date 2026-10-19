import { DestroyRef, inject, Injectable, Injector } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { CcfoliaRoomDroppedEvent } from '@axe/core/event/domain-events';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { buildRoomImportMessages } from '@axe/features/tabletop/ccfolia-room-import/ccfolia-room-import-message';

const PREFIX = 'feature.tabletop.ccfoliaImport.';

@Injectable({ providedIn: 'root' })
export class CcfoliaRoomImportEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly injector = inject(Injector);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly chatMessageService = inject(ChatMessageService);

  constructor() {
    this.objectChange.ccfoliaRoomDropped$.subscribe((event) => void this.importRoom(event), this.destroyRef);
  }

  private async importRoom(event: CcfoliaRoomDroppedEvent): Promise<void> {
    if (!this.rolePermission.canEditTabletop) {
      this.chatMessageService.sendSystemMessage(encodeI18nMessage(`${PREFIX}errors.denied`));
      return;
    }

    // The import is fetched with the first room dropped, being seldom wanted.
    const roomImport = await import('@axe/application/tabletop/ccfolia-room-import.service').then(
      (m) => this.injector.get(m.CcfoliaRoomImportService),
      () => null
    );
    if (!roomImport) {
      PanelService.loadFailureNotice?.();
      return;
    }
    const result = await roomImport.importAsync(event.entries);
    if (!result.summary) {
      this.chatMessageService.sendSystemMessage(encodeI18nMessage(`${PREFIX}errors.${result.error}`));
      return;
    }

    for (const message of buildRoomImportMessages(result.summary)) {
      this.chatMessageService.sendSystemMessage(encodeI18nMessage(message.key, message.params));
    }
    SoundEffect.play(PresetSound.piecePut);
  }
}
