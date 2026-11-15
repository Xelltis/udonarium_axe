import {
  afflictedOf,
  bodyVeil,
  byHead,
  countOf,
  litSign,
  onBody,
  popIn,
  roundOf,
  scatter,
  sign,
  SIGN_RIGHT,
  SIGN_SIZE,
  SIGN_UP,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, glow, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * The states that work on the mind, each told by the sign hung at the piece's shoulder: a sleep,
 * zeds rising off the head one after another, each larger than the last, a bubble swelling and
 * shrinking at the nose with every breath and motes of light sinking round the body; a confusion, a
 * spiral turning by the head, question marks popping up on either side of it in turn, stars wheeling
 * round it and a ring on the floor that staggers about; and a charm, a heart beating by the head,
 * throwing off its own likeness at every beat, small hearts rising round the body.
 */

/** How long each breath of a sleeper is, in and out, in seconds. */
const BREATH_S = 2.2;
/** How long a zed rises before it is gone, in seconds, and how far through that it bursts. */
const ZED_LIFE_S = 2.5;
const ZED_BURSTS_AT = 0.86;

/** A sleep: see the header. */
export function drawSleep(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'sleep');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const pale = mixColor(a.light, '#ffffff', 0.55);
  const night = mixColor(a.dark, a.light, 0.3);
  const salt = stage.seed % 79;
  const breathed = 0.5 - 0.5 * Math.cos((t / BREATH_S) * Math.PI * 2);
  const under = within(a.since, -0.3, 0.1);
  const near = cell * 0.6;
  drawn.floor.push(
    floorMark('disc', a.floor, cell * (1.15 + 0.1 * breathed), 1, a.hue, (0.3 + 0.2 * breathed) * a.shown, 'light', 0)
  );
  drawn.floor.push(
    floorMark('ring', a.floor, cell * (0.85 + 0.12 * breathed), 0.05, pale, 0.45 * under * a.shown, 'light', 0)
  );
  bodyVeil(drawn, a, night, (0.26 + 0.16 * breathed) * under);

  for (let index = 0; index < countOf(a, 12); index++) {
    const { life } = roundOf(t, 2.6, scatter(index, salt + 5));
    const turn = scatter(index, salt + 7) * Math.PI * 2 + t * 0.2;
    const out = cell * (0.4 + 0.45 * scatter(index, salt + 9));
    const at = {
      x: a.foot.x + Math.cos(turn) * out,
      y: a.foot.y + Math.sin(turn) * out,
      z: a.head.z + cell * 0.45 - life * (a.tall + cell * 0.35),
    };
    const lit = Math.sin(Math.PI * life) * a.shown;
    drawn.motes.push(
      index % 3 === 0
        ? { ...glow(at, cell * 0.3, pale, lit, cell * 0.3), shape: 'star', spin: t * 1.5 + index }
        : glow(at, cell * 0.13, pale, 0.9 * lit, cell * 0.3)
    );
  }

  const blown = cell * (0.1 + 0.22 * breathed) * under;
  if (blown > 0) {
    const nose = byHead(a, -0.2, -0.22);
    drawn.motes.push({
      ...ball({ ...nose.at, z: nose.at.z + blown * 0.4 }, blown, pale, 0.9 * a.shown, near, 0),
      shape: 'bubble',
      aside: { right: nose.aside.right - blown * 0.4, up: nose.aside.up },
    });
  }

  if (a.since >= 0) {
    const latest = Math.floor(a.since / a.every);
    for (let born = Math.max(0, latest - 3); born <= latest; born++) {
      const bornAt = a.holdAt + born * a.every;
      const age = t - bornAt;
      if (age < 0 || age >= ZED_LIFE_S || bornAt > a.duration - 0.6) continue;
      const share = age / ZED_LIFE_S;
      const sway = Math.sin(share * 6 + born * 1.9) * 0.07;
      const hung = byHead(a, 0.42 + 0.6 * share + sway, -0.22 + 0.62 * share);
      const size = cell * (0.26 + 0.36 * share) * popIn(age);
      if (share < ZED_BURSTS_AT) {
        litSign(drawn, 'zed', hung.at, size, pale, a.hue, a.shown, near + born, {
          spin: -0.18 + Math.sin(age * 2.6 + born) * 0.22,
          aside: hung.aside,
        });
        continue;
      }
      const burst = (share - ZED_BURSTS_AT) / (1 - ZED_BURSTS_AT);
      for (let fleck = 0; fleck < 7; fleck++) {
        const way = (fleck / 7) * Math.PI * 2 + born;
        const far = size * (0.3 + 0.8 * burst);
        drawn.motes.push({
          ...glow(hung.at, cell * 0.22, pale, (1 - burst) * a.shown, near),
          shape: 'star',
          spin: fleck,
          aside: { right: hung.aside.right + Math.cos(way) * far, up: hung.aside.up + Math.sin(way) * far },
        });
      }
    }
  }
  takeHold(drawn, a, pale, 0.5, 0.7);
  drawn.lights.push({
    ...onBody(a, 0, 0.7, 0),
    color: a.light,
    strength: (0.25 + 0.2 * breathed) * a.shown,
    reachPx: cell * 2,
  });
  return drawn;
}

/** How long a question mark stands before it fades, and how long it is gone before the next, as shares of its round. */
const QUERY_STANDS = 0.6;
const QUERY_GONE_AT = 0.78;

/** A confusion: see the header. */
export function drawConfuse(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'confuse');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const bright = mixColor(a.light, '#ffffff', 0.35);
  const salt = stage.seed % 73;
  const near = cell * 0.6;
  const reels = { x: Math.sin(t * 2.4) * cell * 0.26, y: Math.sin(t * 4.8) * cell * 0.13 };
  for (const [index, way] of [1, -1].entries()) {
    drawn.floor.push(
      floorMark(
        'ring',
        { x: a.floor.x + reels.x * way, y: a.floor.y + reels.y * way, z: a.floor.z },
        cell * (0.75 + 0.12 * index),
        0.07,
        index ? a.hue : bright,
        (0.55 - 0.2 * index) * a.shown,
        'light',
        0
      )
    );
  }
  drawn.floor.push(floorMark('disc', a.floor, cell * 1.1, 1, a.hue, 0.22 * a.shown, 'light', 0));
  bodyVeil(drawn, a, a.hue, 0.14 + 0.14 * a.pulse);

  const wound = popIn(a.since) * (1 + 0.14 * a.pulse);
  if (wound > 0) {
    const hung = byHead(a, SIGN_RIGHT + Math.cos(t * 3.1) * 0.04, SIGN_UP + Math.sin(t * 3.1) * 0.04);
    litSign(drawn, 'swirl', hung.at, cell * SIGN_SIZE * 1.1 * wound, a.light, a.dark, a.shown, near, {
      spin: -t * 5.5,
      aside: hung.aside,
    });
    for (let index = 0; index < countOf(a, 4); index++) {
      const turn = t * 3.4 + (index / 4) * Math.PI * 2;
      const at = {
        x: a.head.x + Math.cos(turn) * cell * 0.5,
        y: a.head.y + Math.sin(turn) * cell * 0.5,
        z: a.head.z - cell * (0.1 + 0.1 * Math.sin(turn + 1)),
      };
      drawn.motes.push({
        ...glow(at, cell * 0.32, bright, (0.6 + 0.4 * Math.sin(t * 9 + index * 2)) * a.shown, cell * 0.5),
        shape: 'star',
        spin: t * 2 + index,
      });
    }
  }

  const round = a.every * 3;
  for (let index = 0; index < 3; index++) {
    const { life, round: which } = roundOf(Math.max(0, a.since), round, index / 3);
    if (a.since < 0 || life > QUERY_GONE_AT) continue;
    const age = life * round;
    const left = (index + which) % 2 === 0;
    const hung = byHead(
      a,
      left ? -0.66 - 0.12 * scatter(index + which, salt) : 1.08 + 0.1 * scatter(index + which, salt),
      (left ? -0.12 : -0.5) + 0.2 * scatter(index + which, salt + 2) + 0.1 * outCubic(life)
    );
    const fades = life < QUERY_STANDS ? 1 : 1 - (life - QUERY_STANDS) / (QUERY_GONE_AT - QUERY_STANDS);
    litSign(
      drawn,
      'query',
      hung.at,
      cell * 0.46 * popIn(age, 0.18),
      index === 1 ? mixColor(a.light, '#ffffff', 0.7) : bright,
      a.hue,
      fades * a.shown,
      near + 4 + index,
      { spin: Math.sin(age * 7 + index) * 0.3, aside: hung.aside }
    );
  }

  if (a.since >= 0 && a.since < 0.22) {
    drawn.motes.push(...starBurst(a.head, cell * 1.5, bright, a.since / 0.22, near, 6, salt));
  }
  takeHold(drawn, a, bright, 0.6, 0.7);
  drawn.lights.push({ ...a.head, color: a.light, strength: (0.3 + 0.3 * a.pulse) * a.shown, reachPx: cell * 1.8 });
  return drawn;
}

/** How long after the first thump of a heart its second comes, as a share of the beat. */
const SECOND_THUMP_AT = 0.24;
/** How long the hearts thrown off as a charm takes hold fly, in seconds. */
const HEARTS_FLY_S = 0.45;

/** A charm: see the header. */
export function drawCharm(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'charm');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const rose = a.light;
  const blush = mixColor(a.light, '#ffffff', 0.6);
  const salt = stage.seed % 71;
  const near = cell * 0.6;
  const second = a.phase >= SECOND_THUMP_AT ? 0.75 * Math.exp(-(a.phase - SECOND_THUMP_AT) * 7) : 0;
  const thump = Math.max(a.pulse, a.since >= 0 ? second : 0);
  drawn.floor.push(floorMark('disc', a.floor, cell * 1.15, 1, rose, (0.28 + 0.2 * thump) * a.shown, 'light', 0));
  if (a.since >= 0) {
    drawn.floor.push(
      floorMark('ring', a.floor, cell * (0.4 + 1 * a.phase), 0.08, blush, 0.8 * (1 - a.phase) * a.shown, 'light', 0)
    );
  }
  bodyVeil(drawn, a, mixColor(rose, a.dark, 0.3), 0.16 + 0.18 * thump);

  for (let index = 0; index < countOf(a, 8); index++) {
    const turn = scatter(index, salt) * Math.PI * 2 + t * 0.5;
    const out = cell * (0.45 + 0.3 * scatter(index, salt + 1));
    const at = {
      x: a.foot.x + Math.cos(turn) * out,
      y: a.foot.y + Math.sin(turn) * out,
      z: a.foot.z + a.tall * (0.2 + 0.9 * scatter(index, salt + 2)),
    };
    const twinkle = Math.max(0, Math.sin(t * 5 + index * 2.4));
    drawn.motes.push({ ...glow(at, cell * 0.34, blush, twinkle * a.shown, cell * 0.4), shape: 'star', spin: index });
  }

  for (let index = 0; index < countOf(a, 7); index++) {
    const { life, round } = roundOf(t, 1.5, scatter(index, salt + 5));
    const turn = scatter(index + round * 5, salt + 7) * Math.PI * 2;
    const from = onBody(a, turn, 0.25 + 0.45 * scatter(index + round, salt + 9), 0.42);
    const at = {
      x: from.x + Math.sin(life * 7 + index) * cell * 0.07,
      y: from.y + Math.cos(life * 6 + index) * cell * 0.07,
      z: from.z + life * cell * 0.7,
    };
    const size = cell * (0.2 + 0.14 * scatter(index, salt + 11)) * popIn(life * 1.5, 0.2);
    drawn.motes.push(
      sign('heart', at, size, index % 2 ? blush : rose, Math.min(1, (1 - life) * 3) * a.shown, a.over + 2 + index, {
        spin: Math.sin(life * 8 + index) * 0.3,
      })
    );
  }

  const beats = popIn(a.since) * (1 + 0.2 * thump);
  if (beats > 0) {
    const hung = byHead(a, SIGN_RIGHT, SIGN_UP + Math.sin(t * 2.4) * 0.02);
    const size = cell * SIGN_SIZE * beats;
    drawn.motes.push(
      sign('heart', hung.at, cell * SIGN_SIZE * (1 + 1.2 * a.phase), blush, 0.5 * (1 - a.phase) * a.shown, near, {
        aside: hung.aside,
      })
    );
    litSign(drawn, 'heart', hung.at, size, rose, rose, a.shown, near + 1, { aside: hung.aside });
    drawn.motes.push({
      ...ball(hung.at, size * 0.16, '#ffffff', 0.75 * a.shown, near + 5, 0),
      aside: { right: hung.aside.right - size * 0.17, up: hung.aside.up + size * 0.2 },
    });
  }
  if (a.since >= 0 && a.since < HEARTS_FLY_S) {
    const flown = a.since / HEARTS_FLY_S;
    for (let index = 0; index < 6; index++) {
      const way = (index / 6) * Math.PI * 2 + salt;
      const far = cell * 0.9 * outCubic(flown);
      const at = {
        x: a.head.x + Math.cos(way) * far,
        y: a.head.y + Math.sin(way) * far,
        z: a.head.z + cell * 0.4 * Math.sin(flown * Math.PI) * scatter(index, salt + 13),
      };
      drawn.motes.push(sign('heart', at, cell * 0.28, blush, (1 - flown) * a.shown, near + 6));
    }
  }
  takeHold(drawn, a, blush, 0.8, 0.8);
  drawn.lights.push({ ...a.head, color: rose, strength: (0.35 + 0.45 * thump) * a.shown, reachPx: cell * 2 });
  return drawn;
}
