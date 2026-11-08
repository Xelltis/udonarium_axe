import { BRDF_Lambert, diffuseColor, normalView, smoothstep } from 'three/tsl';
import {
  DirectionalLight,
  type Light,
  type LightingModel,
  MeshLambertNodeMaterial,
  type Node,
  type NodeBuilder,
  PhongLightingModel,
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
    const direction = input.lightDirection as Node<'vec3'>;
    const colour = input.lightColor as Node<'vec3'>;
    const diffuse = input.reflectedLight.directDiffuse as Node<'vec3'>;
    const facing = smoothstep(0, LAMP_EDGE, normalView.dot(direction));
    const lambert = BRDF_Lambert({ diffuseColor: diffuseColor.rgb }) as unknown as Node<'vec3'>;
    diffuse.addAssign(colour.mul(facing).mul(lambert));
  }
}

/** Has a face drawn with the scene's own light take the scene's lamps as the page lifts its darkness round a light. */
export function litByLamps(material: unknown): void {
  if (!(material instanceof MeshLambertNodeMaterial)) return;
  material.setupLightingModel = () => new LampLightingModel();
}
