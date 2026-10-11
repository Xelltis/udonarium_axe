import { GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

export type FirstPersonMove = 'forward' | 'back' | 'left' | 'right' | 'backLeft' | 'backRight';

export type FirstPersonLatticeKind = 'square' | 'flatHex' | 'pointyHex' | 'free';

export interface FirstPersonLattice {
  kind: FirstPersonLatticeKind;
  facings: number;
  firstRotate: number;
  offsets: Readonly<Partial<Record<FirstPersonMove, number>>>;
}

export interface FirstPersonPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const FIRST_PERSON_EYE_BACK = 0.3;

export const FIRST_PERSON_EYE_HEIGHT_CELLS = 0.8;

const SQUARE: FirstPersonLattice = {
  kind: 'square',
  facings: 4,
  firstRotate: 0,
  offsets: { forward: 0, back: 2, left: -1, right: 1 },
};

const HEX_OFFSETS = { forward: 0, back: 3, left: -1, right: 1, backLeft: -2, backRight: 2 } as const;

const FLAT_HEX: FirstPersonLattice = { kind: 'flatHex', facings: 6, firstRotate: 0, offsets: HEX_OFFSETS };

const POINTY_HEX: FirstPersonLattice = { kind: 'pointyHex', facings: 6, firstRotate: 30, offsets: HEX_OFFSETS };

const FREE: FirstPersonLattice = {
  kind: 'free',
  facings: 8,
  firstRotate: 0,
  offsets: { forward: 0, back: 4, left: -2, right: 2 },
};

export function latticeOf(gridType: GridType): FirstPersonLattice {
  if (isHexGrid(gridType)) return isFlatTopGrid(gridType) ? FLAT_HEX : POINTY_HEX;
  return gridType === GridType.NONE ? FREE : SQUARE;
}

function stepDegrees(lattice: FirstPersonLattice): number {
  return 360 / lattice.facings;
}

function turnsFromFirst(lattice: FirstPersonLattice, rotate: number): number {
  const turns = Math.round((finite(rotate) - lattice.firstRotate) / stepDegrees(lattice));
  return turns === 0 ? 0 : turns;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

export function facingIndexOf(lattice: FirstPersonLattice, rotate: number): number {
  return wrap(turnsFromFirst(lattice, rotate), lattice.facings);
}

export function snappedRotate(lattice: FirstPersonLattice, rotate: number): number {
  return lattice.firstRotate + turnsFromFirst(lattice, rotate) * stepDegrees(lattice);
}

export function rotateOfFacing(lattice: FirstPersonLattice, facing: number): number {
  return lattice.firstRotate + wrap(Math.trunc(facing), lattice.facings) * stepDegrees(lattice);
}

export function turnedRotate(lattice: FirstPersonLattice, rotate: number, turn: 1 | -1): number {
  return snappedRotate(lattice, rotate) + turn * stepDegrees(lattice);
}

export function offersMove(lattice: FirstPersonLattice, move: FirstPersonMove): boolean {
  return lattice.offsets[move] !== undefined;
}

export function directionOf(lattice: FirstPersonLattice, rotate: number, move: FirstPersonMove): number | null {
  const offset = lattice.offsets[move];
  if (offset === undefined) return null;
  return wrap(facingIndexOf(lattice, rotate) + offset, lattice.facings);
}

export function headingVector(yawDeg: number): { x: number; y: number } {
  const radians = (finite(yawDeg) * Math.PI) / 180;
  return { x: tidy(Math.sin(radians)), y: tidy(-Math.cos(radians)) };
}

/** A turn brought within half a turn either way: from -180° up to, but not including, 180°. */
export function signedTurnDeg(degrees: number): number {
  return (((degrees % 360) + 540) % 360) - 180;
}

function tidy(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
}

export function eyePoseAt(
  standing: { x: number; y: number },
  yawDeg: number,
  eyeZ: number,
  gridSize: number
): FirstPersonPose {
  const heading = headingVector(yawDeg);
  const back = FIRST_PERSON_EYE_BACK * gridSize;
  return { x: standing.x - heading.x * back, y: standing.y - heading.y * back, z: eyeZ, yaw: yawDeg };
}
