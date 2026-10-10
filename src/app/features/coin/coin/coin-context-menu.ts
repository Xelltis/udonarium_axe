import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Coin } from '@axe/domain/coin/coin';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

/**
 * The right-click menu of a coin on the table: flip, turn face up or down, lock, edit, copy and delete.
 *
 * Turning, locking, copying and deleting act on the coin directly and play their sounds; flipping and
 * editing are left to the callbacks. A copy is offset by one grid cell and brought to the top.
 */
export function buildCoinContextMenu(
  coin: Coin,
  gridSize: number,
  callbacks: {
    onFlip: () => void;
    onShowDetail: () => void;
  },
  t: TranslateFn
): ContextMenuAction[] {
  const menuArray: ContextMenuAction[] = [];

  menuArray.push({
    name: t('feature.coin.contextMenu.flip'),
    action: () => {
      callbacks.onFlip();
    },
  });

  menuArray.push(
    coin.isFront
      ? {
          name: t('feature.coin.contextMenu.faceDown'),
          action: () => {
            coin.face = 'back';
            SoundEffect.play(PresetSound.cardDraw);
          },
        }
      : {
          name: t('feature.coin.contextMenu.faceUp'),
          action: () => {
            coin.face = 'front';
            SoundEffect.play(PresetSound.cardDraw);
          },
        }
  );

  menuArray.push(ContextMenuSeparator);

  menuArray.push(
    coin.isLock
      ? {
          name: t('feature.tabletop.contextMenu.unlock'),
          action: () => {
            coin.isLock = false;
            SoundEffect.play(PresetSound.unlock);
          },
        }
      : {
          name: t('feature.tabletop.contextMenu.lock'),
          action: () => {
            coin.isLock = true;
            SoundEffect.play(PresetSound.lock);
          },
        }
  );

  menuArray.push({
    name: t('feature.coin.contextMenu.editCoin'),
    action: () => {
      callbacks.onShowDetail();
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const cloneObject = coin.clone() as Coin;
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.toTopmost();
      SoundEffect.play(PresetSound.cardPut);
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      coin.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  });

  return menuArray;
}
