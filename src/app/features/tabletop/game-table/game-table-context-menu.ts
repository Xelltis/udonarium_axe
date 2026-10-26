import { TranslateFn } from '@axe/application/i18n/translate.token';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
} from '@axe/application/ui/context-menu.service';
import { buildToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { buildRevealMenu, ConcealedEntry } from '@axe/features/disclosure/concealment-context-menu';
import {
  buildPressedGroundMenu,
  PressedGroundEntry,
} from '@axe/features/tabletop/board-switch/board-switch-context-menu';

/** The table's right-click menu, both as a plain list and as the groups of the rotating menu. */
export interface GameTableMenu {
  readonly actions: ContextMenuAction[];
  readonly rotatingGroups: ContextMenuRadialGroup[];
}

/** What the table's menu has to offer at a point, as the table and the reader stand. */
export interface GameTableMenuState {
  /** The entries for making things there, in the two halves the rotating menu shows them as. */
  readonly create: readonly [readonly ContextMenuAction[], readonly ContextMenuAction[]];
  /** The entries for gathering a party there, empty for anybody but the master or in a room with no parties. */
  readonly party: readonly ContextMenuAction[];
  /** Whether the reader may bring back what is out of sight and set pressed ground back, as the master may. */
  readonly canEditSwitches: boolean;
  /** What the master has put out of sight. */
  readonly concealed: readonly ConcealedEntry[];
  /** The painted ground that has been pressed. */
  readonly pressedGround: readonly PressedGroundEntry[];
  /** Whether the screen is laid out for a phone, where making a piece with options is offered too. */
  readonly mobile: boolean;
  /** Whether the table is seen in 2D, where the view can be held still. */
  readonly mode2d: boolean;
  /** Whether the view is held still now. */
  readonly viewLocked: boolean;
  /** Whether the view can be put back on real size: the screen is measured and drawn without perspective. */
  readonly canSnapToRealSize: boolean;
}

/** What the table's menu does once an entry is chosen. */
export interface GameTableMenuHands {
  /** Opens the dialogue for making a deck at the point. */
  openDeckBuilder(): void;
  /** Opens the panel for making a piece with options. */
  openCharacterGenerator(): void;
  /** Opens the table's settings. */
  openTableSetting(): void;
  /** Holds the view still, or lets it go. */
  setViewLocked(locked: boolean): void;
  /** Puts the view back on real size, which holds it still as well. */
  snapToRealSize(): void;
}

/**
 * The table's right-click menu for a point on the table.
 *
 * It offers making objects there, making a deck, gathering a party for the game master, bringing back
 * what is out of sight and setting pressed ground back, the table's settings and, in 2D, holding the
 * view still. The rotating menu shows the same entries in groups, so the two answer alike.
 */
export function buildGameTableContextMenu(
  state: GameTableMenuState,
  hands: GameTableMenuHands,
  t: TranslateFn
): GameTableMenu {
  const primaryCreateActions = [...state.create[0]];
  const secondaryCreateActions: ContextMenuAction[] = [
    ...state.create[1],
    { name: t('feature.tabletop.action.createDeck'), action: () => hands.openDeckBuilder() },
  ];
  if (state.mobile) {
    secondaryCreateActions.push({
      name: t('feature.tabletop.contextMenu.createWithOptions'),
      action: () => hands.openCharacterGenerator(),
    });
  }
  const tableSettingActions: ContextMenuAction[] = [
    { name: t('feature.tabletop.tableSetting.title'), action: () => hands.openTableSetting() },
    ...buildViewLockMenu(state, hands, t),
  ];
  const partyActions = [...state.party];
  // The entry goes in whole, the way the ambience entry does: the rotating menu opens what has
  // sub-entries rather than being handed them, and a group holding the same entries the flat menu
  // does is what keeps the two menus answering alike.
  const revealActions = buildRevealMenu(state.canEditSwitches, state.concealed, t);
  const pressedActions = buildPressedGroundMenu(state.canEditSwitches, state.pressedGround, t);
  return {
    actions: [
      ...primaryCreateActions,
      ContextMenuSeparator,
      ...secondaryCreateActions,
      ContextMenuSeparator,
      ...(partyActions.length > 0 ? [...partyActions, ContextMenuSeparator] : []),
      ...(revealActions.length > 0 ? [...revealActions, ContextMenuSeparator] : []),
      ...(pressedActions.length > 0 ? [...pressedActions, ContextMenuSeparator] : []),
      ...tableSettingActions,
    ],
    rotatingGroups: [
      { name: t('feature.tabletop.contextMenu.createObject1'), icon: 'add_circle', actions: primaryCreateActions },
      { name: t('feature.tabletop.contextMenu.createObject2'), icon: 'add_box', actions: secondaryCreateActions },
      ...(partyActions.length > 0
        ? [{ name: t('feature.gmTools.party.title'), icon: 'group', actions: partyActions }]
        : []),
      ...(revealActions.length > 0
        ? [{ name: t('feature.boardSwitch.menu.concealed'), icon: 'visibility', actions: revealActions }]
        : []),
      ...(pressedActions.length > 0
        ? [{ name: t('feature.boardSwitch.menu.reset'), icon: 'restart_alt', actions: pressedActions }]
        : []),
      { name: t('feature.tabletop.tableSetting.title'), icon: 'tune', actions: tableSettingActions },
    ],
  };
}

/**
 * Holding the view still, and putting it back on real size.
 *
 * Only in 2D, where a screen is laid flat and the miniatures sit on it. The entries go into both
 * menus because the flat one is what the four-way hamburger opens when the rotating menu is off, and
 * a table using that would otherwise have no way to reach them. Real size is offered only where it
 * would do something: under perspective there is no one scale to set, and an entry that quietly does
 * nothing is worse than one that is not there.
 */
export function buildViewLockMenu(
  state: Pick<GameTableMenuState, 'mode2d' | 'viewLocked' | 'canSnapToRealSize'>,
  hands: Pick<GameTableMenuHands, 'setViewLocked' | 'snapToRealSize'>,
  t: TranslateFn
): ContextMenuAction[] {
  if (!state.mode2d) return [];
  const actions: ContextMenuAction[] = [
    buildToggleAction(state.viewLocked, (next) => hands.setViewLocked(next), {
      on: t('feature.tabletop.contextMenu.viewLockOn'),
      off: t('feature.tabletop.contextMenu.viewLockOff'),
    }),
  ];
  if (state.canSnapToRealSize) {
    actions.push({ name: t('feature.tabletop.contextMenu.snapToRealSize'), action: () => hands.snapToRealSize() });
  }
  return actions;
}
