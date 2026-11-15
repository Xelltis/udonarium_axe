import { type UpheavalTiming, upheavalTimingOf } from '@axe/domain/effect/earth-looks';
import { type Choreography, nothingStaged, outCubic, type Stage, within } from '@axe/domain/effect/scene/choreography';
import { driftingDust, earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { bearingOf, type EarthTones, earthTonesOf, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import {
  fangAt,
  pillarFangs,
  RING,
  ringFangs,
  ringReaches,
  runFangs,
  type RunFissure,
} from '@axe/domain/effect/scene/earth/fang-layout';
import { drawFang, type Fang, leaning, throwFromFang } from '@axe/domain/effect/scene/earth/fangs';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, lightBall, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An upheaval. The ground gathers and cracks at its caster's feet; fangs of rock break it one after
 * another running from the caster to the target, each taller than the last; the greatest pillar
 * bursts up under the target in a white beat, two lesser ones flanking it; then a ring of fangs
 * spreads out as far as the look reaches, each in the order of its distance, with one under every
 * other target it catches at that target's turn. They stand, their feet glowing and pebbles spilling
 * off them; then light climbs their cracks, they break from their tops down, the pieces falling from
 * where they stood, and their roots sink in dust. Broken ground and rubble are left.
 *
 * Cast from no one, or too close to run, the fangs only spread from the target. On a later target of
 * a cast over no area the pillar and a small ring burst up without the run.
 */

/** How long it lingers after its playback, in seconds: as long as a blade or a shot that lands with it does. */
const LINGER_S = SCENE_LINGER_S.upheaval ?? 1.8;
/** How far the pillars start to break after one another, from the first to the last, in seconds. */
const BREAK_SPREAD_S = 0.25;
/** How long the white beat lasts as the pillar bursts, in seconds. */
const BEAT_S = 0.07;
/** How long before it clears everything left starts to fade, in seconds. */
const CLEARS_S = 0.5;

interface UpheavalThrow {
  readonly timing: UpheavalTiming;
  readonly fangs: readonly Fang[];
  readonly rocks: readonly Rock[];
  readonly dust: readonly Cloud[];
  readonly settling: readonly Cloud[];
  readonly fissures: readonly RunFissure[];
  /** Where the ground gathers before the run, or null with none. */
  readonly gathers: Point | null;
  /** Whether the great pillar bursts in it, with its beat. */
  readonly bursts: boolean;
}

const upheavalByStage = new Map<string, UpheavalThrow>();

/** The first target of the cast that is drawn: where an upheaval over an area is centred. */
function leadOf(stage: Stage): { readonly x: number; readonly y: number; readonly index: number } {
  return stage.targets[0] ?? stage;
}

function throwUpheaval(
  stage: Stage,
  floor: Point,
  tones: EarthTones,
  timing: UpheavalTiming,
  ends: number
): UpheavalThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const lead = leadOf(stage);
  const leads = lead.index === stage.index;
  const reach = stage.areaPx > 0 ? Math.max(stage.areaPx, RING.from * cell * 1.3) : RING.reach * cell;
  const fissures: RunFissure[] = [];
  let fangs: Fang[];
  let gathers: Point | null = null;
  if (!leads && stage.areaPx > 0) {
    const far = Math.hypot(floor.x - lead.x, floor.y - lead.y);
    const outward = bearingOf(lead, floor, 1) ?? -Math.PI / 2;
    const risesAt = Math.max(timing.burstsAt + ringReaches(far, cell, reach), timing.runsAt);
    const root = {
      x: floor.x + Math.cos(outward) * cell * 0.3,
      y: floor.y + Math.sin(outward) * cell * 0.3,
      z: floor.z,
    };
    fangs = [
      fangAt(th, root, leaning(outward, 0.1), th.range(1.5, 1.9), 0.6, risesAt),
      fangAt(
        th,
        { ...root, x: root.x - Math.sin(outward) * cell * 0.45, y: root.y + Math.cos(outward) * cell * 0.45 },
        leaning(outward + 1.4, 0.35),
        th.range(0.7, 1),
        0.36,
        risesAt + 0.03
      ),
    ];
  } else {
    const toward = bearingOf(stage.origin, floor, cell * 0.3) ?? -Math.PI / 2;
    const run = leads ? runFangs(th, stage, floor, toward, timing, fissures) : { fangs: [], gathers: null };
    gathers = run.gathers;
    const ring = ringFangs(
      th,
      stage,
      floor,
      timing,
      th.count(leads ? RING.fangs : RING.fangs * 0.5),
      leads ? reach : reach * 0.75
    );
    fangs = [...run.fangs, ...pillarFangs(th, floor, toward, cell, timing.burstsAt), ...ring];
  }
  const first = Math.min(...fangs.map((fang) => fang.risesAt));
  const lasts = Math.max(...fangs.map((fang) => fang.risesAt)) - first;
  const ordered = fangs.map((fang) => ({
    ...fang,
    breaksAfter: lasts > 0 ? ((fang.risesAt - first) / lasts) * BREAK_SPREAD_S : 0,
  }));
  const thrown = { rocks: [] as Rock[], dust: [] as Cloud[], settling: [] as Cloud[] };
  for (const fang of ordered) throwFromFang(th, fang, timing, tones, thrown);
  const bursts = leads || stage.areaPx <= 0;
  if (bursts) {
    const high = { ...floor, z: th.floorZ };
    thrown.rocks.push(
      ...throwRocks(th, high, th.count(10), {
        size: [0.12, 0.3],
        up: [7, 11],
        out: [0.8, 3],
        bornAt: [timing.burstsAt, timing.burstsAt + 0.05],
        from: 0.5,
      }),
      ...throwRocks(th, high, th.count(26), {
        size: [0.04, 0.09],
        up: [4, 11],
        out: [0.6, 4],
        bornAt: [timing.burstsAt, timing.burstsAt + 0.06],
        from: 0.5,
        bounce: 0.25,
      }),
      ...throwRocks(th, high, th.count(10), {
        size: [0.1, 0.24],
        up: [5, 8.5],
        out: [0.6, 2.6],
        bornAt: [timing.breaksAt, timing.breaksAt + 0.25],
        from: 0.4,
        high: [0.8, 2],
      })
    );
    thrown.dust.push(
      ...kickedDust(th, floor, th.count(8), tones.dust, {
        speed: [2, 5.5],
        size: [0.6, 0.95],
        bornAt: [timing.burstsAt, timing.burstsAt + 0.08],
        alpha: 0.5,
        life: [0.5, 1],
      }),
      ...kickedDust(th, floor, th.count(14), tones.sand, {
        speed: [6, 12],
        size: [0.35, 0.6],
        bornAt: [timing.burstsAt, timing.burstsAt + 0.03],
        rise: [1, 7],
        from: 0.3,
        alpha: 0.75,
        life: [0.3, 0.6],
        jet: 1.8,
      }),
      ...earthPlumes(th, floor, th.count(3), tones.dust, {
        rise: [6, 11],
        bornAt: [timing.burstsAt, timing.burstsAt + 0.1],
        long: 2.4,
        life: [0.7, 1.1],
      }),
      ...driftingDust(th, floor, th.count(6), tones.dust, 1.5, [
        timing.sunkAt - 0.2,
        Math.max(timing.sunkAt, ends - 1.6),
      ])
    );
  }
  if (gathers) {
    thrown.rocks.push(
      ...throwRocks(th, gathers, 8, {
        size: [0.04, 0.08],
        up: [1.5, 3.5],
        out: [0, 0.6],
        bornAt: [0, Math.max(0.02, timing.runsAt)],
        from: 0.5,
        bounce: 0.2,
      })
    );
    thrown.dust.push(
      ...kickedDust(th, gathers, 3, tones.dust, {
        speed: [0.4, 1.2],
        size: [0.4, 0.6],
        bornAt: [0, Math.max(0.02, timing.runsAt)],
      })
    );
  }
  ordered.sort((a, b) => a.root.y - b.root.y);
  return { timing, fangs: ordered, ...thrown, fissures, gathers, bursts };
}

/** An upheaval: see the header. */
export const upheaval: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const lead = leadOf(stage);
    const caught = lead.index !== stage.index && stage.areaPx > 0;
    const t = stage.seconds + (caught ? ((stage.index - lead.index) * stage.preset.stagger) / 1000 : 0);
    const timing = upheavalTimingOf(duration, stage.blowsAt[0] ?? duration * 0.12);
    const ends = duration + LINGER_S;
    if (t >= ends) return drawn;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const tones = earthTonesOf(ramp);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const thrown = keptFor(upheavalByStage, stageKey(stage, ends), () =>
      throwUpheaval(stage, floor, tones, timing, ends)
    );
    const clearing = 1 - within(t, ends - CLEARS_S, ends);
    const since = t - timing.burstsAt;

    if (thrown.gathers && t < timing.burstsAt + 0.4) {
      const gathering = within(t, 0, Math.max(0.05, timing.runsAt));
      const fading = 1 - within(t, timing.burstsAt, timing.burstsAt + 0.4);
      drawn.floor.push(
        floorMark(
          'cracks',
          thrown.gathers,
          cell * 0.9 * gathering,
          0.3,
          tones.earth,
          0.8 * gathering * fading,
          'color',
          stage.seed % 89,
          stage.seed
        ),
        floorMark(
          'cracks',
          thrown.gathers,
          cell * 0.9 * gathering,
          0.16,
          tones.glow,
          0.9 * gathering * fading,
          'light',
          stage.seed % 89,
          stage.seed
        )
      );
    }
    if (thrown.bursts && !thrown.gathers && since < 0) {
      const trembling = within(t, 0, timing.burstsAt);
      drawn.floor.push(
        floorMark(
          'cracks',
          floor,
          cell * 1.3 * trembling,
          0.24,
          tones.earth,
          0.7 * trembling,
          'color',
          stage.seed % 89,
          stage.seed
        )
      );
    }
    const heat =
      since < 0
        ? 0.8
        : Math.max(
            Math.pow(Math.max(0, 1 - since / 1.4), 1.5),
            0.7 * within(t, timing.cracksAt, timing.breaksAt) * (1 - within(t, timing.breaksAt, timing.sunkAt))
          );
    for (const fissure of thrown.fissures) {
      const run = outCubic(within(t, fissure.opensAt, fissure.opensAt + 0.07));
      if (run <= 0) continue;
      const head = {
        x: fissure.from.x + (fissure.to.x - fissure.from.x) * run,
        y: fissure.from.y + (fissure.to.y - fissure.from.y) * run,
        z: fissure.from.z,
      };
      layFissure(drawn, fissure.from, head, cell * 0.16, tones, heat, clearing, fissure.seed);
    }
    if (thrown.bursts && since >= 0) {
      drawn.floor.push(
        floorMark(
          'cracks',
          floor,
          cell * 1.7 * Math.min(1, since / 0.08 + 0.2),
          0.3,
          tones.earth,
          0.8 * clearing,
          'color',
          stage.seed % 89,
          stage.seed
        )
      );
      if (heat > 0.02)
        drawn.floor.push(
          floorMark(
            'cracks',
            floor,
            cell * 1.7,
            0.15,
            heat > 0.6 ? tones.hot : tones.glow,
            Math.min(1, heat * 1.4),
            'light',
            stage.seed % 89,
            stage.seed
          )
        );
      if (since < 0.45)
        drawn.floor.push(
          floorMark(
            'ring',
            floor,
            cell * (0.4 + 2.6 * outCubic(since / 0.45)),
            0.1 * (1 - since / 0.45) + 0.02,
            tones.sand,
            1 - since / 0.45,
            'color',
            0
          )
        );
    }
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
    for (const fang of thrown.fangs) drawFang(drawn, fang, t, thrown.timing, cell, tones, clearing);
    for (const cloud of thrown.settling) drawCloud(drawn, cloud, t, cell, 0);
    for (const rock of thrown.rocks) drawRock(drawn, rock, t, cell, tones);

    if (thrown.bursts && since >= 0 && since < BEAT_S) {
      const left = 1 - since / BEAT_S;
      const struck = { ...floor, z: floor.z + cell * 0.5 };
      drawn.floor.push(floorMark('disc', floor, cell * 1.7, 1, '#ffffff', 0.7 * left, 'light', 0));
      drawn.motes.push(lightBall(struck, cell * 0.7 * (0.7 + 0.3 * left), '#ffffff', left, cell * 0.5));
      drawn.motes.push({
        ...glow({ ...struck, z: struck.z + cell * 0.9 }, cell * 0.45, '#fff4dc', left, cell * 0.5),
        shape: 'flare',
        trail: 7,
        spin: Math.PI / 2,
      });
      drawn.motes.push({ ...glow(struck, cell * 0.4, '#ffffff', left, cell * 0.5), shape: 'flare', trail: 6, spin: 0 });
    }
    if (thrown.bursts && since >= 0 && since < 0.35)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell,
        color: tones.hot,
        strength: 1.8 * (1 - since / 0.35),
        reachPx: cell * 3.2,
      });
    const cracking =
      within(t, timing.cracksAt, timing.breaksAt) * (1 - within(t, timing.breaksAt + 0.2, timing.sunkAt));
    if (thrown.bursts && cracking > 0)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 1.2,
        color: tones.glow,
        strength: 1.1 * cracking,
        reachPx: cell * 3,
      });
    return drawn;
  },
};
