import { buildReorderContextMenu, ReorderMenuCallbacks } from '@axe/application/ui/reorder-context-menu';

const translate = (key: string) => key;

function callbacks(): Required<ReorderMenuCallbacks> {
  return { moveToTop: vi.fn(), moveUp: vi.fn(), moveDown: vi.fn(), moveToBottom: vi.fn() };
}

function names(index: number, count: number, given: ReorderMenuCallbacks = callbacks()): string[] {
  return buildReorderContextMenu({ index, count }, given, translate).map((action) => action.name);
}

describe('buildReorderContextMenu()', () => {
  it('offers every move to a row in the middle of a long list', () => {
    expect(names(3, 7)).toEqual([
      'common.reorder.toTop',
      'common.reorder.up',
      'common.reorder.down',
      'common.reorder.toBottom',
    ]);
  });

  it('offers no way up to the first row, and no way down to the last', () => {
    expect(names(0, 4)).toEqual(['common.reorder.down', 'common.reorder.toBottom']);
    expect(names(3, 4)).toEqual(['common.reorder.toTop', 'common.reorder.up']);
  });

  it('leaves the ends out where they are only one row away', () => {
    expect(names(1, 3)).toEqual(['common.reorder.up', 'common.reorder.down']);
  });

  it('offers nothing in a list of one', () => {
    expect(names(0, 1)).toEqual([]);
  });

  it('leaves out a move the list gives no callback for', () => {
    expect(names(2, 5, { moveUp: vi.fn(), moveDown: vi.fn() })).toEqual(['common.reorder.up', 'common.reorder.down']);
  });

  it('calls back rather than moving anything itself', () => {
    const given = callbacks();
    const menu = buildReorderContextMenu({ index: 2, count: 5 }, given, translate);

    for (const action of menu) action.action?.();

    expect(given.moveToTop).toHaveBeenCalledTimes(1);
    expect(given.moveUp).toHaveBeenCalledTimes(1);
    expect(given.moveDown).toHaveBeenCalledTimes(1);
    expect(given.moveToBottom).toHaveBeenCalledTimes(1);
  });
});
