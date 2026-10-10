import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { buildLockToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { clampBoardPitch, MAX_BOARD_PITCH, WhiteBoard } from '@axe/domain/tabletop/white-board';

/** The angles worth a click of their own; the panel covers everything between. */
export const BOARD_PITCH_STEPS: readonly number[] = [0, 45, MAX_BOARD_PITCH];

export interface WhiteBoardMenuHandlers {
  onDraw(board: WhiteBoard): void;
  onDetachAll(board: WhiteBoard): void;
  onCopy(board: WhiteBoard): void;
  onSave(board: WhiteBoard): void;
  onDelete(board: WhiteBoard): void;
}

/**
 * A white board's right-click menu: draw, tilt, lock, then save, copy and delete.
 *
 * Tilting and locking act on the board directly; everything else is left to the handlers. The entry
 * that takes everything off the board is offered only while something stands on it.
 */
export function buildWhiteBoardContextMenu(
  board: WhiteBoard,
  standingCount: number,
  t: TranslateFn,
  handlers: WhiteBoardMenuHandlers
): ContextMenuAction[] {
  const menu: ContextMenuAction[] = [
    { name: t('feature.whiteBoard.contextMenu.draw'), action: () => handlers.onDraw(board) },
    {
      name: t('feature.whiteBoard.contextMenu.pitch'),
      action: undefined,
      subActions: BOARD_PITCH_STEPS.map((pitch) => ({
        name: (board.pitch === pitch ? '✔ ' : '') + t(`feature.whiteBoard.pitch.${pitch}`),
        action: () => {
          board.pitch = clampBoardPitch(pitch);
          SoundEffect.play(PresetSound.cardPut);
        },
      })),
    },
    buildLockToggleAction(
      board.isLock,
      (next) => {
        board.isLock = next;
      },
      t
    ),
    ContextMenuSeparator,
  ];

  if (standingCount > 0) {
    menu.push({ name: t('feature.whiteBoard.contextMenu.detachAll'), action: () => handlers.onDetachAll(board) });
  }

  menu.push(ContextMenuSeparator);
  menu.push({ name: t('feature.whiteBoard.contextMenu.save'), action: () => handlers.onSave(board) });
  menu.push({ name: t('feature.whiteBoard.contextMenu.copy'), action: () => handlers.onCopy(board) });
  menu.push({ name: t('feature.whiteBoard.contextMenu.delete'), action: () => handlers.onDelete(board) });

  return menu;
}
