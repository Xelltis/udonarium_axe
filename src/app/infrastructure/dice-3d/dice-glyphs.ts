import { DieLabels, labelOf, wantsUnderline } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { dot, sub } from '@axe/domain/dice/dice-3d/rotation';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';

/** One mark on a face: a number, or a pip of a d6. */
export interface FaceGlyph {
  readonly kind: 'text' | 'pip';
  /** Where it sits in the face's cell, from 0 to 1 across and from 0 to 1 up. */
  readonly x: number;
  readonly y: number;
  /** How far it is turned from upright, in radians, anticlockwise. */
  readonly rotation: number;
  /** Its height as a share of the cell: the size of a number's figures, or a pip's diameter. */
  readonly size: number;
  readonly text: string;
  /** Whether it is drawn in the accent, as the one pip of a d6 is. */
  readonly accent: boolean;
  /** Whether it is marked beneath, as a 6 or a 9 is to tell it from the other. */
  readonly underline: boolean;
}

/** How tall each shape's numbers stand, as a share of the face's cell. */
const NUMBER_SIZE: Readonly<Record<DieShape, number>> = {
  d4: 0.16,
  d6: 0.38,
  d8: 0.28,
  d10: 0.24,
  d12: 0.28,
  d20: 0.25,
};

/** The pips of a d6, as offsets from the middle of the face, for each number. */
const PIPS: Readonly<Record<number, readonly [number, number][]>> = {
  1: [[0, 0]],
  2: [
    [-1, 1],
    [1, -1],
  ],
  3: [
    [-1, 1],
    [0, 0],
    [1, -1],
  ],
  4: [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ],
  5: [
    [-1, 1],
    [1, 1],
    [0, 0],
    [-1, -1],
    [1, -1],
  ],
  6: [
    [-1, 1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
  ],
};

/**
 * How far up its face a number sits: a little above the middle on a d8, so a 6 keeps its mark
 * beneath clear of the edge below.
 */
const NUMBER_HEIGHT: Readonly<Partial<Record<DieShape, number>>> = { d8: 0.52 };

/** How far toward its corner each number of a d4 sits, as a share of the way from the middle. */
const D4_LABEL_REACH = 0.32;

/** How far a pip stands from the middle of a d6's face, and how large it is, as shares of the cell. */
const PIP_STEP = 0.19;
const PIP_SIZE = 0.13;
const ONE_PIP_SIZE = 0.22;

/**
 * The marks on one face of a die: its pips, its number, or for a d4 the three numbers at its
 * corners, each turned to read upright when its corner is on top.
 *
 * A d6 numbered as usual wears pips, its one large and in the accent as Japanese dice have it; a
 * d6 standing in for a d3 wears numbers.
 */
export function faceGlyphsOf(shape: DieShape, labels: DieLabels, face: number): FaceGlyph[] {
  if (shape === 'd4') return d4Glyphs(face);
  const text = labelOf(shape, labels, face);
  if (shape === 'd6' && labels === 'standard') {
    const value = Number(text);
    return PIPS[value].map(([dx, dy]) => ({
      kind: 'pip',
      x: 0.5 + dx * PIP_STEP,
      y: 0.5 + dy * PIP_STEP,
      rotation: 0,
      size: value === 1 ? ONE_PIP_SIZE : PIP_SIZE,
      text: '',
      accent: value === 1,
      underline: false,
    }));
  }
  const twoFigures = text.length > 1;
  return [
    {
      kind: 'text',
      x: 0.5,
      y: NUMBER_HEIGHT[shape] ?? 0.5,
      rotation: 0,
      size: NUMBER_SIZE[shape] * (twoFigures && shape !== 'd20' && shape !== 'd12' ? 0.82 : 1),
      text,
      accent: false,
      underline: wantsUnderline(text),
    },
  ];
}

function d4Glyphs(face: number): FaceGlyph[] {
  const poly = polyhedronOf('d4');
  const frame = faceFramesOf('d4')[face];
  return poly.faces[face].map((corner) => {
    const d = sub(poly.vertices[corner], frame.centre);
    const across = dot(d, frame.right) / (2 * frame.reach);
    const up = dot(d, frame.up) / (2 * frame.reach);
    return {
      kind: 'text' as const,
      x: 0.5 + across * D4_LABEL_REACH,
      y: 0.5 + up * D4_LABEL_REACH,
      rotation: Math.atan2(-across, up),
      size: NUMBER_SIZE.d4,
      text: labelOf('d4', 'standard', corner),
      accent: false,
      underline: false,
    };
  });
}
