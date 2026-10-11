import {
  directionOf,
  eyePoseAt,
  facingIndexOf,
  headingVector,
  latticeOf,
  offersMove,
  rotateOfFacing,
  signedTurnDeg,
  snappedRotate,
  turnedRotate,
} from '@axe/domain/tabletop/first-person/first-person-lattice';
import { GridType } from '@axe/domain/tabletop/game-table';
import { describe, expect, it } from 'vitest';

const square = latticeOf(GridType.SQUARE);
const flatHex = latticeOf(GridType.HEX_VERTICAL);
const pointyHex = latticeOf(GridType.HEX_HORIZONTAL);
const free = latticeOf(GridType.NONE);

describe('latticeOf', () => {
  it('faces four ways on squares, six on hexes and eight on a board without a grid', () => {
    expect(square.facings).toBe(4);
    expect(flatHex.facings).toBe(6);
    expect(pointyHex.facings).toBe(6);
    expect(free.facings).toBe(8);
  });

  it('reads a grid type it does not know as squares', () => {
    expect(latticeOf(7 as GridType).kind).toBe('square');
  });
});

describe('the rotate each facing is', () => {
  it('starts at north on squares and flat-topped hexes', () => {
    expect([0, 1, 2, 3].map((facing) => rotateOfFacing(square, facing))).toEqual([0, 90, 180, 270]);
    expect([0, 1, 2, 3, 4, 5].map((facing) => rotateOfFacing(flatHex, facing))).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it('starts at north-east on pointy-topped hexes, where north is a corner', () => {
    expect([0, 1, 2, 3, 4, 5].map((facing) => rotateOfFacing(pointyHex, facing))).toEqual([30, 90, 150, 210, 270, 330]);
  });

  it('goes round in steps of forty-five without a grid', () => {
    expect(rotateOfFacing(free, 3)).toBe(135);
    expect(rotateOfFacing(free, 9)).toBe(45);
  });
});

describe('facingIndexOf', () => {
  it('takes the nearest facing, whichever way round the rotate was written', () => {
    expect(facingIndexOf(square, -90)).toBe(3);
    expect(facingIndexOf(square, 0)).toBe(0);
    expect(facingIndexOf(square, 44)).toBe(0);
    expect(facingIndexOf(square, 46)).toBe(1);
    expect(facingIndexOf(square, 450)).toBe(1);
  });

  it('settles a rotate halfway between two facings on the clockwise one', () => {
    expect(facingIndexOf(pointyHex, 0)).toBe(0);
    expect(facingIndexOf(pointyHex, 60)).toBe(1);
    expect(facingIndexOf(square, -45)).toBe(0);
  });

  it('reads a rotate that is not a number as north', () => {
    expect(facingIndexOf(square, Number.NaN)).toBe(0);
  });
});

describe('turnedRotate', () => {
  it('turns a quarter on squares, a sixth on hexes and an eighth without a grid', () => {
    expect(turnedRotate(square, 0, 1)).toBe(90);
    expect(turnedRotate(flatHex, 0, 1)).toBe(60);
    expect(turnedRotate(pointyHex, 30, -1)).toBe(-30);
    expect(turnedRotate(free, 0, -1)).toBe(-45);
  });

  it('keeps counting past a full turn rather than winding back round', () => {
    expect(turnedRotate(square, 270, 1)).toBe(360);
    expect(turnedRotate(square, 350, 1)).toBe(450);
    expect(turnedRotate(square, -350, -1)).toBe(-450);
  });

  it('squares a crooked piece up before turning it', () => {
    expect(turnedRotate(square, 10, 1)).toBe(90);
    expect(turnedRotate(pointyHex, 0, 1)).toBe(90);
    expect(snappedRotate(flatHex, 50)).toBe(60);
  });
});

describe('directionOf', () => {
  it('turns a step to the side into the way it goes on squares', () => {
    expect(directionOf(square, 0, 'forward')).toBe(0);
    expect(directionOf(square, 0, 'left')).toBe(3);
    expect(directionOf(square, 90, 'right')).toBe(2);
    expect(directionOf(square, 90, 'back')).toBe(3);
  });

  it('steps front-left and back-right on hexes, which have no side to step to', () => {
    expect(directionOf(flatHex, 60, 'left')).toBe(0);
    expect(directionOf(flatHex, 60, 'right')).toBe(2);
    expect(directionOf(flatHex, 60, 'backLeft')).toBe(5);
    expect(directionOf(flatHex, 60, 'backRight')).toBe(3);
    expect(directionOf(flatHex, 60, 'back')).toBe(4);
  });

  it('steps a quarter round to either side without a grid', () => {
    expect(directionOf(free, 0, 'left')).toBe(6);
    expect(directionOf(free, 0, 'right')).toBe(2);
  });

  it('offers no step back to one side where the board has one straight to the side', () => {
    expect(directionOf(square, 0, 'backLeft')).toBeNull();
    expect(offersMove(square, 'backRight')).toBe(false);
    expect(offersMove(free, 'backLeft')).toBe(false);
    expect(offersMove(flatHex, 'backLeft')).toBe(true);
  });
});

describe('headingVector', () => {
  it('points up the table at a rotate of nought and turns clockwise from there', () => {
    expect(headingVector(0)).toEqual({ x: 0, y: -1 });
    expect(headingVector(90)).toEqual({ x: 1, y: 0 });
    expect(headingVector(180)).toEqual({ x: 0, y: 1 });
    expect(headingVector(270)).toEqual({ x: -1, y: 0 });
  });
});

describe('signedTurnDeg', () => {
  it('brings a turn within half a turn either way', () => {
    expect(signedTurnDeg(270)).toBe(-90);
    expect(signedTurnDeg(-200)).toBe(160);
    expect(signedTurnDeg(720 + 30)).toBe(30);
    expect(signedTurnDeg(180)).toBe(-180);
    expect(signedTurnDeg(0)).toBe(0);
  });
});

describe('eyePoseAt', () => {
  it('stands the eye a little behind the middle of where the piece stands', () => {
    expect(eyePoseAt({ x: 100, y: 100 }, 0, 25, 50)).toEqual({ x: 100, y: 115, z: 25, yaw: 0 });
    expect(eyePoseAt({ x: 100, y: 100 }, 90, 25, 50)).toEqual({ x: 85, y: 100, z: 25, yaw: 90 });
  });
});
