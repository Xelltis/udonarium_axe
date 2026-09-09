import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { Terrain } from '@axe/domain/tabletop/terrain';

/**
 * What the terrain on a table costs to keep.
 *
 * A room is carried to everyone who joins it, one object at a time, and drawn one box at a
 * time. Both counts are read here so that a change to how terrain is built can be weighed
 * against what it replaces rather than guessed at.
 */
export interface TerrainCost {
  terrains: number;
  /** The terrain and everything it is built from, which is what a joining peer is sent. */
  syncObjects: number;
  /** How much of the saved room the terrain takes up. */
  xmlBytes: number;
}

function nodeCount(node: ObjectNode): number {
  let total = 1;
  for (const child of node.children) total += nodeCount(child);
  return total;
}

export function terrainCostOf(terrains: readonly Terrain[]): TerrainCost {
  let syncObjects = 0;
  let xmlBytes = 0;
  for (const terrain of terrains) {
    syncObjects += nodeCount(terrain);
    xmlBytes += ObjectSerializer.instance.toXml(terrain).length;
  }
  return { terrains: terrains.length, syncObjects, xmlBytes };
}
