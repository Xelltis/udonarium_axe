import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { type BlackFlame, type DarkTones, flowMote, layBlackFlames } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';
import { hueTone } from '@axe/domain/effect/scene/space/space-bold';

/*
 * The pit of an abyss: a mire churning black and violet, darker and darker towards its middle, its
 * face whirled round in streaks and bubbling black; a rim of torn earth standing round it that sinks
 * into it pull by pull, sliding in and down, the floor about it split; and as it shuts, a geyser of
 * black fire thrown up over the whole of it and earth flung out of it.
 */

/** The earth of the rim, and its torn face. */
const EARTH = '#3e3029';
const EARTH_LIT = '#7a6450';
/** How many slabs of earth stand round the rim. */
const RIM_SLABS = 16;

/** The colours of an abyss: its black, a deep violet, its burning edge in full colour, a hotter glow beside it, and its pale. */
export function abyssTonesOf(light: string, deep: string): DarkTones {
  return {
    ink: hueTone(deep, 0.04, 0.6),
    deep: hueTone(deep, 0.2, 0.9),
    edge: hueTone(deep, 0.45, 1),
    glow: hueTone(deep, 0.62, 1, 0.06),
    pale: hueTone(light, 0.88, 1),
  };
}

/** The pit darkening towards its middle, as open as `open`: black within black, as deep as it goes. */
export function layPitDepth(drawn: Staged, floor: Point, reach: number, tones: DarkTones, open: number): void {
  if (open <= 0.01) return;
  drawn.floor.push(floorMark('disc', floor, reach * 0.95 * open, 1, tones.deep, 0.75, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, reach * 0.72 * open, 1, tones.ink, 0.7, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, reach * 0.45 * open, 1, '#000000', 0.65, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, reach * 0.22 * open, 1, '#000000', 0.75, 'color', 0));
}

/**
 * The face of the mire churning: streaks of violet whirled round it, faster towards its middle, and
 * bubbles of black swelling up out of it and bursting, as much as `shown`.
 */
export function drawChurn(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  cell: number,
  t: number,
  shown: number,
  seed: number,
  forward: number
): void {
  if (shown <= 0.01) return;
  for (let streak = 0; streak < 18; streak++) {
    const out = reach * (0.15 + 0.72 * ((streak * 0.618 + (seed % 7) * 0.1) % 1));
    const turn = streak * 2.39996 + t * (2.4 * (reach / Math.max(out, cell * 0.5)) ** 0.5);
    const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.03 };
    drawn.motes.push(
      flowMote(
        'wisp',
        root,
        { x: -Math.sin(turn), y: Math.cos(turn), z: 0.04 },
        cell * (0.35 + 0.2 * (streak % 3)),
        cell * (0.9 + 0.5 * (streak % 4)),
        t * 3 + streak,
        {
          color: streak % 2 === 0 ? tones.edge : tones.deep,
          core: streak % 2 === 0 ? tones.glow : tones.ink,
          alpha: 0.85 * shown,
          variant: streak,
          forward: forward * 0.2,
        }
      )
    );
  }
  for (let bubble = 0; bubble < 10; bubble++) {
    const life = 0.55 + 0.25 * ((bubble * 0.37) % 1);
    const age = (t / life + bubble * 0.29) % 1;
    const turn = bubble * 1.7 + Math.floor(t / life + bubble * 0.29) * 2.3;
    const out = reach * (0.12 + 0.6 * ((bubble * 0.53 + Math.floor(t / life)) % 1));
    const at = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.08 };
    if (age < 0.8) {
      const swell = cell * (0.18 + 0.32 * age);
      drawn.motes.push({
        ...at,
        z: at.z + swell * 0.3,
        size: swell,
        color: tones.ink,
        core: tones.edge,
        alpha: shown,
        blend: 'color',
        shape: 'blaze',
        velocity: { x: 0, y: 0, z: 100 },
        trail: (swell * 0.2) / 100,
        spin: t * 2 + bubble,
        variant: bubble,
        forward: forward * 0.3,
      });
    } else {
      const burst = (age - 0.8) / 0.2;
      drawn.floor.push(
        floorMark('ring', at, cell * (0.2 + 0.4 * burst), 0.25, tones.edge, shown * (1 - burst), 'color', 0)
      );
    }
  }
}

/**
 * The rim of torn earth standing round the pit, slabs leaning in over it, sinking a little at every
 * pull and sliding in and down, more of them gone the longer it drags, until it shuts and they are
 * dragged under all at once; and the floor about it split in fissures.
 */
export function drawSinkingRim(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  cell: number,
  t: number,
  opened: number,
  sunk: number,
  gone: number,
  seed: number,
  forward: number
): void {
  if (opened <= 0.01 || gone >= 1) return;
  const next = seededRun(seed * 13 + 3);
  for (let slab = 0; slab < RIM_SLABS; slab++) {
    const turn = (slab / RIM_SLABS) * Math.PI * 2 + (next() - 0.5) * 0.3;
    const tall = cell * (0.45 + 0.4 * next());
    const wide = cell * (0.38 + 0.2 * next());
    const lean = 0.5 + 0.4 * next();
    const own = Math.min(1, sunk * (0.6 + 0.8 * next()));
    const out = reach * (1.02 - 0.12 * own - 0.6 * gone) * opened;
    const root = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z - cell * 0.15 * own,
    };
    const long = tall * (1 - 0.65 * own) * (1 - gone) * opened;
    if (long < 1) continue;
    const slant = Math.hypot(lean, 1);
    const way = { x: (-Math.cos(turn) * lean) / slant, y: (-Math.sin(turn) * lean) / slant, z: 1 / slant };
    drawn.motes.push({
      x: root.x + way.x * long,
      y: root.y + way.y * long,
      z: root.z + way.z * long,
      size: wide,
      color: EARTH,
      core: mixColor(EARTH_LIT, tones.edge, 0.3),
      alpha: 1,
      blend: 'color',
      shape: 'crag',
      velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
      trail: Math.max(0, long - wide) / 100,
      spin: Math.floor(30 * own) + 0.35,
      variant: slab,
      forward: forward * 0.5,
    });
  }
  if (gone > 0) return;
  for (let split = 0; split < 8; split++) {
    const turn = (split / 8) * Math.PI * 2 + (seed % 5) * 0.4;
    const at = {
      x: floor.x + Math.cos(turn) * reach * 1.18,
      y: floor.y + Math.sin(turn) * reach * 1.18,
      z: floor.z,
    };
    drawn.floor.push(
      floorMark('fissure', at, cell * 0.9 * opened, 0.22, tones.ink, 0.95 * opened, 'color', split + seed, -turn)
    );
    drawn.floor.push(
      floorMark(
        'fissure',
        at,
        cell * 0.9 * opened,
        0.08,
        tones.edge,
        opened * (0.6 + 0.4 * Math.sin(t * 9 + split)),
        'color',
        split + seed,
        -turn
      )
    );
  }
}

/**
 * The geyser of black fire thrown up over the whole pit as it shuts, highest at its middle, and the
 * earth flung out of it, `since` it shut.
 */
export function drawGeyser(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  cell: number,
  since: number,
  seed: number,
  forward: number
): void {
  if (since < 0 || since >= 1.4) return;
  const next = seededRun(seed * 31 + 17);
  if (since < 0.8) {
    const dying = 1 - within(since, 0.35, 0.8);
    const flames: BlackFlame[] = [];
    for (let index = 0; index < 16; index++) {
      const turn = index * 2.39996 + next();
      const out = reach * 0.62 * Math.sqrt((index + 0.5) / 16);
      const middle = 1 - out / (reach * 0.7);
      flames.push({
        root: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
        heading: { x: Math.cos(turn) * 0.2, y: Math.sin(turn) * 0.2, z: 1 },
        wide: cell * (0.55 + 0.35 * next()) * (0.6 + 0.4 * dying),
        long: cell * (1.6 + 2.2 * middle + next()) * outCubic(within(since, 0, 0.14)) * dying,
        flowed: since * 4 + index,
        variant: index,
        alpha: Math.min(1, dying * 3),
      });
    }
    layBlackFlames(drawn, flames, tones, forward);
  }
  for (let clod = 0; clod < 18; clod++) {
    const turn = next() * Math.PI * 2;
    const fast = cell * (2.5 + 3.5 * next());
    const up = cell * (3 + 4 * next());
    const from = reach * 0.5 * next();
    const size = cell * (0.14 + 0.12 * next());
    const z = up * since - 6.5 * cell * since * since;
    if (z < -cell * 0.05) continue;
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * (from + fast * since),
      y: floor.y + Math.sin(turn) * (from + fast * since),
      z: floor.z + cell * 0.1 + z,
      size,
      color: clod % 3 === 0 ? tones.ink : EARTH,
      alpha: 1,
      blend: 'color',
      shape: 'chunk',
      spin: since * 9 + clod,
      variant: clod,
      forward,
    });
  }
}
