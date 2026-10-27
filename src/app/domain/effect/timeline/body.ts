import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { ringSvg } from '@axe/domain/effect/effect-shapes';
import {
  blank,
  clamp01,
  colorsOf,
  easeOutCubic,
  type EffectSprite,
  fadeInOut,
  type Point3,
  round2,
  takeRandoms,
} from '@axe/domain/effect/timeline/shared';

/**
 * What happens to the piece itself.
 *
 * Crumbling away and spurting blood. They cut the picture and move it, which no other effect does.
 */

const DEFEAT_SHARD_COUNT = 9;
const DISSOLVE_COLUMNS = 4;
const DISSOLVE_ROWS = 6;
/** The size of one fragment. The picture of a piece fits one cell. */
const DISSOLVE_PIECE_SCALE = 0.34;
/** How tall the picture that crumbles is drawn, against the size the effect is drawn at. */
export const DISSOLVE_PICTURE_HEIGHT = DISSOLVE_PIECE_SCALE * DISSOLVE_ROWS;
const GORE_DROP_COUNT = 14;
const GORE_DRIP_COUNT = 5;
const GORE_STAIN_COUNT = 9;
const GORE_PULSE_COUNT = 3;
/** Which way it spurts, wavering a little with each beat. */
const GORE_JET_ANGLES = [-88, -104, -72];
/** Which way the drops fly, leaning towards the side the stroke passed and thin straight up and down. */
const GORE_SPRAY_ANGLES = [-142, -118, -101, -84, -66, -49, -32, -14, 6, 26, -160, -75, -40, 44];
/**
 * The crumbling: the picture itself is cut into a grid and scattered as fragments.
 *
 * Particles of light alone only vanish; cutting the picture and moving it makes something
 * that stood there break. A piece with no picture makes do with shards of light.
 */
export function appendDissolve(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number,
  image: string
): void {
  const life = 1 - clamp01((progress - 0.55) / 0.45);
  const jitters = takeRandoms(random, DISSOLVE_COLUMNS * DISSOLVE_ROWS * 3);
  const piece = base * DISSOLVE_PIECE_SCALE;

  if (image.length > 0) {
    for (let row = 0; row < DISSOLVE_ROWS; row++) {
      for (let column = 0; column < DISSOLVE_COLUMNS; column++) {
        const index = row * DISSOLVE_COLUMNS + column;
        const seed = jitters[index * 3];
        const spin = jitters[index * 3 + 1] - 0.5;
        const lift = jitters[index * 3 + 2];
        // The lower rows go first; all at once it reads as an explosion.
        // They go from the bottom up with a pause between; all at once it reads as an explosion.
        const born = (1 - row / DISSOLVE_ROWS) * 0.42 + seed * 0.14;
        const local = clamp01((progress - born) / 0.52);
        if (local <= 0) continue;

        const fly = easeOutCubic(local);
        const away = (column / (DISSOLVE_COLUMNS - 1) - 0.5) * 2;
        sprites.push({
          ...blank(),
          key: `${prefix}-dissolve-piece-${index}`,
          x: center.x,
          y: center.y,
          z: center.z + base * 0.9,
          // One cell of the grid is shown and flown as a piece.
          offsetX: away * piece * (0.5 + fly * 2.2) + spin * piece * fly * 1.6,
          offsetY: (row / (DISSOLVE_ROWS - 1) - 0.5) * piece * DISSOLVE_ROWS * 0.5 - piece * fly * (1.6 + lift * 2.4),
          width: piece * DISSOLVE_COLUMNS,
          height: piece * DISSOLVE_ROWS,
          rotate: spin * 90 * fly,
          opacity: life * (1 - local) ** 0.7,
          background: `url(${image}) center/contain no-repeat`,
          clipPath: cellClipPath(column, row),
        });
      }
    }
  }

  // The light rising from the broken edges; the fragments alone merely scatter.
  for (let shard = 0; shard < DEFEAT_SHARD_COUNT; shard++) {
    const seed = jitters[shard % jitters.length];
    const phase = (progress * 1.5 + seed) % 1;
    const rise = easeOutCubic(phase);
    const height = base * (0.4 + seed * 0.7);
    sprites.push({
      ...blank(),
      key: `${prefix}-dissolve-shard-${shard}`,
      x: center.x,
      y: center.y,
      z: center.z + base * (0.2 + rise * 2.6),
      offsetX: (seed - 0.5) * base * 1.6 * (1 - rise * 0.4),
      offsetY: -height / 2,
      width: base * 0.09,
      height,
      opacity: life * (1 - phase) * 0.75,
      background: `linear-gradient(180deg, transparent, ${preset.colorPrimary} 55%, #ffffff)`,
      borderRadius: '50%',
    });
  }

  const ring = base * (1.5 + easeOutCubic(progress) * 1.2);
  sprites.push({
    ...blank(),
    key: `${prefix}-dissolve-ring`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: ring,
    height: ring,
    opacity: life * 0.6,
    svg: ringSvg(colorsOf(preset), 6),
    animation: 'effectSpinSlow 3s linear infinite',
    flat: true,
  });
}

/** The clip that shows one cell of the grid. */
function cellClipPath(column: number, row: number): string {
  const left = (column / DISSOLVE_COLUMNS) * 100;
  const right = 100 - ((column + 1) / DISSOLVE_COLUMNS) * 100;
  const top = (row / DISSOLVE_ROWS) * 100;
  const bottom = 100 - ((row + 1) / DISSOLVE_ROWS) * 100;
  return `inset(${round2(top)}% ${round2(right)}% ${round2(bottom)}% ${round2(left)}%)`;
}

/**
 * The blood.
 *
 * Straight lines from a centre make a star of light. Real blood shows as a mass at the
 * wound, flying drops, a trickle and a stain on the ground, so it is laid out in layers.
 * The stain is not a circle but a main pool with spatter of different sizes about it.
 */
export function appendGore(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number
): void {
  const life = fadeInOut(progress, 0.06);
  const jitters = takeRandoms(random, GORE_DROP_COUNT * 3 + GORE_DRIP_COUNT * 2);
  const burst = Math.min(1, progress / 0.18);
  const wound = { x: center.x, y: center.y, z: center.z + base * 0.95 };

  // The mass at the wound, which shows where it comes from.
  const core = base * (0.5 + easeOutCubic(burst) * 0.45);
  sprites.push({
    ...blank(),
    key: `${prefix}-gore-core`,
    x: wound.x,
    y: wound.y,
    z: wound.z,
    width: core * 1.3,
    height: core,
    rotate: -18,
    opacity: life * (1 - progress * 0.5),
    background: `radial-gradient(circle, ${preset.colorPrimary} 0%, ${preset.colorSecondary} 55%, transparent 78%)`,
    borderRadius: '50%',
  });

  // The flying drops, mixed in size and drawn out along their flight; matched in size they read as made.
  for (let drop = 0; drop < GORE_DROP_COUNT; drop++) {
    const seed = jitters[drop * 3];
    const spin = jitters[drop * 3 + 1];
    const grade = jitters[drop * 3 + 2];
    const angle = GORE_SPRAY_ANGLES[drop % GORE_SPRAY_ANGLES.length] + (spin - 0.5) * 26;
    const radians = (angle * Math.PI) / 180;
    const flight = Math.min(1, burst * (0.6 + seed * 0.8));
    const reach = base * (0.6 + seed * 2.2) * easeOutCubic(flight);
    const size = base * (0.07 + grade * grade * 0.16);
    sprites.push({
      ...blank(),
      key: `${prefix}-gore-drop-${drop}`,
      x: wound.x,
      y: wound.y,
      z: wound.z,
      offsetX: Math.cos(radians) * reach,
      offsetY: Math.sin(radians) * reach + base * flight * flight * 0.9,
      width: size * (1.4 + flight * 1.6),
      height: size,
      rotate: angle,
      opacity: life * (1 - flight * 0.35),
      background: `linear-gradient(90deg, transparent, ${preset.colorSecondary} 45%, ${preset.colorPrimary})`,
      borderRadius: '50%',
    });
  }

  // The blood trickling from the wound, which thins and breaks before it falls clear.
  for (let drip = 0; drip < GORE_DRIP_COUNT; drip++) {
    const seed = jitters[GORE_DROP_COUNT * 3 + drip * 2];
    const spread = jitters[GORE_DROP_COUNT * 3 + drip * 2 + 1];
    const fall = easeOutCubic(Math.min(1, progress * (0.8 + seed * 1.1)));
    const length = base * (0.3 + seed * 0.8) * (1 - fall * 0.35);
    sprites.push({
      ...blank(),
      key: `${prefix}-gore-drip-${drip}`,
      x: wound.x,
      y: wound.y,
      z: wound.z - base * fall * 1.5,
      offsetX: (spread - 0.5) * base * 1.1,
      offsetY: -length / 2,
      width: base * (0.05 + seed * 0.04),
      height: length,
      opacity: life * (1 - fall * 0.5),
      background: `linear-gradient(180deg, ${preset.colorSecondary}, ${preset.colorPrimary} 70%, transparent)`,
      borderRadius: '50%',
    });
  }

  appendGoreJet(sprites, `${prefix}-gore`, wound, base, progress, preset, life);
  appendGoreStain(sprites, `${prefix}-gore`, center, base, progress, preset, jitters, life);
}

/**
 * The spurt: a thick line reaching from the wound in pulses.
 *
 * Scattered drops alone only seep; three thrusts on the heartbeat make it spurt.
 */
function appendGoreJet(
  sprites: EffectSprite[],
  prefix: string,
  wound: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  life: number
): void {
  for (let pulse = 0; pulse < GORE_PULSE_COUNT; pulse++) {
    const born = pulse * 0.16;
    const local = clamp01((progress - born) / 0.5);
    if (local <= 0 || local >= 1) continue;

    const angle = GORE_JET_ANGLES[pulse % GORE_JET_ANGLES.length];
    const radians = (angle * Math.PI) / 180;
    // It thrusts and then reaches its length; at an even speed it reads as a tap running.
    const reach = base * (1.4 + pulse * 0.4) * easeOutCubic(Math.min(1, local * 1.8)) * 2.1;
    const thickness = base * (0.34 - pulse * 0.05) * (1 - local * 0.45);
    sprites.push({
      ...blank(),
      key: `${prefix}-jet-${pulse}`,
      x: wound.x,
      y: wound.y,
      z: wound.z,
      offsetX: Math.cos(radians) * reach * 0.5,
      offsetY: Math.sin(radians) * reach * 0.5,
      width: reach,
      height: thickness,
      rotate: angle,
      opacity: life * (1 - local) * 0.95,
      background: `linear-gradient(90deg, ${preset.colorSecondary} 10%, ${preset.colorPrimary} 45%, ${preset.colorSecondary} 78%, transparent)`,
      borderRadius: '50%',
    });

    // The mass that breaks at the head of the spurt, which is where the noise of it lands.
    const head = base * (0.3 + local * 0.5);
    sprites.push({
      ...blank(),
      key: `${prefix}-jet-head-${pulse}`,
      x: wound.x,
      y: wound.y,
      z: wound.z,
      offsetX: Math.cos(radians) * reach,
      offsetY: Math.sin(radians) * reach,
      width: head * 1.25,
      height: head,
      rotate: angle,
      opacity: life * (1 - local) * 0.9,
      background: `radial-gradient(circle, ${preset.colorPrimary} 0%, ${preset.colorSecondary} 60%, transparent 80%)`,
      borderRadius: '54% 46% 42% 58% / 46% 52% 48% 54%',
    });
  }
}

/** The stain on the ground, parted into a main pool and its spatter rather than one round seep. */
export function appendGoreStain(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  jitters: readonly number[],
  life: number
): void {
  const spread = easeOutCubic(Math.min(1, progress * 1.4));
  const pool = base * (0.5 + spread * 1.1);
  sprites.push({
    ...blank(),
    key: `${prefix}-pool`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: pool * 1.25,
    height: pool * 0.85,
    rotate: -24,
    opacity: life * 0.9,
    background: `radial-gradient(circle, ${preset.colorSecondary} 0%, ${preset.colorSecondary} 62%, transparent 80%)`,
    borderRadius: '46% 54% 60% 40% / 52% 44% 56% 48%',
    flat: true,
  });

  for (let stain = 0; stain < GORE_STAIN_COUNT; stain++) {
    const seed = jitters[stain % jitters.length];
    const angle = (stain / GORE_STAIN_COUNT) * Math.PI * 2 + seed * 1.7;
    const distance = base * (0.7 + seed * 2.1) * spread;
    const size = base * (0.08 + (1 - seed) * 0.2);
    sprites.push({
      ...blank(),
      key: `${prefix}-stain-${stain}`,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      z: center.z + 1,
      width: size * (1 + seed),
      height: size,
      rotate: (angle * 180) / Math.PI,
      opacity: life * (0.55 + seed * 0.35),
      background: preset.colorSecondary,
      borderRadius: '52% 48% 44% 56% / 48% 56% 44% 52%',
      flat: true,
    });
  }
}
