import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { buildWhiteBoardContextMenu } from '@axe/features/tabletop/white-board/white-board-context-menu';

const t = (key: string) => key;

function names(menu: ContextMenuAction[]): string[] {
  return menu.map((item) => item.name ?? '');
}

function handlers() {
  return {
    onDraw: vi.fn(),
    onDetachAll: vi.fn(),
    onCopy: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onPutAwayTutorial: vi.fn(),
    onClearToBlankTable: vi.fn(),
  };
}

describe('buildWhiteBoardContextMenu()', () => {
  let board: WhiteBoard;

  beforeEach(() => {
    board = WhiteBoard.create('board', 6, 4, 1);
  });

  afterEach(() => {
    ObjectStore.instance.remove(board);
  });

  it('offers the drawing, the angle and the lock, and nothing the panel already covers', () => {
    const menu = names(buildWhiteBoardContextMenu(board, 0, t, handlers()));

    expect(menu).toContain('feature.whiteBoard.contextMenu.draw');
    // Everything a board is set to now lives in the one panel it is drawn on.
    expect(menu).not.toContain('feature.whiteBoard.contextMenu.settings');
    expect(menu).not.toContain('feature.whiteBoard.contextMenu.gather');
    expect(menu).toContain('feature.whiteBoard.contextMenu.pitch');
    expect(menu).toContain('feature.tabletop.contextMenu.lock');
  });

  it('ticks the angle the board is already at, and moves it when another is picked', () => {
    board.pitch = 90;
    const menu = buildWhiteBoardContextMenu(board, 0, t, handlers());
    const angles = menu.find((item) => item.name === 'feature.whiteBoard.contextMenu.pitch')!.subActions!;

    expect(angles.find((item) => item.name?.startsWith('✔'))!.name).toContain('feature.whiteBoard.pitch.90');

    angles[0].action!();

    expect(board.pitch).toBe(0);
  });

  it('only offers to clear the board when something is on it', () => {
    expect(names(buildWhiteBoardContextMenu(board, 0, t, handlers()))).not.toContain(
      'feature.whiteBoard.contextMenu.detachAll'
    );
    expect(names(buildWhiteBoardContextMenu(board, 3, t, handlers()))).toContain(
      'feature.whiteBoard.contextMenu.detachAll'
    );
  });

  it('hands each choice to the caller that knows how to do it', () => {
    const spies = handlers();
    const menu = buildWhiteBoardContextMenu(board, 2, t, spies);

    for (const key of ['draw', 'detachAll', 'copy', 'delete']) {
      menu.find((item) => item.name === `feature.whiteBoard.contextMenu.${key}`)!.action!();
    }

    expect(spies.onDraw).toHaveBeenCalledWith(board);
    expect(spies.onDetachAll).toHaveBeenCalledWith(board);
    expect(spies.onCopy).toHaveBeenCalledWith(board);
    expect(spies.onDelete).toHaveBeenCalledWith(board);
  });

  it('offers to draw on the board, since a board is for drawing on', () => {
    const spies = handlers();
    const menu = buildWhiteBoardContextMenu(board, 0, t, spies);

    menu.find((item) => item.name === 'feature.whiteBoard.contextMenu.draw')!.action!();

    expect(spies.onDraw).toHaveBeenCalledWith(board);
  });

  it('offers to save the board on its own', () => {
    const acted = handlers();

    const menu = buildWhiteBoardContextMenu(board, 0, t, acted);
    expect(names(menu)).toContain('feature.whiteBoard.contextMenu.save');

    menu.find((item) => item.name === 'feature.whiteBoard.contextMenu.save')?.action?.();
    expect(acted.onSave).toHaveBeenCalledWith(board);
  });

  it('offers to put the tutorial away, leaving the pieces or a blank table, only on the first table’s tutorial boards', () => {
    const tutorial = WhiteBoard.create('tutorial', 32, 15, 1, 'tutorialBoard');
    const acted = handlers();
    try {
      const plain = names(buildWhiteBoardContextMenu(board, 0, t, acted));
      expect(plain).not.toContain('feature.tabletop.tutorial.putAway');
      expect(plain).not.toContain('feature.tabletop.tutorial.clearToBlank');
      const menu = buildWhiteBoardContextMenu(tutorial, 0, t, acted);
      menu.find((item) => item.name === 'feature.tabletop.tutorial.putAway')!.action!();
      menu.find((item) => item.name === 'feature.tabletop.tutorial.clearToBlank')!.action!();

      expect(acted.onPutAwayTutorial).toHaveBeenCalled();
      expect(acted.onClearToBlankTable).toHaveBeenCalled();
    } finally {
      ObjectStore.instance.remove(tutorial);
    }
  });
});
