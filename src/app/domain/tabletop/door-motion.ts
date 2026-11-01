import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';

/**
 * Where an open door has gone from where it stands shut, in the door's own frame (pixels from the
 * corner it is drawn from, before the block's own turn).
 */
export interface DoorMotion {
  /** A swing about an upright hinge, clockwise in degrees, or 0. */
  readonly turnDeg: number;
  /** The hinge a swing turns on, or null for a door that does not swing. */
  readonly hinge: { readonly x: number; readonly y: number } | null;
  /** How far a sliding door has run across and down. */
  readonly shiftX: number;
  readonly shiftY: number;
  /** How far a door that lifts or sinks has gone up, negative for down. */
  readonly lift: number;
}

/**
 * How a door stands open, or null for a block that is no door or a door that is shut.
 *
 * A door thin across x turns on a hinge at one end of its long side and runs along that side, and
 * the other way round; a mirrored door turns and runs the other way. Swinging takes it a little
 * past square, lifting and sinking take it its own height up or down, and sliding takes it its own
 * length into the wall it was set into.
 */
export function openDoorMotion(terrain: Terrain, gridSize: number): DoorMotion | null {
  if (terrain.doorStyle === DoorStyle.NONE || !terrain.isDoorOpen) return null;
  const width = terrain.width * gridSize;
  const depth = terrain.depth * gridSize;
  const longY = terrain.width < terrain.depth;
  const mirrored = terrain.doorMirrored ? -1 : 1;
  const still: DoorMotion = { turnDeg: 0, hinge: null, shiftX: 0, shiftY: 0, lift: 0 };
  switch (terrain.doorStyle) {
    case DoorStyle.SWING:
      return {
        ...still,
        turnDeg: (longY ? -95 : 95) * mirrored,
        hinge: longY
          ? { x: width / 2, y: terrain.doorMirrored ? depth : 0 }
          : { x: terrain.doorMirrored ? width : 0, y: depth / 2 },
      };
    case DoorStyle.SLIDE: {
      const along = (longY ? depth : width) * mirrored;
      return longY ? { ...still, shiftY: along } : { ...still, shiftX: along };
    }
    case DoorStyle.LIFT:
      return { ...still, lift: terrain.height * gridSize };
    case DoorStyle.SINK:
      return { ...still, lift: -terrain.height * gridSize };
    default:
      return null;
  }
}

/** A point of a door's own frame, moved where the door's opening takes it. */
export function movedByDoor(motion: DoorMotion, x: number, y: number): { x: number; y: number } {
  let movedX = x + motion.shiftX;
  let movedY = y + motion.shiftY;
  if (motion.hinge && motion.turnDeg) {
    const turn = (motion.turnDeg * Math.PI) / 180;
    const dx = movedX - motion.hinge.x;
    const dy = movedY - motion.hinge.y;
    movedX = motion.hinge.x + dx * Math.cos(turn) - dy * Math.sin(turn);
    movedY = motion.hinge.y + dx * Math.sin(turn) + dy * Math.cos(turn);
  }
  return { x: movedX, y: movedY };
}
