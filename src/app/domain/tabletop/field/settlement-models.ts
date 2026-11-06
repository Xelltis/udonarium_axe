import type { MapRect } from '@axe/domain/tabletop/map-blocks';

/** The 3D models bundled with the app that the walls and things of a village or a fort are drawn as. */
export const SETTLEMENT_MODEL_IDS = ['palisade_spikes'] as const;

export type SettlementModelId = (typeof SETTLEMENT_MODEL_IDS)[number];

/** Whether a bundled model's name is one of a settlement's. */
export function isSettlementModel(id: string): id is SettlementModelId {
  return (SETTLEMENT_MODEL_IDS as readonly string[]).includes(id);
}

/** Where a bundled model of a settlement is served from, beside the page. */
export function settlementModelUrl(id: SettlementModelId): string {
  return `assets/models/settlement/${id}.glb`;
}

/**
 * How far a run of wall made of tiles facing out is turned, in degrees, for its outside to face away
 * from the middle of what it walls in: a run along a row faces north or south, one down a column east
 * or west, and a single cell whichever way it lies furthest from the middle, as measured against how
 * far the wall reaches each way.
 */
export function outwardTurn(rect: MapRect, middle: { x: number; y: number }, reach: { x: number; y: number }): number {
  const dx = (rect.x + rect.w / 2 - middle.x) / Math.max(reach.x, 1);
  const dy = (rect.y + rect.h / 2 - middle.y) / Math.max(reach.y, 1);
  const alongRow = rect.w > rect.h || (rect.w === rect.h && Math.abs(dy) >= Math.abs(dx));
  if (alongRow) return dy >= 0 ? 0 : 180;
  return dx >= 0 ? 270 : 90;
}
