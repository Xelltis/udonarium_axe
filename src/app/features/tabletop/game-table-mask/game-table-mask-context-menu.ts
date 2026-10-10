import { TranslateFn } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { buildAltitudeAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';

export interface MaskMenuParams {
  mask: GameTableMask;
  gridSize: number;
  objectPosition: PointerCoordinate;
  inventoryService: GameObjectInventoryService;
  tabletopActionService: TabletopActionService;
  onStartScratch(): void;
  onFinishScratch(): void;
  onCancelScratch(): void;
  onEdit(mask: GameTableMask): void;
  t: TranslateFn;
}

/**
 * The right-click menu for a mask: altitude, lock and lock mark, scratching, edit, copy, delete,
 * and creating an object where the menu was opened.
 *
 * A user who is not scratching this mask is offered to start; the one who is gets finish and
 * cancel, which the callbacks carry out. A copy is placed one cell down and to the right, unlocked.
 */
export function buildGameTableMaskContextMenu(params: MaskMenuParams): ContextMenuAction[] {
  const {
    mask,
    gridSize,
    objectPosition,
    inventoryService,
    tabletopActionService,
    onStartScratch,
    onFinishScratch,
    onCancelScratch,
    onEdit,
    t,
  } = params;

  const menuArray: ContextMenuAction[] = [];
  menuArray.push(
    buildAltitudeAction(mask, t, {
      onChanged: () => inventoryService.notifyInventoryUpdate(),
    }),
    ContextMenuSeparator,
    mask.isLock
      ? {
          name: t('feature.tabletop.contextMenu.unlock'),
          action: () => {
            mask.isLock = false;
            mask.dispLockMark = true;
            SoundEffect.play(PresetSound.unlock);
          },
        }
      : {
          name: t('feature.tabletop.contextMenu.lock'),
          action: () => {
            mask.isLock = true;
            SoundEffect.play(PresetSound.lock);
          },
        }
  );
  if (mask.isLock) {
    menuArray.push(
      mask.dispLockMark
        ? {
            name: t('feature.tabletop.contextMenu.lockMarkHide'),
            action: () => {
              mask.dispLockMark = false;
              SoundEffect.play(PresetSound.lock);
            },
          }
        : {
            name: t('feature.tabletop.contextMenu.lockMarkShow'),
            action: () => {
              mask.dispLockMark = true;
              SoundEffect.play(PresetSound.lock);
            },
          }
    );
  }
  if (!mask.isMine) {
    menuArray.push({
      name: t('feature.tabletop.contextMenu.scratchStart'),
      action: () => {
        SoundEffect.play(PresetSound.cardDraw);
        onStartScratch();
        SoundEffect.play(PresetSound.lock);
      },
    });
  } else {
    menuArray.push({
      name: t('feature.tabletop.contextMenu.scratchFinish'),
      action: () => {
        onFinishScratch();
      },
    });
  }
  if (mask.isMine) {
    menuArray.push({
      name: t('feature.tabletop.contextMenu.scratchCancel'),
      action: () => {
        SoundEffect.play(PresetSound.cardDraw);
        onCancelScratch();
      },
    });
  }

  menuArray.push(ContextMenuSeparator);
  menuArray.push({
    name: t('feature.tabletop.contextMenu.maskEdit'),
    action: () => {
      onEdit(mask);
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const cloneObject = mask.clone();
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.isLock = false;
      if (mask.parent) mask.parent.appendChild(cloneObject);
      SoundEffect.play(PresetSound.cardPut);
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      mask.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  });
  menuArray.push(ContextMenuSeparator);
  menuArray.push({
    name: t('feature.tabletop.contextMenu.createObject'),
    action: undefined,
    subActions: tabletopActionService.makeDefaultContextMenuActions(objectPosition),
  });
  return menuArray;
}
