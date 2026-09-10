import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { copyBeside } from '@axe/application/ui/tabletop-context-menu-actions';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { isLockable } from '@axe/domain/tabletop/lockable';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface MultiSelectionContextDeps {
  readonly t: TranslateFn;
  readonly selectionSignalService: SelectionSignalService;
  readonly gridSize: number;
  /** Throws whatever dice are among the selection. Left out where nothing can throw them. */
  readonly rollDice?: (dice: DiceSymbol[]) => void;
  /** The pieces the selected dice can be put away into, and how to do it. */
  readonly diceOwners?: { identifier: string; name: string }[];
  readonly storeDice?: (dice: DiceSymbol[], ownerIdentifier: string) => void;
}

export function buildMultiSelectionContextMenu(
  objects: readonly TabletopObject[],
  deps: MultiSelectionContextDeps
): ContextMenuAction[] {
  const { t, selectionSignalService, gridSize, rollDice, diceOwners, storeDice } = deps;
  const count = objects.length;
  const movable = objects.filter((o) => !(isLockable(o) && o.isLock));
  const dice = objects.filter((o): o is DiceSymbol => o instanceof DiceSymbol && o.isVisible);

  return [
    {
      name: t('feature.tabletop.selection.countLabel', { count }),
      action: undefined,
    },
    ContextMenuSeparator,
    // One throw of a handful, which reads as one line in the chat.
    ...(rollDice && dice.length > 0
      ? [
          {
            name: t('feature.tabletop.selection.rollAllDice', { count: dice.length }),
            action: () => rollDice(dice),
          },
        ]
      : []),
    // A handful is put away in one go, which is how it was laid out.
    ...(storeDice && dice.length > 0 && (diceOwners ?? []).length > 0
      ? [
          {
            name: t('feature.tabletop.selection.storeAllDice', { count: dice.length }),
            action: undefined,
            subActions: (diceOwners ?? []).map((owner) => ({
              name: owner.name,
              action: () => storeDice(dice, owner.identifier),
            })),
          } as ContextMenuAction,
        ]
      : []),
    ...(rollDice && dice.length > 0 ? [ContextMenuSeparator] : []),
    {
      name: t('feature.tabletop.selection.copyAll'),
      action: () => {
        const cloned = movable.map((obj) => copyBeside(obj, gridSize).identifier);
        if (cloned.length > 0) selectionSignalService.replaceSelection(cloned);
      },
    },
    {
      name: t('feature.tabletop.selection.moveAllGraveyard'),
      action: () => {
        for (const obj of movable) {
          obj.setLocation('graveyard');
        }
        selectionSignalService.clearSelection();
      },
    },
    ContextMenuSeparator,
    {
      name: t('feature.tabletop.selection.clear'),
      action: () => selectionSignalService.clearSelection(),
    },
  ];
}

export interface TryBuildMultiSelectionContextMenuOptions {
  readonly self: TabletopObject;
  readonly selectionSignalService: SelectionSignalService;
  readonly objectStore: ObjectStore;
  readonly t: TranslateFn;
  readonly gridSize: number;
  readonly rollDice?: (dice: DiceSymbol[]) => void;
  readonly diceOwners?: { identifier: string; name: string }[];
  readonly storeDice?: (dice: DiceSymbol[], ownerIdentifier: string) => void;
}

export function tryBuildMultiSelectionContextMenu(
  options: TryBuildMultiSelectionContextMenuOptions
): ContextMenuAction[] | null {
  const { self, selectionSignalService, objectStore, t, gridSize, rollDice, diceOwners, storeDice } = options;
  if (selectionSignalService.selectionSize() <= 1) return null;
  const selected = selectionSignalService.selectedObjects();
  if (!selected.has(self.identifier)) return null;
  const objects: TabletopObject[] = [];
  for (const id of selected) {
    const obj = objectStore.get<TabletopObject>(id);
    if (obj) objects.push(obj);
  }
  if (objects.length <= 1) return null;
  return buildMultiSelectionContextMenu(objects, {
    t,
    selectionSignalService,
    gridSize,
    rollDice,
    diceOwners,
    storeDice,
  });
}
