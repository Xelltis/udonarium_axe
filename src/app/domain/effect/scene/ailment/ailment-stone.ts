import { afflictedOf, countOf, onBody, popIn, scatter, shaded } from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, lightningPaths, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * A turning to stone: a crust of grey plates climbing the piece from its feet, the edge of it
 * spitting grit as it climbs, until it closes over the head; there everything stops for an instant,
 * a glint runs up the stone, cracks run through it and across the floor, and flakes of it come away
 * and lie about the feet. The crust stands as long as the look lingers, then falls off in pieces.
 */

/** When the crust starts to climb, in seconds, and how its climb eases: slow off the floor and faster up the body. */
const CLIMBS_FROM_S = 0.05;
const CLIMB_EASE = 1.18;
/** How long after its playback the crust starts to fall away, and how long the falling takes, in seconds. */
const STANDS_ON_S = 0.12;
const FALLS_FOR_S = 0.46;
/** How hard a flake of stone falls, in cells a second squared. */
const FLAKE_FALL = 9;

/** A turning to stone: see the header. */
export function drawPetrify(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'petrify');
  const { cell, t } = a;
  const salt = stage.seed % 101;
  const stones = [a.light, mixColor(a.light, a.dark, 0.35), mixColor(a.light, a.dark, 0.6)];
  const dust = mixColor(a.light, '#8d8478', 0.5);
  const dark = shaded(a.dark, 0.6);
  const climbFor = Math.max(0.1, a.holdAt - CLIMBS_FROM_S);
  const climbed = within(t, CLIMBS_FROM_S, a.holdAt) ** CLIMB_EASE;
  const fallsAt = a.duration + STANDS_ON_S;
  const comesOn = outCubic(within(t, 0, 0.15));
  const stays = 1 - within(t, fallsAt + FALLS_FOR_S * 0.5, fallsAt + FALLS_FOR_S);
  if (stays <= 0) return drawn;

  drawn.floor.push(
    floorMark('disc', a.floor, cell * (0.6 + 0.5 * climbed), 1, stones[2], 0.45 * comesOn * stays, 'color', 0)
  );
  if (a.since >= 0) {
    const split = outCubic(within(a.since, 0, 0.25));
    drawn.floor.push(
      floorMark('cracks', a.floor, cell * (0.5 + 0.7 * split), 0.16, dark, 0.85 * stays, 'color', salt % 9)
    );
    const ringed = 1 - a.since / 0.4;
    if (ringed > 0) {
      drawn.floor.push(
        floorMark('ring', a.floor, cell * (0.4 + 1.2 * (1 - ringed)), 0.12, dust, 0.7 * ringed, 'color', 0)
      );
    }
  }
  drawn.motes.push(
    haze(onBody(a, 0, 0.45 * climbed, 0), Math.max(cell, a.tall) * 1.3, stones[2], 0.3 * climbed * stays, a.over)
  );

  const plates = countOf(a, 40);
  for (let index = 0; index < plates; index++) {
    const share = (index + 0.5 + 0.8 * (scatter(index, salt) - 0.5)) / plates;
    const appearsAt = CLIMBS_FROM_S + Math.max(0, share) ** (1 / CLIMB_EASE) * climbFor;
    const age = t - appearsAt;
    if (age < 0) continue;
    const turn = scatter(index, salt + 1) * Math.PI * 2;
    const at = onBody(a, turn, Math.min(1.02, Math.max(0.02, share) * 1.02), 0.05 + 0.2 * scatter(index, salt + 2));
    const letsGo = t - (fallsAt + FALLS_FOR_S * 0.5 * scatter(index, salt + 3));
    const dropped = letsGo > 0 ? 0.5 * FLAKE_FALL * cell * letsGo * letsGo : 0;
    const fresh = Math.max(0, 1 - age / 0.16);
    const tone = stones[index % 3];
    drawn.motes.push({
      x: at.x + (letsGo > 0 ? Math.cos(turn) * cell * 0.5 * letsGo : 0),
      y: at.y + (letsGo > 0 ? Math.sin(turn) * cell * 0.5 * letsGo : 0),
      z: Math.max(a.floor.z + cell * 0.04, at.z - dropped),
      size: cell * (0.19 + 0.09 * scatter(index, salt + 4)) * popIn(age, 0.12),
      color: fresh > 0 ? mixColor(tone, '#ffffff', 0.6 * fresh) : tone,
      alpha: 0.97 * stays,
      blend: 'color',
      shape: 'chunk',
      spin: scatter(index, salt + 5) * 6 + Math.max(0, letsGo) * 7,
      variant: index,
      forward: a.over,
      exactDepth: true,
    });
  }

  if (climbed > 0 && climbed < 1) {
    const edge = a.foot.z + a.tall * climbed;
    for (let index = 0; index < countOf(a, 9); index++) {
      const turns = t / 0.22 + scatter(index, salt + 7);
      const life = turns - Math.floor(turns);
      const way = scatter(index + Math.floor(turns) * 3, salt + 8) * Math.PI * 2;
      const fast = cell * (1.2 + 1.4 * scatter(index, salt + 9));
      const age = life * 0.22;
      drawn.motes.push({
        ...glow(
          {
            x: a.foot.x + Math.cos(way) * (cell * 0.3 + fast * age),
            y: a.foot.y + Math.sin(way) * (cell * 0.3 + fast * age),
            z: edge + cell * 0.6 * age - 0.5 * FLAKE_FALL * cell * age * age,
          },
          cell * 0.06,
          index % 2 ? '#ffffff' : a.light,
          (1 - life) * 0.95,
          a.over + 2
        ),
        shape: 'spark',
        velocity: { x: Math.cos(way) * fast, y: Math.sin(way) * fast, z: cell * 0.6 - FLAKE_FALL * cell * age },
        trail: 0.05,
      });
    }
    for (let index = 0; index < 3; index++) {
      const turn = (index / 3) * Math.PI * 2 + t * 2;
      drawn.motes.push(
        smokePuff(
          { x: a.foot.x + Math.cos(turn) * cell * 0.3, y: a.foot.y + Math.sin(turn) * cell * 0.3, z: edge },
          cell * 0.4,
          dust,
          0.45,
          a.over
        )
      );
    }
  }

  if (a.since >= 0) {
    const swept = a.since / 0.26;
    if (swept < 1) {
      const at = onBody(a, 0, swept, 0);
      drawn.motes.push({
        ...glow(at, cell * 0.16 * (1 - swept * 0.5), '#ffffff', 1 - swept, cell * 0.6),
        shape: 'flare',
        trail: 7,
        spin: 0.5,
      });
      drawn.motes.push(glow(at, cell * 1.2, '#ffffff', 0.5 * (1 - swept), cell * 0.6));
      drawn.lights.push({ ...at, color: '#ffffff', strength: 1.1 * (1 - swept), reachPx: cell * 2 });
    }
    for (let index = 0; index < 7; index++) {
      const run = within(a.since, 0.05 + index * 0.035, 0.2 + index * 0.035);
      if (run <= 0) continue;
      const turn = scatter(index, salt + 11) * Math.PI * 2;
      const from = onBody(a, turn, 0.12 + 0.78 * scatter(index, salt + 12), 0.1);
      const to = onBody(a, turn + 2.4, 0.12 + 0.78 * scatter(index, salt + 13), 0.1);
      const { main, forks } = lightningPaths(from, to, salt + index, 0, { bends: 6, jag: 0.22, forks: 1 });
      const points = main.slice(0, Math.max(2, Math.ceil(main.length * run)));
      drawn.ribbons.push({ points, widths: cell * 0.04, color: dark, alpha: 0.95 * stays, blend: 'color' });
      if (run >= 1) {
        drawn.ribbons.push({
          points: forks[0],
          widths: [cell * 0.03, cell * 0.02, 0],
          color: dark,
          alpha: 0.9 * stays,
          blend: 'color',
        });
      }
    }
    for (let index = 0; index < countOf(a, 9); index++) {
      const bornAt = 0.06 + 0.5 * scatter(index, salt + 15);
      const age = a.since - bornAt;
      if (age < 0) continue;
      const turn = scatter(index, salt + 16) * Math.PI * 2;
      const from = onBody(a, turn, 0.3 + 0.6 * scatter(index, salt + 17), 0.3);
      const out = cell * 0.5 * Math.min(age, 0.5);
      const z = from.z - 0.5 * FLAKE_FALL * cell * age * age;
      const lies = z <= a.floor.z + cell * 0.04;
      drawn.motes.push({
        x: from.x + Math.cos(turn) * out,
        y: from.y + Math.sin(turn) * out,
        z: Math.max(a.floor.z + cell * 0.04, z),
        size: cell * (0.09 + 0.07 * scatter(index, salt + 18)),
        color: stones[index % 3],
        alpha: stays,
        blend: 'color',
        shape: 'chunk',
        spin: lies ? index : age * 9 + index,
        variant: index + 50,
        forward: a.over,
      });
    }
  }
  return drawn;
}
