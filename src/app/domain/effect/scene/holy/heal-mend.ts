import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawRisingLights } from '@axe/domain/effect/scene/holy/holy-parts';
import {
  drawBloom,
  drawDrifting,
  drawSprouts,
  layLifeRing,
  layRipple,
  layWound,
  lightOf,
  mendTonesOf,
  twinkle,
  windBand,
} from '@axe/domain/effect/scene/holy/mend-parts';
import { glow, haze } from '@axe/domain/effect/scene/parts';

/*
 * A mending, the least of the healings: life wells up out of the floor into the one it is laid on. A
 * ring of life opens under its feet and blades sprout from it; two bands of light wind up about its
 * body, drawing in as they climb, and meet over its head, where a flower opens as its sound swells;
 * then the flower lets its petals go, and they drift down about it as the ring fades.
 */

/** When the flower opens, in seconds, and at the most as a share of the playback: as its sound swells. */
const BLOOMS_AT_S = 0.54;
const BLOOMS_AT_MOST = 0.4;
/** How long the flower takes to open, and how long after it opens it lets its petals go, in seconds. */
const OPENS_S = 0.36;
const SHEDS_AFTER_S = 0.62;

/** A mending: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawMend(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = mendTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.3;
  const bloomsAt = Math.min(BLOOMS_AT_S, duration * BLOOMS_AT_MOST);
  const shedsAt = Math.min(bloomsAt + SHEDS_AFTER_S, duration * 0.8);
  const crown = { ...floor, z: floor.z + stage.tall + cell * 0.55 };
  const reach = cell * 1.15;
  const leaving = 1 - within(t, duration, ends);

  const opened = outCubic(within(t, 0, 0.3));
  layLifeRing(drawn, floor, reach * opened, tones, leaving, t * 0.7, stage.seed);
  layRipple(drawn, floor, reach * 0.4, reach * 1.9, tones, within(t, 0, 0.45));
  layRipple(drawn, floor, reach * 0.6, reach * 2.3, tones, within(t, bloomsAt, bloomsAt + 0.5));
  drawSprouts(
    drawn,
    floor,
    reach,
    cell * 0.95,
    16,
    tones,
    outCubic(within(t, 0.08, 0.5)) * (1 - within(t, duration + lingers * 0.2, ends - 0.1)),
    t,
    stage.seed,
    forward
  );

  const head = outCubic(within(t, 0.06, bloomsAt + 0.04));
  const tail = within(t, bloomsAt * 0.55, bloomsAt + 0.3);
  for (let band = 0; band < 2; band++) {
    const from = (stage.seed % 6) + band * Math.PI;
    layWound(
      drawn,
      windBand(
        floor,
        [cell * 0.06, stage.tall + cell * 0.45],
        [reach * 0.95, cell * 0.1],
        [from, from + Math.PI * 4.2],
        [tail, head],
        cell * 0.3
      ),
      tones,
      1
    );
  }

  const since = t - bloomsAt;
  if (since >= -0.06) {
    const budded = outCubic(within(since, -0.06, 0.04));
    const unfolded = outCubic(within(since, 0, OPENS_S));
    const overshoot = 1 + 0.12 * Math.sin(Math.min(1, since / (OPENS_S * 1.6)) * Math.PI);
    const shed = within(t, shedsAt, shedsAt + 0.22);
    drawBloom(
      drawn,
      crown,
      cell * 1.2 * budded * overshoot,
      unfolded,
      tones,
      1 - shed,
      (stage.seed % 5) + since * 0.5,
      forward + cell * 0.2
    );
    if (since < 0.3) {
      const left = 1 - since / 0.3;
      drawn.motes.push(haze(crown, cell * 1.5 * (0.6 + 0.4 * (1 - left)), tones.gold, 0.55 * left, forward));
      drawn.motes.push(glow(crown, cell * 2.2, tones.pale, 0.8 * left, forward));
      twinkle(drawn, crown, cell * 0.6 * left, tones, left, since * 4, forward + cell * 0.3);
    }
  }
  drawDrifting(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    {
      count: 16,
      out: [cell * 0.15, cell * 0.95],
      high: [stage.tall + cell * 0.3, stage.tall + cell * 0.7],
      born: [shedsAt, shedsAt + 0.2],
      ends,
      colors: [tones.rose, tones.blush, tones.rose, tones.gold],
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
    lightOf(tones),
    { count: 12, out: [cell * 0.2, reach], born: [0.1, Math.max(0.2, duration - 0.5)], rise: cell * 1.4 },
    forward
  );

  const held = Math.min(outCubic(within(t, 0.05, 0.4)), 1 - within(t, duration - 0.3, duration + 0.2));
  const body = { ...floor, z: floor.z + stage.tall * 0.5 };
  drawn.motes.push(haze(body, cell * 1.7, tones.body, 0.3 * held, forward));
  drawn.motes.push(glow(body, cell * 1.5, tones.bright, 0.35 * held, forward));
  drawn.lights.push({ ...body, color: tones.bright, strength: 0.9 * held, reachPx: cell * 2.6 });
  return drawn;
}
