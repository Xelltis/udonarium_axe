import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Network } from '@axe/core/index';
import { Card, CardState } from '@axe/domain/card/card';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

/**
 * The right-click menu of a card on the table: lock, flip, peek, take into the hand, stack, flip
 * cut-in, target, edit, copy and delete.
 *
 * Entries that only touch the card act on it and play their sound here; anything that needs a
 * service goes through the callbacks. The lock mark entry appears only while the card is locked,
 * and clearing the target only while it has one. A copy is placed one grid step down and to the
 * right of the original.
 */
export function buildCardContextMenu(
  card: Card,
  gridSize: number,
  callbacks: {
    onCreateStack: () => void;
    onOverlappingToHand: () => void;
    onShowDetail: () => void;
    onFlipToFront: () => void;
    onAssignCutIn: (cutInIdentifier: string) => void;
    onPickTarget: () => void;
    onClearTarget: () => void;
  },
  cutIns: readonly { identifier: string; name: string }[],
  t: TranslateFn
): ContextMenuAction[] {
  const menuArray: ContextMenuAction[] = [];

  menuArray.push(
    card.isLock
      ? {
          name: t('feature.tabletop.contextMenu.unlock'),
          action: () => {
            card.isLock = false;
            card.dispLockMark = true;
            SoundEffect.play(PresetSound.unlock);
          },
        }
      : {
          name: t('feature.tabletop.contextMenu.lock'),
          action: () => {
            card.isLock = true;
            SoundEffect.play(PresetSound.lock);
          },
        }
  );

  if (card.isLock) {
    menuArray.push(
      card.dispLockMark
        ? {
            name: t('feature.tabletop.contextMenu.lockMarkHide'),
            action: () => {
              card.dispLockMark = false;
              SoundEffect.play(PresetSound.lock);
            },
          }
        : {
            name: t('feature.tabletop.contextMenu.lockMarkShow'),
            action: () => {
              card.dispLockMark = true;
              SoundEffect.play(PresetSound.lock);
            },
          }
    );
  }

  menuArray.push(ContextMenuSeparator);

  menuArray.push(
    !card.isVisible || card.isPeeking
      ? {
          name: t('feature.card.contextMenu.faceUp'),
          action: () => {
            card.faceUp();
            SoundEffect.play(PresetSound.cardDraw);
            callbacks.onFlipToFront();
          },
        }
      : {
          name: t('feature.card.contextMenu.faceDown'),
          action: () => {
            card.faceDown();
            SoundEffect.play(PresetSound.cardDraw);
          },
        }
  );

  menuArray.push(
    card.isPeeking
      ? {
          name: t('feature.card.contextMenu.faceDown'),
          action: () => {
            card.faceDown();
            SoundEffect.play(PresetSound.cardDraw);
          },
        }
      : {
          name: t('feature.card.contextMenu.showSelfOnly'),
          action: () => {
            SoundEffect.play(PresetSound.cardDraw);
            card.state = CardState.BACK;
            card.owner = Network.peerContext.userId;
          },
        }
  );

  menuArray.push({
    name: t('feature.card.contextMenu.toHand'),
    action: () => {
      card.toHand(Network.peerContext.userId);
      SoundEffect.play(PresetSound.cardDraw);
    },
  });

  menuArray.push(ContextMenuSeparator);

  menuArray.push({
    name: t('feature.card.contextMenu.createStack'),
    action: () => {
      callbacks.onCreateStack();
      SoundEffect.play(PresetSound.cardPut);
    },
  });
  menuArray.push({
    name: t('feature.card.contextMenu.overlappingToHand'),
    action: () => {
      callbacks.onOverlappingToHand();
      SoundEffect.play(PresetSound.cardDraw);
    },
  });
  menuArray.push({
    name: t('feature.card.contextMenu.flipCutIn'),
    subActions: [
      {
        name: t('feature.card.contextMenu.flipCutInNone'),
        action: () => {
          callbacks.onAssignCutIn('');
        },
      },
      ...cutIns.map((cutIn) => ({
        name: (card.cutInIdentifier === cutIn.identifier ? '✔ ' : '') + cutIn.name,
        action: () => {
          callbacks.onAssignCutIn(cutIn.identifier);
        },
      })),
    ],
  });
  menuArray.push({
    name: t('feature.card.contextMenu.pickTarget'),
    action: () => {
      callbacks.onPickTarget();
    },
  });
  if (0 < card.targetIdentifier.length) {
    menuArray.push({
      name: t('feature.card.contextMenu.clearTarget'),
      action: () => {
        callbacks.onClearTarget();
      },
    });
  }
  menuArray.push({
    name: t('feature.card.contextMenu.editCard'),
    action: () => {
      callbacks.onShowDetail();
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      const cloneObject = card.clone();
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.toTopmost();
      SoundEffect.play(PresetSound.cardPut);
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      card.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  });

  return menuArray;
}
