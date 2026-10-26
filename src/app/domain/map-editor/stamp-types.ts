export const STAMP_CATEGORIES = ['door', 'stair', 'furniture', 'nature', 'dungeon', 'marker', 'image'] as const;

export type StampCategory = (typeof STAMP_CATEGORIES)[number];

export interface StampDef {
  id: string;
  category: StampCategory;
  svg: string;
}
