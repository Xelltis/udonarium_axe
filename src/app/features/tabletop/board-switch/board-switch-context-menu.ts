import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

export interface BoardSwitchMenuState {
  /** Whether this seat writes switches, which only the master does. */
  canEdit: boolean;
  hasSwitch: boolean;
  /** Whether the thing opens and shuts when clicked, which a switch would take the click from. */
  isDoor: boolean;
  /** Whether the switch has been pressed in a way it counts. */
  pressed?: boolean;
}

export interface BoardSwitchMenuCallbacks {
  edit: () => void;
  press: () => void;
  reset: () => void;
  remove: () => void;
}

/**
 * The entries a thing on the table offers for its switch, for the master alone.
 *
 * A player sees none of them, since what a switch does is the master's to read. A door is not
 * offered one, since clicking it already opens it; one that somehow has a switch can still have it
 * written or taken off.
 */
export function buildBoardSwitchMenu(
  state: BoardSwitchMenuState,
  callbacks: BoardSwitchMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!state.canEdit) return [];
  if (!state.hasSwitch) {
    if (state.isDoor) return [];
    return [{ name: t('feature.boardSwitch.menu.edit'), action: callbacks.edit }];
  }
  return [
    { name: t('feature.boardSwitch.menu.edit'), action: callbacks.edit },
    { name: t('feature.boardSwitch.menu.try'), action: callbacks.press },
    ...(state.pressed ? [{ name: t('feature.boardSwitch.menu.reset'), action: callbacks.reset }] : []),
    { name: t('feature.boardSwitch.menu.remove'), action: callbacks.remove },
  ];
}

export interface PressedGroundEntry {
  /** What the ground is listed as. */
  label: string;
  reset: () => void;
}

/**
 * The master's list of painted ground that has been pressed, each set back as it was painted by
 * choosing it. Ground has no menu of its own, so the table's carries it. Left out for anybody else,
 * and while nothing has been pressed.
 */
export function buildPressedGroundMenu(
  canEdit: boolean,
  pressed: readonly PressedGroundEntry[],
  t: TranslateFn
): ContextMenuAction[] {
  if (!canEdit || pressed.length < 1) return [];
  return [
    {
      name: t('feature.boardSwitch.menu.reset'),
      action: undefined,
      subActions: pressed.map((entry) => ({ name: entry.label, action: entry.reset })),
    },
  ];
}
