import { colourNode } from '@axe/infrastructure/three-kit/colour-node';
import { mix, reflectVector, roughness, smoothstep, specularColorBlended, uniform } from 'three/tsl';
import { Vector3 } from 'three/webgpu';

/**
 * How bright what is mirrored is, beside the light of the sky on a level surface: overhead, where
 * the sky is open; towards the horizon, where what stands round a table, darker than the sky, is
 * mirrored instead; and all round alike, as a surface too rough to tell them apart mirrors them.
 */
const OVERHEAD = 1.15;
const ROUND_ABOUT = 0.3;
const ALL_ROUND = 0.8;

/**
 * The sky as a surface that keeps its metal and its roughness mirrors it: metal takes little light of
 * its own, and with nothing to mirror would stand dark. The open sky overhead, what stands round the
 * table towards the horizon, darker, and the ground under it are told by the way the eye's line is
 * thrown back, in the colour the surface mirrors in; it is the dark towards the horizon that shows
 * the shape of what mirrors it. A rough surface mirrors as much as a smooth one, only blurred, so the
 * rougher it is the more of all round alike it shows.
 */
export class SkyMirror {
  private readonly sky = uniform(new Vector3());
  private readonly ground = uniform(new Vector3());
  /** What a surface gives off for mirroring the sky, to be added to whatever else it gives off. */
  readonly node = this.mirrored();

  /**
   * Sets the sky mirrored: the light of the sky in its colour and as strong as it falls on a level
   * surface, and the ground under it as much dimmer as `ground` says; answers whether anything changed.
   */
  set(colour: { r: number; g: number; b: number }, strength: number, ground: number): boolean {
    const sky = this.sky.value;
    const under = this.ground.value;
    const [r, g, b] = [colour.r * strength, colour.g * strength, colour.b * strength];
    const same = (v: Vector3, x: number, y: number, z: number) => v.x === x && v.y === y && v.z === z;
    if (same(sky, r, g, b) && same(under, r * ground, g * ground, b * ground)) return false;
    sky.set(r, g, b);
    under.set(r * ground, g * ground, b * ground);
    return true;
  }

  private mirrored() {
    const up = reflectVector.y;
    const blur = roughness.mul(roughness);
    const above = mix(this.sky.mul(ROUND_ABOUT), this.sky.mul(OVERHEAD), smoothstep(0.05, 0.8, up));
    const edge = blur.add(0.08);
    const told = mix(this.ground, above, smoothstep(edge.negate(), edge, up));
    const seen = mix(told, this.sky.mul(ALL_ROUND), blur);
    return colourNode(seen.mul(specularColorBlended));
  }
}
