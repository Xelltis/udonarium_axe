import { ZoneState } from '@axe/domain/tabletop/zone/zone-state';

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
