import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { floorMark, glow, haze, lightBall, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';
import { layFloorRing, scatterOf, type SpaceTones } from '@axe/domain/effect/scene/space/space-parts';

/*
 * What a blink leaves as its seam snaps shut: a cross of white light, the air rushing in over the
 * floor, an afterimage tearing away in lines, and glints drifting down over a fading mark.
 */

/** How long the afterimage stays, and how long the glints drift down, in seconds after the snap. */
const AFTERIMAGE_S = 0.75;
const GLINTS_S = 1.7;

/** How wide the piece a stage plays on is, in table pixels: a cell where it is not told. */
export function widthOf(stage: Stage): number {
  return stage.targets.find((target) => target.index === stage.index)?.widthPx ?? stage.cell;
}
/** The snap: a cross of white light where the seam shut, the floor lit, and the air rushing in over the floor in a ring. */
export function drawSnap(
  drawn: Staged,
  stage: Stage,
  chest: Point,
  floor: Point,
  tones: SpaceTones,
  since: number,
  forward: number
): void {
  const { cell, tall } = stage;
  if (since < 0.1) {
    const left = 1 - since / 0.1;
    drawn.motes.push({
      ...glow(chest, cell * 0.3, '#ffffff', left, forward + 4),
      shape: 'flare',
      trail: 24,
      spin: Math.PI / 2,
    });
    drawn.motes.push({ ...glow(chest, cell * 0.24, '#ffffff', left, forward + 4), shape: 'flare', trail: 14, spin: 0 });
    drawn.motes.push(lightBall(chest, cell * 0.8 * left, '#ffffff', 1, forward + 3));
    drawn.floor.push(floorMark('disc', floor, cell * 2.4, 1, tones.glow, 0.4 * left, 'light', 0));
  }
  if (since < 0.35) {
    const left = 1 - since / 0.35;
    drawn.motes.push(glow(chest, cell * (1.6 + 1.6 * (1 - left)), tones.glow, 0.7 * left, forward));
    drawn.motes.push(...starBurst(chest, cell * 2.4, tones.glow, since / 0.35, forward + 3, 8, stage.seed % 7));
    drawn.lights.push({ ...chest, color: tones.glow, strength: 1.7 * left, reachPx: cell * 3.4 });
    drawn.motes.push({
      ...glow(chest, cell * 0.12 * left, tones.pale, left, forward + 4),
      shape: 'flare',
      trail: (tall * 2.2) / Math.max(1, cell * 0.12 * left),
      spin: Math.PI / 2,
    });
  }
  const rushes = within(since, 0, 0.16);
  if (rushes < 1) {
    const radius = cell * (0.25 + 1.75 * (1 - rushes * rushes));
    layFloorRing(drawn, floor, radius, 0.12, tones, 0.3 + 0.7 * rushes);
    for (let gust = 0; gust < 10; gust++) {
      const turn = (gust / 10) * Math.PI * 2 + stage.seed;
      const out = radius * (1 + 0.15 * scatterOf(gust, 2));
      const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.05 };
      drawn.motes.push({
        ...root,
        size: cell * 0.2,
        color: '#8a7a68',
        core: '#c9b896',
        alpha: 0.7 * (1 - rushes),
        blend: 'color',
        shape: 'gust',
        velocity: { x: -Math.cos(turn) * 100, y: -Math.sin(turn) * 100, z: 0 },
        trail: (cell * 0.7) / 100,
        spin: since * 4 + gust,
        variant: gust,
        forward,
      });
    }
  }
  const bounce = within(since, 0.12, 0.7);
  if (bounce > 0 && bounce < 1) {
    const left = 1 - bounce;
    const radius = cell * (0.3 + 2 * outCubic(bounce));
    layFloorRing(drawn, floor, radius, 0.1 * left + 0.03, tones, left);
  }
  if (since >= 0.1 && since < 1.1) {
    const age = within(since, 0.1, 1.1);
    for (let puff = 0; puff < 5; puff++) {
      const turn = puff * 1.26 + stage.seed;
      const out = cell * (0.15 + 0.35 * age);
      drawn.motes.push(
        smokePuff(
          {
            x: floor.x + Math.cos(turn) * out,
            y: floor.y + Math.sin(turn) * out,
            z: floor.z + cell * (0.15 + 0.35 * age),
          },
          cell * (0.35 + 0.4 * age),
          '#9a8c7c',
          0.45 * Math.min(1, age * 6) * (1 - age),
          forward
        )
      );
    }
  }
}

/** The afterimage the piece leaves: a ghost of light where it stood, tearing away sideways in lines. */
export function drawAfterimage(
  drawn: Staged,
  stage: Stage,
  chest: Point,
  tones: SpaceTones,
  since: number,
  forward: number
): void {
  if (since < 0.04 || since >= AFTERIMAGE_S) return;
  const { cell, tall } = stage;
  const left = 1 - since / AFTERIMAGE_S;
  const halfWide = Math.max(cell * 0.5, widthOf(stage) * 0.45);
  for (let step = -2; step <= 2; step++) {
    drawn.motes.push({
      ...haze(chest, halfWide * 1.6, tones.edge, 0.32 * left * left, forward),
      aside: { right: 0, up: (step / 2.5) * tall * 0.45 },
    });
  }
  for (let line = 0; line < 9; line++) {
    const up = (scatterOf(line, 23) - 0.5) * tall * 0.95;
    const drift = (scatterOf(line, 29) - 0.5) * 2;
    const torn = since * cell * (1.2 + 2.4 * Math.abs(drift)) * Math.sign(drift);
    const long = halfWide * (1 + 1.2 * scatterOf(line, 31));
    const alpha = Math.min(1, left * 1.6) * (0.7 + 0.3 * Math.sin(since * 40 + line));
    drawn.motes.push({
      ...glow(chest, cell * 0.4, tones.glow, 0.8 * alpha, forward + 2),
      shape: 'flare',
      trail: long / (cell * 0.4),
      spin: 0,
      aside: { right: torn, up },
    });
    drawn.motes.push({
      ...haze(chest, cell * 0.28, tones.deep, alpha, forward + 1),
      shape: 'flare',
      trail: long / (cell * 0.28),
      spin: 0,
      aside: { right: torn, up },
    });
    drawn.motes.push({
      ...haze(chest, cell * 0.13, '#ffffff', alpha, forward + 2),
      shape: 'flare',
      trail: long / (cell * 0.13),
      spin: 0,
      aside: { right: torn, up },
    });
  }
}

/** Glints of light drifting down where the seam was, and the mark it leaves on the floor fading. */
export function drawGlints(
  drawn: Staged,
  stage: Stage,
  chest: Point,
  floor: Point,
  tones: SpaceTones,
  since: number,
  forward: number
): void {
  const { cell, tall } = stage;
  if (since < 0 || since >= GLINTS_S) return;
  const fading = 1 - within(since, GLINTS_S * 0.5, GLINTS_S);
  const marked = { seed: stage.seed % 13, turn: since * 0.8 };
  const fresh = fading * (1 - within(since, 0, 1.2));
  drawn.floor.push(
    floorMark('sigil', floor, cell * 0.85, 0.16, tones.glow, 0.7 * fresh, 'light', marked.seed, marked.turn)
  );
  drawn.floor.push(
    floorMark('sigil', floor, cell * 0.85, 0.08, tones.deep, 0.75 * fading, 'color', marked.seed, marked.turn)
  );
  drawn.floor.push(floorMark('sigil', floor, cell * 0.85, 0.03, tones.pale, fading, 'color', marked.seed, marked.turn));
  for (let glint = 0; glint < 16; glint++) {
    const born = scatterOf(glint, 37) * 0.5;
    const age = (since - born) / (GLINTS_S - born);
    if (age < 0 || age >= 1) continue;
    const turn = scatterOf(glint, 41) * Math.PI * 2 + age * 2;
    const out = cell * (0.15 + 0.7 * scatterOf(glint, 43)) * (0.4 + 0.6 * age);
    const at = {
      x: chest.x + Math.cos(turn) * out,
      y: chest.y + Math.sin(turn) * out,
      z: Math.max(floor.z + cell * 0.05, chest.z + tall * (0.6 * scatterOf(glint, 47) - 0.1) - tall * 0.8 * age),
    };
    drawn.motes.push({
      ...glow(
        at,
        cell * (0.08 + 0.05 * Math.sin(since * 17 + glint)),
        glint % 2 === 0 ? '#ffffff' : tones.pale,
        (1 - age) * 0.95,
        forward
      ),
      shape: 'star',
      spin: glint + since,
    });
  }
}
