import { inject, Injectable, InjectionToken, Type } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { PartyService } from '@axe/application/party/party.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import {
  type DiceCreateDialogOption,
  type DiceCreateRequest,
  getDiceMenuItems,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  buildCreateObjectMenu,
  buildCreateObjectMenuGroups,
  buildGatherPartyMenu,
  CreateMenuHands,
  CreateObjectMenu,
} from '@axe/features/tabletop/create-menu/create-object-context-menu';

/**
 * Fetches the dialogue for making several dice at once, the first time it is asked for, being
 * seldom wanted. The specs hand in one of their own.
 */
export const DICE_CREATE_DIALOG_LOADER = new InjectionToken<() => Promise<Type<unknown>>>('DICE_CREATE_DIALOG_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    import('@axe/features/dice/dice-symbol-create-dialog/dice-symbol-create-dialog.component').then(
      (m) => m.DiceSymbolCreateDialogComponent
    ),
});

/** The table's create menu and its gather-a-party menu, with what they need from the room. */
@Injectable({ providedIn: 'root' })
export class CreateObjectMenuService implements CreateObjectMenu {
  private readonly actions = inject(TabletopActionService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly selection = inject(SelectionSignalService);
  private readonly modalService = inject(ModalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly partyService = inject(PartyService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly loadDiceCreateDialog = inject(DICE_CREATE_DIALOG_LOADER);

  private readonly hands: CreateMenuHands = {
    actions: this.actions,
    t: this.t,
    select: (made) => this.selection.selectObject(made.identifier, made.aliasName),
    makeManyDice: (position) => void this.openDiceCreateDialog(position),
  };

  /** Everything the create menu offers at a point, as one list. */
  menuAt(position: PointerCoordinate): ContextMenuAction[] {
    return buildCreateObjectMenu(position, this.hands);
  }

  /** The create menu at a point, in the two halves the table's rotating menu spreads over two spokes. */
  menuGroupsAt(position: PointerCoordinate): [ContextMenuAction[], ContextMenuAction[]] {
    return buildCreateObjectMenuGroups(position, this.hands);
  }

  /** Gathering a party on the spot, which only the master is offered. */
  gatherPartyMenuAt(position: PointerCoordinate): ContextMenuAction[] {
    return buildGatherPartyMenu({
      isGameMaster: this.rolePermission.isGameMaster(),
      parties: this.partyService.parties(),
      membersOf: (party) => this.partyService.membersOf(party.identifier),
      gather: (party, bringInAway) => this.actions.gatherParty(position, party, bringInAway),
      t: this.t,
    });
  }

  /** Asks which die and how many, then makes them. Nothing is made where the asking is dropped. */
  private async openDiceCreateDialog(position: PointerCoordinate): Promise<void> {
    const option: DiceCreateDialogOption = {
      defaultCount: 2,
      // The same pieces the menu of a die already offers to give it to.
      ownerCandidates: this.tabletopService.characters.map((character) => ({
        identifier: character.identifier,
        name: character.name,
      })),
    };
    const request = await this.modalService
      .openLazy<DiceCreateRequest | null>(this.loadDiceCreateDialog, {
        ...option,
        title: this.t('feature.dice.createDialog.title'),
        // A few fields in a frame half the screen wide read as a mistake. It takes the width
        // its own asking needs.
        fitWidth: true,
      })
      .catch(() => null);
    if (!request) return;

    const item = getDiceMenuItems()[request.typeIndex];
    if (!item) return;
    const made = this.actions.createDiceSymbols(position, item, request.count, {
      ownerCharacterIdentifier: request.ownerCharacterIdentifier,
      hiddenToOthers: request.hiddenToOthers,
    });
    if (made.length > 0) SoundEffect.play(PresetSound.dicePut);
  }
}
