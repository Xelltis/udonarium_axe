import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
function heaviestCastOf(kind: EffectKind): { preset: EffectPreset; cast: EffectCast } {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = 3;
  preset.durationMs = 1500;
  preset.staggerMs = 100;
  if (kind === 'projectile') {
    preset.shots = 6;
    preset.shotInterval = 110;
  }
  const targets = [0, 1, 2, 3].map((index) => ({
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

/** Every frame of the heaviest cast of every kind, every 40 milliseconds from its start until it has cleared. */
function everyFrame(visit: (kind: EffectKind, drawn: Staged, cast: EffectCast) => void): void {
  for (const kind of EFFECT_KINDS) {
    const { preset, cast } = heaviestCastOf(kind);
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

  it('keeps the heaviest cast of every kind within what the scene draws in a frame', () => {
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
    for (const kind of EFFECT_KINDS) {
      const { preset, cast } = heaviestCastOf(kind);
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
