import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { pointOnFace, TableWorldSprite, turnedOnFace } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a note is known by. */
export const TEXT_NOTE_KIND = 'text-note';

/** How far the page lifts a note off the face it stands on, so it is drawn over what lies flat there. */
const LIFT_PX = 0.15;

/** A note on the table, as much of it as is drawn. */
export interface TextNoteLayout {
  readonly id: string;
  /** The face it stands on. */
  readonly frame: SurfaceFrame;
  /** The point of the face it hangs from, the middle of its lower edge, and how far off the face. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high it floats off its place, in table pixels. */
  readonly altitudePx: number;
  readonly rotateDeg: number;
  /** Whether it stands up from its lower edge, rather than lying flat back from it. */
  readonly upright: boolean;
  /** The picture of the note as the page lays it out, and how big the page lays it out, in table pixels. */
  readonly face: { readonly url: string; readonly widthPx: number; readonly heightPx: number } | null;
}

/**
 * The sprite a note is drawn with: the picture of its panel, its lower edge on the line through
 * the point it hangs from, turned as the note is. A note standing up rises from that line facing the
 * way the note is turned to; one lying down lies back from it, its top furthest off.
 */
export function textNoteSprites(note: TextNoteLayout): TableWorldSprite[] {
  const face = note.face;
  if (!face || !(face.widthPx > 0) || !(face.heightPx > 0)) return [];
  const axes = turnedOnFace(note.frame, note.rotateDeg);
  const out = note.z + LIFT_PX + note.altitudePx;
  const anchor = pointOnFace(note.frame, note.x, note.y, out);
  const half = face.heightPx / 2;
  const normal = note.frame.normal;
  const base = {
    id: `${note.id}#panel`,
    owner: note.id,
    kind: TEXT_NOTE_KIND,
    widthPx: face.widthPx,
    heightPx: face.heightPx,
    look: { kind: 'picture', url: face.url } as const,
    brightness: 1,
    twoSided: false,
  };
  if (note.upright) {
    return [
      {
        ...base,
        centre: { x: anchor.x + normal.x * half, y: anchor.y + normal.y * half, z: anchor.z + normal.z * half },
        facing: { across: axes.across, down: { x: -normal.x, y: -normal.y, z: -normal.z } },
      },
    ];
  }
  return [
    {
      ...base,
      centre: { x: anchor.x - axes.down.x * half, y: anchor.y - axes.down.y * half, z: anchor.z - axes.down.z * half },
      facing: axes,
      order: out,
    },
  ];
}
