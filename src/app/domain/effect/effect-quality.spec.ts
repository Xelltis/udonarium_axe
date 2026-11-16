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
 * and blows of wind, of earth and of ice; those chosen by its grade or laid out over an area, the lights
 * that smite, a sanctuary, the ice that strikes and the bolts of lightning; and those chosen by how many it strikes, a
 * current held on one target, and a storm on six, as many as the bundled one takes; a great beam on
 * two and on three, where each keeps more of its detail, the beam of many hues, a laser as long as the
 * bundled one, and the shots of a blaster; the rounds of guns, a long burst of heavy ones among them,
 * a sniper's shot, arrows, missiles in a swarm and a cruise missile, the shots of spirit, of a curse and
 * of holy light, and a rain of arrows on as many as the bundled one takes and on few enough to fall
 * doubled; and the looks that bless, each healing, cleansing, barrier and aura on as many as the
 * bundled one takes; the greatest fire over an area on eight, as long as the bundled one; the blows of
 * a strike by their grades, each on as many as the bundled one takes and as long as it plays; a cleave
 * and a drawing cut, and a great sword of earth on four and one of ice on three, each target off the
 * line to the first taking a torrent of its own; the looks of darkness by their grades, a mire and an
 * eclipse over an area on
 * eight, a draining on three, and a great blade that lands in a black sphere; and the looks of space
 * and time by their grades, a blink and a summoning, a crush on six and a singularity over an area on
 * eight; a rift on three and a quake over an area on eight, a breath of sand, sickles of wind on
 * four, waves of the void, a storm over an area on eight, and a great blade of wind. The last of each
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
  ['projectile', { impactKind: 'frost' }],
  ['frost', { grade: 1 }],
  ['frost', { grade: 2 }],
  ['frost', { targeting: 'multi', maxTargets: 8, areaRadius: 3 }],
  ['vortex', { tagName: '氷', grade: 2 }],
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
  ['quake', { grade: 2, durationMs: 2691, staggerMs: 140 }, 3],
  ['quake', { targeting: 'multi', maxTargets: 8, areaRadius: 3, durationMs: 5042, staggerMs: 0 }, 8],
  ['breath', { tagName: '土', durationMs: 4493 }],
  ['slash', { tagName: '風', slashStyle: 'combo', grade: 2, durationMs: 2712, staggerMs: 160 }],
  ['projectile', { projectileStyle: 'crescent', impactKind: 'vortex', tagName: '風', durationMs: 1000 }],
  ['vortex', { moteStyle: 'arc', targeting: 'multi', maxTargets: 8, areaRadius: 3, durationMs: 3318, staggerMs: 0 }, 8],
  ['skyblade', { impactKind: 'vortex', tagName: '風', durationMs: 3000 }],
  ['projectile', { projectileStyle: 'bullet', impactKind: 'rubble', shots: 14, shotInterval: 70, durationMs: 1300 }],
  ['projectile', { projectileStyle: 'missile', impactKind: 'burst' }],
  ['projectile', { projectileStyle: 'bullet', impactKind: 'impact', shots: 10, shotInterval: 90 }],
  ['projectile', { projectileStyle: 'bullet', impactKind: 'rubble', shots: 1 }],
  ['projectile', { projectileStyle: 'tracer', impactKind: 'impact', shots: 1, durationMs: 620 }],
  ['projectile', { projectileStyle: 'arrow', impactKind: 'impact' }],
  ['projectile', { projectileStyle: 'arrow', impactKind: 'impact', grade: 2, shots: 5, shotInterval: 150 }],
  [
    'projectile',
    { projectileStyle: 'missile', impactKind: 'burst', grade: 2, shots: 12, shotInterval: 95, durationMs: 2100 },
    3,
  ],
  ['projectile', { projectileStyle: 'cruise', impactKind: 'burst', shots: 1, durationMs: 2600 }],
  ['projectile', { impactKind: 'impact', tagName: '射撃' }],
  ['projectile', { impactKind: 'miasma', tagName: '射撃' }],
  ['projectile', { impactKind: 'smite', tagName: '聖' }],
  ['arrowrain', { durationMs: 2400 }, 5],
  ['arrowrain', { durationMs: 2400 }, 2],
  ['heal', { grade: 1 }],
  ['heal', { grade: 2, durationMs: 2142 }, 6],
  ['heal', { grade: 3, durationMs: 3605 }, 8],
  ['heal', { grade: 1, moteStyle: 'cleanse', durationMs: 2429 }, 6],
  ['heal', { grade: 2, moteStyle: 'cleanse', durationMs: 2351 }, 6],
  ['barrier', { grade: 2, durationMs: 1080 }, 6],
  ['barrier', { grade: 3, durationMs: 1176 }, 6],
  ['aura', { grade: 2, durationMs: 2064 }, 6],
  ['mushroom', { durationMs: 10606, areaRadius: 4 }, 8],
  ['aura', { grade: 3, durationMs: 2560 }, 1],
  ['bash', { grade: 1, durationMs: 1056 }, 1],
  ['bash', { grade: 2, durationMs: 1080, staggerMs: 90 }, 3],
  ['bash', { grade: 3, durationMs: 2880, staggerMs: 110 }],
  ['slash', { slashStyle: 'heavy', durationMs: 2256, staggerMs: 110 }],
  ['slash', { slashStyle: 'iai', grade: 2, durationMs: 2612 }],
  ['skyblade', { impactKind: 'upheaval', durationMs: 3000, staggerMs: 140 }],
  ['skyblade', { impactKind: 'frost', durationMs: 3000, staggerMs: 140 }, 3],
  ['warp', { grade: 1, durationMs: 1411 }],
  ['warp', { grade: 3, durationMs: 3553 }],
  ['gravity', { grade: 2, durationMs: 1855 }, 6],
  ['gravity', { targeting: 'multi', maxTargets: 8, areaRadius: 3, durationMs: 3788 }, 8],
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

/** How long a test that stages every frame may take, on a machine a good deal slower than the one it was written on. */
const EVERY_FRAME_TIMEOUT_MS = 180_000;

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

  it(
    'keeps the heaviest cast of every kind and look within what the scene draws in a frame',
    () => {
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
    },
    EVERY_FRAME_TIMEOUT_MS
  );

  it(
    `draws nothing further than ${FARTHEST_CELLS} cells from the targets and the caster, nor below the floor`,
    () => {
      const astray = new Set<string>();
      everyFrame((kind, drawn, cast) => {
        const anchors = [...cast.targets, cast.origin!];
        const farthest = (FARTHEST_CELLS * CELL) ** 2;
        const check = (x: number, y: number, z: number) => {
          let near = Infinity;
          for (const anchor of anchors) near = Math.min(near, (x - anchor.x) ** 2 + (y - anchor.y) ** 2);
          if (near > farthest) astray.add(`${kind} far`);
          if (z < -DEEPEST_CELLS * CELL) astray.add(`${kind} below`);
        };
        for (const mote of drawn.motes) check(mote.x, mote.y, mote.z);
        for (const ribbon of drawn.ribbons) for (const point of ribbon.points) check(point.x, point.y, point.z);
        for (const mark of drawn.floor) check(mark.x, mark.y, 0);
      });

      expect([...astray]).toEqual([]);
    },
    EVERY_FRAME_TIMEOUT_MS
  );

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
