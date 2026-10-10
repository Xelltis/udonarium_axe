import { SystemAvatarKind } from '@axe/application/chat/system-avatar.service';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

export interface SystemAvatarMenuState {
  kind: SystemAvatarKind;
  isVisible: boolean;
  isSpeakerVisible: boolean;
  hasOwnImage: boolean;
  canEdit: boolean;
}

export interface SystemAvatarMenuHandlers {
  changeImage: (kind: SystemAvatarKind) => void;
  resetImage: (kind: SystemAvatarKind) => void;
  setVisible: (visible: boolean) => void;
  setSpeakerVisible: (visible: boolean) => void;
}

const KIND_LABEL_KEY: Record<SystemAvatarKind, string> = {
  system: 'feature.chat.systemAvatar.kindSystem',
  dice: 'feature.chat.systemAvatar.kindDice',
};

/**
 * The menu on the system's portrait in chat: change or reset its picture, and show or hide the
 * portraits.
 *
 * Readers who may not edit the room's settings get an empty menu.
 */
export function buildSystemAvatarContextMenu(
  state: SystemAvatarMenuState,
  handlers: SystemAvatarMenuHandlers,
  t: TranslateFn
): ContextMenuAction[] {
  if (!state.canEdit) return [];
  return [
    {
      name: t('feature.chat.systemAvatar.changeImage', { kind: t(KIND_LABEL_KEY[state.kind]) }),
      action: () => handlers.changeImage(state.kind),
    },
    {
      name: t('feature.chat.systemAvatar.resetImage'),
      enabled: state.hasOwnImage,
      action: () => handlers.resetImage(state.kind),
    },
    ContextMenuSeparator,
    {
      name: (state.isVisible ? '☑ ' : '☐ ') + t('feature.chat.systemAvatar.show'),
      action: () => handlers.setVisible(!state.isVisible),
    },
    {
      name: (state.isSpeakerVisible ? '☑ ' : '☐ ') + t('feature.chat.systemAvatar.showSpeaker'),
      action: () => handlers.setSpeakerVisible(!state.isSpeakerVisible),
    },
  ];
}
