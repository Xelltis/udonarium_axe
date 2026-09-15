import { DungeonLayout } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { buildDungeonSummary } from '@axe/domain/tabletop/dungeon/dungeon-summary';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';

export type TranslateFn = (key: string) => string;

/**
 * The text summary handed over with a generated dungeon map, built from its layout with labels in
 * the reader's language.
 */
export function describeDungeon(layout: DungeonLayout, blocks: MapBlocks, name: string, t: TranslateFn): string {
  return buildDungeonSummary({
    layout,
    name,
    torchRooms: blocks.torchRooms,
    labels: {
      roleName: (role) => t(`feature.tabletop.dungeonGenerator.role.${role}`),
      title: t('feature.tabletop.dungeonGenerator.summary.seed'),
      start: t('feature.tabletop.dungeonGenerator.summary.start'),
      key: t('feature.tabletop.dungeonGenerator.summary.key'),
      locked: t('feature.tabletop.dungeonGenerator.summary.locked'),
      torch: t('feature.tabletop.dungeonGenerator.summary.torch'),
      doors: t('feature.tabletop.dungeonGenerator.summary.doors'),
    },
  });
}
