import { DungeonMaterial } from '@axe/application/tabletop/dungeon-build.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapPaint, MapSize } from '@axe/domain/tabletop/map-blocks';
import {
  cellKey,
  CellLayer,
  createLayer,
  createScene,
  FillStyle,
  MapScene,
} from '@axe/features/map-editor/model/scene';
import { IMAGE_TEXTURE_PREFIX } from '@axe/features/map-editor/model/textures';

export interface GroundMaterials {
  floor: DungeonMaterial;
  hazard: DungeonMaterial;
}

function fillFor(material: DungeonMaterial): FillStyle {
  const textureId = material.kind === 'texture' ? material.id : IMAGE_TEXTURE_PREFIX + material.identifier;
  return { type: 'texture', textureId, scale: 1, rotation: 0 };
}

/**
 * The ground of a dungeon as a map the editor could have painted.
 *
 * Everything a floor does, the picture on the table does for nothing: it is walked over,
 * seen past and lit through. Built out of terrain instead it would be a third of the pieces on
 * the table and every one of them synced.
 */
export function buildGroundScene(
  size: MapSize,
  paint: readonly MapPaint[],
  materials: GroundMaterials,
  cellPx: number,
  gridType: GridType = GridType.SQUARE
): MapScene {
  // The ground is painted on the same cells the blocks stand on. Painted as squares under a
  // hex board it would drift from them by an eighth of a cell across, since a hex column is
  // narrower than a hex is wide.
  const scene = createScene(size.width, size.height, cellPx, gridType);
  scene.gridVisible = false;

  const fills: Record<MapPaint['kind'], FillStyle> = {
    floor: fillFor(materials.floor),
    hazard: fillFor(materials.hazard),
  };

  const layer = createLayer('cell', 'floor') as CellLayer;
  for (const patch of paint) {
    for (let dy = 0; dy < patch.rect.h; dy++) {
      for (let dx = 0; dx < patch.rect.w; dx++) {
        layer.cells[cellKey(patch.rect.x + dx, patch.rect.y + dy)] = patch.material
          ? fillFor(patch.material)
          : fills[patch.kind];
      }
    }
  }
  scene.layers.push(layer);

  return scene;
}
