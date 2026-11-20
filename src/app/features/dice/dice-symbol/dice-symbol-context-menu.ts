import type { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildCopyAction,
  buildLockToggleAction,
  buildToggleAction,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';

export interface DiceOwnerCandidate {
  identifier: string;
  name: string;
}

/** Who may turn, show and keep a die, and the doing of each, as the dice service holds them. */
export type DiceFaceRules = Pick<
  DiceRollService,
  'canTurn' | 'canChange' | 'canReveal' | 'canKeep' | 'setFace' | 'setNameHidden' | 'reveal' | 'keep'
>;

/**
 * Builds the right-click menu for a die on the table.
 *
 * It offers rolling, opening a kept face or keeping it to oneself, which piece the die belongs to
 * and storing it on that piece, setting the face, locking, hiding the name, marking it spent, the
 * detail sheet, copying and deleting. Rolling, setting the face, hiding the name, showing and
 * keeping are offered only where `dice` lets this seat, and done through it; the other entries
 * change the die directly. Each entry plays its own sound.
 */
export function buildDiceSymbolContextMenu(
  diceSymbol: DiceSymbol,
  gridSize: number,
  dice: DiceFaceRules,
  callbacks: {
    onDiceRoll: () => void;
    onShowDetail: () => void;
    /** The pieces the die can be given to. Left out where there are none to offer. */
    ownerCandidates?: DiceOwnerCandidate[];
    /** Takes the die off the table and onto the sheet of the piece it belongs to. */
    onStoreToOwner?: (ownerIdentifier: string) => void;
  },
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  const turns = dice.canTurn(diceSymbol);

  if (turns) {
    actions.push({
      name: t('feature.dice.contextMenu.rollDice'),
      action: () => callbacks.onDiceRoll(),
    });
  }

  if (actions.length) actions.push(ContextMenuSeparator);

  if (dice.canReveal(diceSymbol)) {
    actions.push({
      name: t('feature.dice.contextMenu.showDice'),
      action: () => dice.reveal(diceSymbol),
    });
  }

  if (dice.canKeep(diceSymbol)) {
    actions.push({
      name: t('feature.dice.contextMenu.showSelfOnly'),
      action: () => dice.keep(diceSymbol),
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
      enabled: !isWithheldHere(diceSymbol),
      action: () => callbacks.onStoreToOwner?.(owner),
    });
  }

  if (turns) {
    const subActions: ContextMenuAction[] = diceSymbol.faces.map((face) => ({
      name: `${face}`,
      action: () => {
        if (dice.setFace(diceSymbol, face)) SoundEffect.play(PresetSound.dicePut);
      },
    }));
    actions.push({ name: t('feature.dice.contextMenu.setFace'), action: undefined, subActions });
  }

  actions.push(ContextMenuSeparator);

  actions.push(buildLockToggleAction(diceSymbol.isLock, (next) => (diceSymbol.isLock = next), t));

  if (dice.canChange(diceSymbol)) {
    actions.push({
      name: t(diceSymbol.hideName ? 'feature.dice.contextMenu.hideNameOn' : 'feature.dice.contextMenu.hideNameOff'),
      action: () => {
        if (dice.setNameHidden(diceSymbol, !diceSymbol.hideName)) SoundEffect.play(PresetSound.sweep);
      },
    });
  }

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
