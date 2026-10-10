import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import type { SceneVisionSource, VisionScene } from '@axe/domain/tabletop/vision-scene';

/** Everything about one pair of eyes that the cells it reaches are worked out from. */
export function visionSourceKey(source: SceneVisionSource): string {
  return JSON.stringify([source.x, source.y, source.z, source.type, source.rangePx, source.direction, source.lobes]);
}

/**
 * What the cells a pair of eyes reaches are worked out from besides the eyes and the walls:
 * whether the table is dark, and the lights a look needs to land on anything in the dark.
 */
export function visibleCellsLightKey(scene: VisionScene): string {
  return JSON.stringify([
    scene.darknessEnabled,
    scene.globalIllumination,
    scene.lights.map((light) => [
      light.x,
      light.y,
      light.z,
      light.brightPx,
      light.dimPx,
      light.angle,
      light.direction,
      light.pitch,
      light.ignoreOcclusion,
      light.surface,
    ]),
  ]);
}

/**
 * The cells each pair of eyes reaches, kept for as long as neither the eyes nor what they look
 * through have changed.
 *
 * A piece crossing the floor builds the scene again. Without this, every pair of eyes on the table
 * would work out its cells again with it, though only the one that moved could see anything new.
 */
export class VisibleCellsMemo {
  private surroundings: readonly unknown[] = [];
  private readonly held = new Map<string, { key: string; cells: CellBits }>();

  /**
   * The cells of one pair of eyes, worked out only when they are new.
   *
   * `surroundings` is what every pair looks through, the grid, the walls and the lights among
   * them; when any of it is not what it was, nothing kept is trusted.
   */
  recall(sourceId: string, sourceKey: string, surroundings: readonly unknown[], work: () => CellBits): CellBits {
    if (!sameItems(surroundings, this.surroundings)) {
      this.held.clear();
      this.surroundings = surroundings;
    }
    const kept = this.held.get(sourceId);
    if (kept?.key === sourceKey) return kept.cells;
    const cells = work();
    this.held.set(sourceId, { key: sourceKey, cells });
    return cells;
  }

  /** Lets go of the eyes that are no longer on the table. */
  keepOnly(sourceIds: ReadonlySet<string>): void {
    for (const id of [...this.held.keys()]) {
      if (!sourceIds.has(id)) this.held.delete(id);
    }
  }
}

function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
