import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import { type Color, ShaderChunk, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

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
