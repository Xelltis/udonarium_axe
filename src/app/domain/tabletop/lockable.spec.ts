import { isLockedInPlace } from '@axe/domain/tabletop/lockable';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { makeFakeTabletopObject } from '@axe/testing/factories/tabletop-object.factory';
import { afterEach, describe, expect, it } from 'vitest';

describe('isLockedInPlace', () => {
  const made: Terrain[] = [];

  afterEach(() => {
    for (const terrain of made.splice(0)) terrain.destroy();
  });

  function terrain(locked: boolean): Terrain {
    const block = Terrain.create('wall', 1, 1, 1, '', '');
    block.isLocked = locked;
    made.push(block);
    return block;
  }

  it('reads the lock of a piece that calls it isLock', () => {
    expect(isLockedInPlace(makeFakeTabletopObject({ isLock: true }))).toBe(true);
    expect(isLockedInPlace(makeFakeTabletopObject({ isLock: false }))).toBe(false);
  });

  it('reads the lock of a terrain, which calls it isLocked', () => {
    expect(isLockedInPlace(terrain(true))).toBe(true);
    expect(isLockedInPlace(terrain(false))).toBe(false);
  });

  it('counts a piece with no lock at all as free to move', () => {
    expect(isLockedInPlace(makeFakeTabletopObject())).toBe(false);
  });
});
