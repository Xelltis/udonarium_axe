import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  barrierSvg,
  boltSvg,
  magicCircleSvg,
  ringSvg,
  snowflakeSvg,
  spikeSvg,
  spiralSvg,
} from '@axe/domain/effect/effect-shapes';
import { projectDirection, type ViewRotation } from '@axe/domain/effect/effect-view';
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
 * A working.
 *
 * A circle, lightning, ice or an aura: what happens about the target.
 */

const BOLT_SEGMENT_COUNT = 9;
const BOLT_BRANCH_COUNT = 3;
/** How long the bolt itself is out, which the animation is matched to. */
const BOLT_STRIKE_END = 0.45;
const FROST_SHARD_COUNT = 8;
const FROST_SPIKE_COUNT = 6;
const CURSE_RING_COUNT = 3;
const ARC_NODE_COUNT = 10;
/** How long the discharge runs. */
const ARC_STRIKE_END = 0.4;
const ARC_LAYERS = [
  { key: 'aura', width: 0.26, opacity: 0.5 },
  { key: 'core', width: 0.08, opacity: 1 },
];
const AURA_PULSE_COUNT = 3;
const AURA_SPIKE_COUNT = 6;
const HEAL_RING_COUNT = 3;

/**
 * A current: a jagged discharge that runs from the origin to the target in an instant.
 *
 * Its joints are built in the plane of the screen. A straight line in space is straight on
 * the screen, so offsetting across the direction of travel makes it zigzag with both ends still joined.
 */
export function appendArc(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  origin: Point3,
  random: () => number,
  view: ViewRotation | null | undefined
): void {
  const jitters = takeRandoms(random, ARC_NODE_COUNT + 1);
  const strike = normalize(progress / ARC_STRIKE_END);

  if (strike < 1) {
    const link = projectDirection(center.x - origin.x, center.y - origin.y, center.z + base * 0.6 - origin.z, view);
    const radians = (link.angle * Math.PI) / 180;
    const alongX = Math.cos(radians);
    const alongY = Math.sin(radians);
    const spread = base * 0.55;

    // Both ends are held at nothing, so it clings to the caster and the target.
    const nodes = Array.from({ length: ARC_NODE_COUNT + 1 }, (_unused, index) => {
      const along = index / ARC_NODE_COUNT;
      return { along: link.length * along, side: (jitters[index] - 0.5) * 2 * spread * Math.sin(along * Math.PI) };
    });

    const strikeMs = Math.round(preset.duration * ARC_STRIKE_END);
    for (let segment = 0; segment < ARC_NODE_COUNT; segment++) {
      const from = nodes[segment];
      const to = nodes[segment + 1];
      const runX = to.along - from.along;
      const runY = to.side - from.side;
      const length = Math.hypot(runX, runY);
      if (length < 0.5) continue;

      const midAlong = (from.along + to.along) / 2;
      const midSide = (from.side + to.side) / 2;
      // The direction of travel is placed in space, so each joint carries its own depth and sits
      // properly in front of and behind the pieces and names between. Only the offset across it is added in the plane.
      const fraction = link.length > 0 ? midAlong / link.length : 0;
      const anchor = {
        x: origin.x + (center.x - origin.x) * fraction,
        y: origin.y + (center.y - origin.y) * fraction,
        z: origin.z + (center.z + base * 0.6 - origin.z) * fraction,
      };
      const offsetX = -alongY * midSide;
      const offsetY = alongX * midSide;
      const angle = link.angle + (Math.atan2(runY, runX) * 180) / Math.PI;

      for (const layer of ARC_LAYERS) {
        sprites.push({
          ...blank(),
          key: `${prefix}-arc-${segment}-${layer.key}`,
          x: anchor.x,
          y: anchor.y,
          z: anchor.z,
          offsetX,
          offsetY,
          width: length + base * 0.06,
          height: base * layer.width,
          rotate: angle,
          background:
            layer.key === 'core'
              ? `linear-gradient(180deg, ${preset.colorPrimary}, #ffffff 45%, ${preset.colorPrimary})`
              : `linear-gradient(180deg, transparent, ${preset.colorSecondary} 40%, ${preset.colorPrimary} 60%, transparent)`,
          borderRadius: '50%',
          opacity: layer.opacity,
          shadow: layer.key === 'core' ? glow(base * 0.4, '#ffffff', base * 1.1, preset.colorSecondary) : '',
          animation: `effectBoltStrike ${strikeMs}ms linear forwards`,
        });
      }
    }
  }

  const scorch = base * (1.2 + easeOutCubic(progress) * 1.8);
  sprites.push({
    ...blank(),
    key: `${prefix}-arc-scorch`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: scorch,
    height: scorch,
    opacity: (1 - progress) * 0.6,
    background: `radial-gradient(circle, #ffffff 0%, ${preset.colorSecondary} 40%, transparent 74%)`,
    borderRadius: '50%',
    flat: true,
  });

  if (progress < 0.4) appendFlareSpikes(sprites, prefix, center, base, progress / 0.4, preset, 3.2, base * 0.5);
}

/** A curse mark: it is cut, binds the target and sinks. */
export function appendCurse(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.25);
  const stamp = normalize(progress / 0.35);

  // The mark, which comes down and is cut.
  const markSize = base * (2.4 - Math.min(stamp, 1) * 0.9);
  sprites.push({
    ...blank(),
    key: `${prefix}-curse-mark`,
    x: center.x,
    y: center.y,
    z: center.z + base * (1.6 - Math.min(stamp, 1) * 1.55),
    width: markSize,
    height: markSize,
    opacity: life * 0.95,
    svg: magicCircleSvg(colorsOf(preset)),
    animation: 'effectSpinReverse 5s linear infinite',
    flat: true,
  });

  // The binding rings, which close on the target from above and below.
  for (let ring = 0; ring < CURSE_RING_COUNT; ring++) {
    const local = normalize((progress - ring * 0.12) / 0.7);
    if (local <= 0 || local >= 1) continue;
    const size = base * (1.9 - local * 0.8);
    sprites.push({
      ...blank(),
      key: `${prefix}-curse-ring-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + base * (1.5 - local * 1.2) + ring * base * 0.35,
      width: size,
      height: size,
      opacity: (1 - local) * 0.8,
      svg: ringSvg(colorsOf(preset), 4, true),
      flat: true,
    });
  }
}

/** A barrier: a pulsing dome over the target with a slowly turning ring at its feet. */
export function appendBarrier(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.18);
  const dome = base * (1.9 + Math.sin(progress * Math.PI) * 0.25);

  sprites.push({
    ...blank(),
    key: `${prefix}-dome`,
    x: center.x,
    y: center.y,
    z: center.z + base * 0.9,
    width: dome,
    height: dome,
    opacity: life * 0.9,
    svg: barrierSvg(colorsOf(preset)),
    animation: 'effectPulseSoft 1.6s ease-in-out infinite',
  });

  const foot = base * 1.9;
  sprites.push({
    ...blank(),
    key: `${prefix}-barrier-ring`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: foot,
    height: foot,
    opacity: life * 0.8,
    svg: ringSvg(colorsOf(preset), 3),
    animation: 'effectSpinSlow 8s linear infinite',
    flat: true,
  });
}

/** A translocation: the circle folds, becomes a column of light and is gone. */
export function appendWarp(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.25);
  const shrink = 1 - easeOutCubic(progress) * 0.75;

  sprites.push({
    ...blank(),
    key: `${prefix}-warp-circle`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: base * 2.2 * shrink,
    height: base * 2.2 * shrink,
    opacity: life * 0.9,
    svg: magicCircleSvg(colorsOf(preset)),
    animation: 'effectSpinSlow 3s linear infinite',
    flat: true,
  });

  // The column rises in the plane of the screen, so it is raised there too.
  // Raised along the world axis it would part from the circle at the feet as the board tilts.
  const columnHeight = base * 3.4;
  sprites.push({
    ...blank(),
    key: `${prefix}-warp-column`,
    x: center.x,
    y: center.y,
    z: center.z,
    offsetY: -columnHeight / 2,
    width: base * 1.2 * shrink,
    height: columnHeight,
    opacity: life * 0.75,
    background: `linear-gradient(180deg, transparent, ${preset.colorPrimary} 45%, #ffffff 80%, ${preset.colorSecondary})`,
    borderRadius: '50%',
    shadow: glow(base * 0.6, preset.colorPrimary),
  });
}

/**
 * A burst: two shock rings spreading along the ground, a flash of spikes and a fading scorch.
 *
 * Also what an effect kind with no painter of its own falls back to, so a new kind at least shows
 * something.
 */
export function appendBurst(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  for (let ring = 0; ring < 2; ring++) {
    const local = normalize((progress - ring * 0.16) / 0.8);
    if (local <= 0 || local >= 1) continue;
    const ringSize = base * (1.1 + easeOutCubic(local) * 3.6);
    sprites.push({
      ...blank(),
      key: `${prefix}-ring-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: ringSize,
      height: ringSize,
      opacity: (1 - local) * 0.85,
      svg: ringSvg(colorsOf(preset), 3.5),
      flat: true,
    });
  }

  if (progress < 0.3) appendFlareSpikes(sprites, prefix, center, base, progress / 0.3, preset, 4.4, base * 0.6);

  const scorch = base * (1.4 + easeOutCubic(progress) * 2);
  sprites.push({
    ...blank(),
    key: `${prefix}-scorch`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: scorch,
    height: scorch,
    opacity: (1 - progress) * 0.5,
    background: `radial-gradient(circle, ${preset.colorSecondary} 0%, transparent 70%)`,
    borderRadius: '50%',
    flat: true,
  });
}

/**
 * The glowing bed under a flame, pulsing on the ground.
 *
 * The flames themselves are particles drawn elsewhere; this is only the part laid down as a sprite.
 */
export function appendFlame(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.22);
  const bed = base * 1.3;
  sprites.push({
    ...blank(),
    key: `${prefix}-bed`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: bed,
    height: bed,
    opacity: life * 0.6,
    background: `radial-gradient(circle, #fff2c4 0%, ${preset.colorPrimary} 30%, ${preset.colorSecondary} 55%, transparent 76%)`,
    borderRadius: '50%',
    animation: 'effectPulseSoft 0.9s ease-in-out infinite',
    flat: true,
  });
}

/**
 * A healing circle: a turning magic circle with an inner ring, and rings rising up through the
 * target.
 */
export function appendHeal(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.18);
  const circleSize = base * 2.2;

  sprites.push({
    ...blank(),
    key: `${prefix}-circle`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: circleSize,
    height: circleSize,
    opacity: life * 0.9,
    svg: magicCircleSvg(colorsOf(preset)),
    animation: 'effectSpinSlow 9s linear infinite',
    flat: true,
  });

  sprites.push({
    ...blank(),
    key: `${prefix}-circle-inner`,
    x: center.x,
    y: center.y,
    z: center.z + 2,
    width: circleSize * 0.62,
    height: circleSize * 0.62,
    opacity: life * 0.75,
    svg: ringSvg(colorsOf(preset), 4, true),
    animation: 'effectSpinReverse 6s linear infinite',
    flat: true,
  });

  for (let ring = 0; ring < HEAL_RING_COUNT; ring++) {
    const local = normalize((progress - ring * 0.2) / 0.7);
    if (local <= 0 || local >= 1) continue;
    const size = base * (1.3 + local * 0.7);
    sprites.push({
      ...blank(),
      key: `${prefix}-ring-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + base * local * 2.2,
      width: size,
      height: size,
      opacity: fadeInOut(local, 0.22) * 0.9,
      svg: ringSvg(colorsOf(preset), 3),
      flat: true,
    });
  }
}

/**
 * A lightning strike from the sky: a jagged channel with branches, a flash and a scorch on the
 * ground.
 *
 * The channel is one drawing animated to run downwards, and it is gone once the strike part of the
 * effect is over.
 */
export function appendBolt(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const channelJitter = takeRandoms(random, BOLT_SEGMENT_COUNT + 1);
  const branchSeeds = takeRandoms(random, BOLT_BRANCH_COUNT * 2);

  const skyHeight = base * 5.4;
  const spread = base * 0.62;
  const boxWidth = spread * 2 + base * 0.9;
  const lift = base * 0.35;

  if (progress < BOLT_STRIKE_END) {
    // The lightning is one drawing, joined as a single line, so it runs rather than falls.
    sprites.push({
      ...blank(),
      key: `${prefix}-channel`,
      x: center.x,
      y: center.y,
      z: center.z + lift,
      offsetY: -skyHeight / 2,
      width: boxWidth,
      height: skyHeight,
      svg: boltSvg(boxWidth, skyHeight, spread, base * 0.1, channelJitter, branchSeeds, colorsOf(preset)),
      animation: `effectBoltStrike ${Math.round(preset.duration * BOLT_STRIKE_END)}ms linear forwards`,
    });
  }

  const flash = normalize(progress / 0.36);
  if (flash > 0 && flash < 1) appendFlareSpikes(sprites, prefix, center, base, flash, preset, 5, base * 0.5);

  const scorch = base * (1.6 + easeOutCubic(progress) * 2.2);
  sprites.push({
    ...blank(),
    key: `${prefix}-scorch`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: scorch,
    height: scorch,
    opacity: (1 - progress) * 0.55,
    background: `radial-gradient(circle, #ffffff 0%, ${preset.colorSecondary} 40%, transparent 72%)`,
    borderRadius: '50%',
    flat: true,
  });
}

/**
 * A freeze: snowflake shards drawn in to the target, ice spikes bursting out of the ground, and a
 * frost ring.
 */
export function appendFrost(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const shardAngles = takeRandoms(random, FROST_SHARD_COUNT);
  const shardHeights = takeRandoms(random, FROST_SHARD_COUNT);
  const shardSpins = takeRandoms(random, FROST_SHARD_COUNT);
  const spikeSizes = takeRandoms(random, FROST_SPIKE_COUNT);

  const gather = normalize(progress / 0.55);
  if (gather < 1) {
    for (let shard = 0; shard < FROST_SHARD_COUNT; shard++) {
      const angle = shardAngles[shard] * Math.PI * 2;
      const distance = base * 2.4 * (1 - easeOutCubic(gather));
      const size = base * (0.34 + shardSpins[shard] * 0.16);
      sprites.push({
        ...blank(),
        key: `${prefix}-shard-${shard}`,
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        z: center.z + base * (0.3 + shardHeights[shard] * 1.2),
        width: size,
        height: size,
        opacity: fadeInOut(gather, 0.15),
        svg: snowflakeSvg(colorsOf(preset)),
        animation: `effectSpinSlow ${(4 + shardSpins[shard] * 4).toFixed(1)}s linear infinite`,
      });
    }
  }

  const burst = normalize((progress - 0.42) / 0.58);
  if (burst > 0 && burst < 1) {
    for (let spike = 0; spike < FROST_SPIKE_COUNT; spike++) {
      const angle = (Math.PI * 2 * spike) / FROST_SPIKE_COUNT;
      const height = base * (1 + spikeSizes[spike] * 1.4) * easeOutCubic(burst);
      sprites.push({
        ...blank(),
        key: `${prefix}-spike-${spike}`,
        x: center.x + Math.cos(angle) * base * 0.85,
        y: center.y + Math.sin(angle) * base * 0.85,
        z: center.z + height * 0.5,
        width: base * 0.38,
        height,
        rotate: (spikeSizes[spike] - 0.5) * 22,
        opacity: (1 - burst) * 0.95,
        svg: spikeSvg(colorsOf(preset)),
      });
    }
  }

  const ringSize = base * (1.2 + easeOutCubic(progress) * 2.4);
  sprites.push({
    ...blank(),
    key: `${prefix}-frost-ring`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: ringSize,
    height: ringSize,
    opacity: (1 - progress) * 0.85,
    svg: ringSvg(colorsOf(preset), 4, true),
    animation: 'effectSpinSlow 12s linear infinite',
    flat: true,
  });
}

/** A nova: two wide shock rings, with a bright flash and a horizontal streak at the start. */
export function appendNova(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  for (let ring = 0; ring < 2; ring++) {
    const local = normalize((progress - ring * 0.16) / 0.84);
    if (local <= 0 || local >= 1) continue;
    const shockSize = base * (1.6 + easeOutCubic(local) * 7);
    sprites.push({
      ...blank(),
      key: `${prefix}-nova-shock-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: shockSize,
      height: shockSize,
      opacity: (1 - local) * 0.9,
      svg: ringSvg(colorsOf(preset), 2.6),
      flat: true,
    });
  }

  const flash = normalize(progress / 0.24);
  if (flash < 1) {
    appendFlareSpikes(sprites, prefix, center, base, flash, preset, 7, base * 0.8);
    sprites.push({
      ...blank(),
      key: `${prefix}-nova-streak`,
      x: center.x,
      y: center.y,
      z: center.z + base * 0.8,
      width: base * (5 + easeOutCubic(flash) * 5),
      height: base * 0.26 * (1 - flash),
      opacity: (1 - flash) * 0.9,
      background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 25%, #ffffff 50%, ${preset.colorPrimary} 75%, transparent)`,
      borderRadius: '50%',
    });
  }
}

/** A vortex: a spiral turning on the ground with two rings about it. */
export function appendVortex(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.18);
  const swirlSize = base * 3;

  sprites.push({
    ...blank(),
    key: `${prefix}-swirl`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: swirlSize,
    height: swirlSize,
    opacity: life * 0.6,
    svg: spiralSvg(colorsOf(preset), 3),
    animation: 'effectSwirl 1.8s linear infinite',
    flat: true,
  });

  for (let ring = 0; ring < 2; ring++) {
    const ringSize = base * (1.4 + ring * 1);
    sprites.push({
      ...blank(),
      key: `${prefix}-vortex-ring-${ring}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: ringSize,
      height: ringSize,
      opacity: life * (0.5 - ring * 0.18),
      svg: ringSvg(colorsOf(preset), 3, true),
      animation: `effectSpinSlow ${(3 + ring * 2).toFixed(1)}s linear infinite`,
      flat: true,
    });
  }
}

/** The pulsing pool under a miasma. The drifting cloud itself is particles drawn elsewhere. */
export function appendMiasma(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.22);
  const poolSize = base * 2.2;

  sprites.push({
    ...blank(),
    key: `${prefix}-pool`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: poolSize,
    height: poolSize,
    opacity: life * 0.5,
    background: `radial-gradient(circle, ${preset.colorSecondary} 0%, ${preset.colorPrimary} 40%, transparent 74%)`,
    borderRadius: '50%',
    animation: 'effectPulseSoft 3.2s ease-in-out infinite',
    flat: true,
  });
}

/** An aura: a magic circle under the target, rings pulsing outwards and spikes circling it. */
export function appendAura(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const life = fadeInOut(progress, 0.28);
  const spin = progress * Math.PI * 3;
  const circleSize = base * 2.4;

  sprites.push({
    ...blank(),
    key: `${prefix}-circle`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: circleSize,
    height: circleSize,
    opacity: life * 0.9,
    svg: magicCircleSvg(colorsOf(preset)),
    animation: 'effectSpinReverse 7s linear infinite',
    flat: true,
  });

  for (let pulse = 0; pulse < AURA_PULSE_COUNT; pulse++) {
    const local = normalize((progress - pulse * 0.3) / 0.5);
    if (local <= 0 || local >= 1) continue;
    const size = base * (0.9 + easeOutCubic(local) * 2);
    sprites.push({
      ...blank(),
      key: `${prefix}-pulse-${pulse}`,
      x: center.x,
      y: center.y,
      z: center.z + 2,
      width: size,
      height: size,
      opacity: (1 - local) * 0.85,
      svg: ringSvg(colorsOf(preset), 3),
      flat: true,
    });
  }

  for (let spike = 0; spike < AURA_SPIKE_COUNT; spike++) {
    const angle = spin + (Math.PI * 2 * spike) / AURA_SPIKE_COUNT;
    const radius = base * 0.85;
    sprites.push({
      ...blank(),
      key: `${prefix}-aura-spike-${spike}`,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      z: center.z + base * (0.5 + Math.sin(spin + spike) * 0.25),
      width: base * 0.28,
      height: base * 0.9,
      rotate: Math.sin(angle) * 26,
      opacity: life * 0.9,
      svg: spikeSvg(colorsOf(preset)),
    });
  }
}
