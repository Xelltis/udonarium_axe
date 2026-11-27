import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import type { Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import {
  Box3,
  type DirectionalLight,
  type Frustum,
  type Layers,
  type Mesh,
  type Object3D,
  type PointLight,
  type Texture,
  Vector3,
} from 'three/webgpu';

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
 * A light that throws shadows on the table, as `shadowReachBox` reads it: the sun, by the way its rays
 * run, or a lamp, by where it stands and how far its light reaches.
 */
export type ShadowLight = { readonly runs: Vector3 } | { readonly at: Vector3; readonly reach: number };

/**
 * The box a thing and the shadow it throws may lie in: its own box, and the floor round it its
 * shadow may fall on, down to the deepest of the board's ground or lower where the thing stands lower.
 *
 * - The sun: each corner of the box carried along its rays down to the floor, no further than
 *   `reach`. A sun under the horizon adds nothing.
 * - A lamp over the thing: the same, from the lamp, kept to the square of the floor the lamp's light
 *   reaches round it, kept to only once the box is grown, so no part of the shadow between the
 *   corners is lost.
 * - A lamp standing within the height of the thing: the whole of that square, as the shadow of the
 *   part under the lamp may run out to the end of its light every way. A lamp no higher than the foot
 *   of the thing, or whose light does not reach it, adds nothing.
 */
export function shadowReachBox(box: Box3, lights: readonly ShadowLight[], reach: number, floor = 0): Box3 {
  const within = box.clone();
  if (box.isEmpty()) return within;
  const ground = Math.min(floor, box.min.y);
  for (const light of lights) {
    if ('runs' in light) {
      within.union(fallenBox(box, () => light.runs, reach, ground));
      continue;
    }
    if (light.at.y <= box.min.y || box.distanceToPoint(light.at) > light.reach) continue;
    const far = Math.min(reach, light.reach);
    const lit = new Box3(
      new Vector3(light.at.x - far, ground, light.at.z - far),
      new Vector3(light.at.x + far, Math.max(box.max.y, ground), light.at.z + far)
    );
    if (light.at.y <= box.max.y) {
      within.union(lit);
      continue;
    }
    const fallen = fallenBox(box, (corner) => new Vector3().subVectors(corner, light.at), reach, ground);
    if (fallen.intersectsBox(lit)) within.union(fallen.intersect(lit));
  }
  return within;
}

/** A box's corners carried along the rays that run through each, down to the floor, no further than `reach`, boxed. */
function fallenBox(box: Box3, rayAt: (corner: Vector3) => Vector3, reach: number, ground: number): Box3 {
  const fallen = new Box3();
  const corner = new Vector3();
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z);
    const ray = rayAt(corner);
    if (ray.y >= 0) continue;
    const length = ray.length();
    const fall = Math.max(0, Math.min(((ground - corner.y) / ray.y) * length, reach));
    fallen.expandByPoint(corner.clone().addScaledVector(ray, fall / length));
  }
  return fallen;
}

/**
 * The lights throwing shadows on the table now, as `shadowReachBox` reads them: the sun where it
 * throws them, its rays running from where it stands to where it looks, and each lamp lit with its
 * shadow, from where it stands in the room as far as its light reaches.
 */
export function shadowLightsOf(sun: DirectionalLight, lamps: readonly PointLight[]): ShadowLight[] {
  const lights: ShadowLight[] = [];
  if (sun.castShadow && sun.intensity > 0) {
    const from = sun.getWorldPosition(new Vector3());
    lights.push({ runs: sun.target.getWorldPosition(new Vector3()).sub(from) });
  }
  for (const lamp of lamps) {
    if (!lamp.visible || !lamp.castShadow || lamp.intensity <= 0) continue;
    lights.push({ at: lamp.getWorldPosition(new Vector3()), reach: lamp.distance > 0 ? lamp.distance : Infinity });
  }
  return lights;
}

/**
 * Whether something wearing a picture is in sight as just drawn: drawn for the camera and in its view,
 * or throwing a shadow, as a piece's board standing for its shadow alone does, that may fall in the
 * view (see `shadowReachBox`).
 */
export function seenOrShadowSeen(
  object: Object3D,
  eye: Layers,
  view: Frustum,
  shadows: { readonly lights: readonly ShadowLight[]; readonly reach: number; readonly floor: number }
): boolean {
  if (object.layers.test(eye) && view.intersectsObject(object)) return true;
  if (!object.castShadow || shadows.lights.length === 0) return false;
  return view.intersectsBox(
    shadowReachBox(new Box3().setFromObject(object), shadows.lights, shadows.reach, shadows.floor)
  );
}

/**
 * The deepest the board's ground goes, in table pixels: none deeper than the table where the ground is
 * flat.
 */
export function deepestGroundOf(world: TableWorld): number {
  const points = world.board?.ground?.points;
  let deepest = 0;
  if (!points) return deepest;
  for (let index = 2; index < points.length; index += 3) deepest = Math.min(deepest, points[index]);
  return deepest;
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
