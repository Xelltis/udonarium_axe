import { isPropOwnWallTextureId, WALL_TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';
import { FieldAtmosphere } from '@axe/domain/tabletop/field/field-atmosphere';
import { MapBlock, MapBlocks, MapMaterial } from '@axe/domain/tabletop/map-blocks';

/**
 * Whether the obstacle material has any business with this piece.
 *
 * It stands for what the rocks and the posts are made of. Foliage wears a ground texture
 * rather than a wall one, and dressing a canopy in planks would roof a wood in
 * decking. A piece that came with a skin of its own is left in it, wall shelf or not.
 */
function wearsWalls(block: MapBlock): boolean {
  const side = block.skin?.side;
  if (side?.kind !== 'texture') return false;
  return side.id in WALL_TEXTURE_ASSET_URLS && !isPropOwnWallTextureId(side.id);
}

/**
 * Puts the chosen materials over the ones the preset picked.
 *
 * A field is painted in bands, so there is no one floor to swap: the ground the panel
 * offers stands for the band the preset calls its own, and the rest keep their places.
 */
export function withFieldMaterials(
  blocks: MapBlocks,
  atmosphere: FieldAtmosphere,
  ground: MapMaterial,
  prop: MapMaterial
): MapBlocks {
  const base = atmosphere.defaultGround;
  return {
    ...blocks,
    paint: blocks.paint.map((patch) =>
      patch.material?.kind === 'texture' && patch.material.id === base ? { ...patch, material: ground } : patch
    ),
    blocks: blocks.blocks.map((block) =>
      wearsWalls(block) ? { ...block, skin: { ...block.skin!, side: prop } } : block
    ),
  };
}
