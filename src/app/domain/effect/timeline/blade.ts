import { isEffectKind, type SlashStyle } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { crackSvg, crescentSvg, ringSvg } from '@axe/domain/effect/effect-shapes';
import { projectDirection, type ViewRotation } from '@axe/domain/effect/effect-view';
import { appendGoreStain } from '@axe/domain/effect/timeline/body';
import {
  appendFlareSpikes,
  blank,
  clamp01,
  colorsOf,
  easeOutCubic,
  type EffectSprite,
  glow,
  type ImpactPainter,
  normalize,
  type Point3,
  takeRandoms,
} from '@axe/domain/effect/timeline/shared';

/**
 * A blade.
 *
 * The cuts, the drawing cut, the cleaving, and the great sword out of the sky. How each ends is left to what it is given.
 */

const BISECT_PIECE_SCALE = 0.62;
const BISECT_GUSH_COUNT = 7;
/** The two halves the cut makes, each keeping one side of the picture. */
const BISECT_HALVES = [
  { key: 'upper', side: 1, drop: 0.3, clip: 'polygon(-40% -40%, 140% -110%, 140% 40%, -40% 110%)' },
  { key: 'lower', side: -1, drop: 1.5, clip: 'polygon(-40% 110%, 140% 40%, 140% 140%, -40% 140%)' },
];
/** How long the stroke takes to pass through. */
const BISECT_CUT_END = 0.22;
const BISECT_ANGLE = -28;
/** The blade of a cut, whose strokes, angle and reach follow its form. */
export interface SlashHit {
  /** How far through the playback the cut falls. */
  at: number;
  /** How much of it one stroke takes. */
  span: number;
  angle: number;
  thickness: number;
  offsetX: number;
  offsetY: number;
  reach: number;
}

const SLASH_ANGLES = [-46, 34, -18, 52, -8, 26];
const SLASH_SHIFTS = [-0.34, 0.3, 0.12, -0.26, 0.36, -0.12];
/** Where the gathering ends and the cut falls. */
const SLASH_CHARGE_END = 0.42;
const SLASH_CHARGE_COUNT = 6;
const SLASH_CRACK_JITTER = [0.2, 0.7, 0.35, 0.85, 0.5, 0.15];
/** Where a drawing cut flashes. Nothing happens before it. */
const SLASH_IAI_AT = 0.55;

/**
 * The line of each form.
 * A drawing cut is stillness, an instant and a wound; a cleave comes from straight above; a sweep goes wide across.
 */
export function slashHits(style: SlashStyle): SlashHit[] {
  switch (style) {
    case 'combo': {
      const span = 0.3;
      const step = (1 - span) / 4;
      return Array.from({ length: 5 }, (_unused, index) => ({
        at: step * index,
        span,
        angle: SLASH_ANGLES[index % SLASH_ANGLES.length],
        thickness: 18,
        offsetX: SLASH_SHIFTS[index % SLASH_SHIFTS.length],
        offsetY: SLASH_SHIFTS[(index + 2) % SLASH_SHIFTS.length] * 0.6,
        reach: 2.2,
      }));
    }
    case 'iai':
      // The instant of the draw: one long thin line, nearly level.
      return [{ at: SLASH_IAI_AT, span: 0.1, angle: -6, thickness: 8, offsetX: 0, offsetY: 0, reach: 5.4 }];
    case 'wide':
      // The sweep: wide across, and thick.
      return [{ at: SLASH_CHARGE_END, span: 0.34, angle: -14, thickness: 46, offsetX: 0, offsetY: 0, reach: 5 }];
    case 'heavy':
      // The cleave, brought down from straight above.
      return [{ at: SLASH_CHARGE_END, span: 0.26, angle: -88, thickness: 42, offsetX: 0, offsetY: -0.35, reach: 4.2 }];
    default:
      return [{ at: 0, span: 0.85, angle: -46, thickness: 28, offsetX: 0, offsetY: 0, reach: 3 }];
  }
}

/**
 * The angle the stroke ends at, turned to from straight above.
 *
 * Taken straight from the heading it would cross the half turn for some directions and
 * pass the blade under the board. It turns the shorter way and stops a little past level.
 */
export function swingTiltOf(headingAngle: number): number {
  let tilt = (headingAngle + 90) % 360;
  if (tilt > 180) tilt -= 360;
  if (tilt <= -180) tilt += 360;
  return Math.max(-EXCALIBUR_MAX_TILT, Math.min(EXCALIBUR_MAX_TILT, tilt));
}

/** The great sword of light, in four stages: rising, becoming a blade, falling and bursting. */
const EXCALIBUR_RISE_END = 0.24;
const EXCALIBUR_FORM_END = 0.5;
export const EXCALIBUR_SWING_END = 0.68;
/** The shortest the blade may be, so it still reads as a sword at close reach. */
const EXCALIBUR_MIN_REACH = 6;
/** How far the stroke may fall before the blade would pass under the board. */
const EXCALIBUR_MAX_TILT = 100;

/**
 * The light rises from the caster's feet into a vast blade, which falls on the target about its foot on the ground.
 *
 * It turns about its foot rather than its middle; about the middle it reads as spinning rather than falling.
 */
export function appendSkyblade(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  origin: Point3,
  view: ViewRotation | null | undefined,
  paintImpact: ImpactPainter
): void {
  const rise = clamp01(progress / EXCALIBUR_RISE_END);
  const form = clamp01(normalize((progress - EXCALIBUR_RISE_END) / (EXCALIBUR_FORM_END - EXCALIBUR_RISE_END)));
  const swing = clamp01(normalize((progress - EXCALIBUR_FORM_END) / (EXCALIBUR_SWING_END - EXCALIBUR_FORM_END)));
  const burst = clamp01(normalize((progress - EXCALIBUR_SWING_END) / (1 - EXCALIBUR_SWING_END)));

  const heading = projectDirection(center.x - origin.x, center.y - origin.y, center.z - origin.z, view);
  const span = Math.hypot(center.x - origin.x, center.y - origin.y, center.z - origin.z);
  const reach = Math.max(span, base * EXCALIBUR_MIN_REACH);

  // First the rising light, drawn up from the feet to the height of the blade.
  if (rise > 0 && form < 1) {
    for (let index = 0; index < 8; index += 1) {
      const phase = (rise * 1.6 + index / 8) % 1;
      sprites.push({
        ...blank(),
        key: `${prefix}-excalibur-rise-${index}`,
        x: origin.x,
        y: origin.y,
        z: origin.z,
        offsetX: Math.cos(index * 2.1) * base * 0.8 * (1 - phase),
        offsetY: -reach * phase * 0.9,
        width: base * 0.22 * (1 - phase),
        height: base * 0.22 * (1 - phase),
        opacity: (1 - phase) * 0.85 * (1 - form),
        background: preset.colorPrimary,
        borderRadius: '50%',
        shadow: glow(base * 0.35 * (1 - phase), preset.colorPrimary),
      });
    }
  }

  // Then the blade, which reaches its length before falling on the target about its foot.
  if (rise >= 1 || form > 0 || swing < 1) {
    const length = reach * (0.15 + easeOutCubic(form) * 0.85);
    const eased = swing < 0.5 ? 2 * swing * swing : 1 - Math.pow(-2 * swing + 2, 2) / 2;
    const tilt = eased * swingTiltOf(heading.angle);
    const radians = (tilt * Math.PI) / 180;
    // The foot is held at the caster's feet, and the middle sits half a length along the blade.
    const pivotX = (length / 2) * Math.sin(radians);
    const pivotY = -(length / 2) * Math.cos(radians);
    const alive = 1 - burst * 0.85;

    for (const [index, layer] of [
      { width: 2.6, alpha: 0.26, color: preset.colorSecondary, blur: 2.8 },
      { width: 1.3, alpha: 0.78, color: preset.colorPrimary, blur: 1.5 },
      { width: 0.45, alpha: 1, color: '#ffffff', blur: 0.8 },
    ].entries()) {
      sprites.push({
        ...blank(),
        key: `${prefix}-excalibur-blade-${index}`,
        x: origin.x,
        y: origin.y,
        z: origin.z,
        offsetX: pivotX,
        offsetY: pivotY,
        width: base * layer.width * (0.4 + form * 0.6),
        height: length,
        rotate: tilt,
        opacity: layer.alpha * (0.3 + form * 0.7) * alive,
        background: `linear-gradient(180deg, transparent, ${layer.color} 18%, #ffffff 100%)`,
        borderRadius: '46% 46% 8% 8%',
        shadow: glow(base * layer.blur, layer.color),
      });
    }

    // The ring of light at the foot, which shows where it turns.
    sprites.push({
      ...blank(),
      key: `${prefix}-excalibur-hilt`,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      width: base * (1.6 + form * 1.2),
      height: base * (0.6 + form * 0.4),
      opacity: (0.4 + form * 0.5) * alive,
      background: `radial-gradient(circle, #ffffff, ${preset.colorPrimary} 50%, transparent 74%)`,
      borderRadius: '50%',
      shadow: glow(base * 0.8, preset.colorPrimary),
    });
  }

  // Last the burst, where the stroke ends, with a ring spreading out.
  if (burst > 0) {
    // A sword given an element ends in it: fire burns and ice freezes.
    if (isEffectKind(preset.impactKind) && preset.impactKind !== 'projectile') {
      paintImpact(
        preset.impactEffectKind,
        sprites,
        `${prefix}-excalibur-impact`,
        center,
        base * 1.2,
        burst,
        preset,
        () => 0.5
      );
    }
    sprites.push({
      ...blank(),
      key: `${prefix}-excalibur-burst`,
      x: center.x,
      y: center.y,
      z: center.z,
      width: base * (2.4 + easeOutCubic(burst) * 6),
      height: base * (2.4 + easeOutCubic(burst) * 6),
      opacity: 1 - burst,
      background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 40%, ${preset.colorSecondary} 64%, transparent 80%)`,
      borderRadius: '50%',
      shadow: glow(base * 2 * (1 - burst), preset.colorPrimary),
    });
    sprites.push({
      ...blank(),
      key: `${prefix}-excalibur-ring`,
      x: center.x,
      y: center.y,
      z: center.z,
      width: base * (1.6 + easeOutCubic(burst) * 11),
      height: base * (0.7 + easeOutCubic(burst) * 4.6),
      opacity: (1 - burst) * 0.8,
      svg: ringSvg(colorsOf(preset)),
      shadow: glow(base * 0.8 * (1 - burst), preset.colorSecondary),
    });
    for (let index = 0; index < 10; index += 1) {
      const phase = clamp01(burst * (1 + (index % 3) * 0.2));
      sprites.push({
        ...blank(),
        key: `${prefix}-excalibur-shard-${index}`,
        x: center.x,
        y: center.y,
        z: center.z,
        offsetX: Math.cos(index * 0.63) * base * 5 * phase,
        offsetY: -Math.abs(Math.sin(index * 0.63)) * base * 4 * phase,
        width: base * 0.3 * (1 - phase),
        height: base * 0.3 * (1 - phase),
        opacity: (1 - phase) * 0.9,
        background: '#ffffff',
        borderRadius: '50%',
        shadow: glow(base * 0.4 * (1 - phase), preset.colorPrimary),
      });
    }
  }
}

/**
 * The cleaving: after the flash the picture parts along the cut and blood comes from between.
 */
export function appendBisect(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  random: () => number,
  image: string
): void {
  const cut = Math.min(1, progress / BISECT_CUT_END);
  const after = clamp01(normalize((progress - BISECT_CUT_END) / (1 - BISECT_CUT_END)));
  const body = { x: center.x, y: center.y, z: center.z + base * 0.9 };
  const piece = base * BISECT_PIECE_SCALE;
  const radians = (BISECT_ANGLE * Math.PI) / 180;
  // The direction across the cut, along which the two halves open.
  const acrossX = -Math.sin(radians);
  const acrossY = Math.cos(radians);

  if (cut < 1) {
    const reach = base * (1.5 + easeOutCubic(cut) * 5.5);
    sprites.push({
      ...blank(),
      key: `${prefix}-bisect-slash`,
      x: body.x,
      y: body.y,
      z: body.z,
      width: reach,
      height: base * 0.5 * (1 - cut * 0.6),
      rotate: BISECT_ANGLE,
      opacity: 1 - cut * 0.3,
      background: `linear-gradient(90deg, transparent, #ffffff 45%, ${preset.colorPrimary} 60%, transparent)`,
      borderRadius: '50%',
      shadow: glow(base * 0.5, preset.colorPrimary),
    });
  }

  if (after <= 0) return;

  const slide = easeOutCubic(after);
  const fade = 1 - clamp01((after - 0.55) / 0.45);

  if (image.length > 0) {
    // The upper and the lower half, parted at the cut and slid opposite ways.
    for (const half of BISECT_HALVES) {
      sprites.push({
        ...blank(),
        key: `${prefix}-bisect-${half.key}`,
        x: body.x,
        y: body.y,
        z: body.z,
        offsetX: acrossX * half.side * piece * slide * 0.9 + half.side * piece * slide * 0.25,
        offsetY: acrossY * half.side * piece * slide * 0.9 + piece * slide * slide * half.drop,
        width: piece * 2,
        height: piece * 2,
        rotate: half.side * slide * 7,
        opacity: fade,
        background: `url(${image}) center/contain no-repeat`,
        clipPath: half.clip,
      });
    }
  }

  // The cut face: the gap glows, and the blood comes from it.
  sprites.push({
    ...blank(),
    key: `${prefix}-bisect-seam`,
    x: body.x,
    y: body.y,
    z: body.z,
    width: base * 2.4,
    height: base * 0.18 * (1 - after * 0.5),
    rotate: BISECT_ANGLE,
    opacity: fade * 0.95,
    background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 25%, ${preset.colorSecondary} 65%, transparent)`,
    borderRadius: '50%',
  });

  const gush = takeRandoms(random, BISECT_GUSH_COUNT * 2);
  for (let jet = 0; jet < BISECT_GUSH_COUNT; jet++) {
    const seed = gush[jet * 2];
    const along = gush[jet * 2 + 1] - 0.5;
    const spurt = Math.min(1, after * (1.4 + seed));
    const reach = base * (0.7 + seed * 1.8) * easeOutCubic(spurt);
    const angle = BISECT_ANGLE + 90 + (along * 40 - 20);
    const jetRadians = (angle * Math.PI) / 180;
    sprites.push({
      ...blank(),
      key: `${prefix}-bisect-gush-${jet}`,
      x: body.x,
      y: body.y,
      z: body.z,
      offsetX: Math.cos((BISECT_ANGLE * Math.PI) / 180) * along * base * 1.6 + Math.cos(jetRadians) * reach * 0.5,
      offsetY: Math.sin((BISECT_ANGLE * Math.PI) / 180) * along * base * 1.6 + Math.sin(jetRadians) * reach * 0.5,
      width: reach,
      height: base * (0.07 + seed * 0.1),
      rotate: angle,
      opacity: fade * 0.9,
      background: `linear-gradient(90deg, ${preset.colorSecondary}, ${preset.colorSecondary} 40%, transparent)`,
      borderRadius: '50%',
    });
  }

  appendGoreStain(sprites, `${prefix}-bisect`, center, base, after, preset, gush, fade);
}

/**
 * A slash: one or more crescent strokes across the target, shaped by the preset's slash style.
 *
 * The wide and heavy styles gather a charge first and an iai style holds a still stance; all three
 * leave an aftermath once the cut is made.
 */
export function appendSlash(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const style = preset.slashLook;
  const hits = slashHits(style);
  const charged = style === 'wide' || style === 'heavy';

  if (charged) appendSlashCharge(sprites, prefix, center, base, progress, preset);
  if (style === 'iai') appendIaiStance(sprites, prefix, center, base, progress, preset);

  // Each stroke takes its own angle and reach; laid on one spot they read as a single cut.
  hits.forEach((hit, index) => {
    const sweepMs = Math.max(Math.round(preset.duration * hit.span), 70);
    sprites.push({
      ...blank(),
      key: `${prefix}-blade-${index}`,
      x: center.x,
      y: center.y,
      z: center.z + base * 0.55,
      offsetX: hit.offsetX * base,
      offsetY: hit.offsetY * base,
      width: base * hit.reach,
      height: base * (hit.thickness / 30),
      rotate: hit.angle,
      svg: crescentSvg(colorsOf(preset), hit.thickness),
      animation: `effectSlashSweep ${sweepMs}ms cubic-bezier(0.2, 0.85, 0.3, 1) ${Math.round(hit.at * preset.duration)}ms both`,
      origin: '0% 50%',
    });

    const local = normalize((progress - hit.at) / hit.span);
    if (local > 0 && local < 0.5) {
      appendFlareSpikes(sprites, `${prefix}-${index}`, center, base, local / 0.5, preset, 2.6, base * 0.55);
    }
  });

  if (charged || style === 'iai') {
    appendSlashAftermath(sprites, prefix, center, base, progress, preset, hits[0], style);
  }
}

/** The gathering of a drawing cut: nothing moves but the light at the scabbard. */
function appendIaiStance(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const hold = normalize(progress / SLASH_IAI_AT);
  if (hold <= 0 || hold >= 1) return;

  // The stillness drawn taut, with one thin light reaching out.
  const glint = base * (0.5 + hold * 1.1);
  sprites.push({
    ...blank(),
    key: `${prefix}-iai-glint`,
    x: center.x,
    y: center.y,
    z: center.z + base * 0.55,
    width: glint,
    height: base * 0.045,
    rotate: -6,
    opacity: hold * hold * 0.9,
    background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 60%, #ffffff)`,
    borderRadius: '50%',
    shadow: glow(base * 0.2 * hold, preset.colorPrimary),
  });
}

/** The gathering: light draws into the blade and the reach pulls taut. */
function appendSlashCharge(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset
): void {
  const charge = normalize(progress / SLASH_CHARGE_END);
  if (charge <= 0 || charge >= 1) return;

  const gather = base * (1.6 - charge * 1.2);
  sprites.push({
    ...blank(),
    key: `${prefix}-charge`,
    x: center.x,
    y: center.y,
    z: center.z + base * 0.7,
    width: gather,
    height: gather,
    opacity: charge * 0.85,
    background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 40%, transparent 72%)`,
    borderRadius: '50%',
    shadow: glow(base * 0.5 * charge, preset.colorPrimary, base * 1.2 * charge, preset.colorSecondary),
  });

  // The light drawn into the blade from around it, which is what says it is gathering.
  for (let index = 0; index < SLASH_CHARGE_COUNT; index++) {
    const angle = (Math.PI * 2 * index) / SLASH_CHARGE_COUNT;
    const distance = base * (2.4 - charge * 2);
    sprites.push({
      ...blank(),
      key: `${prefix}-charge-${index}`,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      z: center.z + base * 0.7,
      width: base * 0.7,
      height: base * 0.1,
      rotate: (angle * 180) / Math.PI,
      opacity: charge * 0.8,
      background: `linear-gradient(90deg, transparent, ${preset.colorPrimary})`,
      borderRadius: '50%',
    });
  }
}

/** What lingers: the wound stays and the force passes into the ground. */
function appendSlashAftermath(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  preset: EffectPreset,
  hit: SlashHit,
  style: SlashStyle
): void {
  const after = normalize((progress - hit.at - hit.span * 0.35) / (1 - hit.at - hit.span * 0.35));
  if (after <= 0 || after >= 1) return;

  // The wound, where the stroke passed, which stays a while.
  sprites.push({
    ...blank(),
    key: `${prefix}-cut`,
    x: center.x,
    y: center.y,
    z: center.z + base * 0.55,
    width: base * hit.reach * 1.15,
    height: base * 0.1 * (1 - after * 0.6),
    rotate: hit.angle,
    opacity: (1 - after) * 0.95,
    background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 25%, #ffffff 50%, ${preset.colorPrimary} 75%, transparent)`,
    borderRadius: '50%',
    shadow: glow(base * 0.4 * (1 - after), '#ffffff'),
  });

  // A drawing cut leaves the wound alone; splitting the ground belongs to the heavier forms.
  if (style === 'iai') return;

  const shock = base * (0.8 + easeOutCubic(after) * 3.4);
  sprites.push({
    ...blank(),
    key: `${prefix}-slash-shock`,
    x: center.x,
    y: center.y,
    z: center.z + 2,
    width: shock,
    height: shock,
    opacity: (1 - after) * 0.85,
    svg: ringSvg(colorsOf(preset), 3),
    flat: true,
  });

  const crack = base * (1.2 + easeOutCubic(after) * 2.4);
  if (style === 'heavy') {
    // A cleave passes straight down, so the ground splits in one line too.
    sprites.push({
      ...blank(),
      key: `${prefix}-slash-split`,
      x: center.x,
      y: center.y,
      z: center.z + 1,
      width: crack * 1.6,
      height: base * 0.28 * (1 - after * 0.5),
      rotate: 8,
      opacity: (1 - after) * 0.85,
      background: `linear-gradient(90deg, transparent, ${preset.colorSecondary} 20%, #000000 50%, ${preset.colorSecondary} 80%, transparent)`,
      borderRadius: '50%',
      flat: true,
    });
    return;
  }

  sprites.push({
    ...blank(),
    key: `${prefix}-slash-crack`,
    x: center.x,
    y: center.y,
    z: center.z + 1,
    width: crack,
    height: crack,
    opacity: (1 - after) * 0.7,
    svg: crackSvg(colorsOf(preset), 6, SLASH_CRACK_JITTER),
    flat: true,
  });
}
