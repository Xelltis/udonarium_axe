import { latticeOf } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { GridType } from '@axe/domain/tabletop/game-table';
import { facingNameOf, padRows } from '@axe/features/first-person/first-person-hud';
import { describe, expect, it } from 'vitest';

describe('facingNameOf', () => {
  it('names the four ways a square board faces', () => {
    expect([0, 90, 180, 270].map(facingNameOf)).toEqual(['north', 'east', 'south', 'west']);
  });

  it('names the six ways of either kind of hex board by the nearest of eight', () => {
    expect([0, 60, 120, 180, 240, 300].map(facingNameOf)).toEqual([
      'north',
      'northEast',
      'southEast',
      'south',
      'southWest',
      'northWest',
    ]);
    expect([30, 90, 150, 210, 270, 330].map(facingNameOf)).toEqual([
      'northEast',
      'east',
      'southEast',
      'southWest',
      'west',
      'northWest',
    ]);
  });

  it('names a way written past a full turn, or backwards, as the way it points', () => {
    expect(facingNameOf(405)).toBe('northEast');
    expect(facingNameOf(-45)).toBe('northWest');
    expect(facingNameOf(Number.NaN)).toBe('north');
  });
});

describe('padRows', () => {
  it('lays a square board out as forward above left, back and right', () => {
    const rows = padRows(latticeOf(GridType.SQUARE));

    expect(rows.map((row) => row.map((button) => button?.label ?? null))).toEqual([
      [null, 'forward', null],
      ['left', 'back', 'right'],
    ]);
  });

  it('lays a hex board out as the six ways out of a hex', () => {
    const rows = padRows(latticeOf(GridType.HEX_HORIZONTAL));

    expect(rows.map((row) => row.map((button) => button?.move))).toEqual([
      ['left', 'forward', 'right'],
      ['backLeft', 'back', 'backRight'],
    ]);
    expect(rows[0].map((button) => button?.label)).toEqual(['frontLeft', 'forward', 'frontRight']);
  });

  it('lays a board without a grid out as a square one', () => {
    expect(padRows(latticeOf(GridType.NONE))).toEqual(padRows(latticeOf(GridType.SQUARE)));
  });
});
