import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';

/** The floor every throw gets at least, room enough for a handful of dice to roll about. */
export const MIN_TRAY_AREA = 98;
/**
 * The floor a throw in a line's frame gets for a couple of dice: less than on the table, so the
 * dice stand large in a strip only a few lines high.
 */
export const FRAME_TRAY_AREA = 64;
/** The floor each die adds, so a large roll still has room to land apart. */
const AREA_PER_DIE = 16;

/**
 * The tray a number of dice are thrown onto, in the shape of the stage it is drawn in: the floor
 * asked for, which a stage sets by how large it wants the dice to look, and more of it for every
 * die past two, so a large roll still lands apart.
 */
export function trayFor(count: number, aspect: number, minArea = MIN_TRAY_AREA): Tray {
  const area = minArea + AREA_PER_DIE * Math.max(0, count - 2);
  const halfDepth = Math.sqrt(area / aspect) / 2;
  return { halfWidth: halfDepth * aspect, halfDepth };
}

/**
 * The shape of the frame a roll's dice are thrown in, width over height: a wide strip under the
 * line for a few dice, deeper for more, so a large roll keeps its dice big enough to read.
 */
export function frameAspectFor(count: number): number {
  if (count <= 4) return 4;
  if (count <= 10) return 3;
  if (count <= 20) return 2.4;
  if (count <= 40) return 2;
  return 1.6;
}
