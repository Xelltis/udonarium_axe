import { inject, Injectable } from '@angular/core';
import { SystemAvatarKind, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { buildSystemAvatarContextMenu } from '@axe/application/chat/system-avatar-context-menu';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

@Injectable({ providedIn: 'root' })
export class SystemAvatarMenuService {
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly modalService = inject(ModalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Opens the right-click menu on the avatar of a system or dice message, for changing or resetting
   * its picture and for showing or hiding avatars.
   *
   * Only a role that may edit the table gets it, and only where the pointer allows a context menu;
   * the browser's own menu is suppressed only when this one opens.
   */
  openContextMenu(event: Event, kind: SystemAvatarKind): void {
    if (!this.rolePermission.canEditTabletop) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    event.stopPropagation();
    event.preventDefault();

    const actions = buildSystemAvatarContextMenu(
      {
        kind,
        isVisible: this.systemAvatar.isVisible(),
        isSpeakerVisible: this.systemAvatar.isSpeakerVisible(),
        hasOwnImage: this.systemAvatar.hasOwnImageOfKind(kind)(),
        canEdit: this.rolePermission.canEditTabletop,
      },
      {
        changeImage: (target) => this.changeImage(target),
        resetImage: (target) => this.systemAvatar.resetImage(target),
        setVisible: (visible) => this.systemAvatar.setVisible(visible),
        setSpeakerVisible: (visible) => this.systemAvatar.setSpeakerVisible(visible),
      },
      this.t
    );
    this.contextMenuService.open(
      this.pointerDeviceService.pointers[0],
      actions,
      this.t('feature.chat.systemAvatar.title')
    );
  }

  /**
   * Asks for a picture in the image picker and sets it as the avatar for that kind of message, for
   * the whole room.
   *
   * Closing the picker without a choice leaves the avatar as it was. Does nothing for a role that
   * may not edit the table.
   */
  changeImage(kind: SystemAvatarKind): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (identifier == null) return;
      this.systemAvatar.setImage(kind, identifier);
    });
  }
}
