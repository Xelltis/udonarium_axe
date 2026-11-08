import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { isTutorialPart } from '@axe/application/tabletop/tutorial-board';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
  ContextMenuType,
} from '@axe/application/ui/context-menu.service';
import { buildAltitudeAction, buildLockToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';
import { buildDisclosureContextMenu } from '@axe/features/disclosure/disclosure-context-menu';

export interface TextNoteContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

/** What the note's menu hands back to the note to do. */
export interface TextNoteMenuCallbacks {
  onSetUpright: (isUpright: boolean) => void;
  onShowDetail: () => void;
  /** Takes the tutorial off the table and leaves the sample pieces, offered on the first table's tutorial note when given. */
  onPutAwayTutorial?: () => void;
  /** Clears the first table down to a blank one, offered on the first table's tutorial note when given. */
  onClearToBlankTable?: () => void;
}

/** The text note's right-click menu as a flat list, without the groups a radial menu needs. */
export function buildTextNoteContextMenu(
  textNote: TextNote,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: TextNoteMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  return buildTextNoteContextMenuModel(textNote, gridSize, inventoryService, callbacks, t).actions;
}

/**
 * The text note's right-click menu, both as a flat list and grouped for the radial menu.
 *
 * It offers editing, altitude, standing the note up or laying it down, disclosure, lock, copy and
 * delete, with any entries for moving it to another surface last. A copy is placed one cell down
 * and to the right, on top of the others. The first table's tutorial note also offers, after delete,
 * to put the tutorial away, leaving the sample pieces or leaving a blank table.
 */
export function buildTextNoteContextMenuModel(
  textNote: TextNote,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: TextNoteMenuCallbacks,
  t: TranslateFn,
  surfaceEntries: ContextMenuAction[] = []
): TextNoteContextMenuModel {
  const editAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.textNoteEdit'),
    action: () => callbacks.onShowDetail(),
  };
  const altitudeAction = buildAltitudeAction(textNote, t, {
    onChanged: () => inventoryService.notifyInventoryUpdate(),
  });
  const orientationAction: ContextMenuAction = textNote.isUpright
    ? {
        name: t('feature.tabletop.contextMenu.textNoteLay'),
        action: () => {
          callbacks.onSetUpright(false);
          SoundEffect.play(PresetSound.sweep);
        },
      }
    : {
        name: t('feature.tabletop.contextMenu.textNoteUpright'),
        action: () => {
          callbacks.onSetUpright(true);
          SoundEffect.play(PresetSound.sweep);
        },
      };
  const disclosureActions = buildDisclosureContextMenu(textNote, t);
  const disclosureItems = disclosureActions.filter((action) => action.type !== ContextMenuType.SEPARATOR);
  const lockAction = buildLockToggleAction(textNote.isLock, (next) => (textNote.isLock = next), t);
  const copyAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.copy'),
    enabled: !isWithheldHere(textNote),
    action: () => {
      const cloneObject = textNote.clone();
      cloneObject.location.x += gridSize;
      cloneObject.location.y += gridSize;
      cloneObject.toTopmost();
      SoundEffect.play(PresetSound.cardPut);
    },
  };
  const deleteAction: ContextMenuAction = {
    name: t('feature.tabletop.contextMenu.delete'),
    action: () => {
      textNote.destroy();
      SoundEffect.play(PresetSound.sweep);
    },
  };

  const { onPutAwayTutorial: putAway, onClearToBlankTable: clear } = callbacks;
  const tutorialActions: ContextMenuAction[] =
    putAway && clear && isTutorialPart(textNote.identifier)
      ? [
          { name: t('feature.tabletop.tutorial.putAway'), action: () => putAway() },
          { name: t('feature.tabletop.tutorial.clearToBlank'), action: () => clear() },
        ]
      : [];

  return {
    actions: [
      editAction,
      ContextMenuSeparator,
      altitudeAction,
      orientationAction,
      ...disclosureActions,
      ContextMenuSeparator,
      lockAction,
      copyAction,
      deleteAction,
      ...tutorialActions,
      ...(surfaceEntries.length > 0 ? [ContextMenuSeparator, ...surfaceEntries] : []),
    ],
    radialGroups: [
      {
        name: t('feature.textNote.contextMenu.radialContent'),
        icon: 'description',
        actions: [editAction],
      },
      {
        name: t('feature.textNote.contextMenu.radialDisplay'),
        icon: 'visibility',
        actions: [altitudeAction, orientationAction],
      },
      {
        name: t('feature.textNote.contextMenu.radialDisclosure'),
        icon: 'group',
        actions: disclosureItems,
      },
      {
        name: t('feature.textNote.contextMenu.radialObject'),
        icon: 'settings',
        actions: [...surfaceEntries, lockAction, copyAction, deleteAction, ...tutorialActions],
      },
    ],
  };
}
