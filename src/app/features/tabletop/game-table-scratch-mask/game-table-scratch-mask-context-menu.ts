import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';

interface ScratchMaskContextMenuCallbacks {
  lock: () => void;
  unlock: () => void;
}

/** The right-click menu for a scratch mask: lock or unlock through the callbacks, and delete. */
export function buildScratchMaskContextMenu(
  mask: GameTableScratchMask,
  isLocked: boolean,
  callbacks: ScratchMaskContextMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  return [
    {
      name: isLocked ? t('feature.tabletop.contextMenu.unlock') : t('feature.tabletop.contextMenu.lock'),
      action: () => {
        if (isLocked) callbacks.unlock();
        else callbacks.lock();
      },
    },
    ContextMenuSeparator,
    {
      name: t('feature.tabletop.contextMenu.delete'),
      action: () => {
        mask.destroy();
        SoundEffect.play(PresetSound.sweep);
      },
    },
  ];
}
