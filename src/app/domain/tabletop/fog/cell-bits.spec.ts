import { CellBits, decodeCellBits, encodeCellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { describe, expect, it } from 'vitest';

describe('CellBits', () => {
  it('remembers only the cells that were set', () => {
    const bits = new CellBits(20);
    bits.set(0);
    bits.set(7);
    bits.set(8);
    bits.set(19);
    for (const index of [0, 7, 8, 19]) expect(bits.get(index)).toBe(true);
    for (const index of [1, 6, 9, 18]) expect(bits.get(index)).toBe(false);
  });

  it('lets one cell go without touching the ones beside it', () => {
    const bits = new CellBits(20);
    for (const index of [6, 7, 8]) bits.set(index);

    bits.unset(7);

    expect(bits.get(7)).toBe(false);
    expect(bits.get(6)).toBe(true);
    expect(bits.get(8)).toBe(true);
  });

  it('ignores cells outside the board', () => {
    const bits = new CellBits(8);
    bits.set(-1);
    bits.set(8);
    expect(bits.get(-1)).toBe(false);
    expect(bits.get(8)).toBe(false);
    expect(bits.isEmpty).toBe(true);
  });

  it('survives being written down and read back', () => {
    const bits = new CellBits(100);
    for (const index of [0, 1, 5, 63, 64, 99]) bits.set(index);
    const back = decodeCellBits(encodeCellBits(bits), 100);
    expect(back.equals(bits)).toBe(true);
  });

  it('comes back empty from nothing', () => {
    expect(decodeCellBits('', 40).isEmpty).toBe(true);
  });

  it('reports whether merging added anything', () => {
    const held = new CellBits(16);
    held.set(3);
    const other = new CellBits(16);
    other.set(3);
    expect(held.or(other)).toBe(false);
    other.set(9);
    expect(held.or(other)).toBe(true);
    expect(held.get(9)).toBe(true);
  });

  it('keeps only the cells another one holds as well', () => {
    const held = new CellBits(16);
    for (const index of [1, 2, 9]) held.set(index);
    const other = new CellBits(16);
    for (const index of [2, 9, 12]) other.set(index);

    expect(held.and(other)).toBe(true);

    expect(held.get(1)).toBe(false);
    expect(held.get(2)).toBe(true);
    expect(held.get(9)).toBe(true);
    expect(held.get(12)).toBe(false);
    expect(held.and(other)).toBe(false);
  });

  it('drops the cells another one holds', () => {
    const held = new CellBits(16);
    for (const index of [1, 2, 9]) held.set(index);
    const other = new CellBits(16);
    for (const index of [2, 12]) other.set(index);

    expect(held.without(other)).toBe(true);

    expect(held.get(1)).toBe(true);
    expect(held.get(2)).toBe(false);
    expect(held.get(9)).toBe(true);
    expect(held.without(other)).toBe(false);
  });

  it('knows when it already holds everything another one does', () => {
    const held = new CellBits(16);
    held.set(1);
    held.set(2);
    const part = new CellBits(16);
    part.set(2);
    expect(held.covers(part)).toBe(true);
    part.set(5);
    expect(held.covers(part)).toBe(false);
  });
});
