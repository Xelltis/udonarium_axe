import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonPoint,
  DungeonRoomRole,
  DungeonTrap,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { TrapKind } from '@axe/domain/tabletop/trap-presets';

/** The most a board is strewn with, however many are asked for. */
export const MAX_DUNGEON_TRAPS = 30;

/** How far apart two traps are set, in cells, so that a party does not walk into a nest of them. */
const TRAP_SPACING = 3;

/** What is set in the open, where there is room to fall into something or to be caught out in it. */
const ROOM_TRAPS: readonly TrapKind[] = ['pit', 'rune'];

/** What is set in a passage, where a party is strung out and has nowhere to go but on. */
const CORRIDOR_TRAPS: readonly TrapKind[] = ['dart', 'blade', 'alarm'];

/** A requested trap count rounded and kept within what a board will take; not a number gives none. */
export function clampTrapCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count)) return 0;
  return Math.min(MAX_DUNGEON_TRAPS, Math.max(0, Math.round(count)));
}

/**
 * Sets traps about a laid-out dungeon, on the floor of its rooms and passages.
 *
 * The room the party walks in by is left alone, and so is the ground the stairs stand on: a
 * trap under the feet of a party that has not moved yet is a trap nobody chose to walk into.
 * Two are never set within a few cells of each other, so that a passage reads as trapped
 * rather than as mined, and a passage gets what a passage gets — darts and wires — while a
 * room gets what needs the floor of one.
 *
 * Everything comes from the given source of chance, so the same seed strews the same board.
 */
export function placeTraps(layout: DungeonLayout, count: number, rng: () => number): DungeonTrap[] {
  const wanted = clampTrapCount(count);
  if (wanted < 1) return [];

  const spared = new Set<number>();
  for (const room of layout.rooms) {
    if (room.role !== DungeonRoomRole.Entrance) continue;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) spared.add(y * layout.width + x);
    }
  }
  for (const spot of [layout.entrance, layout.exit, layout.mouth]) {
    if (spot) spared.add(spot.y * layout.width + spot.x);
  }
  for (const piece of layout.furnishings ?? []) {
    for (let y = piece.y; y < piece.y + piece.h; y++) {
      for (let x = piece.x; x < piece.x + piece.w; x++) spared.add(y * layout.width + x);
    }
  }

  const open: number[] = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const cell = cellAt(layout, x, y);
      if (cell !== DungeonCell.Room && cell !== DungeonCell.Corridor) continue;
      const index = y * layout.width + x;
      if (!spared.has(index)) open.push(index);
    }
  }
  if (open.length < 1) return [];

  const traps: DungeonTrap[] = [];
  const taken: DungeonPoint[] = [];
  // Drawn one at a time rather than shuffled: the pool shrinks as it is drawn from, so a board
  // with barely room for the traps asked for still gives back as many as will fit.
  let left = open.length;
  while (traps.length < wanted && left > 0) {
    const pick = Math.floor(rng() * left);
    const index = open[pick];
    open[pick] = open[--left];
    const x = index % layout.width;
    const y = Math.floor(index / layout.width);
    if (taken.some((set) => Math.abs(set.x - x) < TRAP_SPACING && Math.abs(set.y - y) < TRAP_SPACING)) continue;
    const kinds = cellAt(layout, x, y) === DungeonCell.Room ? ROOM_TRAPS : CORRIDOR_TRAPS;
    traps.push({ x, y, kind: kinds[Math.floor(rng() * kinds.length)] });
    taken.push({ x, y });
  }
  return traps;
}
