import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import { FINISHES } from '@axe/infrastructure/dice-3d/dice-finishes';
import {
  abs,
  float,
  floor,
  Fn,
  fract,
  Loop,
  mix,
  normalGeometry,
  normalize,
  positionGeometry,
  pow,
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { type Color, MeshPhysicalNodeMaterial, type Node, type Texture, Vector2 } from 'three/webgpu';

/** What a die's material on the table is made from: its finish and the pictures painted, carved and marked on its faces. */
export interface DiceNodeLook {
  /** The finish it is drawn with, or a picture wrapped round a resin die. */
  readonly kind: DiceMaterial | 'picture';
  readonly faces: Texture;
  readonly engraving: Texture;
  /** Where the marks are painted on the faces, which keep paint's dull sheen whatever the die is made of. */
  readonly marks: Texture;
  /** The colour of a marbled die's veins. */
  readonly vein: Color;
  /** What a marbled die's swirl and a wrapped picture's place on the die are worked out from. */
  readonly seed: number;
  readonly picture?: Texture;
  /** The colour a glass die tints the light that goes through it. */
  readonly tint?: Color;
  /** The studio the die mirrors. */
  readonly studio: Texture | null;
}

const hash = Fn(([at]: [Node<'vec3'>]) => {
  const p = fract(at.mul(0.3183099).add(vec3(0.71, 0.113, 0.419)))
    .mul(17)
    .toVar();
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
});

const noise = Fn(([at]: [Node<'vec3'>]) => {
  const i = floor(at).toVar();
  const f = fract(at).toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  const corner = (x: number, y: number, z: number) => hash(i.add(vec3(x, y, z)));
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), f.x), mix(corner(0, 1, 0), corner(1, 1, 0), f.x), f.y),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), f.x), mix(corner(0, 1, 1), corner(1, 1, 1), f.x), f.y),
    f.z
  );
});

const fbm = Fn(([start]: [Node<'vec3'>]) => {
  const sum = float(0).toVar();
  const weight = float(0.5).toVar();
  const p = vec3(start).toVar();
  Loop(5, () => {
    sum.addAssign(weight.mul(noise(p)));
    p.assign(p.mul(2.03).add(vec3(11.7, 3.1, 7.9)));
    weight.mulAssign(0.5);
  });
  return sum;
});

/**
 * The material a die on the table is drawn with: the same finish, faces, carving and paint as the
 * dice of a chat frame, written for the table's own renderer. Marble is swirled from where on the
 * die each point lies, so its veins run on across the edges; a wrapped picture is laid on from the
 * three directions across the die; and wherever a mark is painted the die keeps paint's dull sheen,
 * no metal, and lets no light through.
 */
export function diceNodeMaterial(look: DiceNodeLook): MeshPhysicalNodeMaterial {
  const finish = FINISHES[look.kind === 'picture' ? 'resin' : look.kind];
  const material = new MeshPhysicalNodeMaterial({
    ...finish,
    map: look.faces,
    normalMap: look.engraving,
    normalScale: new Vector2(1, 1),
    transparent: true,
  });
  if (look.studio) material.envMap = look.studio;
  if (look.tint) material.attenuationColor = look.tint;
  if (look.kind === 'resin') return material;
  const mark = texture(look.marks, uv()).r;
  const base = texture(look.faces, uv());
  if (look.kind === 'marble') {
    const seed = float(look.seed);
    const at = positionGeometry.mul(0.9).add(vec3(seed, seed.mul(0.61), seed.mul(1.37)));
    const warp = fbm(at.mul(1.3));
    const swirl = sin(at.x.mul(1.1).add(at.y.mul(0.7)).add(at.z.mul(0.4)).mul(2.2).add(warp.mul(6.5)))
      .mul(0.5)
      .add(0.5);
    const veined = smoothstep(0.45, 0.95, swirl).mul(0.65);
    const edge = smoothstep(0.38, 0.46, swirl).sub(smoothstep(0.46, 0.56, swirl));
    const stone = mix(base.rgb, vec3(look.vein.r, look.vein.g, look.vein.b), veined).mul(float(1).sub(edge.mul(0.3)));
    material.colorNode = vec4(mix(stone, base.rgb, mark), base.a);
  }
  if (look.kind === 'picture' && look.picture) {
    const weight = pow(abs(normalize(normalGeometry)), vec3(4)).toVar();
    weight.divAssign(weight.x.add(weight.y).add(weight.z));
    const shift = vec2(look.seed * 0.1371, look.seed * 0.2913);
    const at = positionGeometry.mul(0.5);
    const worn = texture(look.picture, at.yz.add(shift))
      .mul(weight.x)
      .add(texture(look.picture, at.xz.add(shift)).mul(weight.y))
      .add(texture(look.picture, at.xy.add(shift)).mul(weight.z));
    material.colorNode = vec4(mix(mix(base.rgb, worn.rgb, worn.a), base.rgb, mark), base.a);
  }
  material.roughnessNode = mix(float(finish.roughness ?? 0.5), float(0.55), mark);
  if (look.kind === 'metal') material.metalnessNode = float(finish.metalness ?? 0).mul(float(1).sub(mark));
  if (look.kind === 'glass') material.transmissionNode = float(finish.transmission ?? 0).mul(float(1).sub(mark));
  return material;
}
