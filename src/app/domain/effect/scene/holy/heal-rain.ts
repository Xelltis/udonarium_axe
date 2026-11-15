import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { drawHoop, drawRisingLights } from '@axe/domain/effect/scene/holy/holy-parts';
import {
  drawDrifting,
  layLifeRing,
  layRipple,
  lightOf,
  type MendTones,
  mendTonesOf,
  twinkle,
} from '@axe/domain/effect/scene/holy/mend-parts';
import { glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A rain of light, the healing of the middle grade: light is poured down on the one it is laid on. A
 * ring opens high over its head, a sun in it; shafts of light stand from the ring down to the floor,
 * and drops of light fall through them, each breaking into a twinkle where it lands and running out
 * over the floor as a ripple; then the ring draws shut and bursts into leaves, which drift down.
 */

/** How high over the head the ring opens, and how wide it is, in cells. */
const RING_OVER_CELLS = 1.7;
const RING_CELLS = 0.85;
/** How long the ring takes to open, in seconds, and where through the playback the rain stops and the ring bursts. */
const OPENS_S = 0.3;
const STOPS_AT = 0.72;
const BURSTS_AT = 0.86;
/** How fast a drop falls, in cells a second. */
const FALLS_CELLS = 7.5;

/** The shafts of light standing from the ring down to the floor, splayed a little, and the veil of colour between them. */
function drawShafts(
  drawn: Staged,
  floor: Point,
  top: number,
  cell: number,
  tones: MendTones,
  shown: number,
  t: number
) {
  if (shown <= 0.01) return;
  const shares = [1, 0.75, 0.45, 0.2, 0];
  const veil = shares.map((share) => ({ ...floor, z: floor.z + (top - floor.z) * share }));
  drawn.ribbons.push(
    {
      points: veil,
      widths: shares.map((share) => cell * (2.3 - 0.6 * share)),
      color: tones.deep,
      alpha: 0.4 * shown,
      alphas: [0.5, 0.9, 1, 0.8, 0.3],
      blend: 'color',
      soft: 1,
      torn: 0.3,
      flowed: -t * 2.4,
    },
    {
      points: veil,
      widths: shares.map((share) => cell * (1.4 - 0.4 * share)),
      color: tones.pale,
      alpha: 0.08 * shown,
      alphas: [0.6, 1, 1, 0.8, 0.2],
      blend: 'light',
      soft: 1,
    }
  );
  for (let shaft = 0; shaft < 5; shaft++) {
    const turn = (shaft / 5) * Math.PI * 2 + 0.4;
    const shimmer = 0.7 + 0.3 * Math.sin(t * 6.1 + shaft * 2.1);
    const points = shares.map((share) => {
      const out = cell * (RING_CELLS * 0.8 * share + 1.05 * (1 - share));
      return {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: floor.z + (top - floor.z) * share,
      };
    });
    const alphas = [0.9, 1, 0.9, 0.7, 0.25];
    drawn.ribbons.push(
      {
        points,
        widths: cell * 0.38,
        color: tones.shade,
        core: tones.bright,
        alpha: 0.85 * shown * shimmer,
        alphas,
        blend: 'color',
        soft: 0.35,
        torn: 0.2,
        flowed: -t * 3 + shaft,
      },
      {
        points,
        widths: cell * 0.14,
        color: tones.pale,
        core: '#ffffff',
        alpha: 0.7 * shown * shimmer,
        alphas,
        blend: 'light',
        soft: 0.5,
      }
    );
  }
}

/** The drops of light falling through the shafts, each a dark drop under a bright one, and what each breaks into where it lands. */
function drawDrops(drawn: Staged, stage: Stage, floor: Point, top: number, tones: MendTones, stops: number): void {
  const { cell } = stage;
  const t = stage.seconds;
  const next = seededRun(stage.seed * 41 + 3);
  const count = Math.round(30 * stage.preset.gradeDensity);
  const speed = cell * FALLS_CELLS;
  const forward = cell * 0.35;
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const out = cell * 0.95 * Math.sqrt(next());
    const born = OPENS_S * 0.6 + (stops - OPENS_S * 0.6) * (index / count) + next() * 0.05;
    const onBody = out < cell * 0.4;
    const lands = floor.z + (onBody ? stage.tall * (0.35 + 0.6 * next()) : 0);
    const flies = (top - lands) / speed;
    const since = t - born;
    const at = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: top - speed * since };
    if (since < 0) continue;
    if (since < flies) {
      const way = { x: 0, y: 0, z: -speed };
      const fade = Math.min(1, since * 12);
      drawn.motes.push({
        ...haze(at, cell * 0.4, tones.shade, 0.95 * fade, forward),
        shape: 'comet',
        velocity: way,
        trail: 0.2,
      });
      drawn.motes.push({
        ...haze(at, cell * 0.27, index % 3 === 0 ? tones.gold : tones.bright, fade, forward + 0.5),
        shape: 'comet',
        velocity: way,
        trail: 0.17,
      });
      drawn.motes.push(glow(at, cell * 0.32, tones.pale, 0.8 * fade, forward + 1));
      continue;
    }
    const landed = since - flies;
    if (landed >= 0.36) continue;
    const share = landed / 0.36;
    const where = { ...at, z: lands + cell * 0.05 };
    twinkle(drawn, where, cell * 0.6 * (1 - share * 0.5), tones, 1 - share, index + landed * 6, forward + 1);
    if (!onBody && index % 3 === 0) layRipple(drawn, where, cell * 0.05, cell * 0.45, tones, share, 0.9);
  }
}

/** A rain of light: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawRain(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = mendTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const light = lightOf(tones);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.3;
  const stops = duration * STOPS_AT;
  const bursts = duration * BURSTS_AT;
  const top = floor.z + stage.tall + cell * RING_OVER_CELLS;
  const ring = { ...floor, z: top };
  const leaving = 1 - within(t, duration, ends);

  layLifeRing(drawn, floor, cell * 1.05 * outCubic(within(t, 0.1, 0.45)), tones, leaving, -t * 0.5, stage.seed);
  layRipple(drawn, floor, cell * 0.5, cell * 2.2, tones, within(t, OPENS_S, OPENS_S + 0.5));

  const opened = outCubic(within(t, 0, OPENS_S));
  const shut = within(t, stops + 0.1, bursts);
  const radius = cell * RING_CELLS * opened * (1 - 0.85 * shut * shut);
  if (t < bursts) {
    const pulse = 0.85 + 0.15 * Math.sin(t * 9);
    drawHoop(drawn, ring, radius * 1.18, cell * 0.07, light, 0.7 * opened);
    drawHoop(drawn, ring, radius, cell * 0.16, light, opened);
    drawn.motes.push(haze(ring, radius * 2.1, tones.gold, 0.75 * opened * pulse, forward));
    drawn.motes.push(glow(ring, radius * 3.4, tones.gold, 0.6 * opened * pulse, forward));
    drawn.motes.push(glow(ring, radius * 1.3, '#ffffff', 0.9 * opened, forward + 1));
    for (let ray = 0; ray < 4; ray++) {
      drawn.motes.push({
        ...glow(ring, radius * 0.5, tones.pale, 0.7 * opened * pulse, forward + 1),
        shape: 'flare',
        trail: 5,
        spin: (ray / 4) * Math.PI + t * 0.4,
      });
    }
  }
  const pours = Math.min(outCubic(within(t, OPENS_S * 0.5, OPENS_S + 0.2)), 1 - within(t, stops, bursts));
  drawShafts(drawn, floor, top, cell, tones, pours, t);
  drawDrops(drawn, stage, floor, top, tones, stops);

  const since = t - bursts;
  if (since >= 0 && since < 0.3) {
    const left = 1 - since / 0.3;
    drawn.motes.push(haze(ring, cell * (0.8 + 1.2 * (1 - left)), tones.gold, 0.6 * left, forward));
    drawn.motes.push(glow(ring, cell * 2.6, tones.pale, 0.9 * left, forward));
    twinkle(drawn, ring, cell * 0.8 * left, tones, left, since * 5, forward + 1);
    drawHoop(drawn, ring, cell * (0.2 + 1.3 * outCubic(1 - left)), cell * 0.08 * left, light, left);
  }
  drawDrifting(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    {
      count: 24,
      out: [cell * 0.1, cell * 1.1],
      high: [top - floor.z - cell * 0.3, top - floor.z + cell * 0.1],
      born: [bursts, bursts + 0.12],
      ends,
      colors: [tones.body, tones.bright, tones.gold, tones.deep],
      size: 0.42,
    },
    forward
  );

  drawRisingLights(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    light,
    { count: 14, out: [cell * 0.1, cell * 1], born: [stops * 0.6, duration - 0.1], rise: cell * 1.5 },
    forward
  );
  const taken = Math.sin(within(t, stops, duration + 0.1) * Math.PI);
  if (taken > 0.01) {
    const chest = { ...floor, z: floor.z + stage.tall * 0.55 };
    drawn.motes.push(haze(chest, cell * 1.6, tones.gold, 0.4 * taken, forward));
    drawn.motes.push(glow(chest, cell * 2.1, tones.pale, 0.6 * taken, forward));
  }
  const held = Math.min(outCubic(within(t, 0.1, 0.5)), 1 - within(t, bursts, duration + 0.2));
  const body = { ...floor, z: floor.z + stage.tall * 0.5 };
  drawn.motes.push(haze(body, cell * 1.8, tones.body, 0.26 * held, forward));
  drawn.lights.push({ ...ring, color: tones.gold, strength: 1.2 * held, reachPx: cell * 3.4 });
  return drawn;
}
