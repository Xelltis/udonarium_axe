import { holyStrikesAt } from '@axe/domain/effect/holy-looks';
import { type Choreography, nothingStaged, outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  drawBeat,
  drawHoop,
  drawLightSparks,
  drawRisingLights,
  type HolyTones,
  holyTonesOf,
  layLightRing,
  layLightScorch,
} from '@axe/domain/effect/scene/holy/holy-parts';
import { floorMark, glow, haze, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * A halo. A wide ring of light appears level about the target at the height of its middle, two
 * lesser rings tilted through it and turning the other ways, beads of light running round it; it
 * closes, slowly and then fast, brightening, its shadow closing on the floor under it; it trembles
 * tight about the target for an instant and bursts in a white beat, its pieces flung out as arcs of
 * light, a hoop thrown wide, a ring racing over the floor. Motes of light rise where it was, and a
 * stain of light is left on the floor.
 */

const LINGER_S = SCENE_LINGER_S.halo ?? 0.8;
/** How wide the ring is as it appears and as it bursts, in cells from its middle. */
const WIDE_CELLS = 1.75;
const TIGHT_CELLS = 0.46;
/** How long its pieces fly for, in seconds. */
const FLIES_S = 0.5;

/** A ring about a middle, tilted by `tilt` about a level line that lies at `heading`. */
function tiltedRing(middle: Point, radius: number, heading: number, tilt: number): Point[] {
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  const across = { x: -Math.sin(heading) * Math.cos(tilt), y: Math.cos(heading) * Math.cos(tilt), z: Math.sin(tilt) };
  return Array.from({ length: 37 }, (_unused, index) => {
    const turn = (index / 36) * Math.PI * 2;
    return {
      x: middle.x + radius * (Math.cos(turn) * along.x + Math.sin(turn) * across.x),
      y: middle.y + radius * (Math.cos(turn) * along.y + Math.sin(turn) * across.y),
      z: middle.z + radius * Math.sin(turn) * across.z,
    };
  });
}

/** The pieces of the ring flung out as it bursts: arcs of light flying out from where the ring was, tumbling down and fading. */
function drawPieces(
  drawn: Staged,
  seed: number,
  middle: Point,
  floorZ: number,
  cell: number,
  tones: HolyTones,
  since: number
) {
  if (since < 0 || since >= FLIES_S) return;
  const next = seededRun(seed * 43 + 9);
  const left = 1 - since / FLIES_S;
  const pieces = 12;
  for (let index = 0; index < pieces; index++) {
    const turn = (index / pieces) * Math.PI * 2 + next() * 0.3;
    const fast = cell * (5 + next() * 4);
    const up = cell * (next() * 5 - 1);
    const spans = 0.22 + next() * 0.2;
    const out = cell * TIGHT_CELLS + (fast * (1 - Math.exp(-4 * since))) / 4;
    const high = Math.max(floorZ + cell * 0.05, middle.z + up * since - 5 * cell * since * since);
    const points = [-1, -0.33, 0.33, 1].map((share) => ({
      x: middle.x + Math.cos(turn + share * spans) * out,
      y: middle.y + Math.sin(turn + share * spans) * out,
      z: high,
    }));
    const widths = [0, cell * 0.11 * left, cell * 0.11 * left, 0];
    drawn.ribbons.push(
      {
        points,
        widths: widths.map((width) => width * 1.5),
        color: tones.gold,
        core: tones.hot,
        alpha: left,
        blend: 'color',
      },
      { points, widths, color: tones.hot, core: '#ffffff', alpha: left, blend: 'light' }
    );
  }
}

/** A halo: see the header. */
export const halo: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const bursts = stage.blowsAt[0] ?? holyStrikesAt('halo', stage.preset.gradeLevel, duration) ?? duration * 0.4;
    const since = t - bursts;
    const ends = duration + LINGER_S;
    if (t >= ends) return drawn;
    const tones = holyTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const middle = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
    const forward = cell * 0.4;
    const density = stage.preset.gradeDensity;

    if (since < 0) {
      const closing = within(t, 0, bursts);
      const closed = Math.pow(closing, 2.6);
      const shown = outCubic(within(t, 0, 0.22));
      const trembles = cell * 0.025 * Math.sin(t * 95) * within(closing, 0.82, 1);
      const radius = cell * (WIDE_CELLS - (WIDE_CELLS - TIGHT_CELLS) * closed) + trembles;
      const thick = cell * (0.08 + 0.07 * closed);
      const spun = t * 1.3 + closed * 9;
      drawHoop(drawn, middle, radius, thick, tones, shown);
      for (const [tilt, way] of [
        [0.55, 1],
        [-0.55, -1.4],
      ] as const) {
        const points = tiltedRing(middle, radius * 0.94, (stage.seed % 7) + spun * way, tilt);
        drawn.ribbons.push(
          { points, widths: thick * 0.8, color: tones.gold, core: tones.hot, alpha: 0.9 * shown, blend: 'color' },
          { points, widths: thick * 0.5, color: tones.pale, core: '#ffffff', alpha: 0.9 * shown, blend: 'light' }
        );
      }
      for (let bead = 0; bead < 6; bead++) {
        const turn = (bead / 6) * Math.PI * 2 + spun * 1.6;
        const at = { x: middle.x + Math.cos(turn) * radius, y: middle.y + Math.sin(turn) * radius, z: middle.z };
        drawn.motes.push(haze(at, cell * 0.2, tones.amber, 0.8 * shown, forward));
        drawn.motes.push(glow(at, cell * 0.26, tones.hot, shown, forward + 1));
        drawn.motes.push({
          ...glow(at, cell * 0.4, '#ffffff', shown * closed, forward + 2),
          shape: 'star',
          spin: turn,
        });
      }
      drawn.floor.push(floorMark('ring', floor, radius, 0.12, tones.shade, 0.55 * shown, 'color', 0));
      drawn.floor.push(floorMark('ring', floor, radius, 0.06, tones.gold, 0.7 * shown, 'light', 0));
      drawn.floor.push(floorMark('disc', floor, radius * 1.3, 1, tones.gold, 0.3 * shown * (0.4 + closed), 'light', 0));
      drawn.motes.push(haze(middle, cell * 1.3, tones.amber, 0.4 * closed, forward));
      drawn.motes.push(glow(middle, cell * 1.5, tones.hot, 0.5 * closed, forward));
      drawn.lights.push({ ...middle, color: tones.gold, strength: 0.5 + 0.9 * closed, reachPx: cell * 3 });
      return drawn;
    }

    drawBeat(drawn, floor, cell * 1.3, tones, since);
    drawn.motes.push(...starBurst(middle, cell * 2.8, tones.gold, since / 0.32, forward * 1.5, 8, stage.seed));
    if (since < 0.32) {
      const thrown = outCubic(since / 0.32);
      drawHoop(drawn, middle, cell * (TIGHT_CELLS + 2.3 * thrown), cell * 0.14 * (1 - thrown), tones, 1 - thrown);
    }
    drawPieces(drawn, stage.seed, middle, floor.z, cell, tones, since);
    layLightRing(drawn, floor, cell * 0.4, cell * 2.6, cell * 0.2, tones, since, 0.42);
    layLightScorch(drawn, floor, cell * 0.75, tones, since, ends - bursts, stage.seed);
    drawLightSparks(drawn, stage.seed, middle, Math.round(18 * density), cell, since, tones, forward);
    drawRisingLights(
      drawn,
      stage.seed,
      floor,
      cell,
      since,
      tones,
      {
        count: Math.round(22 * density),
        out: [0, cell * 0.85],
        born: [0.03, Math.max(0.2, ends - bursts - 1.7)],
        rise: cell * 1.7,
      },
      forward
    );
    if (since < 0.6) {
      const left = 1 - since / 0.6;
      drawn.motes.push(haze(middle, cell * 2, tones.amber, 0.45 * left, forward));
      drawn.motes.push(glow(middle, cell * 1.8, tones.hot, 0.6 * left, forward));
    }
    if (since < 0.35)
      drawn.lights.push({ ...middle, color: '#ffffff', strength: 1.9 * (1 - since / 0.35), reachPx: cell * 3.6 });
    return drawn;
  },
};
