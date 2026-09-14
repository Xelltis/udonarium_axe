import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildCopyAction,
  buildLockToggleAction,
  buildToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { Network } from '@axe/core/index';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

export interface DiceOwnerCandidate {
  identifier: string;
  name: string;
}

/**
 * Builds the right-click menu for a die on the table.
 *
 * It offers rolling, opening a kept face or keeping it to oneself, which piece the die belongs to
 * and storing it on that piece, setting the face, locking, hiding the name, marking it spent, the
 * detail sheet, copying and deleting. A die whose face the reader cannot see offers no roll and no
 * face to set. The entries change the die directly and play their own sounds.
 */
export function buildDiceSymbolContextMenu(
  diceSymbol: DiceSymbol,
  gridSize: number,
  callbacks: {
    onDiceRoll: () => void;
    onShowDetail: () => void;
    /** Called with the face a die that nobody could see has just been opened on. */
    onRevealed?: (face: string) => void;
    /** Whether the reader may open a die that is somebody else's, which is the master's to do. */
    canRevealHidden?: boolean;
    /** The pieces the die can be given to. Left out where there are none to offer. */
    ownerCandidates?: DiceOwnerCandidate[];
    /** Takes the die off the table and onto the sheet of the piece it belongs to. */
    onStoreToOwner?: (ownerIdentifier: string) => void;
  },
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  if (diceSymbol.isVisible) {
    actions.push({
      name: t('feature.dice.contextMenu.rollDice'),
      action: () => callbacks.onDiceRoll(),
    });
  }

  if (actions.length) actions.push(ContextMenuSeparator);

  // A die kept back is the owner's to open, and the master's. Anyone else opening it would
  // give away the very thing that was kept, and the callout would put it in the log besides.
  if (diceSymbol.hasOwner && (diceSymbol.isMine || callbacks.canRevealHidden === true)) {
    actions.push({
      name: t('feature.dice.contextMenu.showDice'),
      action: () => {
        // Only a die that was somebody's to read has a face to call out on being opened.
        const wasHidden = diceSymbol.hasOwner;
        diceSymbol.owner = '';
        SoundEffect.play(PresetSound.unlock);
        if (wasHidden) callbacks.onRevealed?.(diceSymbol.face);
      },
    });
  }

  // A die nobody has kept back may be taken by whoever picks it up. One that is already
  // somebody's is theirs: taking it would make their roll yours to open, which is the very
  // thing opening it was closed off to protect. The master may take one all the same, being
  // able to read it either way.
  if (!diceSymbol.isMine && (!diceSymbol.hasOwner || callbacks.canRevealHidden === true)) {
    actions.push({
      name: t('feature.dice.contextMenu.showSelfOnly'),
      action: () => {
        diceSymbol.owner = Network.peerContext.userId;
        SoundEffect.play(PresetSound.lock);
      },
    });
  }

  const candidates = callbacks.ownerCandidates ?? [];
  if (candidates.length > 0 || diceSymbol.ownerCharacterIdentifier.length > 0) {
    // Whose die it is, which is apart from who may see the face.
    const subActions: ContextMenuAction[] = candidates.map((candidate) => ({
      name: `${diceSymbol.ownerCharacterIdentifier === candidate.identifier ? '☑' : '☐'} ${candidate.name}`,
      action: () => {
        diceSymbol.ownerCharacterIdentifier = candidate.identifier;
        SoundEffect.play(PresetSound.dicePut);
      },
    }));
    if (diceSymbol.ownerCharacterIdentifier.length > 0) {
      subActions.push({
        name: t('feature.dice.contextMenu.ownerNone'),
        action: () => {
          diceSymbol.ownerCharacterIdentifier = '';
          SoundEffect.play(PresetSound.sweep);
        },
      });
    }
    actions.push({ name: t('feature.dice.contextMenu.owner'), action: undefined, subActions });
  }

  // A die is put away onto the sheet of the piece that keeps it, which is where it came from.
  const owner = diceSymbol.ownerCharacterIdentifier;
  if (owner.length > 0 && callbacks.onStoreToOwner) {
    actions.push({
      name: t('feature.dice.contextMenu.storeToOwner'),
      action: () => callbacks.onStoreToOwner?.(owner),
    });
  }

  if (diceSymbol.isVisible) {
    const subActions: ContextMenuAction[] = diceSymbol.faces.map((face) => ({
      name: `${face}`,
      action: () => {
        diceSymbol.face = face;
        SoundEffect.play(PresetSound.dicePut);
      },
    }));
    actions.push({ name: t('feature.dice.contextMenu.setFace'), action: undefined, subActions });
  }

  actions.push(ContextMenuSeparator);

  actions.push(buildLockToggleAction(diceSymbol.isLock, (next) => (diceSymbol.isLock = next), t));

  actions.push(
    diceSymbol.hideName
      ? {
          name: t('feature.dice.contextMenu.hideNameOn'),
          action: () => {
            diceSymbol.hideName = false;
            SoundEffect.play(PresetSound.sweep);
          },
        }
      : {
          name: t('feature.dice.contextMenu.hideNameOff'),
          action: () => {
            diceSymbol.hideName = true;
            SoundEffect.play(PresetSound.sweep);
          },
        }
  );

  actions.push(
    buildToggleAction(diceSymbol.isUsed, (next) => (diceSymbol.isUsed = next), {
      on: t('feature.dice.contextMenu.usedOn'),
      off: t('feature.dice.contextMenu.usedOff'),
    })
  );

  actions.push(ContextMenuSeparator);

  actions.push({
    name: t('feature.character.contextMenu.showDetail'),
    action: () => callbacks.onShowDetail(),
  });
  actions.push(buildCopyAction(diceSymbol, gridSize, t, { sound: PresetSound.dicePut }));
  actions.push({
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      diceSymbol.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  });

  return actions;
}
