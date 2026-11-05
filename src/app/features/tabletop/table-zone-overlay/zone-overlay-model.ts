import { ZoneState } from '@axe/domain/tabletop/zone/zone-state';
import type { FloorMark } from '@axe/ui/tabletop/floor-marks';

/** One zone as it is drawn on the table, in table pixels. */
export interface ZoneMark {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  /** The radius of a circle, or half the side of a square. */
  readonly reach: number;
  readonly square: boolean;
  /** Everybody standing in it against its limit, for whoever may know it; empty otherwise. */
  readonly label: string;
  readonly overflowing: boolean;
  readonly forming: boolean;
}

/** A piece standing in a zone without being in it, marked at its own point. */
export interface InsideMark {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface ZoneOverlayModel {
  readonly zones: readonly ZoneMark[];
  readonly inside: readonly InsideMark[];
}

/**
 * What the overlay draws for the zones on the table.
 *
 * The count against the limit is written only for whoever may see every piece: a count would tell
 * a player how many are in a fight they cannot all see. For the same reason a zone none of whose
 * pieces the reader sees is not drawn, and a piece the reader does not see is not ringed.
 */
export function zoneOverlayModelOf(
  state: ZoneState,
  seesEverything: boolean,
  isSeen: (pieceId: string) => boolean = () => true
): ZoneOverlayModel {
  const shown = (id: string) => seesEverything || isSeen(id);
  const zones = state.zones
    .filter((zone) => zone.members.some(shown))
    .map((zone) => ({
      id: zone.id,
      cx: zone.shape.centre.x,
      cy: zone.shape.centre.y,
      reach: zone.shape.reach,
      square: zone.shape.square,
      label: seesEverything ? `${zone.occupants}/${zone.limit}` : '',
      overflowing: zone.overflowing,
      forming: zone.forming,
    }));
  const seen = new Set<string>();
  const inside: InsideMark[] = [];
  for (const zone of state.zones) {
    for (const id of zone.inside) {
      if (seen.has(id) || !shown(id)) continue;
      seen.add(id);
      const point = state.pointOf(id);
      if (point) inside.push({ id, x: point.x, y: point.y });
    }
  }
  return { zones, inside };
}

/** The colour of a zone holding more than its limit, and of one within it, as the page drew them. */
export const ZONE_OVER_COLOUR = '#fb2c36';
export const ZONE_COLOUR = '#ffb900';
/** The colour of the ring about a piece standing in a zone without being in it. */
export const ZONE_INSIDE_COLOUR = '#38bdf8';

/**
 * The marks the zones are drawn with on the floor: each zone's circle or square, faintly filled and
 * outlined in its colour, dashed while it is declared but not yet in force, a dot at its centre and
 * its count over it; and a dashed ring of the size given about every piece standing in a zone
 * without being in it.
 */
export function zoneFloorMarksOf(model: ZoneOverlayModel, ringPx: number): FloorMark[] {
  const marks: FloorMark[] = [];
  for (const zone of model.zones) {
    const colour = zone.overflowing ? ZONE_OVER_COLOUR : ZONE_COLOUR;
    const fill = { colour, opacity: 0.12 };
    const stroke = { colour, widthPx: 3, ...(zone.forming ? { dash: [12, 8] } : {}) };
    const { cx, cy, reach } = zone;
    marks.push(
      zone.square
        ? {
            kind: 'line',
            closed: true,
            points: [
              { x: cx - reach, y: cy - reach },
              { x: cx + reach, y: cy - reach },
              { x: cx + reach, y: cy + reach },
              { x: cx - reach, y: cy + reach },
            ],
            fill,
            stroke,
          }
        : { kind: 'circle', x: cx, y: cy, r: reach, fill, stroke },
      { kind: 'circle', x: cx, y: cy, r: 4, fill: { colour } }
    );
    if (zone.label) {
      marks.push({
        kind: 'text',
        x: cx,
        y: cy - reach - 8,
        text: zone.label,
        sizePx: 18,
        colour,
        outline: '#000000',
        outlinePx: 3,
      });
    }
  }
  if (model.zones.length > 0) {
    for (const mark of model.inside) {
      marks.push({
        kind: 'circle',
        x: mark.x,
        y: mark.y,
        r: ringPx,
        stroke: { colour: ZONE_INSIDE_COLOUR, widthPx: 2, dash: [6, 5] },
      });
    }
  }
  return marks;
}
