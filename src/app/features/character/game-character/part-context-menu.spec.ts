import { buildPartContextMenu } from '@axe/features/character/game-character/part-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';
import { describe, expect, it, vi } from 'vitest';

const t = createSyncTranslate('ja');

describe('buildPartContextMenu()', () => {
  it('offers to make a piece a part of each one it stands on', () => {
    const attach = vi.fn();
    const entries = buildPartContextMenu(
      {
        body: null,
        bodies: [
          { id: 'dragon', name: 'ドラゴン' },
          { id: 'golem', name: 'ゴーレム' },
        ],
      },
      { attach, detach: vi.fn() },
      t
    );

    expect(entries.map((entry) => entry.name)).toEqual(['ドラゴン の部位にする', 'ゴーレム の部位にする']);
    (entries[1] as { action: () => void }).action();
    expect(attach).toHaveBeenCalledWith('golem');
  });

  it('offers to take a part off its body, and nothing else', () => {
    const detach = vi.fn();
    const entries = buildPartContextMenu(
      { body: 'ドラゴン', bodies: [{ id: 'golem', name: 'ゴーレム' }] },
      { attach: vi.fn(), detach },
      t
    );

    expect(entries.map((entry) => entry.name)).toEqual(['ドラゴン の部位から外す']);
    (entries[0] as { action: () => void }).action();
    expect(detach).toHaveBeenCalled();
  });

  it('offers no taking off to a reader who may not change the table', () => {
    expect(buildPartContextMenu({ body: 'ドラゴン', bodies: [] }, { attach: vi.fn() }, t)).toEqual([]);
  });

  it('offers nothing for a piece standing on no other', () => {
    expect(buildPartContextMenu({ body: null, bodies: [] }, { attach: vi.fn(), detach: vi.fn() }, t)).toEqual([]);
  });

  it('offers to work on how the parts look, to a part and to a body with parts, for whoever may change the table', () => {
    const editLook = vi.fn();
    const callbacks = { attach: vi.fn(), detach: vi.fn(), editLook };
    const names = (model: Parameters<typeof buildPartContextMenu>[0]) =>
      buildPartContextMenu(model, callbacks, t).map((entry) => entry.name);

    expect(names({ body: 'ドラゴン', bodies: [], canEditLook: true })).toEqual([
      'ドラゴン の部位から外す',
      '部位の見た目を編集',
    ]);
    expect(names({ body: null, bodies: [], hasParts: true, canEditLook: true })).toEqual(['部位の見た目を編集']);
    expect(names({ body: null, bodies: [], hasParts: false, canEditLook: true })).toEqual([]);
    expect(names({ body: 'ドラゴン', bodies: [], canEditLook: false })).toEqual(['ドラゴン の部位から外す']);
  });
});
