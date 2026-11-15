import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { drawBlackSmoke, drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type BlackFlame,
  type DarkTones,
  darkTonesOf,
  drawDarkBeat,
  drawShards,
  layBlackFlames,
  layDarkRing,
  layShadowPool,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { crag } from '@axe/domain/effect/scene/earth/earth-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, haze, keptFor, type Point, stageKey } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * Spikes of shadow. The target's own shadow darkens and spreads under it, its edge burning violet
 * and creeping; it draws tight for an instant, and black spikes stab up out of it through the
 * target in a black beat, a tall one at its heart and a crown of lesser ones leaning out about it,
 * each edged in violet, veins of violet light climbing it, a ring racing out over the floor and
 * shards flying. They stand while the veins beat, then break from their tips and sink back in smoke.
 * The shadow is left torn: rents of violet light across it, closing, motes of black drifting up.
 */

const LINGER_S = SCENE_LINGER_S.shadow ?? 1.6;
/** How long a spike takes to stab up, how long the spikes stand at the most, and how long they take to break and sink, in seconds. */
const STABS_S = 0.07;
const STANDS_S = 0.62;
const BREAKS_S = 0.4;

/** One spike: where it is rooted, the way it leans, how tall and wide it is, in cells, and how long after the stab it comes. */
interface Spike {
  readonly root: Point;
  readonly way: Point;
  readonly tall: number;
  readonly wide: number;
  readonly late: number;
  readonly variant: number;
}

const spikesByStage = new Map<string, readonly Spike[]>();

/** The spikes of a stage: the tall ones close about the target, leaning in through it, and a crown of lesser ones leaning out. */
function spikesOf(stage: Stage): readonly Spike[] {
  return keptFor(spikesByStage, stageKey(stage, stage.tall), () => {
    const next = seededRun(stage.seed * 13 + 3);
    const { cell } = stage;
    const high = Math.max(stage.tall / cell, 1);
    const inner = stage.preset.gradeLevel === 1 ? 5 : 7;
    const outer = stage.preset.gradeLevel === 1 ? 6 : 9;
    const spikes: Spike[] = [];
    const from = next() * Math.PI * 2;
    for (let index = 0; index < inner + outer; index++) {
      const close = index < inner;
      const turn = from + (index / (close ? inner : outer)) * Math.PI * 2 + (next() - 0.5) * 0.5;
      const out = close ? 0.36 + next() * 0.16 : 0.75 + next() * 0.4;
      const lean = close ? -(0.14 + next() * 0.16) : 0.3 + next() * 0.4;
      const way = { x: Math.cos(turn) * lean, y: Math.sin(turn) * lean, z: 1 };
      const long = Math.hypot(way.x, way.y, way.z);
      const tall = close ? high * (1.45 + next() * 0.6) + 0.6 : 0.9 + next() * 0.9;
      spikes.push({
        root: { x: stage.x + Math.cos(turn) * out * cell, y: stage.y + Math.sin(turn) * out * cell, z: stage.groundZ },
        way: { x: way.x / long, y: way.y / long, z: way.z / long },
        tall: index === 0 ? high * 2.6 + 1.2 : tall,
        wide: (close ? 0.23 : 0.19) + next() * 0.09,
        late: close ? next() * 0.03 : 0.02 + next() * 0.07,
        variant: next() * 6,
      });
    }
    return spikes;
  });
}

/** One spike at a moment: a body of black over a burning edge, veins of light climbing it. */
function drawSpike(
  drawn: Staged,
  spike: Spike,
  cell: number,
  tones: DarkTones,
  risen: number,
  broken: number,
  beat: number
): void {
  if (risen <= 0.01) return;
  const tall = spike.tall * cell * risen;
  const wide = spike.wide * cell * (0.6 + 0.4 * risen);
  const look = { variant: spike.variant, broken };
  const under = { ...spike.root, z: spike.root.z - cell * 0.02 };
  drawn.motes.push(crag(under, spike.way, tall * 1.04 + wide * 0.2, wide * 1.42, tones.glow, 1, look));
  drawn.motes.push(
    crag(spike.root, spike.way, tall, wide, tones.ink, 1, { ...look, veins: 0.9 * beat, glow: tones.pale })
  );
}

/** The shadow torn where the spikes came up: rents of violet light across it, closing as it fades. */
function layRents(drawn: Staged, floor: Point, reach: number, tones: DarkTones, shown: number, seed: number): void {
  if (shown <= 0.01) return;
  for (let rent = 0; rent < 3; rent++) {
    const turn = (seed % 5) + rent * 2.2;
    drawn.floor.push(
      floorMark('fissure', floor, reach * (1.25 - rent * 0.12), 0.1, tones.edge, shown, 'color', seed + rent, turn)
    );
    drawn.floor.push(
      floorMark(
        'fissure',
        floor,
        reach * (1.25 - rent * 0.12),
        0.05 * shown,
        tones.pale,
        shown,
        'light',
        seed + rent,
        turn
      )
    );
  }
}

/** Spikes of shadow: see the header. */
export function drawSpikes(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const stabs = stage.blowsAt[0] ?? darkStrikesAt('shadow', stage.preset.gradeLevel, duration)?.[0] ?? duration * 0.3;
  const since = t - stabs;
  const tones = darkTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
  const forward = cell * 0.4;
  const reach = cell * (stage.preset.gradeLevel === 1 ? 1 : 1.3);
  const stands = Math.min(STANDS_S, Math.max(0.2, (duration - stabs) * 0.5));
  const breaksAt = stabs + stands;
  const cleared = 1 - within(t, duration - 0.2, ends);

  const spreading = outCubic(within(t, 0, stabs * 0.8));
  const tight = since < 0 ? 1 - 0.14 * within(t, stabs * 0.8, stabs) : 1;
  layShadowPool(
    drawn,
    floor,
    reach * (0.35 + 0.65 * spreading) * tight,
    tones,
    Math.min(1, t / 0.12) * cleared,
    stage.seed
  );

  if (since < 0) {
    const flames: BlackFlame[] = [];
    for (let lick = 0; lick < 8; lick++) {
      const turn = (lick / 8) * Math.PI * 2 + t * 1.4 + stage.seed;
      const out = reach * 0.62 * (0.35 + 0.65 * spreading) * tight;
      flames.push({
        root: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
        heading: { x: -Math.cos(turn) * 0.5, y: -Math.sin(turn) * 0.5, z: 1 },
        wide: cell * 0.16 * spreading,
        long: cell * (0.3 + 0.25 * Math.abs(Math.sin(t * 9 + lick * 2.1))) * spreading,
        flowed: t * 2.4 + lick,
        variant: lick,
      });
    }
    layBlackFlames(drawn, flames, tones, forward);
    const gathering = within(t, stabs * 0.6, stabs);
    drawn.floor.push(
      floorMark('ring', floor, reach * (1.5 - 0.7 * gathering), 0.05, tones.pale, 0.9 * gathering, 'light', 0)
    );
    drawn.lights.push({ ...chest, color: tones.edge, strength: 0.5 * spreading, reachPx: cell * 2.5 });
    return drawn;
  }

  const breaking = within(t, breaksAt, breaksAt + BREAKS_S);
  if (breaking < 1) {
    const beat = 0.75 + 0.25 * Math.sin(since * 21);
    for (const spike of spikesOf(stage)) {
      const risen = outCubic(within(since, spike.late, spike.late + STABS_S)) * (1 - 0.55 * breaking * breaking);
      drawSpike(drawn, spike, cell, tones, risen, 0.97 * breaking, since < 0.12 ? 1 : beat);
    }
    const flames: BlackFlame[] = spikesOf(stage).map((spike, index) => ({
      root: spike.root,
      heading: { x: spike.way.x * 0.6, y: spike.way.y * 0.6, z: 1 },
      wide: cell * spike.wide * 1.1,
      long: cell * spike.tall * (0.3 + 0.12 * Math.sin(since * 13 + index)) * (1 - breaking),
      flowed: since * 3 + index,
      variant: index,
      alpha: Math.min(1, since / 0.05),
    }));
    layBlackFlames(drawn, flames, tones, forward, true);
  }

  drawDarkBeat(drawn, chest, floor, cell * 0.8, tones, since);
  layDarkRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.22, tones, since, 0.4);
  drawShards(
    drawn,
    stage.seed,
    chest,
    floor.z,
    Math.round(22 * stage.preset.gradeDensity),
    cell,
    since,
    tones,
    forward
  );
  if (since < 0.45) {
    const left = 1 - since / 0.45;
    drawn.motes.push(haze(chest, cell * 2, tones.edge, 0.4 * left, forward));
    drawn.motes.push(glow(chest, cell * 2.4, tones.glow, 0.6 * left, forward));
    drawn.lights.push({ ...chest, color: tones.edge, strength: 1.5 * left, reachPx: cell * 3.4 });
  }

  const brokeFor = t - breaksAt;
  if (brokeFor >= 0) {
    spikesOf(stage).forEach((spike, index) => {
      if (index % 2 === 1) return;
      const tip = {
        x: spike.root.x + spike.way.x * spike.tall * cell * 0.7,
        y: spike.root.y + spike.way.y * spike.tall * cell * 0.7,
        z: spike.root.z + spike.way.z * spike.tall * cell * 0.7,
      };
      drawShards(drawn, stage.seed + index * 17, tip, floor.z, 4, cell * 0.5, brokeFor, tones, forward, 0.5);
    });
  }
  drawBlackSmoke(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    tones,
    { count: 12, out: [0, reach * 0.7], born: [breaksAt, Math.max(breaksAt + 0.1, ends - 1.3)], tall: cell * 1.5 },
    forward
  );
  drawInkMotes(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    tones,
    {
      count: Math.round(20 * stage.preset.gradeDensity),
      out: [0, reach * 0.8],
      born: [stabs + 0.1, Math.max(stabs + 0.2, ends - 1.4)],
      rise: cell * 1.3,
    },
    forward
  );
  layRents(
    drawn,
    floor,
    reach,
    tones,
    Math.min(1, since / 0.08) * cleared * (1 - 0.5 * within(t, breaksAt, ends)),
    stage.seed
  );
  return drawn;
}
