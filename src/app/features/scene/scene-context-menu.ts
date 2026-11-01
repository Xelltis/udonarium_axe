import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { folderSegments } from '@axe/domain/folder/folder-path';

/** What the menu of a scene does, each on the scene it was opened on. */
export interface SceneMenuCallbacks {
  applyWithoutBgm: () => void;
  applyWithoutText: () => void;
  edit: () => void;
  overwrite: () => void;
  duplicate: () => void;
  moveTo: (folderPath: string) => void;
  remove: () => void;
}

/**
 * The menu of a scene in the list: putting it on without its music or its words, then editing it,
 * writing the table as it stands over it and copying it, then filing it into another folder and
 * moving it up or down the list, and deleting it last.
 *
 * The folder it is in is not offered to move to, and "no folder" only while it is in one. With no
 * other folder to go to, the move is left out.
 */
export function buildSceneContextMenu(
  scene: { folderName: string; hasMusic: boolean; hasText: boolean },
  folders: readonly string[],
  reorder: readonly ContextMenuAction[],
  callbacks: SceneMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  if (scene.hasMusic)
    actions.push({ name: t('feature.scene.menu.applyWithoutBgm'), action: callbacks.applyWithoutBgm });
  if (scene.hasText)
    actions.push({ name: t('feature.scene.menu.applyWithoutText'), action: callbacks.applyWithoutText });
  if (actions.length > 0) actions.push(ContextMenuSeparator);
  actions.push(
    { name: t('feature.scene.menu.edit'), action: callbacks.edit },
    { name: t('feature.scene.menu.overwrite'), action: callbacks.overwrite },
    { name: t('feature.scene.menu.duplicate'), action: callbacks.duplicate }
  );

  const destinations = [
    ...(scene.folderName.length > 0 ? [{ path: '', name: t('common.folder.none') }] : []),
    ...folders
      .filter((path) => path !== scene.folderName)
      .map((path) => ({ path, name: folderSegments(path).join(' / ') })),
  ];
  const moves: ContextMenuAction[] = [];
  if (destinations.length > 0) {
    moves.push({
      name: t('feature.scene.menu.moveTo'),
      subActions: destinations.map((destination) => ({
        name: destination.name,
        action: () => callbacks.moveTo(destination.path),
      })),
    });
  }
  moves.push(...reorder);
  if (moves.length > 0) actions.push(ContextMenuSeparator, ...moves);

  actions.push(ContextMenuSeparator, { name: t('feature.scene.menu.delete'), action: callbacks.remove });
  return actions;
}
