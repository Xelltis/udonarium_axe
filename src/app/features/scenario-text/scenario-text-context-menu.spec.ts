import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildScenarioTextContextMenu,
  type ScenarioTextMenuCallbacks,
} from '@axe/features/scenario-text/scenario-text-context-menu';

describe('the menu of a scenario text', () => {
  const t = (key: string) => key.replace('feature.scenarioText.', '').replace('common.folder.', 'folder.');
  const names = (actions: readonly ContextMenuAction[]) =>
    actions.map((action) => (action === ContextMenuSeparator ? '---' : action.name));

  function callbacks(): ScenarioTextMenuCallbacks & { said: string[] } {
    const said: string[] = [];
    return {
      said,
      sendAs: (speaker) => said.push(speaker),
      edit: vi.fn(),
      duplicate: vi.fn(),
      moveTo: vi.fn(),
      remove: vi.fn(),
    };
  }

  it('offers saying it as the other two speakers, only where it has words', () => {
    const done = callbacks();
    const actions = buildScenarioTextContextMenu({ folderName: '', hasWords: true, speaker: 'title' }, [], [], done, t);

    const sendAs = actions.find((action) => action.name === 'menu.sendAs')!;
    expect(sendAs.subActions!.map((action) => action.name)).toEqual(['speaker.character', 'speaker.system']);
    sendAs.subActions![1].action!();
    expect(done.said).toEqual(['system']);

    const empty = buildScenarioTextContextMenu({ folderName: '', hasWords: false, speaker: 'title' }, [], [], done, t);
    expect(names(empty)).toEqual(['menu.edit', 'menu.duplicate', '---', 'menu.delete']);
  });

  it('offers the other folders to move to, and no folder only while it is in one', () => {
    const actions = buildScenarioTextContextMenu(
      { folderName: '導入', hasWords: false, speaker: 'title' },
      ['導入', '本編'],
      [],
      callbacks(),
      t
    );

    const move = actions.find((action) => action.name === 'menu.moveTo')!;
    expect(move.subActions!.map((action) => action.name)).toEqual(['folder.none', '本編']);
  });
});
