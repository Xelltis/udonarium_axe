import { clamp } from '@axe/core/util/clamp';
import { GRACE_RISES_AT, GRACE_SETS_DOWN_AT } from '@axe/domain/effect/blessing-looks';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { drawFeathers, drawHoop, drawPillar, drawRisingLights } from '@axe/domain/effect/scene/holy/holy-parts';
import {
  drawBloom,
  drawDrifting,
  drawSprouts,
  layLifeRing,
  layRipple,
  layWound,
  lightOf,
  type MendTones,
  mendTonesOf,
  twinkle,
  windBand,
} from '@axe/domain/effect/scene/holy/mend-parts';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A grace, the greatest of the healings. A great seal of life opens on the floor about all it is laid
 * on and turns, blades sprouting along its rim; as its sound swells a dome of light is raised over
 * them, ribs of light climbing from the rim to meet at its crown, where a great flower opens, and a
 * pillar of light stands up through each of them, bands winding up it, and lifts them off the floor.
 * Feathers and petals drift down under the dome while it stands. Then the ribs fall open as the petals
 * of a flower do and are gone, the pillars thin away, and the light comes down on each of them in
 * motes and goes in.
 *
 * The seal, the dome and what falls under it are drawn once, with the first of the cast that is
 * drawn, about the middle of all of them; the rest draw their own pillar and what goes into them, on
 * the first one's clock.
 */

/** How far past the furthest of the cast the dome stands, and how wide it is at the least and at the most, in cells. */
const PAST_CELLS = 1.3;
const NARROWEST_CELLS = 2.1;
const WIDEST_CELLS = 4;
/** How many ribs the dome has, and how long they take to climb and to fall open, in seconds. */
const RIBS = 12;
const CLIMBS_S = 0.4;
const FALLS_OPEN_S = 0.75;
/** How far the ribs fall open, in radians from standing. */
const FALLS_OPEN_BY = 1.15;

/** The middle of the cast and how far the dome reaches from it. */
function domeOf(stage: Stage): { readonly middle: Point; readonly reach: number } {
  const all = stage.targets.length > 0 ? stage.targets : [stage];
  const middle = {
    x: all.reduce((sum, target) => sum + target.x, 0) / all.length,
    y: all.reduce((sum, target) => sum + target.y, 0) / all.length,
    z: stage.groundZ,
  };
  const furthest = Math.max(...all.map((target) => Math.hypot(target.x - middle.x, target.y - middle.y)));
  const { cell } = stage;
  return { middle, reach: clamp(furthest + cell * PAST_CELLS, cell * NARROWEST_CELLS, cell * WIDEST_CELLS) };
}

/** The ribs of the dome, climbed as far as `risen` and fallen open as far as `fallen`, and hoops of light round it. */
function drawDome(
  drawn: Staged,
  middle: Point,
  reach: number,
  high: number,
  cell: number,
  tones: MendTones,
  t: number,
  risen: number,
  fallen: number
): void {
  const shown = 1 - fallen;
  if (risen <= 0 || shown <= 0.01) return;
  const tilt = fallen * FALLS_OPEN_BY;
  const steps = 10;
  for (let rib = 0; rib < RIBS; rib++) {
    const turn = (rib / RIBS) * Math.PI * 2 + t * 0.12;
    const points: Point[] = [];
    const about: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let step = 0; step <= steps; step++) {
      const share = (step / steps) * risen;
      const lat = share * (Math.PI / 2) * 0.96;
      const dr = reach * (Math.cos(lat) - 1);
      const dz = high * Math.sin(lat);
      const out = reach + dr * Math.cos(tilt) + dz * Math.sin(tilt);
      const z = Math.max(cell * 0.03, dz * Math.cos(tilt) - dr * Math.sin(tilt));
      points.push({ x: middle.x + Math.cos(turn) * out, y: middle.y + Math.sin(turn) * out, z: middle.z + z });
      about.push({ x: middle.x, y: middle.y, z: middle.z + z });
      widths.push(cell * (0.42 - 0.24 * share));
      alphas.push(step === steps && risen < 1 ? 0 : 1 - 0.35 * share);
    }
    const shimmer = 0.8 + 0.2 * Math.sin(t * 4.3 + rib * 1.9);
    for (const [half, seen] of [
      ['far', 1],
      ['near', 0.55],
    ] as const) {
      drawn.ribbons.push(
        {
          points,
          about,
          half,
          widths: widths.map((wide) => wide * 1.9),
          color: tones.deep,
          alpha: 0.75 * shown * seen,
          alphas,
          blend: 'color',
          soft: 0.6,
          torn: 0.25,
          flowed: -t * 2 + rib,
        },
        {
          points,
          about,
          half,
          widths,
          color: tones.body,
          core: tones.gold,
          alpha: 0.95 * shown * seen,
          alphas,
          blend: 'color',
          soft: 0.2,
        },
        {
          points,
          about,
          half,
          widths: widths.map((wide) => wide * 0.6),
          color: tones.pale,
          core: '#ffffff',
          alpha: 0.4 * shown * seen * shimmer,
          alphas,
          blend: 'light',
          soft: 0.5,
        }
      );
    }
  }
  if (fallen > 0) return;
  const light = lightOf(tones);
  for (const lat of [0.42, 0.85, 1.2]) {
    if (risen < lat / (Math.PI / 2)) continue;
    const at = { ...middle, z: middle.z + high * Math.sin(lat) };
    drawHoop(drawn, at, reach * Math.cos(lat), cell * 0.05, light, 0.55);
  }
}

/** What a grace does to one of those it is laid on: a ring under it, a pillar through it, bands wound up it, and the light that goes into it. */
function drawBlessed(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  tones: MendTones,
  t: number,
  rises: number,
  setsDown: number,
  ends: number
): void {
  const { cell, duration } = stage;
  const forward = cell * 0.3;
  const since = t - rises;
  const leaving = 1 - within(t, duration, ends);
  layLifeRing(drawn, floor, cell * 0.8 * outCubic(within(t, 0.15, 0.6)), tones, leaving, t * 0.6, stage.seed);
  if (since < 0) return;
  const stands = outCubic(within(since, 0, 0.22)) * (1 - within(t, setsDown, setsDown + 0.6));
  const thick = cell * (0.34 + 0.5 * (1 - outCubic(within(since, 0, 0.5))));
  drawPillar(
    drawn,
    floor,
    floor.z + stage.tall + cell * 4.2 * outCubic(within(since, 0, 0.16)),
    thick,
    lightOf(tones),
    stands,
    t
  );
  layRipple(drawn, floor, cell * 0.3, cell * 1.7, tones, within(since, 0, 0.5));
  if (since < 0.1) {
    const left = 1 - since / 0.1;
    drawn.floor.push(floorMark('disc', floor, cell * 1.3, 1, tones.pale, 0.8 * left, 'light', 0));
    drawn.motes.push(glow({ ...floor, z: floor.z + stage.tall * 0.5 }, cell * 2.4, '#ffffff', 0.7 * left, forward));
  }
  if (stands > 0.05) {
    for (let band = 0; band < 2; band++) {
      const head = ((since * 0.62 + band * 0.5) % 1) * 1.4;
      const from = (stage.seed % 6) + band * Math.PI;
      layWound(
        drawn,
        windBand(
          floor,
          [cell * 0.05, stage.tall + cell * 1.1],
          [cell * 0.62, cell * 0.4],
          [from, from + Math.PI * 4],
          [Math.max(0, head - 0.4), Math.min(1, head)],
          cell * 0.15
        ),
        tones,
        stands
      );
    }
  }
  const next = seededRun(stage.seed * 29 + 1);
  const body = { ...floor, z: floor.z + stage.tall * 0.55 };
  for (let mote = 0; mote < 9; mote++) {
    const born = setsDown + 0.05 + next() * 0.45;
    const turn = next() * Math.PI * 2;
    const out = cell * (0.5 + next() * 0.9);
    const high = stage.tall + cell * (1.4 + next() * 1.2);
    const lasts = 0.5 + next() * 0.25;
    const age = (t - born) / lasts;
    if (age < 0 || age >= 1) continue;
    const drawnIn = age * age;
    const at = {
      x: floor.x + Math.cos(turn + age * 2) * out * (1 - drawnIn),
      y: floor.y + Math.sin(turn + age * 2) * out * (1 - drawnIn),
      z: floor.z + high + (stage.tall * 0.55 - high) * drawnIn,
    };
    twinkle(drawn, at, cell * 0.36, tones, Math.min(1, age * 6, (1 - age) * 4), mote + t * 3, forward);
  }
  const goesIn = Math.sin(within(t, setsDown + 0.4, setsDown + 1.1) * Math.PI);
  if (goesIn > 0.01) {
    drawn.motes.push(haze(body, cell * 1.5, tones.gold, 0.4 * goesIn, forward));
    drawn.motes.push(glow(body, cell * 2, tones.pale, 0.7 * goesIn, forward));
  }
  drawRisingLights(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    lightOf(tones),
    { count: 8, out: [cell * 0.15, cell * 0.8], born: [0.05, Math.max(0.2, setsDown - rises - 0.6)], rise: cell * 1.6 },
    forward
  );
}

/** A grace: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawGrace(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const lead = stage.targets[0] ?? stage;
  const leads = lead.index === stage.index;
  const t = stage.seconds + (leads ? 0 : ((stage.index - lead.index) * stage.preset.stagger) / 1000);
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = mendTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const rises = duration * GRACE_RISES_AT;
  const setsDown = duration * GRACE_SETS_DOWN_AT;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  drawBlessed(drawn, stage, floor, tones, t, rises, setsDown, ends);
  if (!leads) return drawn;

  const { middle, reach } = domeOf(stage);
  const high = Math.max(reach * 0.85, stage.tall + cell * 1.6);
  const forward = cell * 0.4;
  const density = stage.preset.gradeDensity;
  const since = t - rises;
  const opened = outCubic(within(t, 0, rises * 0.85));
  const leaving = 1 - within(t, duration - 0.2, ends);
  const turn = (stage.seed % 7) + t * 0.2;
  const pulse = 0.75 + 0.25 * Math.sin(t * 3.6);
  const standing = since >= 0 ? 1 - within(t, setsDown, setsDown + FALLS_OPEN_S) : 0;

  drawn.floor.push(floorMark('disc', middle, reach * opened * 1.12, 1, tones.deep, 0.42 * leaving, 'color', 0));
  drawn.floor.push(floorMark('crest', middle, reach * opened, 0.075, tones.shade, 0.85 * leaving, 'color', 0, turn));
  drawn.floor.push(floorMark('crest', middle, reach * opened, 0.05, tones.body, leaving, 'color', 0, turn));
  drawn.floor.push(floorMark('crest', middle, reach * opened, 0.022, tones.gold, leaving, 'color', 0, turn));
  drawn.floor.push(
    floorMark(
      'crest',
      middle,
      reach * opened,
      0.03,
      tones.pale,
      leaving * pulse * (0.5 + 0.5 * standing),
      'light',
      0,
      turn
    )
  );
  drawn.floor.push(floorMark('ring', middle, reach * opened * 1.03, 0.06, tones.shade, 0.7 * leaving, 'color', 0));
  drawn.floor.push(floorMark('ring', middle, reach * opened * 1.01, 0.035, tones.gold, 0.95 * leaving, 'color', 0));
  drawn.floor.push(
    floorMark('disc', middle, reach * opened * 1.2, 1, tones.bright, 0.3 * leaving * (0.4 + 0.6 * standing), 'light', 0)
  );
  layRipple(drawn, middle, cell * 0.3, reach * 1.05, tones, within(t, 0, rises * 0.85));
  drawSprouts(
    drawn,
    middle,
    reach,
    cell * 0.7,
    Math.round(clamp((reach / cell) * 9, 16, 34)),
    tones,
    outCubic(within(t, rises * 0.3, rises)) * (1 - within(t, duration, ends - 0.1)),
    t,
    stage.seed,
    forward
  );
  if (since < 0) {
    drawn.lights.push({
      ...middle,
      z: middle.z + cell,
      color: tones.bright,
      strength: 0.7 * opened,
      reachPx: reach * 1.6,
    });
    return drawn;
  }

  const fallen = within(t, setsDown, setsDown + FALLS_OPEN_S);
  drawDome(drawn, middle, reach, high, cell, tones, t, outCubic(within(since, 0, CLIMBS_S)), fallen);
  layRipple(drawn, middle, reach, reach * 1.45, tones, within(since, 0, 0.5));
  layRipple(drawn, middle, reach * 0.9, reach * 1.6, tones, fallen);
  const crown = { ...middle, z: middle.z + high };
  const flowered = outCubic(within(since, CLIMBS_S * 0.7, CLIMBS_S + 0.5));
  if (flowered > 0) {
    drawBloom(
      drawn,
      crown,
      Math.min(reach * 0.5, cell * 1.7) * Math.min(1, flowered * 3),
      flowered,
      tones,
      1 - within(t, setsDown - 0.1, setsDown + 0.25),
      turn,
      forward,
      9
    );
    const flash = 1 - within(since, CLIMBS_S * 0.7, CLIMBS_S + 0.25);
    if (flash > 0.01) twinkle(drawn, crown, cell * 1.2 * flash, tones, flash, since * 3, forward + cell * 0.3);
  }
  const fill = { ...middle, z: middle.z + high * 0.45 };
  drawn.motes.push(haze(fill, reach * 2.1, tones.body, 0.2 * standing, forward));
  drawn.motes.push(glow(fill, reach * 2.2, tones.bright, 0.22 * standing * pulse, forward));
  const lasts = setsDown - rises;
  drawFeathers(
    drawn,
    stage.seed,
    middle,
    cell,
    since,
    lightOf(tones),
    {
      count: Math.round(14 * density),
      out: [cell * 0.3, reach * 0.9],
      high: [high * 0.55, high * 0.95],
      born: [CLIMBS_S, lasts + 0.3],
      ends: ends - rises,
    },
    forward
  );
  drawDrifting(
    drawn,
    stage.seed + 5,
    middle,
    cell,
    since,
    {
      count: Math.round(12 * density),
      out: [cell * 0.2, reach * 0.85],
      high: [high * 0.6, high],
      born: [CLIMBS_S + 0.3, lasts + 0.4],
      ends: ends - rises,
      colors: [tones.rose, tones.blush, tones.gold],
      size: 0.3,
    },
    forward
  );
  drawRisingLights(
    drawn,
    stage.seed + 9,
    middle,
    cell,
    since,
    lightOf(tones),
    {
      count: Math.round(10 * density),
      out: [cell * 0.5, reach * 0.95],
      born: [0.1, Math.max(0.3, lasts - 0.4)],
      rise: cell * 1.3,
    },
    forward
  );
  if (since < 0.45)
    drawn.lights.push({ ...fill, color: '#ffffff', strength: 1.8 * (1 - since / 0.45), reachPx: reach * 2.4 });
  else if (standing > 0.02)
    drawn.lights.push({ ...fill, color: tones.bright, strength: 1.0 * standing, reachPx: reach * 2 });
  return drawn;
}
