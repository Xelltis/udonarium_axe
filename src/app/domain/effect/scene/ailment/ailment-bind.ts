import {
  afflictedOf,
  bodyVeil,
  countOf,
  INK,
  onBody,
  scatter,
  shaded,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { ball, floorMark, glow, type Point, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * A binding: the floor cracks at the piece's feet and three vines break out of it and wind up round
 * the body, putting out leaves as they climb; they draw tight all at once, leaves and dust flying,
 * and hold, tightening again at every beat as a glint of sap runs up them and a leaf or two shakes
 * loose. Only the part of each vine that passes before the piece is drawn, so that it is seen to go
 * round behind it.
 */

/** How many times each vine winds round the body, and how far up the body it climbs, as a share of its height. */
const WINDS = 1.6;
const CLIMBS_TO = 0.9;
/** How far out from the middle of the body a vine lies before it is drawn tight and after, in cells. */
const LOOSE = 0.46;
const TIGHT = 0.27;
/** How many points each vine is drawn through. */
const VINE_POINTS = 30;

/** A leaf: a small pointed blade of a colour standing off a point along a way, hidden by a piece it is behind. */
function leaf(at: Point, way: Point, long: number, color: string, alpha: number, variant: number): EffectMote {
  const wide = long * 0.5;
  return {
    ...ball({ x: at.x + way.x * long, y: at.y + way.y * long, z: at.z + way.z * long }, wide, color, alpha, 3, variant),
    shape: 'tongue',
    velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
    trail: Math.max(0, long - wide) / 100,
    exactDepth: true,
  };
}

/** A binding: see the header. */
export function drawBind(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'bind');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const bark = a.dark;
  const green = a.light;
  const sap = mixColor(a.light, '#ffffff', 0.5);
  const salt = stage.seed % 47;
  const grown = outCubic(within(t, 0.04, Math.max(0.2, a.holdAt - 0.14)));
  const drawnTight = within(a.since, -0.1, 0);
  const squeeze = a.since >= 0 ? a.pulse : 0;
  const girth = cell * (LOOSE - (LOOSE - TIGHT) * drawnTight * drawnTight) * (1 - 0.1 * squeeze);
  const strains = a.since > 0 ? 1 - squeeze : 0;

  drawn.floor.push(
    floorMark('cracks', a.floor, cell * (0.4 + 0.5 * grown), 0.2, shaded(bark, 0.55), 0.85 * a.shown, 'color', salt % 9)
  );
  drawn.floor.push(floorMark('disc', a.floor, cell * 0.9, 1, shaded(bark, 0.3), 0.4 * a.shown, 'color', 0));
  bodyVeil(drawn, a, mixColor(bark, green, 0.3), 0.06 + 0.12 * squeeze);

  if (t < 0.55) {
    for (let index = 0; index < countOf(a, 9); index++) {
      const way = scatter(index, salt) * Math.PI * 2;
      const fast = cell * (0.8 + 1.2 * scatter(index, salt + 1));
      const up = cell * (2 + 1.5 * scatter(index, salt + 2));
      drawn.motes.push({
        ...ball(
          {
            x: a.floor.x + Math.cos(way) * (cell * 0.2 + fast * t),
            y: a.floor.y + Math.sin(way) * (cell * 0.2 + fast * t),
            z: Math.max(a.floor.z + cell * 0.03, a.floor.z + up * t - 4.5 * cell * t * t),
          },
          cell * (0.07 + 0.07 * scatter(index, salt + 3)),
          shaded(bark, 0.25),
          Math.min(1, (0.55 - t) * 4) * a.shown,
          cell * 0.2,
          index
        ),
        shape: 'chunk',
        spin: t * 9 + index,
      });
    }
  }

  const count = Math.max(2, Math.ceil(VINE_POINTS * grown));
  for (let vine = 0; vine < 3; vine++) {
    const starts = (vine / 3) * Math.PI * 2 + salt;
    const hand = vine === 1 ? -1 : 1;
    const points: Point[] = [];
    const about: Point[] = [];
    const widths: number[] = [];
    for (let step = 0; step < count; step++) {
      const along = (step / (VINE_POINTS - 1)) * (grown > 0 ? 1 : 0);
      const turn = starts + hand * along * WINDS * Math.PI * 2;
      const strain = strains * Math.sin(t * 19 + along * 9 + vine) * cell * 0.012;
      const out = girth * (1.25 - 0.25 * Math.min(1, along * 4)) + strain;
      const z = a.foot.z + a.tall * CLIMBS_TO * along ** 0.9;
      points.push({ x: a.foot.x + Math.cos(turn) * out, y: a.foot.y + Math.sin(turn) * out, z });
      about.push({ x: a.foot.x, y: a.foot.y, z });
      const toTip = (count - 1 - step) / Math.max(1, count - 1);
      widths.push(cell * (0.045 + 0.05 * (1 - along)) * Math.min(1, toTip * 6 + 0.15));
    }
    if (points.length < 2) continue;
    drawn.ribbons.push({
      points,
      widths: widths.map((wide) => wide * 1.45),
      color: INK,
      alpha: 0.9 * a.shown,
      blend: 'color',
      about,
      half: 'near',
    });
    drawn.ribbons.push({
      points,
      widths,
      color: bark,
      core: mixColor(bark, green, 0.55),
      alpha: a.shown,
      blend: 'color',
      about,
      half: 'near',
      leans: 0.3,
    });
    for (let step = 3; step < count; step += 5) {
      const at = points[step];
      const turn = Math.atan2(at.y - a.foot.y, at.x - a.foot.x);
      const flutter = Math.sin(t * 6 + step + vine) * 0.25;
      const way = { x: Math.cos(turn + flutter) * 0.8, y: Math.sin(turn + flutter) * 0.8, z: 0.6 };
      const opened = Math.min(1, (count - step) / 4);
      drawn.motes.push(
        leaf(at, way, cell * 0.2 * opened, step % 10 === 3 ? green : mixColor(green, bark, 0.35), a.shown, step)
      );
    }
    if (a.since >= 0 && count >= VINE_POINTS) {
      const at = points[Math.min(points.length - 1, Math.floor(a.phase * 1.4 * (points.length - 1)))];
      if (a.phase < 0.7) {
        drawn.motes.push(glow(at, cell * 0.3, sap, (1 - a.phase / 0.7) * a.shown, cell * 0.3));
      }
    }
  }

  if (a.since >= 0) {
    const flown = a.since / 0.5;
    if (flown < 1) {
      for (let index = 0; index < countOf(a, 10); index++) {
        const way = scatter(index, salt + 5) * Math.PI * 2;
        const far = cell * (0.35 + 0.9 * outCubic(flown) * (0.5 + scatter(index, salt + 6)));
        const tumble = flown * 9 + index;
        drawn.motes.push(
          leaf(
            {
              x: a.foot.x + Math.cos(way) * far,
              y: a.foot.y + Math.sin(way) * far,
              z: a.foot.z + a.tall * (0.2 + 0.7 * scatter(index, salt + 7)) + cell * 0.3 * Math.sin(flown * Math.PI),
            },
            { x: Math.cos(tumble) * 0.7, y: Math.sin(tumble) * 0.7, z: Math.sin(tumble * 1.3) * 0.7 },
            cell * 0.2,
            index % 2 ? green : mixColor(green, bark, 0.4),
            (1 - flown) * a.shown,
            index
          )
        );
      }
      drawn.motes.push(
        smokePuff(onBody(a, 0, 0.1, 0), cell * (0.8 + flown), '#8d8478', 0.35 * (1 - flown) * a.shown, cell * 0.2)
      );
    }
    for (let index = 0; index < countOf(a, 3); index++) {
      const fall = a.phase * a.every;
      const way = scatter(index + a.beat * 3, salt + 9) * Math.PI * 2;
      const from = onBody(a, way, 0.35 + 0.5 * scatter(index + a.beat, salt + 10), 0.4);
      const sways = fall * 5 + index;
      drawn.motes.push(
        leaf(
          {
            x: from.x + Math.sin(sways) * cell * 0.12,
            y: from.y + Math.cos(fall * 4 + index) * cell * 0.12,
            z: Math.max(a.floor.z + cell * 0.03, from.z - cell * 0.9 * fall),
          },
          { x: Math.cos(sways) * 0.8, y: Math.sin(sways) * 0.8, z: 0.3 * Math.sin(sways * 1.7) },
          cell * 0.17,
          green,
          Math.min(1, (1 - a.phase) * 3) * a.shown,
          index
        )
      );
    }
  }
  takeHold(drawn, a, sap, 0.8);
  drawn.lights.push({ ...onBody(a, 0, 0.4, 0), color: green, strength: 0.3 * squeeze * a.shown, reachPx: cell * 1.6 });
  return drawn;
}
