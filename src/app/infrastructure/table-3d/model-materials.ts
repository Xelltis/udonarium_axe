import { materialKeyOf } from '@axe/core/storage/gltf-facts';
import type { MaterialLook, ModelFinish } from '@axe/domain/tabletop/model-look';
import { litByLampsAsMade } from '@axe/infrastructure/table-3d/lamp-lighting';
import { picturesOf } from '@axe/infrastructure/three-kit/read-pictures';
import {
  Color,
  type Material,
  MeshLambertNodeMaterial,
  type MeshStandardMaterial,
  MeshStandardNodeMaterial,
  MeshToonNodeMaterial,
  type Side,
  type Texture,
  Vector2,
} from 'three/webgpu';

/**
 * How much of what a model's materials were made of is drawn: all of it, their metal, their
 * roughness and their bumps, or their colour and picture alone, lit evenly, which a screen that draws
 * the table lightly draws.
 */
export type ModelDetail = 'full' | 'plain';

/** The material a model is drawn with in the scene, whichever of the scene's kinds it is. */
export type ModelSceneMaterial = MeshLambertNodeMaterial | MeshStandardNodeMaterial | MeshToonNodeMaterial;

/**
 * What a material of a model was made of, kept once the material its file was read into is let go
 * of, for the scene's own to be made from however its piece has it drawn: its colour and picture, how
 * it lets light through, its metal, its roughness and its bumps, and the glow it gives off.
 */
export interface MadeMaterial {
  /** What the material is told apart by among the model's, as `materialKeyOf` has it. */
  readonly key: string;
  readonly color: Color;
  readonly map: Texture | null;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly alphaTest: number;
  readonly side: Side;
  readonly vertexColors: boolean;
  readonly metalness: number;
  readonly roughness: number;
  readonly metalnessMap: Texture | null;
  readonly roughnessMap: Texture | null;
  readonly normalMap: Texture | null;
  readonly normalScale: Vector2;
  readonly emissive: Color;
  readonly emissiveMap: Texture | null;
  readonly emissiveIntensity: number;
  /** Every picture it wore, those the scene never draws among them. */
  readonly pictures: readonly Texture[];
}

/** What a material read from a model's file was made of, the material standing so far among the model's. */
export function madeMaterialOf(material: Material, index: number): MadeMaterial {
  const was = material as Partial<MeshStandardMaterial> & Material;
  return {
    key: materialKeyOf(material.name, index),
    color: was.color?.clone() ?? new Color(0xffffff),
    map: was.map ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    vertexColors: material.vertexColors,
    metalness: was.metalness ?? 0,
    roughness: was.roughness ?? 1,
    metalnessMap: was.metalnessMap ?? null,
    roughnessMap: was.roughnessMap ?? null,
    normalMap: was.normalMap ?? null,
    normalScale: was.normalScale?.clone() ?? new Vector2(1, 1),
    emissive: was.emissive?.clone() ?? new Color(0x000000),
    emissiveMap: was.emissiveMap ?? null,
    emissiveIntensity: was.emissiveIntensity ?? 1,
    pictures: picturesOf(material),
  };
}

/** Whether a material gives off a glow of its own that the scene keeps: only one of the app's own models does. */
function glowsAsMade(made: MadeMaterial, ownGlow: boolean): boolean {
  return ownGlow && made.emissive.getHex() !== 0;
}

/**
 * The pictures of a material the scene may draw it with, however its piece has it drawn: its colour's,
 * the picture of the glow it keeps, and at full detail those of its metal, its roughness and its
 * bumps. The rest it wore are never drawn.
 */
export function drawnPicturesOf(made: MadeMaterial, detail: ModelDetail, ownGlow: boolean): Texture[] {
  const drawn = [made.map, glowsAsMade(made, ownGlow) ? made.emissiveMap : null];
  if (detail === 'full') drawn.push(made.normalMap, made.metalnessMap, made.roughnessMap);
  return drawn.filter((picture): picture is Texture => picture !== null);
}

/**
 * A material of a model made as the scene's own, as its piece has it drawn. As it was made, it keeps
 * its metal, its roughness and its bumps at full detail and is lit evenly at plain; matt, it is lit
 * evenly whatever the detail; drawn as a figure, it is shaded in flat bands.
 *
 * Its colour is its own times the tint, or the tint alone where it is drawn plain, without its
 * picture. The glow it was made with, a neon tube's or a potion's, is kept as strong as it was made,
 * with the picture of that glow, only for one of the app's own models (`ownGlow`), made to glow on
 * purpose: one brought in may glow only as a way to look unlit, which would stand out of the dark of
 * a table. A glow its piece sets is given off by either.
 */
export function sceneMaterialFor(
  made: MadeMaterial,
  look: MaterialLook,
  finish: ModelFinish,
  detail: ModelDetail,
  ownGlow: boolean
): ModelSceneMaterial {
  const tint = look.tint ? new Color(look.tint) : null;
  const opacity = made.opacity * (look.opacity ?? 1);
  const keptGlow = glowsAsMade(made, ownGlow);
  const glow = look.glow
    ? { emissive: new Color(look.glow), emissiveMap: null, emissiveIntensity: look.glowStrength ?? 1 }
    : keptGlow
      ? {
          emissive: made.emissive,
          emissiveMap: made.emissiveMap,
          emissiveIntensity: look.glowStrength ?? made.emissiveIntensity,
        }
      : {};
  const common = {
    name: made.key,
    color: look.plain && tint ? tint : tint ? made.color.clone().multiply(tint) : made.color,
    map: look.plain ? null : made.map,
    transparent: made.transparent || opacity < 1,
    opacity,
    alphaTest: made.alphaTest,
    side: made.side,
    vertexColors: look.plain ? false : made.vertexColors,
    visible: !look.hidden,
    ...glow,
  };
  const bumps = detail === 'full' && made.normalMap ? { normalMap: made.normalMap, normalScale: made.normalScale } : {};
  if (finish === 'toon') return new MeshToonNodeMaterial({ ...common, ...bumps });
  if (finish === 'matte' || detail === 'plain') return new MeshLambertNodeMaterial(common);
  const material = new MeshStandardNodeMaterial({
    ...common,
    ...bumps,
    metalness: look.metalness ?? made.metalness,
    roughness: look.roughness ?? made.roughness,
    metalnessMap: look.metalness === null && !look.plain ? made.metalnessMap : null,
    roughnessMap: look.roughness === null && !look.plain ? made.roughnessMap : null,
  });
  litByLampsAsMade(material);
  return material;
}
