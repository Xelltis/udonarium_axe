import { TranslateFn } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import {
  getDiceMenuItems,
  getRangeMenuEntries,
  RangeMenuItem,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Party } from '@axe/domain/party/party';

/** The table's create menu at a point, as the menus of the objects standing on the table offer it. */
export interface CreateObjectMenu {
  menuAt(position: PointerCoordinate): ContextMenuAction[];
}

/** What the create menu makes things with, and what follows a pick. */
export interface CreateMenuHands {
  readonly actions: TabletopActionService;
  readonly t: TranslateFn;
  /** Picks out what was just made, so it can be worked on at once. */
  readonly select: (made: { identifier: string; aliasName: string }) => void;
  /** Asks which die and how many, then makes them. */
  readonly makeManyDice: (position: PointerCoordinate) => void;
}

/**
 * The table's create menu at a point, in two halves.
 *
 * The halves let the table's rotating menu spread the create items over two spokes instead of
 * piling them all onto one group; the menus of objects on the table take them as one list.
 */
export function buildCreateObjectMenuGroups(
  position: PointerCoordinate,
  hands: CreateMenuHands
): [ContextMenuAction[], ContextMenuAction[]] {
  const { actions, t, select } = hands;
  const made = (name: string, sound: string, make: () => unknown): ContextMenuAction => ({
    name: t(name),
    action: () => {
      make();
      SoundEffect.play(sound);
    },
  });
  const madeAndPicked = (name: string, sound: string, make: () => { identifier: string; aliasName: string }) =>
    made(name, sound, () => select(make()));
  return [
    [
      madeAndPicked('feature.tabletop.action.createCharacter', PresetSound.piecePut, () =>
        actions.createGameCharacter(position)
      ),
      made('feature.tabletop.action.createMask', PresetSound.cardPut, () => actions.createGameTableMask(position)),
      made('feature.tabletop.action.createTerrain', PresetSound.blockPut, () => actions.createTerrain(position)),
      made('feature.tabletop.action.createNote', PresetSound.cardPut, () => actions.createTextNote(position)),
      made('feature.tabletop.action.createBlankCard', PresetSound.cardPut, () => actions.createBlankCard(position)),
      made('feature.tabletop.action.createTrump', PresetSound.cardPut, () => actions.createTrump(position)),
      diceMenu(position, hands),
    ],
    [
      madeAndPicked('feature.tabletop.action.createCoin', PresetSound.dicePut, () => actions.createCoin(position)),
      rangeMenu(position, hands),
      madeAndPicked('feature.tabletop.action.createLight', PresetSound.cardPut, () =>
        actions.createLightSource(position)
      ),
      madeAndPicked('feature.whiteBoard.action.create', PresetSound.cardPut, () => actions.createWhiteBoard(position)),
      {
        name: t('feature.tabletop.action.createAmbience'),
        action: undefined,
        subActions: GROUND_AMBIENCE_KINDS.map((kind) =>
          made(`feature.ambience.kind.${kind}`, PresetSound.cardPut, () => actions.createTableAmbience(position, kind))
        ),
      },
    ],
  ];
}

/** Everything the table's create menu offers at a point, as one list. */
export function buildCreateObjectMenu(position: PointerCoordinate, hands: CreateMenuHands): ContextMenuAction[] {
  return buildCreateObjectMenuGroups(position, hands).flat();
}

function diceMenu(position: PointerCoordinate, { actions, t, makeManyDice }: CreateMenuHands): ContextMenuAction {
  const subActions: ContextMenuAction[] = getDiceMenuItems().map((item) => ({
    name: item.menuName,
    action: () => {
      actions.createDiceSymbol(position, item.diceName, item.type, item.imagePathPrefix);
      SoundEffect.play(PresetSound.dicePut);
    },
  }));
  subActions.push({ name: t('feature.tabletop.action.createDiceMany'), action: () => makeManyDice(position) });
  return { name: t('feature.tabletop.action.createDice'), action: undefined, subActions };
}

function rangeMenu(position: PointerCoordinate, { actions, t }: CreateMenuHands): ContextMenuAction {
  const make = (item: RangeMenuItem): ContextMenuAction => ({
    name: t(item.menuName),
    action: () => {
      actions.createRangeArea(position, item.typeName);
      SoundEffect.play(PresetSound.dicePut);
    },
  });
  return {
    name: t('feature.tabletop.action.createRange'),
    action: undefined,
    subActions: getRangeMenuEntries().map((entry) =>
      entry.variants
        ? { name: t(entry.menuName), action: undefined, subActions: entry.variants.map(make) }
        : make(entry)
    ),
  };
}

/** What gathering a party on one spot is offered from. */
export interface GatherPartyHands {
  readonly isGameMaster: boolean;
  readonly parties: readonly Party[];
  readonly membersOf: (party: Party) => readonly { readonly isVisibleOnTable: boolean }[];
  readonly gather: (party: Party, bringInAway: boolean) => void;
  readonly t: TranslateFn;
}

/**
 * Gathering a party on one spot, which is the master's to offer.
 *
 * A room may keep several parties - the players, and whoever is travelling with them - so each
 * is named and picked in turn rather than the table guessing which one was meant. A party
 * nobody belongs to is shown and cannot be picked, since a party that has lost its members
 * should say so rather than going quiet.
 */
export function buildGatherPartyMenu(hands: GatherPartyHands): ContextMenuAction[] {
  if (!hands.isGameMaster || hands.parties.length === 0) return [];
  return [
    {
      name: hands.t('feature.gmTools.party.gather'),
      action: undefined,
      subActions: hands.parties.flatMap((party) => gatherOnePartyMenu(party, hands)),
    },
  ];
}

/**
 * What a party is offered as, which is one entry unless some of it is off the table.
 *
 * A party with members put away is offered twice - the ones on the table, and all of them -
 * rather than asked about after the fact. The entry says how many it will move, so which of
 * the two was wanted is read before it is picked instead of in a dialogue afterwards.
 */
function gatherOnePartyMenu(party: Party, { membersOf, gather, t }: GatherPartyHands): ContextMenuAction[] {
  const name = party.name.length ? party.name : t('common.party.unnamed');
  const members = membersOf(party);
  if (members.length === 0) return [{ name, enabled: false }];

  const away = members.filter((member) => !member.isVisibleOnTable).length;
  const here = members.length - away;
  const entries: ContextMenuAction[] = [];
  if (here > 0) {
    entries.push({
      name: away > 0 ? t('feature.gmTools.party.gatherOnTable', { name, count: here }) : name,
      action: () => gather(party, false),
    });
  }
  if (away > 0) {
    entries.push({
      name: t('feature.gmTools.party.gatherWithAway', { name, count: away }),
      action: () => gather(party, true),
    });
  }
  return entries;
}
