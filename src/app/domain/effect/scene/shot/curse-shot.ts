import { fallingDrop, litSign, sign } from '@axe/domain/effect/scene/ailment/ailment-parts';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { acrossOf, ball, floorMark, haze, hueOf, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import {
  detailOf,
  type FiredShot,
  leftAt,
  offsetBy,
  powerOf,
  type ShotLook,
} from '@axe/domain/effect/scene/shot/shot-flight';
import { floorUnder } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A shot of a curse. A knot of black with a skull's face on it, wrapped in its colour, flies winding
 * like a snake; black flame edged with its colour streams back off it, a rope of dark smoke hangs
 * along the way it has come, and darkness drips from it, each drop falling to stain the floor. Where it
 * strikes it does not burst: it clings. Coils of black wind up about the one struck and draw tight,
 * the skull swells over it and fades, and the stain under it sinks away.
 */

/** How wide the knot is, in cells. */
const KNOT = 0.85;
/** How far it winds off its course, in cells, and how many times. */
const WINDS_CELLS = 0.5;
const WINDS = 1.5;
/** How many drops it lets fall along its way, and how long the stain of each lies, in seconds. */
const DROPS = 8;
const STAIN_S = 0.9;
/** How long the coils cling to what it strikes, how many there are, and how many points each is drawn through. */
const CLINGS_S = 0.85;
const COILS = 3;
const COIL_POINTS = 14;
const BLACK = '#0b0512';
const INK = '#1a0b2a';

/** Where a shot of a curse is at a share of its flight: on its course, wound off it to either side. */
function windingOf(shot: FiredShot): (along: number) => Point {
  const { side } = acrossOf(wayBetween(shot.from, shot.to).way);
  return (along) => {
    const on = shot.pathAt(along);
    const out = Math.sin(along * Math.PI * 2 * WINDS + (shot.seed % 6) + shot.index * 2) * Math.sin(Math.PI * along);
    const by = out * shot.cell * WINDS_CELLS;
    return { x: on.x + side.x * by, y: on.y + side.y * by, z: on.z + Math.abs(out) * shot.cell * 0.15 };
  };
}

/** Draws a shot of a curse at a moment: see the header. */
export const drawCurseShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const knot = cell * KNOT * power;
  const forward = cell * 0.4;
  const hue = hueOf(ramp);
  const pale = ramp[5];
  const pathAt = windingOf(shot);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const share = since / flies;
  const drops = Math.max(3, Math.round(DROPS * detail));

  for (let drop = 0; drop < drops; drop++) {
    const letGo = (drop + 0.6) / (drops + 0.4);
    const age = since - letGo * flies;
    if (age < 0) break;
    const from = pathAt(letGo);
    const falling = fallingDrop(
      { ...from, z: from.z - knot * 0.3 },
      age,
      shot.floorZ,
      cell,
      cell * 0.2,
      BLACK,
      1,
      forward,
      7
    );
    if (falling) {
      drawn.motes.push(falling);
      continue;
    }
    const lain = age - Math.sqrt((2 * Math.max(0, from.z - knot * 0.3 - shot.floorZ)) / (7 * cell));
    const stain = 1 - within(lain, STAIN_S * 0.4, STAIN_S);
    if (lain < 0 || stain <= 0) continue;
    const floor = floorUnder(from, shot.floorZ);
    const spread = Math.min(1, lain / 0.08);
    drawn.floor.push(floorMark('disc', floor, cell * 0.42 * spread, 1, BLACK, 0.8 * stain, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, cell * 0.5 * spread, 0.3, hue, 0.6 * stain, 'color', 0));
  }

  if (share < 1) {
    const at = pathAt(share);
    const { way } = wayBetween(pathAt(Math.max(0, share - 0.03)), pathAt(Math.min(1, share + 0.03)));
    const back = { x: -way.x, y: -way.y, z: -way.z };
    const rope: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let point = 0; point <= 9; point++) {
      const behind = point / 9;
      const was = pathAt(Math.max(0, share - behind * 0.5));
      rope.push({ ...was, z: was.z + cell * 0.25 * behind });
      widths.push(knot * (0.75 + 0.5 * behind) * (1 - behind * 0.5));
      alphas.push(1 - behind);
    }
    drawn.ribbons.push(
      {
        points: rope,
        widths: widths.map((width) => width * 1.25),
        alphas,
        color: hue,
        alpha: 0.55,
        blend: 'color',
        soft: 0.6,
        torn: 0.5,
        flowed: t * 3,
      },
      {
        points: rope,
        widths,
        alphas,
        color: INK,
        alpha: 0.9,
        blend: 'color',
        soft: 0.45,
        torn: 0.55,
        flowed: t * 4 + 1,
      }
    );
    drawn.motes.push(haze(at, knot * 2.4, hue, 0.6, forward - 2));
    for (let flame = 0; flame < 3; flame++) {
      const { side, lift } = acrossOf(way);
      const turn = flame * 2.1 + t * 3;
      const root = offsetBy(offsetBy(at, side, Math.cos(turn) * knot * 0.22), lift, Math.sin(turn) * knot * 0.22);
      drawn.motes.push(
        flowingMote(
          'lick',
          root,
          { x: back.x, y: back.y, z: back.z + 0.15 },
          knot * (0.95 - 0.12 * flame),
          knot * (2.5 - 0.4 * flame),
          t * 11 + flame * 2,
          {
            color: flame === 0 ? hue : mixColor(hue, INK, 0.4),
            core: BLACK,
            alpha: 0.95,
            forward: forward - 1,
            variant: (shot.seed + flame) % 6,
          }
        )
      );
    }
    drawn.motes.push(ball(at, knot * 1.22, hue, 1, forward, shot.seed % 6));
    drawn.motes.push(ball(at, knot, BLACK, 1, forward + 1, (shot.seed + 2) % 6));
    drawn.motes.push(
      sign('skull', at, knot * 0.92, pale, 1, forward + 2, { core: BLACK, spin: Math.sin(t * 9) * 0.25 })
    );
    drawn.floor.push(floorMark('disc', floorUnder(at, shot.floorZ), cell * 0.9, 1, BLACK, 0.35, 'color', 0));
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const left = leftAt(shot);
  const foot = floorUnder(shot.aim, shot.floorZ);
  const tall = (shot.aim.z - shot.floorZ) * 2.1;
  if (struck < CLINGS_S) {
    const clung = struck / CLINGS_S;
    const tight = 1 - 0.45 * within(clung, 0.15, 0.8);
    const shown = Math.min(1, struck / 0.08) * (1 - within(clung, 0.65, 1));
    for (let coil = 0; coil < COILS; coil++) {
      const points: Point[] = [];
      const about: Point[] = [];
      const widths: number[] = [];
      const reached = Math.min(1, clung * 3);
      for (let point = 0; point < COIL_POINTS; point++) {
        const up = (point / (COIL_POINTS - 1)) * reached;
        const turn = (coil / COILS) * Math.PI * 2 + up * 7 + struck * 5;
        const out = cell * 0.62 * power * tight * (1 - 0.25 * up);
        const middle = { x: foot.x, y: foot.y, z: foot.z + cell * 0.08 + tall * up };
        about.push(middle);
        points.push({ x: middle.x + Math.cos(turn) * out, y: middle.y + Math.sin(turn) * out, z: middle.z });
        widths.push(
          cell * 0.2 * power * Math.sin(Math.PI * Math.min(1, 0.12 + (point / (COIL_POINTS - 1)) * 0.88)) ** 0.6
        );
      }
      for (const half of ['far', 'near'] as const) {
        drawn.ribbons.push(
          {
            points,
            widths: widths.map((width) => width * 1.5),
            color: hue,
            alpha: 0.7 * shown * (half === 'far' ? 0.6 : 1),
            blend: 'color',
            soft: 0.4,
            about,
            half,
          },
          {
            points,
            widths,
            color: BLACK,
            alpha: shown * (half === 'far' ? 0.7 : 1),
            blend: 'color',
            torn: 0.3,
            flowed: struck * 5,
            about,
            half,
          }
        );
      }
    }
    const swells = within(struck, 0, 0.5);
    litSign(
      drawn,
      'skull',
      { x: shot.aim.x, y: shot.aim.y, z: shot.aim.z + cell * (0.5 + 0.6 * swells) },
      knot * (1 + 1.3 * swells),
      pale,
      hue,
      (1 - swells) ** 0.7,
      cell * 0.7,
      { core: BLACK }
    );
    drawn.motes.push(haze(shot.aim, cell * 2.4 * power, INK, 0.55 * (1 - clung), forward));
  }
  const sinks = 1 - within(struck, 0.5, 1.3);
  if (sinks > 0) {
    drawn.floor.push(
      floorMark('disc', foot, cell * 1.25 * power * Math.min(1, struck / 0.1), 1, BLACK, 0.6 * sinks * left, 'color', 0)
    );
    drawn.floor.push(
      floorMark('ring', foot, cell * 1.3 * power * Math.min(1, struck / 0.1), 0.14, hue, 0.7 * sinks * left, 'color', 0)
    );
  }
};
