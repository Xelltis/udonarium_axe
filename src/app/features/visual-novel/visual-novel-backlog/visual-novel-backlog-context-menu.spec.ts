import { buildBacklogEntryContextMenu } from '@axe/features/visual-novel/visual-novel-backlog/visual-novel-backlog-context-menu';

const translate = (key: string) => key;

describe('buildBacklogEntryContextMenu()', () => {
  it('offers to edit a line the reader may change', () => {
    const edit = vi.fn();
    const menu = buildBacklogEntryContextMenu(true, { edit }, translate);

    expect(menu.map((action) => action.name)).toEqual(['feature.visualNovel.edit.title']);
    menu[0].action?.();
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('offers nothing for a line the reader may not change', () => {
    expect(buildBacklogEntryContextMenu(false, { edit: vi.fn() }, translate)).toEqual([]);
  });
});
