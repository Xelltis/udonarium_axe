import { BRDF_Lambert, diffuseColor, normalView, smoothstep, vec3 } from 'three/tsl';
import {
  DirectionalLight,
  type Light,
  type LightingModel,
  MeshLambertNodeMaterial,
  MeshStandardNodeMaterial,
  type Node,
  type NodeBuilder,
  PhongLightingModel,
  PhysicalLightingModel,
} from 'three/webgpu';

/** How far round from facing a lamp a face still takes its light whole, in the cosine of the angle. */
const LAMP_EDGE = 0.08;

type DirectInput = Parameters<LightingModel['direct']>[0];

/**
 * How the scene lights a face drawn with its own light: the sun and the moon by how squarely their
 * light falls, as ever; a lamp all alike over the side that faces it, as the page's darkness is
 * lifted round a light, rather than the fainter the more aslant its light falls. A lamp stands at
 * the height of an eye, so the floor round it would otherwise be lit only close by, and what stands
 * in its light would throw a shadow too faint to read.
 */
class LampLightingModel extends PhongLightingModel {
  constructor() {
    super(false);
  }

  override direct(input: DirectInput, builder: NodeBuilder): void {
    const light = (input.lightNode as unknown as { light?: Light }).light;
    if (light instanceof DirectionalLight) {
      super.direct(input, builder);
      return;
    }
    (input.reflectedLight.directDiffuse as Node<'vec3'>).addAssign(evenLampLight(input));
  }
}

/** A lamp's light all alike over the side of a face that faces it, in the face's own colour. */
function evenLampLight(input: DirectInput): Node<'vec3'> {
  const direction = input.lightDirection as Node<'vec3'>;
  const colour = input.lightColor as Node<'vec3'>;
  const facing = smoothstep(0, LAMP_EDGE, normalView.dot(direction));
  const lambert = BRDF_Lambert({ diffuseColor: diffuseColor.rgb }) as unknown as Node<'vec3'>;
  return colour.mul(facing).mul(lambert);
}

/**
 * How the scene lights a model drawn as it was made, with its metal and its roughness: the sun and
 * the moon as such a surface takes any light; a lamp all alike over the side that faces it, as
 * {@link LampLightingModel} has it, in the surface's own colour whatever metal it is, with the gleam
 * the lamp throws on it added as the surface would throw it. Metal mirrors rather than takes light,
 * and by a lamp alone, with nothing round it to mirror, would stand black.
 */
class LampPhysicalLightingModel extends PhysicalLightingModel {
  override direct(input: DirectInput, builder: NodeBuilder): void {
    const light = (input.lightNode as unknown as { light?: Light }).light;
    if (light instanceof DirectionalLight) {
      super.direct(input, builder);
      return;
    }
    const lit = input.reflectedLight;
    (lit.directDiffuse as Node<'vec3'>).addAssign(evenLampLight(input));
    super.direct({ ...input, reflectedLight: { ...lit, directDiffuse: vec3(0).toVar() } } as DirectInput, builder);
  }
}

/**
 * Has a model's material that keeps its metal and its roughness take the scene's lamps as
 * {@link LampPhysicalLightingModel} lights it; any other material is left as it is.
 */
export function litByLampsAsMade(material: unknown): void {
  if (!(material instanceof MeshStandardNodeMaterial)) return;
  material.setupLightingModel = () => new LampPhysicalLightingModel();
}

/** Has a face drawn with the scene's own light take the scene's lamps as the page lifts its darkness round a light. */
export function litByLamps(material: unknown): void {
  if (!(material instanceof MeshLambertNodeMaterial)) return;
  material.setupLightingModel = () => new LampLightingModel();
}
