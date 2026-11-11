import { inject, Injectable } from '@angular/core';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { tryBuildMultiSelectionContextMenu } from '@axe/application/ui/multi-selection-context-menu';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * Where a right-click on something on the board arrives.
 *
 * A group selection gets the bulk actions; only a single object earns the menu
 * built for that object alone.
 */
@Injectable({ providedIn: 'root' })
export class PieceContextMenuService {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly diceRollService = inject(DiceRollService);
  private readonly characterDice = inject(CharacterDiceService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly names = inject(PieceNameService);
  private readonly vision = inject(VisionService);

  /** True when the bulk menu was opened. The caller stops there. */
  openForSelection(self: TabletopObject, gridSize: number, position: PointerCoordinate): boolean {
    const multi = tryBuildMultiSelectionContextMenu({
      self,
      selectionSignalService: this.selectionSignalService,
      objectStore: this.objectStore,
      t: this.t,
      gridSize,
      rollDice: (dice) => this.diceRollService.roll(dice),
      diceOwners: this.objectStore
        .getObjects<GameCharacter>(GameCharacter)
        .filter((character) => character.isVisibleOnTable && this.vision.isTokenVisible(character))
        .filter((character) => !this.names.isKept(character))
        .map((character) => ({ identifier: character.identifier, name: character.name })),
      storeDice: (dice, ownerIdentifier) => this.storeDice(dice, ownerIdentifier),
    });
    if (!multi) return false;

    this.contextMenuService.open(position, multi, this.t('feature.tabletop.selection.title'));
    return true;
  }

  private storeDice(dice: DiceSymbol[], ownerIdentifier: string): void {
    const owner = this.objectStore.get<GameCharacter>(ownerIdentifier);
    if (!(owner instanceof GameCharacter)) return;

    for (const die of dice) this.characterDice.store(owner, die);
    this.selectionSignalService.clearSelection();
  }
}
