import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { flameRampOf, mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { drawBillowClouds, type Flame, layFlames } from '@axe/domain/effect/scene/fire/fire-body';
import { drawEmber, drawSpark, layShockRing, SMOKE, WARM } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  diesFrom,
  fierceness,
  FIRES,
  type FlameThrow,
  flareAt,
  heatAt,
  throwFire,
  type Tongue,
  tongueAt,
} from '@axe/domain/effect/scene/fire/flame-fire';
import {
  floorMark,
  glow,
  hueOf,
  keptFor,
  lightBall,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A piece set ablaze. The fire catches with a flare: sparks spit from it and its tongues leap past
 * their height before they settle. Tongues of flame stand in a ring round its feet, leaning in over
 * it, and more lick up its body, all flickering in height, swaying, and torn at their tips by a
 * pattern that runs up them; laid as one fire, deep red at its edge, orange and yellow within and
 * pale at the heart of the largest. They stand on every side of the piece, so those beyond it are
 * hidden by it and it is seen wreathed in the fire, not behind it; but the few of the least fire,
 * too small to hide the piece, are drawn before it, where they can be seen. Flames break off the tips and
 * rise, reddening as they go out, and smoke rolls off the top, dark over the fire. Embers are
 * carried up, sparks pop, the floor under it is lit warm and blackens as it burns. Near its end the
 * fire sinks and reddens, the tongues shorten, and coals are left glowing while the last smoke clears.
 *
 * Its grade is how great a fire it is: the least is a few sparks flicked at the piece, from its
 * caster where it has one, that catch on it in a flash and a ring of light, leap up in a handful of
 * broad, hot tongues past its head and settle low about its feet, and gutter; the middle one wreathes the
 * piece to its head; the greatest roars up past it in tall
 * tongues, twice its height, and throws a ring of light out along the floor as it catches.
 */

/** How long a fire lingers after its playback while its smoke clears and its coals die, in seconds. */
const LINGER_S = 1.6;
const thrownByStage = new Map<string, FlameThrow>();

export const flame: Choreography = { lingerS: LINGER_S, draw: drawFlame };

function drawFlame(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const grade = stage.preset.gradeLevel;
  const fire = FIRES[grade];
  const ends = duration + LINGER_S;
  const ramp = flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const foot = { x: stage.x, y: stage.y, z: stage.z };
  const forward = cell * 0.15;
  const about = grade === 1 ? { forward } : { forward: cell * 0.1, exact: true };
  const fierce = fierceness(t, duration);
  const flicker = 0.85 + 0.1 * Math.sin(t * 23 + stage.seed) + 0.05 * Math.sin(t * 57 + stage.seed * 1.7);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwFire(throwerFor(stage, ends), foot, grade, duration)
  );

  const burnt = within(t, 0, duration);
  const clearing = 1 - within(t, ends - 0.6, ends);
  const reach = cell * (fire.ring + 0.12);
  drawn.floor.push(
    floorMark('scorch', floor, reach * (0.5 + 0.7 * burnt), 1, SMOKE, 0.5 * clearing, 'color', (stage.seed % 89) + 1)
  );
  if (fierce > 0) {
    drawn.floor.push(floorMark('disc', floor, reach * 3.4, 1, WARM, 0.3 * fierce * flicker, 'light', 0));
    drawn.floor.push(
      floorMark('scorch', floor, reach * 1.1, 1, ramp[4], 0.55 * fierce * flicker, 'light', (stage.seed % 61) + 3)
    );
  }
  if (grade === 3 && t < 0.4) {
    const ring = cell * (0.3 + 1.9 * outCubic(t / 0.4));
    drawn.floor.push(
      floorMark('ring', floor, ring, (cell * 0.12 * (1 - t / 0.4)) / ring, ramp[4], 1 - t / 0.4, 'light', 0)
    );
  }
  const cooling = within(t, diesFrom(duration), ends - 0.3);
  if (cooling > 0 && cooling < 1) {
    for (const [index, coal] of thrown.coals.entries()) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 5 + index * 1.9);
      drawn.motes.push(glow(coal, cell * 0.12, ramp[cooling < 0.5 ? 4 : 3], (1 - cooling) * pulse, forward));
    }
  }

  drawBillowClouds(drawn, thrown.clouds, t, cell, { forward });
  const flames = [
    ...tonguesAt(thrown.tongues, foot, floor, t, duration, cell, fire.flares),
    ...flameletsAt(thrown, foot, floor, t, duration, cell, fire.flares),
  ];
  layFlames(drawn, flames, ramp, about);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);

  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.5 };
  if (grade === 1) drawFlicked(drawn, stage, heart, ramp, t, forward);
  if (grade >= 2 && t < 0.16) {
    drawn.motes.push(...starBurst(heart, cell * 1.6 * (grade - 1), hueOf(ramp), t / 0.16, cell * 0.6, 6, stage.seed));
  }
  if (fierce > 0.02) {
    drawn.motes.push(glow(heart, cell * (0.9 + fire.tall), ramp[3], 0.3 * fierce * flicker, forward));
    drawn.lights.push({
      ...heart,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: (0.6 + 0.2 * grade) * fierce * flicker * (1 + flareAt(t)),
      reachPx: cell * (1.8 + 0.5 * grade),
    });
  }
  return drawn;
}

/** How long the sparks of the least fire take to reach the piece, in seconds, and how many there are. */
const FLICKED_S = 0.16;
const FLICKED = 8;

/**
 * The sparks flicked at the piece before the least fire catches: thrown from the caster's hands, or
 * with no caster dropped from over the piece, each on its own low arc, landing one after another.
 */
function drawFlicked(
  drawn: Staged,
  stage: Stage,
  heart: Point,
  ramp: readonly string[],
  t: number,
  forward: number
): void {
  const { cell } = stage;
  const from = stage.origin ?? { x: heart.x - cell * 0.8, y: heart.y, z: heart.z + cell * 1.6 };
  for (let spark = 0; spark < FLICKED; spark++) {
    const share = (t - spark * 0.02) / FLICKED_S;
    if (share <= 0 || share >= 1) continue;
    const aside = Math.sin(stage.seed + spark * 2.4) * cell * 0.18;
    const arc = Math.sin(Math.PI * share) * cell * (0.25 + 0.1 * spark);
    const way = { x: heart.x - from.x, y: heart.y - from.y, z: heart.z - from.z };
    const far = Math.hypot(way.x, way.y, way.z) || 1;
    drawn.motes.push({
      ...glow(
        { x: from.x + way.x * share, y: from.y + way.y * share + aside * (1 - share), z: from.z + way.z * share + arc },
        cell * 0.15,
        spark % 2 === 0 ? ramp[5] : ramp[4],
        1,
        forward
      ),
      shape: 'spark',
      velocity: { x: (way.x / far) * cell * 6, y: (way.y / far) * cell * 6, z: (way.z / far) * cell * 6 },
      trail: 0.12,
    });
  }
  const caught = (t - FLICKED_S) / 0.2;
  if (caught >= 0 && caught < 1) {
    drawn.motes.push(...starBurst(heart, cell * 3, hueOf(ramp), caught, forward, 6, stage.seed));
    drawn.motes.push(lightBall(heart, cell * 1.1 * (1 - caught), ramp[5], 1 - caught, forward + 1));
    const floor = { x: heart.x, y: heart.y, z: stage.groundZ };
    drawn.floor.push(floorMark('disc', floor, cell * 2, 1, ramp[4], 0.6 * (1 - caught), 'light', 0));
    layShockRing(drawn, floor, cell * 0.25, cell * 1.8, cell * 0.26, ramp[4], t - FLICKED_S, 0.3);
  }
}

/** The tongues at a moment, as flames to be laid as one fire, leaping as far as `flares` says as it catches. */
function tonguesAt(
  tongues: readonly Tongue[],
  foot: Point,
  floor: Point,
  t: number,
  duration: number,
  cell: number,
  flares: number
): Flame[] {
  const fierce = fierceness(t, duration);
  if (fierce <= 0.02) return [];
  const heat = heatAt(t, duration);
  return tongues.map((tongue): Flame => {
    const at = tongueAt(tongue, foot, floor, t, fierce, cell, flares);
    return {
      shape: 'lick',
      at: at.root,
      heading: { x: at.leanX, y: at.leanY, z: 1 },
      wide: cell * tongue.width * (0.6 + 0.4 * fierce),
      long: at.tall,
      heat: tongue.heat * heat,
      flowed: t * tongue.rates[2] * 0.7 + tongue.variant * 7,
      variant: tongue.variant,
    };
  });
}

/** The flames broken off the tongues at a moment: each rising from the tip it left, narrowing and reddening until it is out. */
function flameletsAt(
  thrown: FlameThrow,
  foot: Point,
  floor: Point,
  t: number,
  duration: number,
  cell: number,
  flares: number
): Flame[] {
  const flames: Flame[] = [];
  for (const flamelet of thrown.flamelets) {
    const age = (t - flamelet.bornAt) / flamelet.lasts;
    if (age < 0 || age >= 1) continue;
    const fierce = fierceness(flamelet.bornAt, duration);
    const { tip } = tongueAt(thrown.tongues[flamelet.tongue], foot, floor, flamelet.bornAt, fierce, cell, flares);
    const risen = cell * flamelet.rises * flamelet.lasts * age;
    const wide = cell * flamelet.size * (1 - 0.55 * age);
    flames.push({
      shape: 'lick',
      at: { x: tip.x + Math.sin(flamelet.drift + age * 4) * cell * 0.06, y: tip.y, z: tip.z - wide + risen },
      heading: { x: 0.25 * Math.sin(flamelet.drift + age * 6), y: 0, z: 1 },
      wide,
      long: wide * (2.4 - age),
      heat: 0.7 * (1 - age) * heatAt(flamelet.bornAt, duration),
      flowed: t * 5 + flamelet.variant * 7,
      variant: flamelet.variant,
    });
  }
  return flames;
}
