import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActiveEffectCast, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectReactionService } from '@axe/application/effect/effect-reaction.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('EffectReactionService', () => {
  const casts = signal<ActiveEffectCast[]>([]);
  const now = signal(0);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: EffectPlaybackService, useValue: { activeCasts: casts, now } }],
    });
    vi.spyOn(TestBed.inject(TabletopService), 'gridSize').mockReturnValue(50);
  });

  afterEach(() => {
    casts.set([]);
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('throws the body of a part an effect strikes, as the part is drawn as its body', () => {
    const dragon = GameCharacter.create('ドラゴン', 3, '');
    dragon.setLocation('table');
    const head = GameCharacter.create('頭', 1, '');
    head.setLocation('table');
    head.ridingOn = dragon.identifier;
    head.rideSeat = 'part';
    const preset = new EffectPreset('preset');
    preset.kind = 'bash';
    preset.grade = 2;
    preset.durationMs = 1000;
    const blows = effectBlowsOf(preset);
    casts.set([
      {
        key: 1,
        preset,
        startedAt: 0,
        blows,
        cast: {
          presetIdentifier: 'preset',
          casterIdentifier: 'caster',
          origin: { x: 0, y: 0, z: 0 },
          targets: [{ identifier: head.identifier, x: 100, y: 0, z: 0 }],
          seed: 1,
        },
      },
    ]);
    now.set(blows[0].atMs + blows[0].holdMs + 60);

    const jolts = TestBed.inject(EffectReactionService).jolts();

    expect(jolts.get(dragon.identifier)?.x).toBeGreaterThan(0);
    expect(jolts.has(head.identifier)).toBe(false);
    const once = jolts.get(dragon.identifier)!.x;

    casts.update(([active]) => [
      {
        ...active,
        cast: {
          ...active.cast,
          targets: [...active.cast.targets, { identifier: dragon.identifier, x: 100, y: 0, z: 0 }],
          // Struck together, as one blow.
        },
        preset: Object.assign(preset, { staggerMs: 0 }),
      },
    ]);

    expect(TestBed.inject(EffectReactionService).jolts().get(dragon.identifier)!.x).toBeCloseTo(once);
  });
});
