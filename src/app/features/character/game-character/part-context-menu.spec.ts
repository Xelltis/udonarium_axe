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

  it('offers nothing for a piece standing on no other', () => {
    expect(buildPartContextMenu({ body: null, bodies: [] }, { attach: vi.fn(), detach: vi.fn() }, t)).toEqual([]);
  });
});
