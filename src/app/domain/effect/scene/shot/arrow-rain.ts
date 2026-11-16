import { type Choreography, nothingStaged, type Stage, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  acrossOf,
  floorMark,
  glow,
  keptFor,
  lerpPoint,
  type Point,
  stageKey,
  wayBetween,
} from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { arrowBody, stuckArrow } from '@axe/domain/effect/scene/shot/bodies';
import { offsetBy } from '@axe/domain/effect/scene/shot/shot-flight';
import { layDustKick } from '@axe/domain/effect/scene/shot/shot-parts';
import { ARROW_RAIN_FALL, arrowRainShots } from '@axe/domain/effect/timeline/flight-timing';

/*
 * A rain of arrows. They are loosed up into the sky from the caster, one after another, and fall
 * steeply over the target and its round, slanting in from the caster's side, in a wave that sweeps
 * across it from the near side to the far. The ground under the volley darkens while it falls, and
 * the shadow of each arrow closes to a point where it is about to strike. Each lands with a glint and
 * a kick of dust, and one of each pair that falls is left standing, quivering, leaning back the way
 * it came; none comes down at the target's very foot, so the piece is seen among the shafts. When the
 * look clears they go one by one, not together.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.arrowrain ?? 1.4;
/** How large a falling arrow is drawn, and one left standing, against the cell. */
const FALLING = 1.25;
const STANDING = 0.85;
/** How far round the middle of the target no arrow comes down, so the piece is seen among the shafts, in cells. */
const CLEAR_CELLS = 0.45;
/** How far back towards the caster an arrow comes from, against how high, so the volley leans the way it was loosed. */
const SLANT = 0.4;
/** How high the arrows are loosed, in cells. */
const SKY_CELLS = 9;
/** How long before it strikes the shadow of an arrow is seen on the floor, in seconds. */
const SHADOW_S = 0.3;
/** Over how long the standing arrows go, one by one, before the look clears, and how long each takes, in seconds. */
const GOES_OVER_S = 0.7;
const GOES_S = 0.28;
/** With how many targets or fewer each arrow falls with a second beside it, which strikes but is not left standing. */
const DOUBLED_UP_TO = 3;
const SHADE = '#0c1422';

/** Where one arrow of the rain comes down, how it leans as it falls, and the second that falls beside it. */
interface RainSpot {
  readonly x: number;
  readonly y: number;
  readonly lean: number;
  readonly beside: { readonly x: number; readonly y: number; readonly later: number };
}

const spotsByStage = new Map<string, readonly RainSpot[]>();

/** Where a rain is loosed from: its caster, or above and behind the target for one cast from nowhere. */
function originOf(stage: Stage): Point {
  return stage.origin ?? { x: stage.x - stage.cell * 3, y: stage.y + stage.cell * 3, z: stage.z + stage.cell * 2 };
}

/** Where the arrows of a rain come down, in the order they strike: scattered over its round, the nearest to the caster first. */
function spotsOf(stage: Stage, floor: Point, reach: number, from: Point): readonly RainSpot[] {
  return keptFor(spotsByStage, stageKey(stage, reach), () => {
    const next = seededRun(stage.seed * 3 + 11);
    const count = arrowRainShots().length;
    const toward = wayBetween({ ...from, z: floor.z }, floor).way;
    const clear = stage.cell * CLEAR_CELLS;
    const clearOf = (x: number, y: number): { x: number; y: number } => {
      const off = Math.hypot(x - floor.x, y - floor.y);
      if (off >= clear) return { x, y };
      const turn = off > 0.001 ? Math.atan2(y - floor.y, x - floor.x) : 0;
      return { x: floor.x + Math.cos(turn) * clear, y: floor.y + Math.sin(turn) * clear };
    };
    const spots = Array.from({ length: count }, () => {
      const turn = next() * Math.PI * 2;
      const out = clear + Math.sqrt(next()) * Math.max(0, reach - clear);
      const aside = next() * Math.PI * 2;
      const x = floor.x + Math.cos(turn) * out;
      const y = floor.y + Math.sin(turn) * out;
      const beside = clearOf(x + Math.cos(aside) * stage.cell * 0.55, y + Math.sin(aside) * stage.cell * 0.55);
      return { x, y, lean: (next() - 0.5) * 0.5, beside: { ...beside, later: 0.02 + next() * 0.05 } };
    });
    const along = (spot: RainSpot): number => (spot.x - floor.x) * toward.x + (spot.y - floor.y) * toward.y;
    return spots
      .map((spot, index) => ({ spot, order: along(spot) + ((index * 37) % 11) * 0.03 * reach }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.spot);
  });
}

/** A rain of arrows: see the header. */
export const arrowrain: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const from = originOf(stage);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const reach = Math.max(stage.areaPx, cell * 1.2);
    const ends = duration + LINGER_S;
    const shots = arrowRainShots();
    const spots = spotsOf(stage, floor, reach, from);
    const doubled = stage.targets.length <= DOUBLED_UP_TO;
    const forward = cell * 0.3;
    const sky = cell * SKY_CELLS;
    const toward = wayBetween({ ...from, z: floor.z }, floor).way;

    const firstLands = shots[0].land * duration;
    const lastLands = shots.at(-1)!.land * duration;
    const raining = Math.min(within(t, firstLands - 0.45, firstLands - 0.1), 1 - within(t, lastLands, lastLands + 0.4));
    if (raining > 0) {
      drawn.floor.push(floorMark('disc', floor, reach + cell * 1.1, 1, SHADE, 0.42 * raining, 'color', 0));
    }

    shots.forEach((shot, index) => {
      const spot = spots[index];
      const up = (t - shot.loose * duration) / 0.35;
      if (up >= 0 && up < 1) {
        const rising = { x: from.x + spot.lean * cell * up * 2, y: from.y, z: from.z + cell * 0.8 + up * sky };
        drawn.ribbons.push(
          ...arrowBody(rising, { x: spot.lean * 0.2, y: 0, z: 1 }, cell * FALLING, ramp, floor.z).map((ribbon) => ({
            ...ribbon,
            alpha: ribbon.alpha * (1 - up * up),
          }))
        );
      }
      const falls = Math.max((shot.land - shot.fall) * duration, ARROW_RAIN_FALL * duration * 0.5);
      const fallen = (later: number, at: { readonly x: number; readonly y: number }, salt: number): void => {
        const lands = shot.land * duration + later;
        const ground = { x: at.x, y: at.y, z: floor.z };
        const top = {
          x: at.x - toward.x * sky * SLANT - toward.y * spot.lean * cell * 3,
          y: at.y - toward.y * sky * SLANT + toward.x * spot.lean * cell * 3,
          z: floor.z + sky,
        };
        const { way } = wayBetween(top, ground);
        const nears = within(t, lands - SHADOW_S, lands);
        if (nears > 0 && t < lands) {
          drawn.floor.push(floorMark('disc', ground, cell * (0.55 - 0.3 * nears), 1, SHADE, 0.55 * nears, 'color', 0));
        }
        const down = (t - (lands - falls)) / falls;
        if (down >= 0 && down < 1) {
          const tip = lerpPoint(top, ground, down);
          const { lift } = acrossOf(way);
          drawn.ribbons.push({
            points: [
              offsetBy(offsetBy(tip, way, -cell * FALLING * 3.4), lift, cell * 0.05),
              offsetBy(tip, way, -cell * FALLING),
            ],
            widths: [0, cell * 0.07],
            color: '#ffffff',
            alpha: 0.8,
            blend: 'color',
            soft: 0.3,
          });
          drawn.ribbons.push(...arrowBody(tip, way, cell * FALLING, ramp, floor.z));
        }
        const since = t - lands;
        if (since < 0) return;
        const goes =
          ends - GOES_OVER_S + ((GOES_OVER_S - GOES_S) * ((index * 7 + salt * 3) % shots.length)) / shots.length;
        const left = salt === 0 ? 1 - within(t, goes, goes + GOES_S) : 0;
        if (left > 0) {
          const { lift } = acrossOf(way);
          const swung = 0.3 * Math.exp(-since * 7) * Math.sin(since * 55 + salt);
          const leaning = {
            x: way.x * Math.cos(swung) + lift.x * Math.sin(swung),
            y: way.y * Math.cos(swung) + lift.y * Math.sin(swung),
            z: way.z * Math.cos(swung) + lift.z * Math.sin(swung),
          };
          const size = cell * STANDING;
          drawn.ribbons.push(
            ...stuckArrow(
              offsetBy({ ...ground, z: ground.z + cell * 0.05 }, way, size * 0.22),
              leaning,
              size,
              ramp,
              left
            )
          );
        }
        if (since < 0.1) {
          drawn.motes.push({
            ...glow(
              { ...ground, z: ground.z + cell * 0.15 },
              cell * 0.7 * (1 - since / 0.1),
              '#ffffff',
              1 - since / 0.1,
              forward
            ),
            shape: 'star',
            spin: index,
          });
        }
        if (salt === 0)
          layDustKick(drawn, ground, cell, since, stage.seed + index, 0.8, forward, { count: 2, lastsS: 0.4 });
      };
      fallen(0, spot, 0);
      if (doubled) fallen(spot.beside.later, spot.beside, 1);
    });
    return drawn;
  },
};
