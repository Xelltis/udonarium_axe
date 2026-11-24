import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActiveEffectCast, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { ModelActsService } from '@axe/application/tabletop/model-acts.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ModelActsService', () => {
  const casts = signal<ActiveEffectCast[]>([]);
  let acts: ModelActsService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: EffectPlaybackService, useValue: { activeCasts: casts } }],
    });
    acts = TestBed.inject(ModelActsService);
    await TestBed.inject(EffectSceneLooksService).load();
  });

  afterEach(() => {
    casts.set([]);
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function piece(name: string, x: number, y: number): GameCharacter {
    const made = GameCharacter.create(name, 1, '');
    made.setLocation('table');
    made.location.x = x;
    made.location.y = y;
    return made;
  }

  function playing(kind: string, caster: GameCharacter, target: GameCharacter, startedAt = 1000): ActiveEffectCast {
    const preset = new EffectPreset(`preset-${kind}`);
    preset.kind = kind;
    preset.grade = 2;
    preset.durationMs = 1000;
    return {
      key: 1,
      preset,
      startedAt,
      blows: effectBlowsOf(preset),
      cast: {
        presetIdentifier: preset.identifier,
        casterIdentifier: caster.identifier,
        origin: null,
        targets: [{ identifier: target.identifier, x: target.location.x, y: target.location.y, z: 0 }],
        seed: 1,
      },
    };
  }

  it('asks nothing of anybody while no effect is played', () => {
    expect(acts.acts().size).toBe(0);
  });

  it('has nobody act an effect until the looks of the effects are loaded, as nothing of an effect is drawn till then', () => {
    vi.spyOn(TestBed.inject(EffectSceneLooksService), 'looks').mockReturnValue(null);
    const knight = piece('騎士', 0, 0);
    const orc = piece('オーク', 200, 0);
    casts.set([playing('bash', knight, orc)]);

    expect(acts.acts().size).toBe(0);
  });

  it('has the one who cast an effect strike towards the one struck, from where its piece stands, and the one struck take the blow', () => {
    const knight = piece('騎士', 0, 0);
    const orc = piece('オーク', 200, 0);
    casts.set([playing('bash', knight, orc)]);

    expect(acts.acts().get(knight.identifier)).toMatchObject({ role: 'attack', atMs: 1000, toward: { x: 1, y: 0 } });
    const taken = acts.acts().get(orc.identifier);
    expect(taken).toMatchObject({ role: 'hit', toward: { x: -1, y: 0 } });
    expect(taken!.atMs).toBeGreaterThan(1000);
  });

  it('has the body of a part act what its part is asked to', () => {
    const knight = piece('騎士', 0, 0);
    const dragon = piece('ドラゴン', 200, 0);
    const head = piece('頭', 200, 0);
    head.ridingOn = dragon.identifier;
    head.rideSeat = 'part';
    casts.set([playing('bash', knight, head)]);

    expect(acts.acts().get(dragon.identifier)?.role).toBe('hit');
    expect(acts.acts().has(head.identifier)).toBe(false);
  });

  it('has a piece take a blow when asked outright, as when a number of it falls with no effect played', () => {
    const orc = piece('オーク', 0, 0);
    vi.spyOn(performance, 'now').mockReturnValue(5000);

    acts.strike(orc.identifier);

    expect(acts.acts().get(orc.identifier)).toMatchObject({ role: 'hit', atMs: 5000 });
  });

  it('does not strike again a piece an effect is striking, or one struck only just now, but does once a while has passed', () => {
    const knight = piece('騎士', 0, 0);
    const orc = piece('オーク', 200, 0);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1100);
    casts.set([playing('bash', knight, orc)]);
    const landed = acts.acts().get(orc.identifier);

    acts.strike(orc.identifier);
    expect(acts.acts().get(orc.identifier)).toBe(landed);

    casts.set([]);
    acts.strike(orc.identifier);
    const first = acts.acts().get(orc.identifier);
    now.mockReturnValue(1500);
    acts.strike(orc.identifier);
    expect(acts.acts().get(orc.identifier)).toBe(first);

    now.mockReturnValue(4000);
    acts.strike(orc.identifier);
    expect(acts.acts().get(orc.identifier)).not.toBe(first);
  });

  it('has a piece play one of its model’s own motions by name, each asking told apart from the last', () => {
    const orc = piece('オーク', 0, 0);

    acts.play(orc.identifier, 'Wave');
    const first = acts.acts().get(orc.identifier);
    acts.play(orc.identifier, 'Wave');

    expect(first).toMatchObject({ role: 'named', name: 'Wave' });
    expect(acts.acts().get(orc.identifier)?.key).not.toBe(first?.key);
  });

  it('plays a role a word for one asks for, rather than a motion of that name', () => {
    const orc = piece('オーク', 0, 0);

    acts.play(orc.identifier, '攻撃');
    expect(acts.acts().get(orc.identifier)).toMatchObject({ role: 'attack' });
    expect(acts.acts().get(orc.identifier)?.name).toBeUndefined();

    acts.play(orc.identifier, ' Wave ');
    expect(acts.acts().get(orc.identifier)).toMatchObject({ role: 'named', name: 'Wave' });
  });

  it('plays the model’s own motion asked for by name, though its name be a word for a role, here and on every seat', () => {
    const orc = piece('オーク', 0, 0);
    const sent = vi.spyOn(Network.instance, 'send').mockImplementation(() => undefined);

    acts.play(orc.identifier, 'Attack', { named: true });
    expect(acts.acts().get(orc.identifier)).toMatchObject({ role: 'named', name: 'Attack' });

    acts.playForAll(orc.identifier, 'Attack', { named: true });
    const told = sent.mock.calls.map(([context]) => (context as { data: unknown }).data);
    expect(told).toEqual([{ identifier: orc.identifier, motion: 'Attack', named: true }]);
  });

  it('tells every seat of a motion played for all', () => {
    const orc = piece('オーク', 0, 0);
    const sent = vi.spyOn(Network.instance, 'send').mockImplementation(() => undefined);

    acts.playForAll(orc.identifier, 'Bow');
    const told = sent.mock.calls.map(([context]) => context as { eventName: string; data: unknown });
    expect(told.map((context) => [context.eventName, context.data])).toEqual([
      ['MODEL_MOTION', { identifier: orc.identifier, motion: 'Bow' }],
    ]);
  });

  it('lets what an effect asks of a piece come before what it was asked outright', () => {
    const knight = piece('騎士', 0, 0);
    const orc = piece('オーク', 200, 0);
    acts.play(knight.identifier, 'Wave');

    casts.set([playing('bash', knight, orc)]);

    expect(acts.acts().get(knight.identifier)?.role).toBe('attack');
  });

  it('forgets what was asked outright long ago when something else is', () => {
    const [orc, goblin] = [piece('オーク', 0, 0), piece('ゴブリン', 50, 0)];
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    acts.play(orc.identifier, 'Wave');

    now.mockReturnValue(60_000);
    acts.play(goblin.identifier, 'Wave');

    expect([...acts.acts().keys()]).toEqual([goblin.identifier]);
  });
});
