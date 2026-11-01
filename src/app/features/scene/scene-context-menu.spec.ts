import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { buildSceneContextMenu, type SceneMenuCallbacks } from '@axe/features/scene/scene-context-menu';

describe('the menu of a scene', () => {
  const t = (key: string) => key.replace('feature.scene.menu.', '').replace('common.folder.', 'folder.');

  function callbacks(): SceneMenuCallbacks & { moved: string[] } {
    const moved: string[] = [];
    return {
      moved,
      applyWithoutBgm: vi.fn(),
      applyWithoutText: vi.fn(),
      edit: vi.fn(),
      overwrite: vi.fn(),
      duplicate: vi.fn(),
      moveTo: (path) => moved.push(path),
      remove: vi.fn(),
    };
  }

  const names = (actions: readonly ContextMenuAction[]) =>
    actions.map((action) => (action === ContextMenuSeparator ? '---' : action.name));

  it('offers putting it on without its music or its words only where it has them', () => {
    const full = buildSceneContextMenu({ folderName: '', hasMusic: true, hasText: true }, [], [], callbacks(), t);
    const bare = buildSceneContextMenu({ folderName: '', hasMusic: false, hasText: false }, [], [], callbacks(), t);

    expect(names(full)).toEqual([
      'applyWithoutBgm',
      'applyWithoutText',
      '---',
      'edit',
      'overwrite',
      'duplicate',
      '---',
      'delete',
    ]);
    expect(names(bare)).toEqual(['edit', 'overwrite', 'duplicate', '---', 'delete']);
  });

  it('offers every other folder to move to, and no folder only while it is in one', () => {
    const done = callbacks();
    const actions = buildSceneContextMenu(
      { folderName: '第1話/村', hasMusic: false, hasText: false },
      ['第1話', '第1話/村', '第2話'],
      [],
      done,
      t
    );

    const move = actions.find((action) => action.name === 'moveTo')!;
    expect(move.subActions!.map((action) => action.name)).toEqual(['folder.none', '第1話', '第2話']);
    move.subActions![0].action!();
    expect(done.moved).toEqual(['']);
  });

  it('leaves the move out with nowhere to go, keeping the moves up and down the list', () => {
    const reorder: ContextMenuAction[] = [{ name: 'up', action: vi.fn() }];
    const actions = buildSceneContextMenu(
      { folderName: '', hasMusic: false, hasText: false },
      [],
      reorder,
      callbacks(),
      t
    );

    expect(names(actions)).toEqual(['edit', 'overwrite', 'duplicate', '---', 'up', '---', 'delete']);
  });
});
