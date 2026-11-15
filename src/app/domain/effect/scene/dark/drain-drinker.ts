import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { type DarkTones, flowMote } from '@axe/domain/effect/scene/dark/dark-parts';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, haze, type Point, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * The one who drains, as the life arrives: a wreath of crimson flame standing up about it from its
 * feet, pale at its heart, taller with all it has drunk and leaping at every beat of the pull, a pool
 * of light under it and a ring thrown out along the floor at each beat. As the strands snap back
 * into it it flares, a star of light and a ring; then the wreath sinks, and motes of light go on
 * rising off it.
 */

/** When the draining hooks, when it snaps and when its look is gone, in seconds, and how hard it pulls now. */
export interface DrinkerClock {
  readonly hooks: number;
  readonly snaps: number;
  readonly ends: number;
  readonly beat: number;
}

/** How long the drinker flares for as the strands snap back into it, in seconds. */
const FLARES_S = 0.4;
/** How long one beat of the pull is, in seconds, for the rings thrown out along the floor. */
const BEAT_S = 0.6;

/** The one who drains at a moment: see the header. */
export function drawDrinker(drawn: Staged, stage: Stage, hands: Point, tones: DarkTones, clock: DrinkerClock): void {
  const { cell } = stage;
  const t = stage.seconds;
  const { hooks, snaps, ends, beat } = clock;
  if (t < hooks) return;
  const foot = { x: hands.x, y: hands.y, z: Math.max(stage.groundZ, hands.z - cell * 0.5) };
  const forward = cell * 0.45;
  const drunk = within(t, hooks, snaps);
  const snapped = t - snaps;
  const sinking = snapped < 0 ? 1 : 1 - within(snapped, FLARES_S * 0.5, Math.max(FLARES_S, ends - snaps - 0.3));
  const strong = (0.35 + 0.65 * drunk) * sinking;
  if (strong <= 0.01) return;

  drawn.floor.push(floorMark('disc', foot, cell * (1.3 + 0.5 * drunk), 1, tones.deep, 0.45 * strong, 'color', 0));
  drawn.floor.push(floorMark('ring', foot, cell * (0.8 + 0.08 * beat), 0.1, tones.edge, 0.8 * strong, 'color', 0));
  drawn.floor.push(floorMark('ring', foot, cell * (0.8 + 0.08 * beat), 0.05, tones.pale, strong, 'light', 0));
  if (snapped < 0) {
    const since = (t - hooks) % BEAT_S;
    layShockRing(drawn, foot, cell * 0.5, cell * 1.9, cell * 0.16, tones.edge, since, BEAT_S * 0.8);
  }

  const next = seededRun(stage.seed * 73 + 41);
  const tongues = 11;
  const leaps = snapped >= 0 && snapped < FLARES_S ? 1 + 0.9 * (1 - snapped / FLARES_S) : 1;
  const sheets = [
    { wide: 1.45, long: 1.06, color: tones.ink, core: tones.deep, alpha: 0.9 },
    { wide: 1, long: 1, color: tones.deep, core: tones.edge, alpha: 1 },
    { wide: 0.45, long: 0.78, color: tones.edge, core: tones.glow, alpha: 1 },
  ];
  const flames = Array.from({ length: tongues }, (_unused, index) => {
    const turn = (index / tongues) * Math.PI * 2 + next() * 0.5;
    const out = cell * (0.42 + next() * 0.18);
    const tall = cell * (0.7 + next() * 0.6 + 1.6 * drunk) * (0.8 + 0.3 * beat) * leaps;
    return {
      root: { x: foot.x + Math.cos(turn) * out, y: foot.y + Math.sin(turn) * out, z: foot.z },
      heading: { x: Math.cos(turn) * 0.08 + Math.sin(t * 5 + index * 1.7) * 0.2, y: Math.sin(turn) * 0.08, z: 1 },
      wide: cell * (0.15 + next() * 0.09) * (0.6 + 0.4 * strong),
      long: tall * strong * (0.86 + 0.14 * Math.sin(t * 15 + index * 2.3)),
      flowed: t * 3 + index,
      variant: index,
    };
  });
  for (const sheet of sheets) {
    for (const flame of flames) {
      drawn.motes.push(
        flowMote('lick', flame.root, flame.heading, flame.wide * sheet.wide, flame.long * sheet.long, flame.flowed, {
          color: sheet.color,
          core: sheet.core,
          alpha: sheet.alpha * Math.min(1, strong * 2.5),
          variant: flame.variant,
          forward,
          exact: true,
        })
      );
    }
  }
  drawn.motes.push(haze(hands, cell * (1.4 + 0.5 * drunk), tones.edge, 0.3 * strong, forward));
  drawn.motes.push(glow(hands, cell * (1.6 + 0.9 * drunk + 0.4 * beat), tones.glow, 0.35 * strong, forward));
  drawn.lights.push({
    ...hands,
    color: tones.edge,
    strength: (0.6 + 0.9 * drunk + 0.5 * beat) * sinking,
    reachPx: cell * 3,
  });

  for (let mote = 0; mote < 18; mote++) {
    const turn = next() * Math.PI * 2;
    const out = cell * (0.15 + next() * 0.5);
    const pace = 0.7 + next() * 0.8;
    const along = (t * pace * 0.8 + next()) % 1;
    const at = {
      x: foot.x + Math.cos(turn) * out + Math.sin(along * 7 + mote) * cell * 0.06,
      y: foot.y + Math.sin(turn) * out,
      z: foot.z + cell * (0.1 + 2.2 * along),
    };
    const fade = Math.min(1, along * 6, (1 - along) * 3) * strong;
    drawn.motes.push(haze(at, cell * 0.14, tones.edge, 0.9 * fade, forward + 2));
    drawn.motes.push(glow(at, cell * 0.2, tones.pale, fade, forward + 3));
  }

  if (snapped >= 0 && snapped < FLARES_S) {
    const share = snapped / FLARES_S;
    const left = 1 - share;
    drawn.motes.push(...starBurst(hands, cell * 1.9, tones.edge, share, forward * 1.5, 8, stage.seed));
    drawn.motes.push(haze(hands, cell * 2.4, tones.edge, 0.55 * left, forward));
    layShockRing(drawn, foot, cell * 0.4, cell * 2.8, cell * 0.24, tones.edge, snapped, FLARES_S);
    drawn.floor.push(floorMark('disc', foot, cell * 2.6, 1, tones.deep, 0.5 * left, 'color', 0));
    drawn.lights.push({ ...hands, color: tones.edge, strength: 1.8 * left * outCubic(left), reachPx: cell * 3.4 });
  }
}
