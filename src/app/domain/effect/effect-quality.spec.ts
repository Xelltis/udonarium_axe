import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AILMENT_LOOKS } from '@axe/domain/effect/ailment-looks';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EFFECT_KINDS, type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
/** How far from every target and the caster anything an effect draws may be, in cells: a ballistic missile's blast throws its fire furthest. */
const FARTHEST_CELLS = 10;
/** How far below the floor anything an effect draws may reach, in cells: a buried arrowhead, a sunk blade. */
const DEEPEST_CELLS = 0.4;

/** Every source of the effects' own drawing, not their specs. */
function sources(dir = resolve(process.cwd(), 'src/app/domain/effect'), found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) found.push(path);
  }
  return found;
}

/**
 * A cast of every kind at the highest grade on four targets, fired from off to one side: a volley of
 * six where it fires shots. The strongest a cast is usually made.
 */
function heaviestCastOf(kind: EffectKind, count = 4): { preset: EffectPreset; cast: EffectCast } {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = 3;
  preset.durationMs = 1500;
  preset.staggerMs = 100;
  if (kind === 'projectile') {
    preset.shots = 6;
    preset.shotInterval = 110;
  }
  const targets = Array.from({ length: count }, (_unused, index) => ({
    identifier: `t${index}`,
    x: 400 + index * 100,
    y: 300 + (index % 2) * 100,
    z: 0,
  }));
  return {
    preset,
    cast: { presetIdentifier: 'preset', casterIdentifier: '', origin: { x: 0, y: 0, z: 30 }, targets, seed: 3 },
  };
}

/**
 * The looks a kind takes that are chosen by its family or by the particles it names, which a cast of
 * the kind with neither never draws: each state of a curse, each element of a breath, and the shots
 * and blows of wind and of earth; those chosen by its grade or laid out over an area, the lights
 * that smite, a sanctuary and the bolts of lightning; and those chosen by how many it strikes, a
 * current held on one target, and a storm on six, as many as the bundled one takes; a great beam on
 * two and on three, where each keeps more of its detail, the beam of many hues, a laser as long as the
 * bundled one, and the shots of a blaster; the looks of darkness by their grades, a mire and an
 * eclipse over an area on eight, a draining on three, and a great blade that lands in a black
 * sphere. The last of each
 * is how many targets it is cast on, where that is not four.
 */
const CHOSEN_LOOKS: readonly (readonly [EffectKind, Partial<EffectPreset>, number?])[] = [
  ...[...AILMENT_LOOKS, 'arc', 'haze'].map((moteStyle) => ['curse', { moteStyle, durationMs: 5500 }] as const),
  ...(['spark', 'frost', 'arc', 'leaf', 'haze', 'none'] as const).map(
    (moteStyle) => ['breath', { moteStyle }] as const
  ),
  ['breath', { tagName: '状態異常' }],
  ['breath', { tagName: '回復' }],
  ['projectile', { tagName: '風' }],
  ['projectile', { tagName: '土' }],
  ['vortex', { tagName: '風', grade: 1 }],
  ['vortex', { tagName: '風' }],
  ['smite', { grade: 1 }],
  ['smite', { grade: 2 }],
  ['smite', { targeting: 'multi', maxTargets: 8, areaRadius: 3 }],
  ['sanctuary', { targeting: 'multi', maxTargets: 8, areaRadius: 3 }],
  ['bolt', { grade: 1 }],
  ['bolt', { grade: 2 }],
  ['bolt', { grade: 3, durationMs: 3048 }, 6],
  ['arc', { grade: 2 }, 1],
  ['arc', { grade: 3, staggerMs: 140 }, 5],
  ['projectile', { impactKind: 'bolt', tagName: '射撃' }],
  ['skyblade', { impactKind: 'bolt', durationMs: 3000 }],
  ['beam', { durationMs: 3344 }, 2],
  ['beam', { durationMs: 3344 }, 3],
  ['beam', { moteStyle: 'prism', durationMs: 3000 }],
  ['beam', { moteStyle: 'prism', durationMs: 3000 }, 2],
  ['raybeam', { durationMs: 2038 }],
  ['projectile', { projectileStyle: 'blaster', impactKind: 'impact' }],
  ['shadow', { grade: 1 }],
  ['shadow', { grade: 2 }],
  ['shadow', { targeting: 'multi', maxTargets: 8, areaRadius: 3, durationMs: 5042 }, 8],
  ['darkorb', { grade: 2, durationMs: 3788, staggerMs: 260 }],
  ['darkorb', { targeting: 'multi', maxTargets: 8, areaRadius: 3, durationMs: 4206 }, 8],
  ['drain', { grade: 2, durationMs: 3239, staggerMs: 120 }, 3],
  ['skyblade', { impactKind: 'darkorb', durationMs: 3000 }],
];

/** The heaviest cast of a kind, as one of the looks it is given by its family or its particles. */
function heaviestCastAs(
  kind: EffectKind,
  fields: Partial<EffectPreset>,
  count?: number
): { preset: EffectPreset; cast: EffectCast } {
  const heaviest = heaviestCastOf(kind, count);
  Object.assign(heaviest.preset, fields);
  return heaviest;
}

/** Every cast the checks are made on: the heaviest of every kind, and of every look chosen for one. */
function heaviestCasts(): { name: string; preset: EffectPreset; cast: EffectCast }[] {
  return [
    ...EFFECT_KINDS.map((kind) => ({ name: kind as string, ...heaviestCastOf(kind) })),
    ...CHOSEN_LOOKS.map(([kind, fields, count]) => ({
      name: `${kind} ${JSON.stringify(fields)}${count ? ` on ${count}` : ''}`,
      ...heaviestCastAs(kind, fields, count),
    })),
  ];
}

/** Every frame of the heaviest cast of every kind and look, every 40 milliseconds from its start until it has cleared. */
function everyFrame(visit: (kind: string, drawn: Staged, cast: EffectCast) => void): void {
  for (const { name: kind, preset, cast } of heaviestCasts()) {
    const ends = preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset);
    for (let ms = 0; ms <= ends; ms += 40) {
      const drawn = nothingStaged();
      stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
      visit(kind, drawn, cast);
    }
  }
}

describe('the quality of the effects', () => {
  it('draws nothing from unseeded randomness, so every seat draws the same frame', () => {
    const unseeded = sources().filter((path) => /Math\.random\s*\(/.test(readFileSync(path, 'utf-8')));

    expect(unseeded).toEqual([]);
  });

  it('keeps the heaviest cast of every kind and look within what the scene draws in a frame', () => {
    const over = new Set<string>();
    everyFrame((kind, drawn) => {
      for (const blend of ['light', 'color'] as const) {
        const motes = drawn.motes.filter((mote) => mote.blend === blend).length;
        const marks = drawn.floor.filter((mark) => mark.blend === blend).length;
        const points = drawn.ribbons
          .filter((ribbon) => ribbon.blend === blend)
          .reduce((sum, ribbon) => sum + ribbon.points.length, 0);
        if (motes > EFFECT_FRAME_BUDGET.motes) over.add(`${kind} motes`);
        if (marks > EFFECT_FRAME_BUDGET.marks) over.add(`${kind} marks`);
        if (points > EFFECT_FRAME_BUDGET.ribbonPoints) over.add(`${kind} ribbon points`);
      }
    });

    expect([...over]).toEqual([]);
  });

  it(`draws nothing further than ${FARTHEST_CELLS} cells from the targets and the caster, nor below the floor`, () => {
    const astray = new Set<string>();
    everyFrame((kind, drawn, cast) => {
      const anchors = [...cast.targets, cast.origin!];
      const points = [
        ...drawn.motes,
        ...drawn.ribbons.flatMap((ribbon) => ribbon.points),
        ...drawn.floor.map((mark) => ({ ...mark, z: 0 })),
      ];
      for (const point of points) {
        const near = Math.min(...anchors.map((anchor) => Math.hypot(point.x - anchor.x, point.y - anchor.y)));
        if (near > FARTHEST_CELLS * CELL) astray.add(`${kind} far`);
        if (point.z < -DEEPEST_CELLS * CELL) astray.add(`${kind} below`);
      }
    });

    expect([...astray]).toEqual([]);
  });

  it('draws the same frame at the same moment, whatever was drawn before it', () => {
    const differing: string[] = [];
    for (const { name: kind, preset, cast } of heaviestCasts()) {
      const at = (ms: number) => {
        const drawn = nothingStaged();
        stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
        return drawn;
      };
      const later = at(900);
      at(300);
      if (JSON.stringify(at(900)) !== JSON.stringify(later)) differing.push(kind);
    }

    expect(differing).toEqual([]);
  });
});
