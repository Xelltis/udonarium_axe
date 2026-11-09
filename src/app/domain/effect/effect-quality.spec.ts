import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { EFFECT_KINDS } from '@axe/domain/effect/effect-kind';
import { effectParticles } from '@axe/domain/effect/effect-particles';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

/** The most particles one canvas of an effect may draw in a frame, which a slow machine still draws in time. */
const MOST_PARTICLES = 400;

/** Every source of the effects' own drawing, not their specs. */
function sources(dir = resolve(process.cwd(), 'src/app/domain/effect'), found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) found.push(path);
  }
  return found;
}

/** Every frame of every kind at every grade, sampled through its playback. */
function everyFrame(visit: (kind: string, layer: ReturnType<typeof effectParticles>) => void): void {
  for (const kind of EFFECT_KINDS) {
    for (const grade of [1, 2, 3]) {
      const preset = new EffectPreset('preset');
      preset.kind = kind;
      preset.grade = grade;
      preset.impactKind = 'nova';
      for (let step = 0; step <= 40; step++) visit(kind, effectParticles(preset, 11, step / 40, 50));
    }
  }
}

describe('the quality of the effects', () => {
  it('draws nothing from unseeded randomness, so every seat draws the same frame', () => {
    const unseeded = sources().filter((path) => /Math\.random\s*\(/.test(readFileSync(path, 'utf-8')));

    expect(unseeded).toEqual([]);
  });

  it('draws no particle past the edge of its canvas, where it would be cut off in a hard line', () => {
    const spilling = new Set<string>();
    everyFrame((kind, layer) => {
      for (const particle of layer.particles) {
        const reach = (particle.size * Math.max(1, particle.stretch)) / 2;
        const x = layer.originX + particle.x;
        const y = layer.originY + particle.y;
        const inside = x - reach >= 0 && y - reach >= 0 && x + reach <= layer.width && y + reach <= layer.height;
        if (!inside && particle.alpha > 0.01) spilling.add(kind);
      }
    });

    expect([...spilling]).toEqual([]);
  });

  it(`draws no more than ${MOST_PARTICLES} particles in a frame of any kind at any grade`, () => {
    const crowded = new Set<string>();
    everyFrame((kind, layer) => {
      if (layer.particles.length > MOST_PARTICLES) crowded.add(kind);
    });

    expect([...crowded]).toEqual([]);
  });
});
