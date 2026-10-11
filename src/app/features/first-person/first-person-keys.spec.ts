import { latticeOf } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { GridType } from '@axe/domain/tabletop/game-table';
import { FirstPersonKeyContext, firstPersonKeyDown } from '@axe/features/first-person/first-person-keys';
import { describe, expect, it } from 'vitest';

function contextOn(gridType: GridType, overrides: Partial<FirstPersonKeyContext> = {}): FirstPersonKeyContext {
  return {
    typing: false,
    composing: false,
    chord: false,
    busy: false,
    forced: false,
    shift: false,
    picking: false,
    lattice: latticeOf(gridType),
    ...overrides,
  };
}

describe('firstPersonKeyDown', () => {
  it('walks with WASD and the up and down arrows, and turns with Q, E and the side arrows', () => {
    const square = contextOn(GridType.SQUARE);

    expect(firstPersonKeyDown('KeyW', square)).toEqual({ kind: 'move', move: 'forward' });
    expect(firstPersonKeyDown('ArrowUp', square)).toEqual({ kind: 'move', move: 'forward' });
    expect(firstPersonKeyDown('KeyS', square)).toEqual({ kind: 'move', move: 'back' });
    expect(firstPersonKeyDown('ArrowDown', square)).toEqual({ kind: 'move', move: 'back' });
    expect(firstPersonKeyDown('KeyA', square)).toEqual({ kind: 'move', move: 'left' });
    expect(firstPersonKeyDown('KeyD', square)).toEqual({ kind: 'move', move: 'right' });
    expect(firstPersonKeyDown('KeyQ', square)).toEqual({ kind: 'turn', turn: -1 });
    expect(firstPersonKeyDown('ArrowLeft', square)).toEqual({ kind: 'turn', turn: -1 });
    expect(firstPersonKeyDown('KeyE', square)).toEqual({ kind: 'turn', turn: 1 });
    expect(firstPersonKeyDown('ArrowRight', square)).toEqual({ kind: 'turn', turn: 1 });
  });

  it('opens the door ahead with the space bar, and leaves the view with escape', () => {
    expect(firstPersonKeyDown('Space', contextOn(GridType.SQUARE))).toEqual({ kind: 'door' });
    expect(firstPersonKeyDown('Escape', contextOn(GridType.SQUARE))).toEqual({ kind: 'exit' });
  });

  it('strikes and puts out the light the piece carries with F', () => {
    expect(firstPersonKeyDown('KeyF', contextOn(GridType.SQUARE))).toEqual({ kind: 'torch' });
    expect(firstPersonKeyDown('KeyF', contextOn(GridType.SQUARE, { typing: true }))).toBeNull();
  });

  it('steps back to either side with Z and C on hexes, and nowhere on squares or without a grid', () => {
    expect(firstPersonKeyDown('KeyZ', contextOn(GridType.HEX_VERTICAL))).toEqual({ kind: 'move', move: 'backLeft' });
    expect(firstPersonKeyDown('KeyC', contextOn(GridType.HEX_HORIZONTAL))).toEqual({
      kind: 'move',
      move: 'backRight',
    });
    expect(firstPersonKeyDown('KeyZ', contextOn(GridType.SQUARE))).toBeNull();
    expect(firstPersonKeyDown('KeyC', contextOn(GridType.NONE))).toBeNull();
  });

  it('leaves a key alone while it is being typed, composed, held with another key, or something else has the screen', () => {
    for (const held of ['typing', 'composing', 'chord', 'busy'] as const) {
      expect(firstPersonKeyDown('KeyW', contextOn(GridType.SQUARE, { [held]: true }))).toBeNull();
    }
  });

  it('keeps the player in a view everyone was put in', () => {
    expect(firstPersonKeyDown('Escape', contextOn(GridType.SQUARE, { forced: true }))).toBeNull();
    expect(firstPersonKeyDown('KeyW', contextOn(GridType.SQUARE, { forced: true }))).toEqual({
      kind: 'move',
      move: 'forward',
    });
  });

  it('answers nothing to a key it does not use, however it is spelled', () => {
    expect(firstPersonKeyDown('KeyX', contextOn(GridType.SQUARE))).toBeNull();
    expect(firstPersonKeyDown('toString', contextOn(GridType.SQUARE))).toBeNull();
  });

  it('aims at what is ahead with T, and lets every mark go with shift and T', () => {
    expect(firstPersonKeyDown('KeyT', contextOn(GridType.SQUARE))).toEqual({ kind: 'target' });
    expect(firstPersonKeyDown('KeyT', contextOn(GridType.SQUARE, { shift: true }))).toEqual({ kind: 'clearTargets' });
  });

  it('gives up on the effect being aimed with escape, rather than leaving the view', () => {
    expect(firstPersonKeyDown('Escape', contextOn(GridType.SQUARE, { picking: true }))).toEqual({
      kind: 'cancelPicks',
    });
  });

  it('brings a look away back ahead with escape before anything else, the view and the aiming left as they were', () => {
    expect(firstPersonKeyDown('Escape', contextOn(GridType.SQUARE, { looking: true }))).toEqual({ kind: 'endLook' });
    expect(firstPersonKeyDown('Escape', contextOn(GridType.SQUARE, { looking: true, picking: true }))).toEqual({
      kind: 'endLook',
    });
  });

  it('fires the effect being aimed with enter, and leaves enter alone the rest of the time', () => {
    const picking = contextOn(GridType.SQUARE, { picking: true });

    expect(firstPersonKeyDown('Enter', picking)).toEqual({ kind: 'castPicks' });
    expect(firstPersonKeyDown('NumpadEnter', picking)).toEqual({ kind: 'castPicks' });
    expect(firstPersonKeyDown('Enter', contextOn(GridType.SQUARE))).toBeNull();
  });
});
