import type { EffectKind } from '@axe/domain/effect/effect-kind';
import { alongBlade } from '@axe/domain/effect/scene/blade/great-blade';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { glow, lightningPaths, type Point, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * What hangs about a great sword while it waits, by the look it will strike with, so that a sword
 * of each element is its own before it lands: flames licking up off a sword of fire, flakes of ice
 * sifting down off one of frost, sparks of lightning crawling along one of thunder, grit crumbling
 * off one of earth, a dark smoke sinking off one of shadow, and for any other, light twinkling
 * about it.
 */

/** A sword as it hangs: its point, the way from its point to its pommel, of length one, and how long it is, in table pixels. */
export interface HungBlade {
  readonly tip: Point;
  readonly axis: Point;
  readonly length: number;
}

/** A place a little way out from the sword, a share of the way up it and a turn round it. */
function beside(sword: HungBlade, share: number, turn: number, out: number): Point {
  const at = alongBlade(sword.tip, sword.axis, sword.length, share);
  return { x: at.x + Math.cos(turn) * out, y: at.y + Math.sin(turn) * out, z: at.z };
}

/** What hangs about a sword that will strike with a kind of look, at a moment; see the head of this file. */
export function drawBladeAura(
  drawn: Staged,
  kind: EffectKind,
  sword: HungBlade,
  cell: number,
  ramp: readonly string[],
  t: number,
  seed: number,
  alpha: number,
  forward: number
): void {
  if (alpha <= 0.01) return;
  const each = (
    count: number,
    every: number,
    draw: (index: number, age: number, share: number, turn: number) => void
  ) => {
    for (let index = 0; index < count; index++) {
      const age = (t / every + index / count + (seed % 13) / 13) % 1;
      draw(index, age, 0.08 + (((index * 7) % count) / count) * 0.62, index * 2.4 + seed);
    }
  };
  const seen = (age: number) => Math.sin(Math.PI * age) * alpha;
  switch (kind) {
    case 'flame':
      each(12, 0.7, (index, age, share) => {
        const side = index % 2 === 0 ? 1 : -1;
        const at = beside(sword, share + age * 0.12, index, sword.length * 0.07 * side);
        drawn.motes.push({
          ...glow(
            at,
            cell * (0.2 + 0.07 * (index % 3)) * (1 - age * 0.5),
            index % 3 === 0 ? ramp[4] : ramp[2],
            seen(age),
            forward
          ),
          blend: 'color',
          shape: 'tongue',
          velocity: { x: side * cell * 0.25, y: 0, z: cell * 1.5 },
          trail: 0.24,
          variant: index + t,
        });
      });
      return;
    case 'frost':
      each(12, 1.5, (index, age, share, turn) => {
        const at = beside(sword, share, turn, cell * (0.2 + 0.25 * age));
        drawn.motes.push({
          ...glow(
            { ...at, z: at.z - cell * 0.8 * age },
            cell * (0.11 + 0.05 * (index % 3)),
            index % 2 === 0 ? '#ffffff' : ramp[3],
            seen(age),
            forward
          ),
          blend: 'color',
          shape: 'flake',
          spin: t * (2 + (index % 3)) + index,
          variant: index,
        });
      });
      return;
    case 'bolt': {
      const flicker = Math.floor(t * 16);
      if (flicker % 3 === 0) return;
      for (let crackle = 0; crackle < 2; crackle++) {
        const from = 0.06 + ((flicker * 5 + crackle * 3) % 7) / 12;
        const { main } = lightningPaths(
          beside(sword, from, flicker + crackle, sword.length * 0.03),
          beside(sword, from + 0.34, flicker * 2 + crackle, sword.length * 0.09),
          seed + crackle,
          flicker,
          { bends: 6, jag: 0.3, forks: 0 }
        );
        drawn.ribbons.push({
          points: main,
          widths: cell * 0.055,
          color: ramp[2],
          core: '#ffffff',
          alpha,
          blend: 'color',
        });
      }
      return;
    }
    case 'upheaval':
    case 'rubble':
    case 'impact':
      each(9, 0.9, (index, age, share, turn) => {
        const at = beside(sword, share, turn, cell * 0.12);
        drawn.motes.push({
          x: at.x,
          y: at.y,
          z: at.z - cell * 1.1 * age * age,
          size: cell * (0.05 + 0.025 * (index % 3)),
          color: mixColor(ramp[1], '#5b4a3c', 0.5),
          alpha: Math.min(1, (1 - age) * 3) * alpha,
          blend: 'color',
          shape: 'chunk',
          spin: t * 9 + index,
          variant: index,
          forward,
        });
      });
      return;
    case 'miasma':
    case 'gravity':
    case 'curse':
      each(9, 1.6, (index, age, share, turn) => {
        const at = beside(sword, share, turn, cell * (0.1 + 0.3 * age));
        drawn.motes.push(
          smokePuff({ ...at, z: at.z - cell * 0.7 * age }, cell * (0.28 + 0.3 * age), ramp[0], 0.5 * seen(age), forward)
        );
      });
      return;
    default:
      each(7, 1.1, (index, age, share, turn) => {
        const at = beside(sword, share + 0.1, turn, cell * 0.38);
        drawn.motes.push({
          ...glow(
            { ...at, z: at.z + cell * 0.3 * age },
            cell * 0.2 * Math.sin(Math.PI * age),
            '#ffffff',
            seen(age),
            forward
          ),
          shape: 'star',
          spin: t * 2 + index,
        });
      });
  }
}
