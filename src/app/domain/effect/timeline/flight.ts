import { type ProjectileStyle } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  arrowSvg,
  blasterSvg,
  bulletSvg,
  cruiseSvg,
  flyingCrescentSvg,
  missileSvg,
  ringSvg,
  thrustSvg,
  tracerSvg,
} from '@axe/domain/effect/effect-shapes';
import { projectDirection, type ViewRotation } from '@axe/domain/effect/effect-view';
import {
  blank,
  clamp01,
  colorsOf,
  easeOutCubic,
  type EffectSprite,
  glow,
  type ImpactPainter,
  normalize,
  type Point3,
} from '@axe/domain/effect/timeline/shared';

/**
 * What flies.
 *
 * The effects that travel from the caster to the target: a bolt, a shot, a rain of arrows. How each lands is left to what it is given.
 */

/**
 * How long a shot is in the air, in real time rather than as a share of the playback.
 * As a share, a longer effect such as a burst would fly its shots more slowly.
 */
const PROJECTILE_TRAVEL_MS: Record<ProjectileStyle, number> = {
  bullet: 130,
  arrow: 260,
  bolt: 340,
  crescent: 300,
  blaster: 110,
  tracer: 70,
  missile: 420,
  cruise: 1400,
};

export interface ProjectileShot {
  /** Where through the effect it is fired. */
  launch: number;
  /** Where it lands. */
  land: number;
}

/**
 * The rhythm of the shots, spaced evenly so the last of them lands at the end.
 * Each flies on its own, which is what makes a machine gun read as a hail.
 */
/** How the height is taken: an arc, or a cruise and a dive at the end. */
function loft(at: number, level: boolean): number {
  if (!level) return Math.sin(Math.PI * at);
  // It climbs to its cruising height at once, holds it, and drops all at once just short of the target.
  // Thrown it reads as a mortar; let down gently, as a landing.
  return Math.min(at / 0.16, 1) - Math.max(0, (at - 0.88) / 0.12) ** 1.7;
}

/** How many sections the exhaust smoke is joined from. */
const SMOKE_SEGMENTS = 6;

/** Each shot strays to a different side; all to one they bunch and read as a single shot. */
const SWERVE_SIDE = [1, -1, 0.55, -0.55, 1.4, -1.4];

/** What flies straight, its tail joined as one rather than broken into particles. */
const STRAIGHT_LOOKS: ReadonlySet<ProjectileStyle> = new Set([
  'bullet',
  'blaster',
  'tracer',
  'crescent',
  'missile',
  'cruise',
]);

/** How long the tail is, as a share of the flight. The faster it flies the longer it draws out. */
const TRAIL_SPAN: Record<ProjectileStyle, number> = {
  bolt: 0.3,
  arrow: 0.2,
  bullet: 0.22,
  crescent: 0.24,
  blaster: 0.3,
  tracer: 0.55,
  missile: 0.34,
  cruise: 0.55,
};

/** How it leans against its travel. A crescent is set across it, so the belly of the arc faces forward. */
const PROJECTILE_TURN: Record<ProjectileStyle, number> = {
  bolt: 0,
  arrow: 0,
  bullet: 0,
  crescent: 0,
  blaster: 0,
  tracer: 0,
  missile: 0,
  cruise: 0,
};

/** How high the arc rises. An arrow arcs, while anything of light and any blade flies straight. */
const PROJECTILE_ARC: Record<ProjectileStyle, number> = {
  bolt: 0.15,
  arrow: 1.1,
  bullet: 0.15,
  crescent: 0,
  blaster: 0,
  tracer: 0,
  missile: 0.5,
  cruise: 1.4,
};

/** How far it strays to the side of the path. A guided missile swings wide before it closes. */
const PROJECTILE_SWERVE: Record<ProjectileStyle, number> = {
  bolt: 0,
  arrow: 0,
  bullet: 0,
  crescent: 0,
  blaster: 0,
  tracer: 0,
  missile: 0.9,
  cruise: 2.4,
};

/** How thick the tail is. Taken from the size of the head, a large blade would trail a band. */
const TRAIL_THICKNESS: Record<ProjectileStyle, number> = {
  bolt: 0.34,
  arrow: 0.1,
  bullet: 0.16,
  crescent: 0.5,
  blaster: 0.26,
  tracer: 0.09,
  missile: 0.34,
  cruise: 0.5,
};

const PROJECTILE_SIZE: Record<ProjectileStyle, { width: number; height: number }> = {
  bolt: { width: 1.9, height: 0.5 },
  arrow: { width: 1.8, height: 0.36 },
  bullet: { width: 1.25, height: 0.22 },
  crescent: { width: 1.7, height: 1.7 },
  blaster: { width: 1.05, height: 0.34 },
  tracer: { width: 2.2, height: 0.09 },
  missile: { width: 1.7, height: 1.0 },
  cruise: { width: 2.8, height: 1.24 },
};

function projectileSvg(look: ProjectileStyle, colors: ReturnType<typeof colorsOf>): string {
  switch (look) {
    case 'arrow':
      return arrowSvg(colors);
    case 'crescent':
      return flyingCrescentSvg(colors);
    case 'blaster':
      return blasterSvg(colors);
    case 'tracer':
      return tracerSvg(colors);
    case 'missile':
      return missileSvg(colors);
    case 'cruise':
      return cruiseSvg(colors);
    default:
      return bulletSvg(colors);
  }
}

/**
 * When each shot of a projectile effect is fired and lands, as shares of the effect's duration.
 *
 * The travel time comes from the projectile's look, held between 5% and 60% of the effect. Several
 * shots are spaced by the preset's shot interval, but never so far apart that the last one would
 * land after the effect ends.
 */
export function projectileTiming(preset: EffectPreset): { travel: number; shots: ProjectileShot[] } {
  const travel = Math.min(Math.max(PROJECTILE_TRAVEL_MS[preset.projectileLook] / preset.duration, 0.05), 0.6);
  const count = preset.shotCount;
  if (count === 1) return { travel, shots: [{ launch: 0, land: travel }] };

  // A burst is set by shots a second; spread evenly through the effect it would keep firing
  // long after the sound of the shots has ended.
  const even = (1 - travel) / (count - 1);
  const wanted = preset.shotIntervalMs > 0 ? preset.shotIntervalMs / preset.duration : even;
  const gap = Math.min(wanted, even);

  return {
    travel,
    shots: Array.from({ length: count }, (_unused, index) => ({
      launch: gap * index,
      land: gap * index + travel,
    })),
  };
}
const PROJECTILE_RIBBON_COUNT = 7;
/** Where the launch ends, by which point it has left the screen. */
const BALLISTIC_LIFT_END = 0.32;
/** Where it begins to fall, with a gap between that is the time it spends out of sight. */
const BALLISTIC_DIVE_START = 0.6;
/** Where it strikes, after which comes the explosion. It matches where the landing sounds. */
export const BALLISTIC_DIVE_END = 0.86;
/** How high the launch and the fall reach, which is far enough to leave the screen. */
const BALLISTIC_HEIGHT = 16;
/** How many sections the falling streak is joined from. */
const BALLISTIC_TRAIL_SEGMENTS = 7;

/**
 * A ballistic missile: launched straight up, flying out of sight, and coming down directly over the target.
 *
 * In four stages: the launch, the warning, the fall and the explosion. With the shot out
 * of sight, without marking the ground where it will fall the explosion comes from nowhere.
 */
export function appendBallistic(
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
  const colors = colorsOf(preset);
  const lift = clamp01(progress / BALLISTIC_LIFT_END);
  const dive = clamp01(normalize((progress - BALLISTIC_DIVE_START) / (BALLISTIC_DIVE_END - BALLISTIC_DIVE_START)));
  const burst = clamp01(normalize((progress - BALLISTIC_DIVE_END) / (1 - BALLISTIC_DIVE_END)));
  const body = { width: base * 2.4, height: base * 1.35 };

  // First the launch, straight up from the feet, gathering speed as it goes.
  if (lift > 0 && lift < 1) {
    const up = projectDirection(0, 0, 1, view);
    const climbed = lift ** 1.9;
    const shrink = 1 - climbed * 0.45;
    const height = origin.z + base * BALLISTIC_HEIGHT * climbed;

    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-lift`,
      x: origin.x,
      y: origin.y,
      z: height,
      width: body.width * shrink,
      height: body.height * shrink,
      rotate: up.angle,
      opacity: 1 - climbed ** 4,
      svg: cruiseSvg(colors),
    });
    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-thrust`,
      x: origin.x,
      y: origin.y,
      z: height - body.width * shrink * 0.7,
      width: body.width * shrink * 0.8,
      height: body.height * shrink * 0.7,
      rotate: up.angle,
      opacity: (1 - climbed ** 4) * 0.9,
      svg: thrustSvg(colors),
    });
  }

  // The smoke of the launch, which stays at the feet and spreads after it has gone.
  const pad = clamp01(progress / BALLISTIC_DIVE_START);
  if (pad > 0 && pad < 1) {
    for (let puff = 0; puff < 4; puff += 1) {
      const spread = easeOutCubic(clamp01(pad * (1 + puff * 0.25)));
      sprites.push({
        ...blank(),
        key: `${prefix}-ballistic-pad-${puff}`,
        x: origin.x,
        y: origin.y,
        z: origin.z,
        offsetX: Math.cos(puff * 1.9) * base * 2.4 * spread,
        offsetY: -Math.abs(Math.sin(puff * 1.9)) * base * 1.2 * spread,
        width: base * (1.4 + spread * 3.4),
        height: base * (1.4 + spread * 3.4),
        opacity: (1 - pad) * 0.4,
        background: `radial-gradient(circle, ${preset.colorSecondary} 0%, transparent 70%)`,
        borderRadius: '50%',
      });
    }
  }

  // Then the warning, drawn at the feet of the target and closing in.
  const tell = clamp01(normalize((progress - BALLISTIC_LIFT_END) / (BALLISTIC_DIVE_END - BALLISTIC_LIFT_END)));
  if (tell > 0 && tell < 1) {
    for (let ring = 0; ring < 2; ring += 1) {
      const closing = clamp01(tell * (1 + ring * 0.3));
      sprites.push({
        ...blank(),
        key: `${prefix}-ballistic-mark-${ring}`,
        x: center.x,
        y: center.y,
        z: center.z,
        width: base * (4.5 - closing * 3),
        height: base * (4.5 - closing * 3),
        opacity: Math.min(tell * 4, 1) * (0.25 + (ring === 0 ? 0.3 : 0)),
        svg: ringSvg(colors, 5, ring === 0),
      });
    }
  }

  // Then the fall, straight down onto the target, gathering speed.
  if (dive > 0 && dive < 1) {
    const sky = { x: center.x + base * 1.6, y: center.y - base * 1.6, z: center.z + base * BALLISTIC_HEIGHT };
    const at = (value: number): Point3 => {
      const eased = clamp01(value) ** 1.9;
      return {
        x: sky.x + (center.x - sky.x) * eased,
        y: sky.y + (center.y - sky.y) * eased,
        z: sky.z + (center.z - sky.z) * eased,
      };
    };
    const head = at(dive);
    const drop = projectDirection(
      head.x - at(dive - 0.02).x,
      head.y - at(dive - 0.02).y,
      head.z - at(dive - 0.02).z,
      view
    );

    // The streak of the re-entry, joined along the path.
    for (let segment = 0; segment < BALLISTIC_TRAIL_SEGMENTS; segment += 1) {
      const front = at(dive - segment * 0.07);
      const back = at(dive - (segment + 1) * 0.07);
      const link = projectDirection(front.x - back.x, front.y - back.y, front.z - back.z, view);
      if (link.length < 0.5) continue;
      const age = segment / BALLISTIC_TRAIL_SEGMENTS;
      sprites.push({
        ...blank(),
        key: `${prefix}-ballistic-trail-${segment}`,
        x: (front.x + back.x) / 2,
        y: (front.y + back.y) / 2,
        z: (front.z + back.z) / 2,
        width: link.length * 1.1,
        height: base * 0.5 * (0.6 + age * 1.6),
        rotate: link.angle,
        opacity: (1 - age) * 0.5,
        background: `linear-gradient(90deg, transparent, ${preset.colorSecondary})`,
        borderRadius: '50%',
      });
    }

    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-shot`,
      x: head.x,
      y: head.y,
      z: head.z,
      width: body.width,
      height: body.height,
      rotate: drop.angle,
      opacity: 1,
      svg: cruiseSvg(colors),
    });
    // The head, burning as it comes down.
    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-heat`,
      x: head.x,
      y: head.y,
      z: head.z,
      width: body.height * 1.4,
      height: body.height * 1.4,
      opacity: 0.75,
      background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 45%, transparent 72%)`,
      borderRadius: '50%',
    });
  }

  // Last the explosion, left to the effect of its element, with the flash and the ring added here.
  if (burst > 0) {
    paintImpact(
      preset.impactEffectKind,
      sprites,
      `${prefix}-ballistic-impact`,
      center,
      base * 1.4,
      burst,
      preset,
      () => 0.5
    );
    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-flash`,
      x: center.x,
      y: center.y,
      z: center.z,
      width: base * (3 + easeOutCubic(burst) * 8),
      height: base * (3 + easeOutCubic(burst) * 8),
      opacity: (1 - burst) * 0.9,
      background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 38%, ${preset.colorSecondary} 62%, transparent 78%)`,
      borderRadius: '50%',
    });
    sprites.push({
      ...blank(),
      key: `${prefix}-ballistic-ring`,
      x: center.x,
      y: center.y,
      z: center.z,
      width: base * (2 + easeOutCubic(burst) * 14),
      height: base * (0.9 + easeOutCubic(burst) * 6),
      opacity: (1 - burst) * 0.7,
      svg: ringSvg(colors),
    });
  }
}

/** How many arrows fall. Too few and it is no rain. */
const ARROW_RAIN_COUNT = 36;
/** How long the archer takes to loose them all. */
const ARROW_RAIN_LOOSE_END = 0.26;
/** How long one takes to climb. */
const ARROW_RAIN_CLIMB = 0.22;
/** How long one takes to fall. */
export const ARROW_RAIN_FALL = 0.18;
/** The stretch the falls are scattered over, which fits the last of them striking inside the effect. */
const ARROW_RAIN_SPREAD = 0.5;
/** How long the warning shows at the feet before they fall, so where they will land is seen first. */
const ARROW_RAIN_TELL = 0.14;
/** How high they climb, which is off the screen and back. */
const ARROW_RAIN_HEIGHT = 9;

export interface ArrowRainShot {
  /** Where it leaves the bow. */
  loose: number;
  /** Where it begins to fall. */
  fall: number;
  /** Where it strikes. */
  land: number;
}

/**
 * For each arrow: the loosing, the falling and the striking.
 *
 * Both the picture and the sound read this table, so it returns the same order whatever the seed.
 */
export function arrowRainShots(): ArrowRainShot[] {
  const shots: ArrowRainShot[] = [];
  for (let index = 0; index < ARROW_RAIN_COUNT; index += 1) {
    // Evenly spaced they sound machined, so a waver worked out from the count is mixed in.
    const wobble = (((index * 37) % 13) / 13 - 0.5) * 0.04;
    const fall = ARROW_RAIN_LOOSE_END + (index / ARROW_RAIN_COUNT) * ARROW_RAIN_SPREAD + wobble;
    shots.push({
      loose: (index / ARROW_RAIN_COUNT) * ARROW_RAIN_LOOSE_END,
      fall,
      land: fall + ARROW_RAIN_FALL,
    });
  }
  return shots;
}

/**
 * A rain of arrows: the archer looses them skyward, the ground is marked, and then they land.
 *
 * In four stages: the loosing, the warning, the fall and the strike. Without the loosing
 * the arrows come from nowhere; without the warning you learn what happened after it hit.
 */
export function appendArrowRain(
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
  const colors = colorsOf(preset);
  const shots = arrowRainShots();

  for (let index = 0; index < ARROW_RAIN_COUNT; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = base * (0.3 + random() * 1.9);
    const sway = (random() - 0.5) * base * 2.4;
    const lean = 0.6 + random() * 0.5;

    const spot = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: center.z };
    const { loose, fall: launch, land } = shots[index];
    const sky = { x: spot.x - base * lean, y: spot.y - base * lean * 1.4, z: spot.z + base * ARROW_RAIN_HEIGHT };
    const drop = projectDirection(spot.x - sky.x, spot.y - sky.y, spot.z - sky.z, view);

    // The loosing: from the archer's feet, leaning towards the target, away into the sky.
    const climb = normalize((progress - loose) / ARROW_RAIN_CLIMB);
    if (climb > 0 && climb < 1) {
      const apex = {
        x: origin.x + (center.x - origin.x) * 0.32 + sway,
        y: origin.y + (center.y - origin.y) * 0.32 + sway * 0.6,
        z: origin.z + base * ARROW_RAIN_HEIGHT,
      };
      // It slows as it climbs; at an even speed it stretches out like a firework.
      const eased = 1 - (1 - climb) ** 2;
      const rising = {
        x: origin.x + (apex.x - origin.x) * eased,
        y: origin.y + (apex.y - origin.y) * eased,
        z: origin.z + (apex.z - origin.z) * eased,
      };
      const ahead = {
        x: origin.x + (apex.x - origin.x) * Math.min(eased + 0.05, 1),
        y: origin.y + (apex.y - origin.y) * Math.min(eased + 0.05, 1),
        z: origin.z + (apex.z - origin.z) * Math.min(eased + 0.05, 1),
      };
      const heading = projectDirection(ahead.x - rising.x, ahead.y - rising.y, ahead.z - rising.z, view);
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-loose-${index}`,
        x: rising.x,
        y: rising.y,
        z: rising.z,
        width: base * 1.4,
        height: base * 0.28,
        rotate: heading.angle,
        opacity: 1 - climb ** 3,
        svg: arrowSvg(colors),
      });
    }

    // The warning: the ring where they will fall, closing in.
    const tell = normalize((progress - (launch - ARROW_RAIN_TELL)) / (ARROW_RAIN_TELL + ARROW_RAIN_FALL));
    if (tell > 0 && tell < 1) {
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-mark-${index}`,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        width: base * (1.4 - tell * 0.7),
        height: base * (1.4 - tell * 0.7),
        opacity: Math.min(tell * 3, 1) * 0.5,
        svg: ringSvg(colors, 6, true),
      });
    }

    // The fall: each arrow laid along its descent, with a thin streak behind.
    const fall = normalize((progress - launch) / ARROW_RAIN_FALL);
    if (fall > 0 && fall < 1) {
      const eased = fall ** 1.4;
      const head = {
        x: sky.x + (spot.x - sky.x) * eased,
        y: sky.y + (spot.y - sky.y) * eased,
        z: sky.z + (spot.z - sky.z) * eased,
      };
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-trail-${index}`,
        x: head.x,
        y: head.y,
        z: head.z + base * 0.9,
        width: base * 1.6,
        height: base * 0.06,
        rotate: drop.angle,
        opacity: 0.35,
        background: `linear-gradient(90deg, transparent, ${preset.colorSecondary})`,
        borderRadius: '2px',
      });
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-arrow-${index}`,
        x: head.x,
        y: head.y,
        z: head.z,
        width: base * 1.5,
        height: base * 0.3,
        rotate: drop.angle,
        opacity: 1,
        svg: arrowSvg(colors),
      });
    }

    // The strike: the dust, and the arrow left quivering in the ground.
    const stuck = normalize((progress - land) / Math.max(1 - land, 0.01));
    if (stuck > 0 && stuck < 1) {
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-dust-${index}`,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        width: base * (0.5 + easeOutCubic(stuck) * 1.6),
        height: base * (0.5 + easeOutCubic(stuck) * 1.6),
        opacity: (1 - stuck) * 0.55,
        background: `radial-gradient(circle, ${preset.colorSecondary} 0%, transparent 70%)`,
        borderRadius: '50%',
      });
      sprites.push({
        ...blank(),
        key: `${prefix}-rain-stuck-${index}`,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        width: base * 1.1,
        height: base * 0.26,
        rotate: drop.angle + Math.sin(stuck * 34) * (1 - stuck) * 6,
        opacity: 1 - stuck * 0.8,
        svg: arrowSvg(colors),
      });
    }
  }
}

/**
 * A projectile, in three stages: the firing, the flight and the landing.
 *
 * In flight it shows a head drawn out along its speed and a ribbon joining where it has been.
 * Round particles at even spacing carry no speed; the point is to squash and stretch along the travel seen on the screen.
 */
export function appendProjectile(
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
  const look = preset.projectileLook;
  const solid = look !== 'bolt';
  const arc = base * PROJECTILE_ARC[look];
  const timing = projectileTiming(preset);

  // Each shot fires, flies and lands on its own, and a burst is these laid close together.
  timing.shots.forEach((shot, index) => {
    const travel = normalize((progress - shot.launch) / timing.travel);
    const shotKey = `${prefix}-s${index}`;

    if (travel > 0 && travel < 1) {
      appendFlyingShot(sprites, shotKey, center, base, travel, preset, origin, view, arc, look, index);
    }

    appendLaunchFlash(sprites, shotKey, base, travel, preset, origin, solid);

    const impact = normalize((progress - shot.land) / (1 - shot.land));
    if (impact > 0 && impact < 1) {
      // The landing is left to the effect of its element: ice leaves a ring of frost and earth a crack.
      paintImpact(
        preset.impactEffectKind,
        sprites,
        `${shotKey}-impact`,
        center,
        base * 0.85,
        impact,
        preset,
        () => 0.5
      );
    }
  });
}

/** One shot in flight: a head drawn out along its speed and a ribbon joining where it has been. */
function appendFlyingShot(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  travel: number,
  preset: EffectPreset,
  origin: Point3,
  view: ViewRotation | null | undefined,
  arc: number,
  look: ProjectileStyle,
  shotIndex: number
): void {
  const solid = look !== 'bolt';
  const swerve = base * PROJECTILE_SWERVE[look] * SWERVE_SIDE[shotIndex % SWERVE_SIDE.length];
  const at = (value: number): Point3 => flightPoint(origin, center, base, value, arc, swerve, look === 'cruise');
  const head = at(travel);

  // The tail. Anything that swings is joined in short sections along the path; as one chord the shot alone would look sideways.
  if (look === 'missile' || look === 'cruise') {
    const span = TRAIL_SPAN[look] / SMOKE_SEGMENTS;
    for (let segment = 0; segment < SMOKE_SEGMENTS; segment += 1) {
      const front = at(travel - segment * span);
      const back = at(travel - (segment + 1) * span);
      const link = projectDirection(front.x - back.x, front.y - back.y, front.z - back.z, view);
      if (link.length < 0.5) continue;
      const age = segment / SMOKE_SEGMENTS;
      sprites.push({
        ...blank(),
        key: `${prefix}-smoke-${segment}`,
        x: (front.x + back.x) / 2,
        y: (front.y + back.y) / 2,
        z: (front.z + back.z) / 2,
        width: link.length * 1.1,
        height: base * TRAIL_THICKNESS[look] * (0.5 + age * 1.4),
        rotate: link.angle,
        opacity: (1 - age) * 0.45,
        background: `linear-gradient(90deg, transparent, ${preset.colorSecondary})`,
        borderRadius: '50%',
      });
    }
  } else if (STRAIGHT_LOOKS.has(look)) {
    const tailAt = Math.max(0, travel - TRAIL_SPAN[look]);
    const tail = at(tailAt);
    const link = projectDirection(head.x - tail.x, head.y - tail.y, head.z - tail.z, view);
    if (link.length >= 0.5) {
      sprites.push({
        ...blank(),
        key: `${prefix}-trail`,
        x: (head.x + tail.x) / 2,
        y: (head.y + tail.y) / 2,
        z: (head.z + tail.z) / 2,
        width: link.length,
        height: base * TRAIL_THICKNESS[look],
        rotate: link.angle,
        opacity: 0.65,
        background: `linear-gradient(90deg, transparent, ${preset.colorSecondary} 45%, ${preset.colorPrimary})`,
        borderRadius: '9999px',
        shadow: glow(base * 0.16, preset.colorSecondary),
      });
    }
  } else {
    const span = solid ? 0.05 : 0.075;
    for (let segment = 0; segment < PROJECTILE_RIBBON_COUNT; segment++) {
      const back = at(travel - (segment + 1) * span);
      const front = at(travel - segment * span);
      const link = projectDirection(front.x - back.x, front.y - back.y, front.z - back.z, view);
      if (link.length < 0.5) continue;
      const age = segment / PROJECTILE_RIBBON_COUNT;
      sprites.push({
        ...blank(),
        key: `${prefix}-ribbon-${segment}`,
        x: (front.x + back.x) / 2,
        y: (front.y + back.y) / 2,
        z: (front.z + back.z) / 2,
        width: link.length * 1.08,
        height: base * (solid ? 0.1 : 0.34) * (1 - age * 0.75),
        rotate: link.angle,
        opacity: (1 - age) * (1 - age) * (solid ? 0.5 : 0.85),
        background: solid
          ? `linear-gradient(90deg, transparent, ${preset.colorSecondary})`
          : `linear-gradient(90deg, transparent, ${preset.colorSecondary} 35%, ${preset.colorPrimary} 85%, #ffffff)`,
        borderRadius: '50%',
        shadow: solid ? '' : glow(base * 0.2 * (1 - age), preset.colorSecondary),
      });
    }
  }

  // The head, drawn out along its speed so it reads fast even in a still.
  const nose = at(travel - 0.02);
  const heading = projectDirection(head.x - nose.x, head.y - nose.y, head.z - nose.z, view);
  if (solid) {
    sprites.push({
      ...blank(),
      key: `${prefix}-shot`,
      x: head.x,
      y: head.y,
      z: head.z,
      width: base * PROJECTILE_SIZE[look].width,
      height: base * PROJECTILE_SIZE[look].height,
      rotate: heading.angle + PROJECTILE_TURN[look],
      opacity: look === 'crescent' ? 0.95 : 1,
      svg: projectileSvg(look, colorsOf(preset)),
      shadow: look === 'blaster' || look === 'tracer' ? glow(base * 0.35, preset.colorPrimary) : '',
    });

    // The exhaust behind it, which makes it read as driven rather than merely flying.
    if (look === 'missile' || look === 'cruise') {
      const flame = base * PROJECTILE_SIZE[look].width * 0.55;
      // It sits one length behind; measured by a frame's travel it would part differently at different speeds and reaches.
      const step = base * PROJECTILE_SIZE[look].width * 0.62;
      const reach = Math.hypot(head.x - nose.x, head.y - nose.y, head.z - nose.z);
      const behind = reach > 0.001 ? step / reach : 0;
      sprites.push({
        ...blank(),
        key: `${prefix}-thrust`,
        x: head.x - (head.x - nose.x) * behind,
        y: head.y - (head.y - nose.y) * behind,
        z: head.z - (head.z - nose.z) * behind,
        width: flame,
        height: base * PROJECTILE_SIZE[look].height * 0.85,
        rotate: heading.angle,
        opacity: 0.85,
        svg: thrustSvg(colorsOf(preset)),
        shadow: glow(base * 0.3, preset.colorSecondary),
      });
    }
    return;
  }

  sprites.push({
    ...blank(),
    key: `${prefix}-streak`,
    x: head.x,
    y: head.y,
    z: head.z,
    width: base * 1.9,
    height: base * 0.5,
    rotate: heading.angle,
    opacity: 0.95,
    background: `linear-gradient(90deg, transparent, ${preset.colorSecondary} 30%, ${preset.colorPrimary} 65%, #ffffff 100%)`,
    borderRadius: '50%',
    shadow: glow(base * 0.5, preset.colorPrimary, base * 1.1, preset.colorSecondary),
  });

  const coreSize = base * 0.52;
  sprites.push({
    ...blank(),
    key: `${prefix}-core`,
    x: head.x,
    y: head.y,
    z: head.z,
    width: coreSize,
    height: coreSize,
    opacity: 1,
    background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 45%, ${preset.colorSecondary} 72%, transparent 84%)`,
    borderRadius: '50%',
    shadow: glow(base * 0.7, '#ffffff', base * 1.4, preset.colorPrimary),
  });
}

/** The moment of firing: the gathered light and the flash at the muzzle. */
function appendLaunchFlash(
  sprites: EffectSprite[],
  prefix: string,
  base: number,
  travel: number,
  preset: EffectPreset,
  origin: Point3,
  solid: boolean
): void {
  const flash = normalize(travel / 0.2);
  if (flash <= 0 || flash >= 1) return;

  const size = base * (solid ? 0.5 + flash * 0.7 : 1 + flash * 1.4);
  sprites.push({
    ...blank(),
    key: `${prefix}-muzzle`,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    width: size,
    height: size,
    opacity: (1 - flash) * 0.95,
    background: `radial-gradient(circle, #ffffff 0%, ${preset.colorPrimary} 40%, ${preset.colorSecondary} 62%, transparent 78%)`,
    borderRadius: '50%',
  });

  if (solid) return;
  for (let spike = 0; spike < 2; spike++) {
    sprites.push({
      ...blank(),
      key: `${prefix}-muzzle-flare-${spike}`,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      width: base * (1.4 + flash * 1.6),
      height: base * 0.09 * (1 - flash),
      rotate: spike * 90,
      opacity: (1 - flash) * 0.85,
      background: `linear-gradient(90deg, transparent, ${preset.colorPrimary} 35%, #ffffff 50%, ${preset.colorPrimary} 65%, transparent)`,
      borderRadius: '50%',
    });
  }
}

/** One point along the path. Given an arc it flies over one. */
function flightPoint(
  origin: Point3,
  center: Point3,
  base: number,
  value: number,
  arc: number,
  swerve = 0,
  level = false
): Point3 {
  const clamped = Math.min(Math.max(value, 0), 1);
  // It gathers a little speed; at an even one it drifts rather than flies.
  const eased = clamped ** 1.25;
  const point = {
    x: origin.x + (center.x - origin.x) * eased,
    y: origin.y + (center.y - origin.y) * eased,
    z: origin.z + (center.z + base * 0.6 - origin.z) * eased + loft(clamped, level) * arc,
  };
  if (swerve === 0) return point;

  // It swells across the path, taken in the horizontal plane so it swings over the board.
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return point;

  // It strays early and closes on the target; turning back at the middle it would still be off the target near the landing.
  const bulge = Math.sin(Math.PI * clamped ** 0.7) * swerve;
  return { ...point, x: point.x + (-dy / length) * bulge, y: point.y + (dx / length) * bulge };
}
