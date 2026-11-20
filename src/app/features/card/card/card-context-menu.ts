import type { CardGameService } from '@axe/application/card/card-game.service';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Card } from '@axe/domain/card/card';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';

/** Who may turn, peek at, take and edit a card, and the doing of each, as the card service holds them. */
export type CardRules = Pick<
  CardGameService,
  'canHandle' | 'canOpenSheet' | 'faceUp' | 'faceDown' | 'peek' | 'takeToHand'
>;

/**
 * The right-click menu of a card on the table: lock, flip, peek, take into the hand, stack, flip
 * cut-in, target, edit, copy and delete.
 *
 * Turning the card over, peeking at it, taking it into the hand and gathering it into a stack are
 * offered only where `cards` lets this seat handle it, which no seat may for a card another seat
 * connected now peeks at, and the first three are done through it; editing it is open only where this
 * seat may open its sheet. Other entries that
 * only touch the card act on it and play their sound here, and anything else that needs a service
 * goes through the callbacks. The lock mark entry appears only while the card is locked, and
 * clearing the target only while it has one. A copy is placed one grid step down and to the right of
 * the original.
 */
export function buildCardContextMenu(
  card: Card,
  gridSize: number,
  cards: CardRules,
  callbacks: {
    onCreateStack: () => void;
    onOverlappingToHand: () => void;
    onShowDetail: () => void;
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

  if (cards.canHandle(card)) {
    menuArray.push(
      !card.isVisible || card.isPeeking
        ? { name: t('feature.card.contextMenu.faceUp'), action: () => cards.faceUp(card) }
        : { name: t('feature.card.contextMenu.faceDown'), action: () => cards.faceDown(card) }
    );
    menuArray.push(
      card.isPeeking
        ? { name: t('feature.card.contextMenu.faceDown'), action: () => cards.faceDown(card) }
        : { name: t('feature.card.contextMenu.showSelfOnly'), action: () => cards.peek(card) }
    );
    menuArray.push({ name: t('feature.card.contextMenu.toHand'), action: () => cards.takeToHand([card]) });
    menuArray.push(ContextMenuSeparator);
  }

  if (cards.canHandle(card)) {
    menuArray.push({
      name: t('feature.card.contextMenu.createStack'),
      action: () => {
        callbacks.onCreateStack();
        SoundEffect.play(PresetSound.cardPut);
      },
    });
  }
  menuArray.push({
    name: t('feature.card.contextMenu.overlappingToHand'),
    action: () => callbacks.onOverlappingToHand(),
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
    enabled: cards.canOpenSheet(card),
    action: () => {
      callbacks.onShowDetail();
    },
  });
  menuArray.push({
    name: t('feature.tabletop.contextMenu.copy'),
    enabled: !isWithheldHere(card),
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
