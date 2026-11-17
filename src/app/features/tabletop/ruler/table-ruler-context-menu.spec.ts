import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { buildTableRulerContextMenu } from '@axe/features/tabletop/ruler/table-ruler-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('buildTableRulerContextMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  const points = { from: { x: 100, y: 100, z: 10 }, to: { x: 300, y: 100, z: 0 } };

  function held(): TableRuler {
    return TableRuler.create('物差し', {
      from: { x: 0, y: 0, z: 0, piece: 'hero', lift: 10 },
      to: { x: 300, y: 100, z: 0 },
    });
  }

  it('locks the ruler, lets its ends go of their pieces where they stand, copies and deletes it', () => {
    const ruler = held();
    const names = buildTableRulerContextMenu(ruler, points, 50, t)
      .map((action) => action.name)
      .filter((name) => name);

    expect(names).toEqual(['固定する', 'コマとのつなぎを外す', 'コピーを作る', '削除する']);
  });

  it('lets the ends go of their pieces where they stand now', () => {
    const ruler = held();
    buildTableRulerContextMenu(ruler, points, 50, t).find((action) => action.name === 'コマとのつなぎを外す')!
      .action!();

    expect(ruler.rulerLine).toEqual({ from: { x: 100, y: 100, z: 10 }, to: { x: 300, y: 100, z: 0 } });
  });

  it('offers nothing to let go of where no end is held to a piece, or the ruler is locked', () => {
    const free = TableRuler.create('物差し', { from: { x: 0, y: 0, z: 0 }, to: { x: 50, y: 0, z: 0 } });
    expect(buildTableRulerContextMenu(free, points, 50, t).some((a) => a.name === 'コマとのつなぎを外す')).toBe(false);
    const locked = held();
    locked.isLock = true;
    expect(buildTableRulerContextMenu(locked, points, 50, t).some((a) => a.name === 'コマとのつなぎを外す')).toBe(
      false
    );
  });

  it('takes the ruler away', () => {
    const ruler = held();
    buildTableRulerContextMenu(ruler, points, 50, t).find((action) => action.name === '削除する')!.action!();

    expect(ObjectStore.instance.get(ruler.identifier)).toBeNull();
  });
});
