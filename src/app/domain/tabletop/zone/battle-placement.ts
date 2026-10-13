import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';

/** One row of the table a room writes for how far apart two sides start: a name and the metres. */
export interface PlacementDistance {
  readonly name: string;
  readonly metres: number;
}

/** One row of the table a room writes for what a distance does: up to `upToM` metres, the note. */
export interface DistanceModifier {
  readonly upToM: number;
  readonly note: string;
}

/**
 * Reads the distances a room writes as `name:metres` rows separated by commas. A row with no name or
 * no distance that is a number of zero or more is left out.
 */
export function parsePlacementDistances(text: string): PlacementDistance[] {
  const rows: PlacementDistance[] = [];
  for (const written of text.split(/[,、\n]/)) {
    const parts = written.split(/[:：]/).map((part) => part.trim());
    if (parts.length !== 2) continue;
    const [name, metresText] = parts;
    const metres = Number(metresText);
    if (name.length < 1 || metresText.length < 1 || !Number.isFinite(metres) || metres < 0) continue;
    rows.push({ name, metres });
  }
  return rows;
}

/**
 * Reads what distances do as `metres:note` rows separated by commas, nearest first. A row whose
 * distance is not a number of zero or more, or whose note is empty, is left out.
 */
export function parseDistanceModifiers(text: string): DistanceModifier[] {
  const rows: DistanceModifier[] = [];
  for (const written of text.split(/[,、\n]/)) {
    const at = written.search(/[:：]/);
    if (at < 0) continue;
    const metresText = written.slice(0, at).trim();
    const note = written.slice(at + 1).trim();
    const upToM = Number(metresText);
    if (metresText.length < 1 || !Number.isFinite(upToM) || upToM < 0 || note.length < 1) continue;
    rows.push({ upToM, note });
  }
  return rows.sort((a, b) => a.upToM - b.upToM);
}

/** One row of the table a room writes for a situation rather than a distance: its name and the note. */
export interface SituationModifier {
  readonly name: string;
  readonly note: string;
}

/**
 * Reads the rows of what distances do that name a situation instead, such as a kind of move or the
 * lie of the ground, as `name:note`, in the order written. A row headed by a number is a distance
 * and is left out, as is one with no name or no note.
 */
export function parseSituationModifiers(text: string): SituationModifier[] {
  const rows: SituationModifier[] = [];
  for (const written of text.split(/[,、\n]/)) {
    const at = written.search(/[:：]/);
    if (at < 0) continue;
    const name = written.slice(0, at).trim();
    const note = written.slice(at + 1).trim();
    if (name.length < 1 || note.length < 1 || Number.isFinite(Number(name))) continue;
    rows.push({ name, note });
  }
  return rows;
}

/** The row for a distance: the first whose reach takes it in, or null past every row. */
export function modifierFor(rows: readonly DistanceModifier[], distanceM: number): DistanceModifier | null {
  return rows.find((row) => distanceM <= row.upToM + 1e-9) ?? null;
}

/**
 * The point a distance away from another in a direction, in table pixels: 0° to the right, turning
 * clockwise as the table is drawn.
 */
export function pointAtBearing(from: MovePoint, bearingDeg: number, distancePx: number): MovePoint {
  const turn = (bearingDeg * Math.PI) / 180;
  return { x: from.x + Math.cos(turn) * distancePx, y: from.y + Math.sin(turn) * distancePx };
}
