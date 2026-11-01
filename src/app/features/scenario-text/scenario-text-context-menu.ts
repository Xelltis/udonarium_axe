import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { folderSegments } from '@axe/domain/folder/folder-path';
import { SCENARIO_TEXT_SPEAKERS, type ScenarioTextSpeaker } from '@axe/domain/scenario-text/scenario-text';

/** What the menu of a scenario text does, each on the text it was opened on. */
export interface ScenarioTextMenuCallbacks {
  sendAs: (speaker: ScenarioTextSpeaker) => void;
  edit: () => void;
  duplicate: () => void;
  moveTo: (folderPath: string) => void;
  remove: () => void;
}

/**
 * The menu of a scenario text in the list: saying it as somebody else than it is said by, then
 * editing and copying it, then filing it into another folder and moving it up or down the list,
 * and deleting it last. A text with no words is not offered to be said.
 *
 * The folder it is in is not offered to move to, and "no folder" only while it is in one.
 */
export function buildScenarioTextContextMenu(
  text: { folderName: string; hasWords: boolean; speaker: ScenarioTextSpeaker },
  folders: readonly string[],
  reorder: readonly ContextMenuAction[],
  callbacks: ScenarioTextMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  if (text.hasWords) {
    actions.push({
      name: t('feature.scenarioText.menu.sendAs'),
      subActions: SCENARIO_TEXT_SPEAKERS.filter((speaker) => speaker !== text.speaker).map((speaker) => ({
        name: t(`feature.scenarioText.speaker.${speaker}`),
        action: () => callbacks.sendAs(speaker),
      })),
    });
    actions.push(ContextMenuSeparator);
  }
  actions.push(
    { name: t('feature.scenarioText.menu.edit'), action: callbacks.edit },
    { name: t('feature.scenarioText.menu.duplicate'), action: callbacks.duplicate }
  );

  const destinations = [
    ...(text.folderName.length > 0 ? [{ path: '', name: t('common.folder.none') }] : []),
    ...folders
      .filter((path) => path !== text.folderName)
      .map((path) => ({ path, name: folderSegments(path).join(' / ') })),
  ];
  const moves: ContextMenuAction[] = [];
  if (destinations.length > 0) {
    moves.push({
      name: t('feature.scenarioText.menu.moveTo'),
      subActions: destinations.map((destination) => ({
        name: destination.name,
        action: () => callbacks.moveTo(destination.path),
      })),
    });
  }
  moves.push(...reorder);
  if (moves.length > 0) actions.push(ContextMenuSeparator, ...moves);

  actions.push(ContextMenuSeparator, { name: t('feature.scenarioText.menu.delete'), action: callbacks.remove });
  return actions;
}
