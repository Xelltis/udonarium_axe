import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import { throwSeedOf } from '@axe/domain/dice/dice-3d/throw-seed';
import type { DiceColors } from '@axe/infrastructure/dice-3d/dice-textures';
import {
  Color,
  DoubleSide,
  type MeshPhysicalMaterialParameters,
  ShaderChunk,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * How each material takes the light, before the marks painted on it.
 *
 * Resin is the plain die every roll had before looks were offered, glossy under a clear coat.
 * Marble is the same resin swirled with a second colour. Metal mirrors the studio, so it is lit
 * more strongly to show it, and it wears no clear coat. Glass lets the light through.
 */
export const FINISHES: Readonly<Record<DiceMaterial, MeshPhysicalMaterialParameters>> = {
  resin: { roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, ior: 1.5 },
  marble: { roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5 },
  metal: { roughness: 0.3, metalness: 1, clearcoat: 0, envMapIntensity: 1.8 },
  glass: {
    roughness: 0.04,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.03,
    ior: 1.5,
    transmission: 1,
    thickness: 1.2,
    attenuationDistance: 2.4,
    side: DoubleSide,
  },
};

/**
 * The colours a material's faces are painted in. Glass takes its colour from how far light goes
 * through it, deep where it is thick and pale at its edges, so its faces are painted a pale wash of
 * it; the rest are painted as they are.
 */
export function faceColorsOf(material: DiceMaterial, colors: DiceColors): DiceColors {
  if (material !== 'glass') return colors;
  const wash = new Color(colors.body).lerp(new Color(1, 1, 1), 0.5);
  return { ...colors, body: `#${wash.getHexString()}` };
}

/** The values a dressed die's shader reads: where its marks lie, the colour of its veins, and its own swirl. */
export interface DiceDressing {
  readonly diceMarks: { value: Texture };
  readonly diceVein: { value: Color };
  readonly diceSeed: { value: number };
  /** The picture wrapped round a die, for a die that wears one. */
  readonly dicePicture?: { value: Texture };
}

/** What a die's shader is dressed for: a material, or a picture wrapped round a resin die. */
export type DiceDressingKind = DiceMaterial | 'picture';

const HEAD = /* glsl */ `
uniform sampler2D diceMarks;
uniform vec3 diceVein;
uniform float diceSeed;
varying vec3 vDiceSpot;

float diceHash( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

float diceNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( diceHash( i ), diceHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
         mix( diceHash( i + vec3( 0.0, 1.0, 0.0 ) ), diceHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
    mix( mix( diceHash( i + vec3( 0.0, 0.0, 1.0 ) ), diceHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
         mix( diceHash( i + vec3( 0.0, 1.0, 1.0 ) ), diceHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
    f.z );
}

float diceFbm( vec3 p ) {
  float sum = 0.0;
  float weight = 0.5;
  for ( int octave = 0; octave < 5; octave++ ) {
    sum += weight * diceNoise( p );
    p = p * 2.03 + vec3( 11.7, 3.1, 7.9 );
    weight *= 0.5;
  }
  return sum;
}
`;

/** Where the marks lie, read once the faces' picture is. */
const MARKS = /* glsl */ `
float diceMark = texture2D( diceMarks, vMapUv ).r;
`;

/**
 * The swirl of a marbled die, worked out from where on the die each point lies rather than from the
 * faces' picture, so its veins run on across the edges between faces as they do in cast resin.
 */
const MARBLE = /* glsl */ `
vec3 diceAt = vDiceSpot * 0.9 + vec3( diceSeed, diceSeed * 0.61, diceSeed * 1.37 );
float diceWarp = diceFbm( diceAt * 1.3 );
float diceSwirl = 0.5 + 0.5 * sin( ( diceAt.x * 1.1 + diceAt.y * 0.7 + diceAt.z * 0.4 ) * 2.2 + diceWarp * 6.5 );
float diceVeined = smoothstep( 0.45, 0.95, diceSwirl ) * 0.65;
float diceEdge = smoothstep( 0.38, 0.46, diceSwirl ) - smoothstep( 0.46, 0.56, diceSwirl );
vec3 diceStone = mix( diffuseColor.rgb, diceVein, diceVeined ) * ( 1.0 - diceEdge * 0.3 );
diffuseColor.rgb = mix( diceStone, diffuseColor.rgb, diceMark );
`;

/**
 * A picture wrapped round a die, laid on from the three directions across it and blended by which
 * way each face looks, so it runs on across the edges between faces; each die shows its own part of
 * it. Where the picture is clear the die's own colour shows, and the marks stay paint.
 */
const PICTURE = /* glsl */ `
vec3 dicePictureWeight = pow( abs( normalize( vDiceNormal ) ), vec3( 4.0 ) );
dicePictureWeight /= dicePictureWeight.x + dicePictureWeight.y + dicePictureWeight.z;
vec2 dicePictureShift = vec2( diceSeed * 0.1371, diceSeed * 0.2913 );
vec3 dicePictureAt = vDiceSpot * 0.5;
vec4 dicePictureColor =
  texture2D( dicePicture, dicePictureAt.yz + dicePictureShift ) * dicePictureWeight.x +
  texture2D( dicePicture, dicePictureAt.xz + dicePictureShift ) * dicePictureWeight.y +
  texture2D( dicePicture, dicePictureAt.xy + dicePictureShift ) * dicePictureWeight.z;
vec3 diceWorn = mix( diffuseColor.rgb, dicePictureColor.rgb, dicePictureColor.a );
diffuseColor.rgb = mix( diceWorn, diffuseColor.rgb, diceMark );
`;

/** Paint where the marks lie: no metal and a duller sheen. */
const PAINTED_ROUGHNESS = /* glsl */ `
roughnessFactor = mix( roughnessFactor, 0.55, diceMark );
`;
const PAINTED_METALNESS = /* glsl */ `
metalnessFactor *= 1.0 - diceMark;
`;

/** Glass lets the light through everywhere but where its marks are painted. */
const GLASS_TRANSMISSION = ShaderChunk.transmission_fragment.replace(
  'material.transmission = transmission;',
  'material.transmission = transmission * ( 1.0 - diceMark );'
);

/**
 * Has a die's material drawn as marble, metal or glass: its marks kept as paint read from where they
 * lie, and for marble a swirl of the vein colour through the rest. Resin needs none of it.
 */
export function dressDie(
  material: DiceDressingKind,
  dressing: DiceDressing
): (shader: WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    Object.assign(shader.uniforms, dressing);
    const pictured = material === 'picture';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vDiceSpot;${pictured ? '\nvarying vec3 vDiceNormal;' : ''}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvDiceSpot = position;${pictured ? '\nvDiceNormal = normal;' : ''}`
      );
    const head = pictured ? `${HEAD}\nuniform sampler2D dicePicture;\nvarying vec3 vDiceNormal;` : HEAD;
    const worn = material === 'marble' ? MARBLE : pictured ? PICTURE : '';
    let fragment = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${MARKS}${worn}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${PAINTED_ROUGHNESS}`);
    if (material === 'metal') {
      fragment = fragment.replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>\n${PAINTED_METALNESS}`
      );
    }
    if (material === 'glass') fragment = fragment.replace('#include <transmission_fragment>', GLASS_TRANSMISSION);
    shader.fragmentShader = fragment;
  };
}

/**
 * A seed for a die's swirl, and for the part of a wrapped picture it shows, from what its roll is
 * known by and which die of it this is: the same wherever and however the roll is drawn, and
 * different for every die and every roll.
 */
export function swirlSeedOf(seedKey: string, index: number): number {
  return (throwSeedOf(seedKey, index) % 50_000) / 1000;
}

/**
 * The colour of a marbled die's veins: the body lightened toward white for a dark die, and darkened
 * for a light one, so the swirl shows whatever colour the die is.
 */
export function veinOf(body: string): Color {
  const color = new Color(body);
  const { l } = color.getHSL({ h: 0, s: 0, l: 0 });
  return l > 0.55 ? color.multiplyScalar(0.55) : color.lerp(new Color(1, 1, 1), 0.34);
}
