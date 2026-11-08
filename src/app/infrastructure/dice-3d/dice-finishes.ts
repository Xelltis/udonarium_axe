import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
import { throwSeedOf } from '@axe/domain/dice/dice-3d/throw-seed';
import type { DiceColors } from '@axe/infrastructure/dice-3d/dice-textures';
import { Color, DoubleSide, type MeshPhysicalMaterialParameters } from 'three';

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
