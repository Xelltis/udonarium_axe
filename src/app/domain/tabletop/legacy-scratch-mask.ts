import { GameObject } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { TabletopLocation } from '@axe/domain/tabletop/tabletop-object';

/** A regular mask counts its opacity out of this; it draws at the current value over it. */
const MASK_OPACITY_FULL = 100;

/** The legacy box was always drawn at this share of full opacity, whatever its data said. */
const LEGACY_DRAWN_OPACITY = 60;

/** The legacy map is a fixed square this many cells a side, laid out row by row. */
const LEGACY_MAP_SIDE = 50;

/** The size and name every legacy mask was made with, in either app that made them. */
const LEGACY_COMMON_ELEMENTS = ['name', 'width', 'height'] as const;

const HEX_COLOUR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CELL_KEY = /^\d+:\d+$/;

/**
 * What a cell of the legacy map holds once it has been scratched open, in each form it can reach
 * here: as sent by a peer, or read back from a saved room as text.
 */
const OPEN_CELL_VALUES: ReadonlySet<unknown> = new Set<unknown>([false, 0, 'false', '0']);

/**
 * The identifier of the regular mask a legacy scratch mask becomes.
 *
 * Every seat derives the same one from the same legacy mask, so seats that convert it at the same
 * moment write to one mask instead of each adding their own.
 */
export function convertedMaskIdentifierOf(legacyIdentifier: string): string {
  return `table-mask-from_${legacyIdentifier}`;
}

/**
 * The colour a converted mask is filled with: the legacy `changeColor`, or failing that its
 * `color`, whichever is first a hex colour.
 *
 * Null when neither is, missing and empty values included, which leaves the regular mask's own
 * default fill.
 */
export function legacyMaskColourOf(legacy: { changeColor: unknown; color: unknown }): string | null {
  for (const candidate of [legacy.changeColor, legacy.color]) {
    if (typeof candidate !== 'string') continue;
    const colour = candidate.trim();
    if (HEX_COLOUR.test(colour)) return colour;
  }
  return null;
}

/**
 * The cells of a legacy mask already scratched open, written the way a regular mask lists them:
 * sorted `col:row` keys joined by commas.
 *
 * A cell of the legacy map is covered while it holds anything but false, a missing entry included,
 * so a map that is missing or not a list opens nothing. Entries beyond the mask's size are ignored.
 * Cells the legacy mask already listed in its own `scratchedGrids` stay open.
 */
export function legacyScratchedGridsOf(legacy: {
  M: unknown;
  scratchedGrids: unknown;
  width: number;
  height: number;
}): string {
  const cells = new Set<string>();
  const map = legacy.M;
  if (Array.isArray(map)) {
    const rows = Math.min(Math.max(1, legacy.height), LEGACY_MAP_SIDE);
    const cols = Math.min(Math.max(1, legacy.width), LEGACY_MAP_SIDE);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (OPEN_CELL_VALUES.has(map[LEGACY_MAP_SIDE * y + x])) cells.add(`${x}:${y}`);
      }
    }
  }
  if (typeof legacy.scratchedGrids === 'string') {
    for (const key of legacy.scratchedGrids.split(',')) {
      if (CELL_KEY.test(key)) cells.add(key);
    }
  }
  return [...cells].sort().join(',');
}

/**
 * Replaces a legacy scratch mask with a regular mask that looks the same, and deletes the legacy
 * one.
 *
 * The regular mask takes the legacy name, size, place and face, height above the table, lock, lock
 * mark, owner and table. It is filled with {@link legacyMaskColourOf} at the opacity the legacy
 * box was drawn at, and starts with the cells {@link legacyScratchedGridsOf} finds open. A legacy
 * mask that names no table goes on the one given, as a dropped mask would.
 *
 * Null, with nothing changed, while the legacy mask is still missing its name or size or the table
 * it names, or when there is no table to put it on: a mask sent by a peer arrives piece by piece.
 * When the regular mask for it is already there, made here or by another seat, only the legacy
 * mask is deleted and that mask comes back; when it was made and has since been deleted, the legacy
 * mask is deleted as well and null comes back.
 */
export function convertLegacyScratchMask(
  legacy: GameTableScratchMask,
  tableForUnplaced: ObjectNode | null
): GameTableMask | null {
  const table = legacy.parentIsAssigned ? legacy.parent : tableForUnplaced;
  if (!table || !hasLegacyCommonElements(legacy)) return null;

  const store = ObjectStore.instance;
  const identifier = convertedMaskIdentifierOf(legacy.identifier);
  const existing = store.get(identifier);
  if (existing || store.isDeleted(identifier)) {
    legacy.destroy();
    return existing instanceof GameTableMask ? existing : null;
  }

  const mask = GameObject.batch(() => buildConvertedMask(legacy, identifier, table));
  legacy.destroy();
  return mask;
}

function hasLegacyCommonElements(legacy: GameTableScratchMask): boolean {
  const common = legacy.commonDataElement;
  return common != null && LEGACY_COMMON_ELEMENTS.every((name) => common.getFirstElementByName(name) != null);
}

function buildConvertedMask(legacy: GameTableScratchMask, identifier: string, table: ObjectNode): GameTableMask {
  const width = Math.max(1, legacy.width);
  const height = Math.max(1, legacy.height);
  const mask = GameTableMask.create(legacy.name, width, height, MASK_OPACITY_FULL, identifier);
  const common = mask.commonDataElement!;
  const opacity = common.getFirstElementByName('opacity');
  if (opacity) opacity.currentValue = LEGACY_DRAWN_OPACITY;
  const colour = legacyMaskColourOf(legacy);
  if (colour) {
    common.appendChild(
      DataElement.create('color', colour, { type: 'colors', currentValue: colour }, `color_${identifier}`)
    );
  }
  mask.location = locationOf(legacy.location);
  mask.posZ = numberOr(legacy.posZ, 0);
  mask.isLock = flagOr(legacy.isLock, false);
  mask.dispLockMark = flagOr(legacy.dispLockMark, true);
  mask.owner = typeof legacy.owner === 'string' ? legacy.owner : '';
  mask.isAltitudeIndicate = flagOr(legacy.isAltitudeIndicate, false);
  if (legacy.altitude !== 0) mask.altitude = legacy.altitude;
  mask.scratchedGrids = legacyScratchedGridsOf(legacy);
  table.appendChild(mask);
  return mask;
}

function locationOf(value: unknown): TabletopLocation {
  const place = (value != null && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof TabletopLocation, unknown>
  >;
  const location: TabletopLocation = {
    name: typeof place.name === 'string' && place.name.length > 0 ? place.name : 'table',
    x: numberOr(place.x, 0),
    y: numberOr(place.y, 0),
  };
  if (typeof place.surface === 'string' && place.surface.length > 0) location.surface = place.surface;
  return location;
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string' || value.trim().length < 1) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function flagOr(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}
