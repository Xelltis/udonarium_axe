import {
  clamp01,
  type ColorRamp,
  easeOutQuad,
  type EffectParticle,
  fadeInOut,
  flameBodyColor,
  flameBodyFade,
  flameColor,
} from '@axe/domain/effect/particles/shared';

/**
 * What burns.
 *
 * Flame, explosion, engulfing fire and mushroom cloud, each falling from white heat to smoke.
 */

/** A rising flame: white-hot at the root, narrower and redder as it climbs, and smoke at the last. */
export function emitFlame(
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp
): void {
  const life = fadeInOut(progress, 0.18);
  if (life <= 0) return;

  for (let index = 0; index < 46; index++) {
    const phase = random();
    const spread = (random() - 0.5) * base * 0.9;
    const speed = 0.55 + random() * 0.45;
    const swayPhase = random() * Math.PI * 2;

    const local = (progress * 2.6 + phase) % 1;
    const rise = easeOutQuad(local);
    const sway = Math.sin(swayPhase + local * Math.PI * 2.4) * base * 0.16 * local;

    // The root of each tongue is hot and gives light; higher up it is a body of flame, coloured to
    // its edge, so the flame keeps its colour and its shape rather than running together into white.
    const hot = local < 0.28;
    particles.push({
      x: spread * (1 - local * 0.55) + sway,
      y: -base * (0.1 + rise * 2.1 * speed),
      size: base * (0.5 + random() * 0.22) * (1 - local * 0.55) * (hot ? 0.8 : 1),
      angle: 0,
      stretch: 1.35 - local * 0.4,
      color: hot ? flameColor(local, ramp) : flameBodyColor(local, ramp),
      alpha: life * (1 - local) * (hot ? 0.75 : 0.7),
      shape: hot ? 'glow' : 'puff',
    });
  }

  for (let index = 0; index < 14; index++) {
    const phase = random();
    const spread = (random() - 0.5) * base * 1.1;
    const local = (progress * 1.7 + phase) % 1;
    particles.push({
      x: spread + Math.sin(local * Math.PI * 3 + phase * 6) * base * 0.28,
      y: -base * (0.3 + local * 3.4),
      size: base * 0.1 * (1 - local * 0.4),
      angle: 0,
      stretch: 1,
      color: local < 0.5 ? ramp.hot : ramp.mid,
      alpha: life * (1 - local) * 0.95,
      shape: 'glow',
    });
  }

  for (let index = 0; index < 8; index++) {
    const phase = random();
    const local = (progress * 1.1 + phase) % 1;
    particles.push({
      x: (random() - 0.5) * base * 0.8 + Math.sin(local * Math.PI * 2 + phase * 5) * base * 0.5,
      y: -base * (1.6 + local * 3),
      size: base * (0.7 + local * 1.1),
      angle: 0,
      stretch: 1,
      color: '#2a2320',
      alpha: life * (1 - local) * 0.3 * local,
      shape: 'smoke',
    });
  }
}

/** An explosion: a brief white core, sparks slowed by drag, a swelling fireball and smoke behind it. */
export function emitExplosion(
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp,
  power: number,
  engulf: boolean
): void {
  if (engulf) emitEngulf(particles, random, progress, base, ramp, power);

  // The heart of the blast gives the light; the table round it is lit by the effect's own light, so
  // the heart stays small rather than burning the picture white.
  const flash = clamp01(progress / 0.12);
  if (flash < 1) {
    particles.push({
      x: 0,
      y: -base * 0.6,
      size: base * (1.1 + flash * 1.1) * Math.sqrt(power),
      angle: 0,
      stretch: 1,
      color: ramp.hot,
      alpha: (1 - flash) * 0.9,
      shape: 'glow',
    });
  }

  const puffs = Math.round(20 * power);
  for (let index = 0; index < puffs; index++) {
    const angle = random() * Math.PI * 2;
    const reach = base * (0.3 + random() * 1.1) * power;
    const born = random() * 0.16;
    const local = clamp01((progress - born) / 0.62);
    if (local <= 0 || local >= 1) continue;
    const distance = reach * easeOutQuad(local);
    particles.push({
      x: Math.cos(angle) * distance,
      y: -base * 0.6 + Math.sin(angle) * distance * 0.7 - base * local * 0.5,
      size: base * (0.6 + random() * 0.4) * power * (0.5 + local * 0.7),
      angle: 0,
      stretch: 1,
      color: flameBodyColor(local, ramp),
      alpha: flameBodyFade(local) * 0.75,
      shape: 'puff',
    });
  }

  const sparks = Math.round(30 * power);
  for (let index = 0; index < sparks; index++) {
    const angle = random() * Math.PI * 2;
    // A greater blast throws its sparks further, but only as the root of its power: thrown as far as
    // the power itself, they flew off the canvas they are drawn on and were cut off at its edge.
    const reach = Math.sqrt(power);
    const speed = base * (1.3 + random() * 1.7) * reach;
    const born = random() * 0.1;
    const local = clamp01((progress - born) / 0.75);
    if (local <= 0 || local >= 1) continue;
    // Drag slows them and gravity brings them down; in straight even lines it is no firework.
    const travel = speed * (1 - Math.pow(1 - local, 2.2));
    const drop = base * 1.3 * local * local * reach;
    particles.push({
      x: Math.cos(angle) * travel,
      y: -base * 0.6 + Math.sin(angle) * travel * 0.72 + drop,
      size: base * 0.13 * (1 - local * 0.4),
      angle,
      stretch: 3.2 + local * 3,
      color: local < 0.35 ? ramp.hot : ramp.mid,
      alpha: (1 - local) * 0.95,
      shape: 'streak',
    });
  }

  // Smoke makes an explosion look larger, but thickened and enlarged with the grade it sinks the screen itself.
  // Only the count and the spread grow with the grade; each particle stays as thin as ever.
  const smokes = Math.round(9 * power);
  for (let index = 0; index < smokes; index++) {
    const angle = random() * Math.PI * 2;
    const born = 0.12 + random() * 0.25;
    const local = clamp01((progress - born) / 0.7);
    if (local <= 0 || local >= 1) continue;
    particles.push({
      x: Math.cos(angle) * base * (0.4 + local * 1.5) * power,
      y: -base * 0.6 + Math.sin(angle) * base * 0.5 - base * local * 1.6 * power,
      size: base * (0.7 + local * 1.1) * (0.75 + power * 0.25),
      angle: 0,
      stretch: 1,
      color: '#453a32',
      alpha: fadeInOut(local, 0.3) * 0.11,
      shape: 'smoke',
    });
  }
}

/**
 * The engulfing: the flame around is drawn in before the explosion, and then the fireball covers the piece.
 * Scattering outwards alone merely bursts on the spot and never swallows.
 */
function emitEngulf(
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp,
  power: number
): void {
  const bodyY = -base * 0.9;

  // The indrawing, whose gathering makes the swell that follows read stronger.
  const suck = clamp01(progress / 0.14);
  if (suck < 1) {
    for (let index = 0; index < 18; index++) {
      const angle = random() * Math.PI * 2;
      const radius = base * (2.6 + random() * 1.4) * (1 - easeOutQuad(suck));
      particles.push({
        x: Math.cos(angle) * radius,
        y: bodyY + Math.sin(angle) * radius * 0.55,
        size: base * 0.28,
        angle,
        stretch: 2.6 + suck * 4,
        color: ramp.mid,
        alpha: suck * 0.8,
        shape: 'streak',
      });
    }
  }

  // The fireball over the piece, held thick a while before it breaks.
  const swallow = clamp01((progress - 0.08) / 0.5);
  if (swallow > 0 && swallow < 1) {
    const hold = swallow < 0.45 ? 1 : 1 - (swallow - 0.45) / 0.55;
    for (let index = 0; index < 10; index++) {
      const angle = random() * Math.PI * 2;
      const radius = base * random() * 0.7 * power;
      particles.push({
        x: Math.cos(angle) * radius,
        y: bodyY + Math.sin(angle) * radius * 0.7 - base * swallow * 0.5,
        size: base * (1.3 + random() * 0.7) * power * (0.5 + swallow * 0.5),
        angle: 0,
        stretch: 1,
        color: flameBodyColor(swallow, ramp),
        alpha: hold * 0.8 * (1 - swallow * 0.5),
        shape: 'puff',
      });
    }
    // Its heart, white-hot while it swells, is all of it that gives light.
    if (swallow < 0.45) {
      particles.push({
        x: 0,
        y: bodyY - base * swallow * 0.5,
        size: base * 1.3 * Math.sqrt(power),
        angle: 0,
        stretch: 1,
        color: ramp.hot,
        alpha: (1 - swallow / 0.45) * 0.85,
        shape: 'glow',
      });
    }

    // The smoke around it, whose outline is what reads as being covered.
    // Enlarged and darkened with the grade it goes past covering and sinks the screen.
    for (let index = 0; index < 8; index++) {
      const angle = random() * Math.PI * 2;
      const radius = base * (0.9 + random() * 0.7) * power * (0.6 + swallow * 0.8);
      particles.push({
        x: Math.cos(angle) * radius,
        y: bodyY + Math.sin(angle) * radius * 0.6,
        size: base * (1.1 + random() * 0.6) * (0.8 + power * 0.3),
        angle: 0,
        stretch: 1,
        color: '#3b2f28',
        alpha: hold * 0.24 * swallow,
        shape: 'smoke',
      });
    }
  }
}

/** The greatest explosion: a column rises and a cap rolls out at the top. */
export function emitMushroom(
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp
): void {
  // The flash is the table's light to give; drawn here it is only the heart of the blast.
  const flash = clamp01(progress / 0.08);
  if (flash < 1) {
    particles.push({
      x: 0,
      y: -base * 0.8,
      size: base * (1.6 + flash * 1.6),
      angle: 0,
      stretch: 1,
      color: ramp.hot,
      alpha: (1 - flash) * 0.9,
      shape: 'glow',
    });
  }

  // The column: hot and giving light at its root, a body of flame darkening as it rises.
  for (let index = 0; index < 40; index++) {
    const phase = random();
    const local = clamp01((progress - phase * 0.3) / 0.55);
    if (local <= 0 || local >= 1) continue;
    const height = easeOutQuad(local);
    const radius = base * (0.5 + random() * 0.4) * (1 - height * 0.35);
    const angle = random() * Math.PI * 2;
    const root = height < 0.2;
    particles.push({
      x: Math.cos(angle) * radius,
      y: -base * (0.6 + height * 3.4),
      size: base * (1 + random() * 0.6) * (1 - height * 0.3) * (root ? 0.7 : 1),
      angle: 0,
      stretch: 1,
      color: root ? flameColor(height, ramp) : flameBodyColor(height, ramp),
      alpha: root ? (1 - local * 0.7) * 0.55 : flameBodyFade(local) * 0.7,
      shape: root ? 'glow' : 'puff',
    });
  }

  // The cap, rolling up as a ring and spreading outwards.
  const cap = clamp01((progress - 0.28) / 0.72);
  if (cap > 0) {
    for (let index = 0; index < 44; index++) {
      const around = random() * Math.PI * 2;
      const roll = random() * Math.PI * 2 + cap * Math.PI * 1.6;
      const ringRadius = base * (0.6 + easeOutQuad(cap) * 3.2);
      const tube = base * (0.7 + random() * 0.5) * (0.6 + cap * 0.8);
      particles.push({
        x: Math.cos(around) * (ringRadius + Math.cos(roll) * tube),
        y: -base * (3.6 + cap * 1.4) + Math.sin(around) * ringRadius * 0.4 + Math.sin(roll) * tube * 0.7,
        size: base * (1 + random() * 0.7),
        angle: 0,
        stretch: 1,
        color: cap < 0.35 ? flameBodyColor(cap + 0.2, ramp) : '#4a3a30',
        alpha: (1 - cap * 0.85) * (cap < 0.3 ? 0.6 : 0.2),
        shape: cap < 0.3 ? 'puff' : 'smoke',
      });
    }
  }

  // The skirt: the smoke of the shock, crawling out along the ground.
  const skirt = clamp01((progress - 0.1) / 0.6);
  if (skirt > 0 && skirt < 1) {
    for (let index = 0; index < 20; index++) {
      const angle = random() * Math.PI * 2;
      const distance = base * (1 + random() * 2.4) * easeOutQuad(skirt);
      particles.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.4 - base * 0.2,
        size: base * (0.8 + skirt * 1.2),
        angle: 0,
        stretch: 1,
        color: '#5a4a3e',
        alpha: fadeInOut(skirt, 0.25) * 0.16,
        shape: 'smoke',
      });
    }
  }
}
