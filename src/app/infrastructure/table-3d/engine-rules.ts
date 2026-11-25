import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import type { Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import type { Mesh, Object3D, Texture } from 'three/webgpu';

/** How wide, in degrees, a camera sees that looks through a box `heightPx` tall from `focalPx` in front of it. */
export function fieldOfViewDeg(heightPx: number, focalPx: number): number {
  return (2 * Math.atan(heightPx / 2 / focalPx) * 180) / Math.PI;
}

/**
 * The finishing a scene is drawn through: the plan's, with the glow spilled only where anything
 * glows, the lamps of a dark table, so a table with nothing glowing on it is drawn straight onto the
 * canvas at any quality short of the one that shades its corners.
 */
export function finishingOf(plan: Table3dQualityPlan, glowing: boolean): Table3dQualityPlan {
  return plan.bloom && !glowing ? { ...plan, bloom: false } : plan;
}

/** What a loaded picture is known by: its url and the way it is worn, tiled, stretched or as a sprite. */
export function pictureKey(url: string, worn: string): string {
  return `${url}|${worn}`;
}

/** The key of a picture shared by everything that wears it the same way, tiled or stretched. */
export function sharedPictureKey(url: string, tiled: boolean): string {
  return pictureKey(url, String(tiled));
}

/** The url of a picture known by {@link pictureKey}. */
export function urlOfPictureKey(key: string): string {
  return key.slice(0, key.lastIndexOf('|'));
}

/**
 * The urls of the pictures the things of a world wear: the faces of the blocks and the walls and the
 * grids laid over walls, the sprites drawn as pictures, the layers and the backdrops, and the board.
 */
export function wornPictures(world: TableWorld): Set<string> {
  const worn = new Set<string>();
  for (const face of [...world.walls, ...world.caps]) worn.add(face.pictureUrl);
  for (const wall of world.walls) if (wall.gridUrl) worn.add(wall.gridUrl);
  for (const sprite of world.sprites) if (sprite.look.kind === 'picture') worn.add(sprite.look.url);
  for (const layer of [...world.layers, ...world.backdrops]) worn.add(layer.pictureUrl);
  if (world.board?.pictureUrl) worn.add(world.board.pictureUrl);
  return worn;
}

/** The keys, of {@link pictureKey}, of the loaded pictures none of the urls given is of. */
export function unwornPictureKeys(keys: Iterable<string>, worn: ReadonlySet<string>): string[] {
  return [...keys].filter((key) => !worn.has(urlOfPictureKey(key)));
}

/**
 * The pictures worn by what is drawn under a group and throws a shadow, as the faces of blocks and
 * walls: a moving one among them has the shadows drawn again as its frames change.
 */
export function shadowCastingPictures(root: Object3D): Set<Texture> {
  const pictures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const picture = (material as { map?: Texture | null }).map;
      if (picture) pictures.add(picture);
    }
  });
  return pictures;
}

/**
 * The pictures of a world drawn through the nodes of their materials rather than as a map, as the
 * engine shares them (see {@link sharedPictureKey}): the board stretched, and tiled the layers laid
 * over it and the backdrops stood round it under a sky. Where they are drawn is not told, so a
 * moving one among them is taken as always in sight; what is not laid, for want of a board or a
 * sky, wears nothing.
 */
export function nodeWornPictures(
  world: TableWorld,
  sky: boolean,
  pictureOf: (key: string) => Texture | undefined
): Set<Texture> {
  const pictures = new Set<Texture>();
  if (!world.board) return pictures;
  const add = (url: string, tiled: boolean) => {
    const picture = url ? pictureOf(sharedPictureKey(url, tiled)) : undefined;
    if (picture) pictures.add(picture);
  };
  add(world.board.pictureUrl, false);
  for (const layer of world.layers) add(layer.pictureUrl, true);
  if (sky) for (const backdrop of world.backdrops) add(backdrop.pictureUrl, true);
  return pictures;
}
