import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
  ContextMenuType,
} from '@axe/application/ui/context-menu.service';
import { buildAltitudeAction, buildLockToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { buildDisclosureContextMenu } from '@axe/features/disclosure/disclosure-context-menu';

export interface TextNoteContextMenuModel {
  actions: ContextMenuAction[];
  radialGroups: ContextMenuRadialGroup[];
}

export function buildTextNoteContextMenu(
  textNote: TextNote,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: {
    onSetUpright: (isUpright: boolean) => void;
    onShowDetail: () => void;
  },
  t: TranslateFn
): ContextMenuAction[] {
  return buildTextNoteContextMenuModel(textNote, gridSize, inventoryService, callbacks, t).actions;
}

export function buildTextNoteContextMenuModel(
  textNote: TextNote,
  gridSize: number,
  inventoryService: GameObjectInventoryService,
  callbacks: {
    onSetUpright: (isUpright: boolean) => void;
    onShowDetail: () => void;
  },
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
        actions: [...surfaceEntries, lockAction, copyAction, deleteAction],
      },
    ],
  };
}
