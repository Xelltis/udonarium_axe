import { movedByDoor, openDoorMotion } from '@axe/domain/tabletop/door-motion';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { afterEach, describe, expect, it } from 'vitest';

describe('how an open door stands', () => {
  const made: Terrain[] = [];
  afterEach(() => made.splice(0).forEach((terrain) => terrain.destroy()));

  /** A door a quarter of a cell across and one cell along, two high, open in the given way. */
  function door(style: DoorStyle, open = true): Terrain {
    const terrain = Terrain.create('door', 0.25, 1, 2, '', '');
    terrain.doorStyle = style;
    terrain.isDoorOpen = open;
    made.push(terrain);
    return terrain;
  }

  it('leaves a shut door and a block that is no door where they stand', () => {
    expect(openDoorMotion(door(DoorStyle.SWING, false), 50)).toBeNull();
    expect(openDoorMotion(door(DoorStyle.NONE), 50)).toBeNull();
  });

  it('runs a sliding door the length of itself, into the wall it was set into', () => {
    expect(openDoorMotion(door(DoorStyle.SLIDE), 50)).toMatchObject({ shiftX: 0, shiftY: 50, lift: 0 });
  });

  it('turns the other one of a pair the other way, on the hinge at the other end, so the two open apart', () => {
    const one = openDoorMotion(door(DoorStyle.SWING), 50)!;
    const other = door(DoorStyle.SWING);
    other.doorMirrored = true;
    const mirrored = openDoorMotion(other, 50)!;

    expect(one).toMatchObject({ turnDeg: -95, hinge: { x: 6.25, y: 0 } });
    expect(mirrored).toMatchObject({ turnDeg: 95, hinge: { x: 6.25, y: 50 } });
  });

  it('lifts a door that lifts, and sinks one that sinks, its own height', () => {
    expect(openDoorMotion(door(DoorStyle.LIFT), 50)?.lift).toBe(100);
    expect(openDoorMotion(door(DoorStyle.SINK), 50)?.lift).toBe(-100);
  });

  it('carries a point of the door where the swing takes it, about the hinge', () => {
    const swung = openDoorMotion(door(DoorStyle.SWING), 50)!;

    const moved = movedByDoor(swung, 6.25, 50);

    expect(moved.x).toBeCloseTo(6.25 + 50 * Math.sin((95 * Math.PI) / 180), 6);
    expect(moved.y).toBeCloseTo(50 * Math.cos((95 * Math.PI) / 180), 6);
  });
});
