import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  crackSvg,
  gravitySvg,
  impactStarSvg,
  ringSvg,
  speedLinesSvg,
  spikeSvg,
} from '@axe/domain/effect/effect-shapes';
import {
  appendFlareSpikes,
  blank,
  colorsOf,
  easeOutCubic,
  type EffectSprite,
  fadeInOut,
  glow,
  normalize,
  type Point3,
  takeRandoms,
} from '@axe/domain/effect/timeline/shared';

/**
 * The ground.
 *
 * What comes from underfoot: a slam, rubble, an upheaval, a mushroom cloud.
 */

const UPHEAVAL_SLAB_COUNT = 7;
/** A shield: a hexagonal dome raised, which pulses and goes. */
/**
 * A strike, which crushes rather than cuts.
 * At the moment of the blow a star bursts and speed lines run out, as a drawn blow is drawn.
 */
export function appendBash(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const lift = base * 0.6;

  // The flash at that moment. The shorter it is, the harder it sounds.
  const flash = normalize(progress / 0.1);
  if (flash < 1) {
    const size = base * (1.4 + flash * 1.6);
    sprites.push({
      ...blank(),
      key: `${prefix}-bash-flash`,
      x: center.x,
      y: center.y,
      z: center.z + lift,
      width: size,
      height: size,
      opacity: 1 - flash,
      background: 'radial-gradient(circle, #ffffff 0%, #ffffff 45%, transparent 72%)',
      borderRadius: '50%',
    });
  }

  // The star, which opens at once, holds and goes.
  const star = normalize(progress / 0.42);
  if (star > 0 && star < 1) {
    const size = base * (0.9 + easeOutCubic(star) * 2.1);
    sprites.push({
      ...blank(),
      key: `${prefix}-bash-star`,
      x: center.x,
      y: center.y,
      z: center.z + lift,
      width: size,
      height: size * 0.92,
      rotate: -8,
      opacity: 1 - star * star,
      svg: impactStarSvg(colorsOf(preset)),
      shadow: glow(base * 0.5 * (1 - star), preset.colorSecondary),
    });
  }

  // The speed lines, which run out a beat after it.
  const lines = normalize((progress - 0.04) / 0.4);
  if (lines > 0 && lines < 1) {
    const size = base * (1.4 + easeOutCubic(lines) * 3);
    sprites.push({
      ...blank(),
      key: `${prefix}-bash-lines`,
      x: center.x,
      y: center.y,
      z: center.z + lift,
      width: size,
      height: size,
      opacity: (1 - lines) * 0.9,
      svg: speedLinesSvg(colorsOf(preset)),
    });
  }

  const ring = normalize((progress - 0.08) / 0.8);
  if (ring > 0 && ring < 1) {
    const size = base * (0.8 + easeOutCubic(ring) * 3.2);
    sprites.push({
      ...blank(),
      key: `${prefix}-bash-shock`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: size,
      height: size,
      opacity: (1 - ring) * 0.8,
      svg: ringSvg(colorsOf(preset), 4),
      flat: true,
    });
  }
}

/** Gravity: the rings close inwards and pull towards the centre. */
export function appendGravity(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.16);

  sprites.push({
    ...blank(),
    key: `${prefix}-gravity-field`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: base * 2.6,
    height: base * 2.6,
    opacity: life * 0.75,
    svg: gravitySvg(colorsOf(preset)),
    animation: 'effectSpinSlow 4s linear infinite',
    flat: true,
  });

  // They close from outside in; the reverse of a spreading shock wave, which is what reads as a pull.
  for (let ring = 0; ring < 3; ring++) {
    const local = normalize((progress - ring * 0.18) / 0.62);
    if (local <= 0 || local >= 1) continue;
    const size = base * (3.2 - easeOutCubic(local) * 2.9);
    sprites.push({
      ...blank(),
      key: `${prefix}-gravity-ring-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + base * 0.5,
      width: size,
      height: size,
      opacity: (1 - local) * 0.85,
      svg: ringSvg(colorsOf(preset), 3),
    });
  }

  const core = base * (0.4 + Math.sin(progress * Math.PI) * 0.7);
  sprites.push({
    ...blank(),
    key: `${prefix}-gravity-core`,
    x: center.x,
    y: center.y,
    z: center.z + base * 0.5,
    width: core,
    height: core,
    opacity: life,
    background: `radial-gradient(circle, #000000 0%, ${preset.colorSecondary} 65%, transparent 85%)`,
    borderRadius: '50%',
    shadow: glow(base * 0.7, preset.colorSecondary),
  });
}

/** A heavy impact: three shock rings spreading along the ground over cracks that open and fade. */
export function appendImpact(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const crackJitter = takeRandoms(random, 8);

  for (let ring = 0; ring < 3; ring++) {
    const local = normalize((progress - ring * 0.17) / 0.8);
    if (local <= 0 || local >= 1) continue;
    const size = base * (0.8 + easeOutCubic(local) * 4.6);
    sprites.push({
      ...blank(),
      key: `${prefix}-shock-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: size,
      height: size,
      opacity: (1 - local) * 0.9,
      svg: ringSvg(colorsOf(preset), 3.5),
      flat: true,
    });
  }

  const crackSize = base * (1.4 + easeOutCubic(progress) * 3.2);
  sprites.push({
    ...blank(),
    key: `${prefix}-cracks`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: crackSize,
    height: crackSize,
    opacity: (1 - progress) * 0.8,
    svg: crackSvg(colorsOf(preset), 8, crackJitter),
    flat: true,
  });
}

/** Shattering rock: the cracks run and the rock breaks and flies, the flying rock drawn on the canvas. */
export function appendRubble(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const crackJitter = takeRandoms(random, 10);

  const crackSize = base * (1.2 + easeOutCubic(progress) * 2.6);
  sprites.push({
    ...blank(),
    key: `${prefix}-cracks`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: crackSize,
    height: crackSize,
    opacity: (1 - progress * 0.7) * 0.9,
    svg: crackSvg(colorsOf(preset), 10, crackJitter),
    flat: true,
  });

  const local = normalize(progress / 0.7);
  if (local > 0 && local < 1) {
    const ringSize = base * (0.9 + easeOutCubic(local) * 2.8);
    sprites.push({
      ...blank(),
      key: `${prefix}-shock-0`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: ringSize,
      height: ringSize,
      opacity: (1 - local) * 0.75,
      svg: ringSvg(colorsOf(preset), 3.5),
      flat: true,
    });
  }
}

/** An upheaval: the bedrock rises from the crack and throws the target up. */
export function appendUpheaval(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const slabAngles = takeRandoms(random, UPHEAVAL_SLAB_COUNT);
  const slabSizes = takeRandoms(random, UPHEAVAL_SLAB_COUNT);
  const crackJitter = takeRandoms(random, 8);

  const crackSize = base * (1.2 + easeOutCubic(progress) * 2.2);
  sprites.push({
    ...blank(),
    key: `${prefix}-cracks`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: crackSize,
    height: crackSize,
    opacity: Math.min(1, progress * 4) * (1 - progress * 0.6) * 0.9,
    svg: crackSvg(colorsOf(preset), 8, crackJitter),
    flat: true,
  });

  // It rises, holds at the top, breaks and sinks.
  for (let slab = 0; slab < UPHEAVAL_SLAB_COUNT; slab++) {
    const local = normalize((progress - slab * 0.05) / 0.85);
    if (local <= 0 || local >= 1) continue;
    const thrust = local < 0.45 ? easeOutCubic(local / 0.45) : 1 - (local - 0.45) / 0.55;
    const height = base * (1.1 + slabSizes[slab] * 1.5) * thrust;
    if (height <= 0) continue;
    const angle = (Math.PI * 2 * slab) / UPHEAVAL_SLAB_COUNT + slabAngles[slab] * 0.4;
    sprites.push({
      ...blank(),
      key: `${prefix}-slab-${slab}`,
      x: center.x + Math.cos(angle) * base * (0.5 + slabAngles[slab] * 0.5),
      y: center.y + Math.sin(angle) * base * (0.5 + slabAngles[slab] * 0.5),
      z: center.z + height * 0.5,
      width: base * (0.7 + slabSizes[slab] * 0.5),
      height,
      rotate: (slabAngles[slab] - 0.5) * 26,
      opacity: 0.95,
      svg: spikeSvg({ core: '#8a7259', edge: '#4a3a2c' }),
    });
  }
}

/** A mushroom cloud. Only the ring on the ground belongs here; the column and the cap are drawn on the canvas. */
export function appendMushroom(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  for (let ring = 0; ring < 3; ring++) {
    const local = normalize((progress - ring * 0.12) / 0.6);
    if (local <= 0 || local >= 1) continue;
    const size = base * (1.4 + easeOutCubic(local) * 8);
    sprites.push({
      ...blank(),
      key: `${prefix}-shock-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: size,
      height: size,
      opacity: (1 - local) * 0.85,
      svg: ringSvg(colorsOf(preset), 2.4),
      flat: true,
    });
  }

  const flash = normalize(progress / 0.16);
  if (flash < 1) appendFlareSpikes(sprites, prefix, center, base, flash, preset, 9, base * 0.8);
}
