import { ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildReplayEntryContextMenu,
  type ReplayEntryMenuCallbacks,
} from '@axe/features/replay/replay-workspace/replay-entry-context-menu';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function callbacks(): ReplayEntryMenuCallbacks {
  return {
    rewrite: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    remove: vi.fn(),
    writeAfter: vi.fn(),
    stageAfter: vi.fn(),
  };
}

describe('buildReplayEntryContextMenu()', () => {
  it('offers rewriting first for one row with words', () => {
    const actions = buildReplayEntryContextMenu({ count: 1, canRewrite: true, canStage: true }, callbacks(), t);

    expect(actions.map((action) => action.name)).toEqual([
      'feature.replay.editor.rewrite',
      'feature.replay.editor.up',
      'feature.replay.editor.down',
      ContextMenuSeparator.name,
      'feature.replay.editor.writeAfter',
      'feature.replay.editor.stageAfter',
      ContextMenuSeparator.name,
      'feature.replay.editor.removeCount:{"count":1}',
    ]);
  });

  it('offers no rewriting for several rows, and says how many a removal takes', () => {
    const actions = buildReplayEntryContextMenu({ count: 3, canRewrite: true, canStage: true }, callbacks(), t);

    expect(actions.some((action) => action.name === 'feature.replay.editor.rewrite')).toBe(false);
    expect(actions[actions.length - 1].name).toBe('feature.replay.editor.removeCount:{"count":3}');
  });

  it('greys recording out while the table is taken', () => {
    const actions = buildReplayEntryContextMenu({ count: 1, canRewrite: false, canStage: false }, callbacks(), t);

    expect(actions.find((action) => action.name === 'feature.replay.editor.stageAfter')?.enabled).toBe(false);
  });

  it('offers nothing with nothing chosen', () => {
    expect(buildReplayEntryContextMenu({ count: 0, canRewrite: false, canStage: true }, callbacks(), t)).toEqual([]);
  });

  it('runs what each entry names', () => {
    const run = callbacks();
    const actions = buildReplayEntryContextMenu({ count: 1, canRewrite: true, canStage: true }, run, t);

    actions.find((action) => action.name === 'feature.replay.editor.down')?.action?.();

    expect(run.moveDown).toHaveBeenCalledTimes(1);
  });
});
