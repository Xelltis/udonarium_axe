import {
  afflictedOf,
  bodyVeil,
  byHead,
  countOf,
  litSign,
  onBody,
  popIn,
  scatter,
  shaded,
  sign,
  SIGN_RIGHT,
  SIGN_SIZE,
  SIGN_UP,
  stampIn,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, glow, haze, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * The states that take a sense or a power away: a blindness, a black band shut over the eyes, its
 * ends trailing, dark fog wound about the head and the light round the piece drawn into it and put
 * out; a silence, the rings of a voice leaving the mouth, a cross stamped over it, and every ring
 * after that breaking on the cross and falling in pieces; and a slowness, the face of a clock laid
 * under the feet and another hung over the head, whose hands drag round a heavy tick at a time, a
 * ring spreading at each, and iron weights dropped at the ankles.
 */

/** How far up a body its eyes are and how far up its mouth, as shares of its height. */
const EYES_AT = 0.78;
const MOUTH_AT = 0.68;
/** How wide the band shut over the eyes of the blind is drawn, in cells. */
const BAND_WIDE = 0.86;

/** A blindness: see the header. */
export function drawBlind(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'blind');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const black = '#08060c';
  const edge = mixColor(a.dark, a.light, 0.35);
  const salt = stage.seed % 61;
  const eyes: Point = { x: a.foot.x, y: a.foot.y, z: a.foot.z + a.tall * EYES_AT };
  const shut = within(a.since, -0.2, 0);
  drawn.floor.push(floorMark('disc', a.floor, cell * 1.45, 1, black, 0.6 * a.shown, 'color', 0));
  if (a.since >= 0) {
    drawn.floor.push(
      floorMark('ring', a.floor, cell * (1.8 - 1.4 * a.phase), 0.14, black, 0.7 * a.phase * a.shown, 'color', 0)
    );
  }
  bodyVeil(drawn, a, black, 0.16 + 0.12 * a.pulse);

  for (let index = 0; index < countOf(a, 10); index++) {
    const closing = (t * 0.85 + index / 10) % 1;
    const turn = index * 2.4 + closing * 3;
    const out = cell * 1.7 * (1 - closing) + cell * 0.1;
    const at = {
      x: eyes.x + Math.cos(turn) * out,
      y: eyes.y + Math.sin(turn) * out,
      z: eyes.z + (scatter(index, salt) - 0.5) * a.tall * (1 - closing),
    };
    const fast = cell * (1.5 + 3 * closing);
    drawn.motes.push({
      ...glow(at, cell * 0.11, '#fff1c2', (1 - closing) * shut * a.shown, cell * 0.3),
      shape: 'spark',
      velocity: { x: -Math.cos(turn) * fast, y: -Math.sin(turn) * fast, z: 0 },
      trail: 0.07,
    });
  }

  drawn.motes.push(haze(eyes, cell * 1.5, black, 0.45 * shut * a.shown, cell * 0.3));
  for (let index = 0; index < countOf(a, 4); index++) {
    const turn = (index / 4) * Math.PI * 2 + t * 0.9;
    const at = {
      x: eyes.x + Math.cos(turn) * cell * 0.36,
      y: eyes.y + Math.sin(turn) * cell * 0.36,
      z: eyes.z + Math.sin(turn * 2 + t) * cell * 0.14,
    };
    drawn.motes.push(
      smokePuff(at, cell * 0.5, index % 2 ? black : shaded(a.dark, 0.6), 0.42 * shut * a.shown, cell * 0.3)
    );
  }

  const near = cell * 0.6;
  const wide = cell * BAND_WIDE * (1 + 1.4 * (1 - outCubic(shut))) * (1 - 0.04 * a.pulse);
  const cloth = shaded(a.dark, 0.5);
  const tilt = -0.07;
  for (const [index, long] of [0.42, 0.6].entries()) {
    const sway = Math.sin(t * 4.2 + index * 1.8) * 0.3 + 0.35;
    const reach = cell * long * shut;
    const tail = cell * 0.13;
    drawn.motes.push({
      ...ball({ ...eyes, z: eyes.z - reach }, tail, index ? black : cloth, shut * a.shown, near + index, index),
      shape: 'tongue',
      velocity: { x: 0, y: 0, z: -cell },
      trail: Math.max(0, reach - tail) / cell,
      aside: { right: wide * 0.36 + reach * sway * 0.5, up: -cell * 0.02 },
    });
  }
  drawn.motes.push(sign('bar', eyes, wide, cloth, shut * a.shown, near + 2, { spin: tilt }));
  drawn.motes.push({
    ...glow(eyes, cell * 0.035, edge, 0.55 * shut * a.shown, near + 3),
    shape: 'flare',
    trail: (wide * 0.62) / (cell * 0.035),
    spin: tilt,
    aside: { right: 0, up: wide * 0.035 },
  });
  drawn.motes.push({
    ...ball(eyes, cell * 0.16, black, shut * a.shown, near + 4, 1),
    aside: { right: wide * 0.36, up: -wide * 0.02 },
  });

  if (a.since >= 0 && a.since < 0.25) {
    const left = 1 - a.since / 0.25;
    drawn.motes.push({
      ...ball(eyes, cell * (0.7 + 1.6 * (1 - left)), black, left * a.shown, near, 0),
      shape: 'hoop',
    });
    drawn.motes.push({
      ...glow(eyes, cell * 0.12 * left, '#ffffff', left * a.shown, near + 5),
      shape: 'flare',
      trail: 7,
      spin: tilt,
    });
  }
  return drawn;
}

/** How far through a beat the ring of a voice gets before it breaks on the cross. */
const VOICE_BREAKS_AT = 0.36;

/** A silence: see the header. */
export function drawSilence(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'silence');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const voice = mixColor(a.light, '#ffffff', 0.55);
  const salt = stage.seed % 59;
  const mouth: Point = { x: a.foot.x, y: a.foot.y, z: a.foot.z + a.tall * MOUTH_AT };
  const near = cell * 0.6;
  drawn.floor.push(floorMark('disc', a.floor, cell * 1.05, 1, a.hue, 0.22 * a.shown, 'light', 0));
  drawn.floor.push(floorMark('ring', a.floor, cell * 0.8, 0.06, a.light, 0.5 * a.shown, 'light', 0));
  bodyVeil(drawn, a, mixColor(a.dark, a.light, 0.3), 0.1 + 0.1 * a.pulse);

  const shards = (from: Point, reach: number, age: number, lasts: number, count: number, seed: number): void => {
    if (age < 0 || age >= lasts) return;
    const left = 1 - age / lasts;
    for (let index = 0; index < count; index++) {
      const turn = (index / count) * Math.PI * 2 + seed;
      const drift = cell * 0.5 * scatter(index, seed) * age;
      drawn.motes.push({
        ...ball(
          {
            x: from.x + Math.cos(turn) * (reach + drift),
            y: from.y + Math.sin(turn) * (reach + drift) * 0.3,
            z: Math.max(a.floor.z, from.z + Math.sin(turn) * reach - 5 * cell * age * age),
          },
          cell * (0.1 + 0.07 * scatter(index, seed + 1)),
          index % 2 ? voice : a.light,
          left * a.shown,
          near,
          index
        ),
        shape: 'flake',
        spin: age * (4 + 6 * scatter(index, seed + 2)) + index,
      });
    }
  };

  if (a.since < 0) {
    for (let index = 0; index < 3; index++) {
      const age = t - index * 0.09;
      if (age < 0) continue;
      const grown = age / Math.max(0.1, a.holdAt);
      drawn.motes.push({
        ...ball(mouth, cell * (0.25 + 1.1 * grown), voice, (1 - 0.5 * grown) * a.shown, near, 0),
        shape: 'hoop',
      });
    }
  } else {
    shards(mouth, cell * 0.45, a.since, 0.6, countOf(a, 10), salt);
    if (a.beat > 0 || a.phase > 0.05) {
      if (a.phase < VOICE_BREAKS_AT && a.beat > 0) {
        const grown = a.phase / VOICE_BREAKS_AT;
        drawn.motes.push({
          ...ball(mouth, cell * (0.2 + 0.5 * grown), voice, 0.9 * a.shown, near, 0),
          shape: 'hoop',
        });
      } else if (a.beat > 0) {
        shards(mouth, cell * 0.33, (a.phase - VOICE_BREAKS_AT) * a.every, 0.42, countOf(a, 6), salt + a.beat);
      }
    }
    const struck = a.beat > 0 && a.phase >= VOICE_BREAKS_AT ? Math.exp(-(a.phase - VOICE_BREAKS_AT) * 9) : 0;
    const size = cell * 0.62 * stampIn(a.since) * (1 + 0.1 * struck);
    litSign(drawn, 'cross', mouth, size, struck > 0.3 ? voice : a.light, a.hue, a.shown, near + 4, {
      spin: Math.sin(a.since * 40) * 0.12 * Math.max(0, 1 - a.since / 0.25),
    });
    if (a.since < 0.2) {
      drawn.motes.push(...starBurst(mouth, cell * 1.7, voice, a.since / 0.2, near + 2, 6, salt));
    }
  }
  takeHold(drawn, a, voice, 0.8);
  drawn.lights.push({ ...mouth, color: a.light, strength: 0.35 * a.pulse * a.shown, reachPx: cell * 1.6 });
  return drawn;
}

/** How far the long hand of the clock moves at each tick, in radians, and how long each tick takes to land, in seconds. */
const TICK_TURN = Math.PI / 6;
const TICK_LANDS_S = 0.2;
/** How dark the iron of a weight is. */
const IRON = '#3b3f4a';

/** A slowness: see the header. */
export function drawSlow(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'slow');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const brass = a.light;
  const pale = mixColor(a.light, '#ffffff', 0.6);
  const hand = shaded(a.dark, 0.45);
  const salt = stage.seed % 53;
  const ticked = a.since >= 0 ? a.beat + popIn(a.phase * a.every, TICK_LANDS_S) : 0;
  const long = -Math.PI / 2 + ticked * TICK_TURN;
  const short = long / 12 + 2.2;
  const laid = within(t, 0, 0.2);

  drawn.floor.push(floorMark('disc', a.floor, cell * 1.15, 1, shaded(a.dark, 0.5), 0.5 * laid * a.shown, 'color', 0));
  drawn.floor.push(floorMark('sigil', a.floor, cell * 1.08, 0.08, brass, 0.9 * laid * a.shown, 'light', 0, 0));
  if (a.since >= 0) {
    drawn.floor.push(
      floorMark('ring', a.floor, cell * (0.3 + 1.2 * a.phase), 0.09, pale, 0.8 * (1 - a.phase) * a.shown, 'light', 0)
    );
  }
  const lies = a.floor.z + cell * 0.02;
  for (const [turn, reach, wide] of [
    [long, 0.86, 0.075],
    [short, 0.5, 0.1],
  ] as const) {
    const points = [0, 0.5, 1].map((share) => ({
      x: a.floor.x + Math.cos(turn) * cell * reach * share,
      y: a.floor.y + Math.sin(turn) * cell * reach * share,
      z: lies,
    }));
    drawn.ribbons.push({
      points,
      widths: [cell * wide, cell * wide * 0.8, cell * wide * 0.3],
      color: hand,
      core: brass,
      alpha: laid * a.shown,
      blend: 'color',
    });
  }
  bodyVeil(drawn, a, mixColor(a.dark, '#5a6076', 0.4), 0.12 + 0.12 * a.pulse);
  drawn.motes.push(haze(onBody(a, 0, 0.14, 0), cell * 1.5, shaded(a.dark, 0.3), 0.4 * laid * a.shown, cell * 0.2));

  for (let index = 0; index < countOf(a, 6); index++) {
    const turns = t / 1.7 + scatter(index, salt);
    const life = turns - Math.floor(turns);
    const turn = scatter(index, salt + 2) * Math.PI * 2;
    const sunk = 1 - (1 - life) * (1 - life);
    const at = {
      x: a.foot.x + Math.cos(turn) * cell * 0.5,
      y: a.foot.y + Math.sin(turn) * cell * 0.5,
      z: a.head.z - sunk * a.tall * 0.95,
    };
    const fast = cell * 1.4 * (1 - life) + cell * 0.1;
    drawn.motes.push({
      ...ball(at, cell * 0.06, pale, 0.55 * Math.sin(Math.PI * life) * a.shown, cell * 0.3, index),
      shape: 'comet',
      velocity: { x: 0, y: 0, z: -fast },
      trail: 0.3,
    });
  }

  for (const [index, side] of [0.6, 3.7].entries()) {
    const turn = side + salt;
    const fallen = within(a.since, -0.16, 0);
    const size = cell * 0.22;
    const rests = { x: a.floor.x + Math.cos(turn) * cell * 0.44, y: a.floor.y + Math.sin(turn) * cell * 0.44 };
    const at = { ...rests, z: a.floor.z + size * 0.5 + cell * 0.7 * (1 - fallen * fallen) };
    if (t < a.holdAt - 0.16) continue;
    const ankle = onBody(a, turn, 0.1, 0.16);
    drawn.ribbons.push({
      points: [0, 1, 2, 3].map((step) => {
        const share = step / 3;
        return {
          x: ankle.x + (at.x - ankle.x) * share,
          y: ankle.y + (at.y - ankle.y) * share,
          z: ankle.z + (at.z + size * 0.4 - ankle.z) * share - Math.sin(Math.PI * share) * cell * 0.05,
        };
      }),
      widths: cell * 0.045,
      color: mixColor(IRON, '#9aa0ae', 0.35),
      core: IRON,
      alpha: a.shown,
      blend: 'color',
    });
    drawn.motes.push(ball(at, size * 1.18, shaded(IRON, 0.6), a.shown, a.over, index));
    drawn.motes.push(ball(at, size, IRON, a.shown, a.over + 1, index + 2));
    drawn.motes.push(
      ball({ ...at, z: at.z + size * 0.2 }, size * 0.32, '#a9afbd', 0.85 * a.shown, a.over + 2, index + 4)
    );
    const thud = 1 - a.since / 0.35;
    if (a.since >= 0 && thud > 0) {
      for (let puff = 0; puff < 3; puff++) {
        const way = turn + (puff - 1) * 1.2;
        const out = cell * 0.3 * (1 - thud);
        drawn.motes.push(
          smokePuff(
            { x: rests.x + Math.cos(way) * out, y: rests.y + Math.sin(way) * out, z: a.floor.z + cell * 0.08 },
            cell * (0.2 + 0.25 * (1 - thud)),
            '#8d8478',
            0.5 * thud * a.shown,
            cell * 0.2
          )
        );
      }
    }
  }

  const swung = popIn(a.since);
  if (swung > 0) {
    const hung = byHead(a, SIGN_RIGHT, SIGN_UP + Math.sin(t * 1.3) * 0.015);
    const size = cell * SIGN_SIZE * swung * (1 + 0.06 * a.pulse);
    litSign(drawn, 'dial', hung.at, size, pale, brass, a.shown, cell * 0.6, {
      spin: -(long + Math.PI / 2),
      aside: hung.aside,
    });
    drawn.motes.push(
      sign('dial', hung.at, size, pale, a.shown, cell * 0.6 + 4, {
        spin: -(short + Math.PI / 2),
        variant: 1,
        aside: hung.aside,
      })
    );
  }
  takeHold(drawn, a, pale, 0.7, 0.8);
  drawn.lights.push({
    ...onBody(a, 0, 0.3, 0),
    color: brass,
    strength: (0.2 + 0.35 * a.pulse) * a.shown,
    reachPx: cell * 1.8,
  });
  return drawn;
}
