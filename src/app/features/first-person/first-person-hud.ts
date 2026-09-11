import { FirstPersonLattice, FirstPersonMove } from '@axe/domain/tabletop/first-person/first-person-lattice';

export const FIRST_PERSON_FACING_NAMES = [
  'north',
  'northEast',
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
  'northWest',
] as const;

export type FirstPersonFacingName = (typeof FIRST_PERSON_FACING_NAMES)[number];

export const FIRST_PERSON_PAD_LABELS = [
  'forward',
  'back',
  'left',
  'right',
  'frontLeft',
  'frontRight',
  'backLeft',
  'backRight',
] as const;

export type FirstPersonPadLabel = (typeof FIRST_PERSON_PAD_LABELS)[number];

export interface FirstPersonPadButton {
  move: FirstPersonMove;
  label: FirstPersonPadLabel;
  arrowDeg: number;
}

export function facingNameOf(yawDeg: number): FirstPersonFacingName {
  const turns = Math.round((Number.isFinite(yawDeg) ? yawDeg : 0) / 45);
  return FIRST_PERSON_FACING_NAMES[((turns % 8) + 8) % 8];
}

export function isHexLattice(lattice: FirstPersonLattice): boolean {
  return lattice.kind === 'flatHex' || lattice.kind === 'pointyHex';
}

export function padRows(lattice: FirstPersonLattice): (FirstPersonPadButton | null)[][] {
  if (isHexLattice(lattice)) {
    return [
      [button('left', 'frontLeft', -45), button('forward', 'forward', 0), button('right', 'frontRight', 45)],
      [button('backLeft', 'backLeft', -135), button('back', 'back', 180), button('backRight', 'backRight', 135)],
    ];
  }
  return [
    [null, button('forward', 'forward', 0), null],
    [button('left', 'left', -90), button('back', 'back', 180), button('right', 'right', 90)],
  ];
}

function button(move: FirstPersonMove, label: FirstPersonPadLabel, arrowDeg: number): FirstPersonPadButton {
  return { move, label, arrowDeg };
}
