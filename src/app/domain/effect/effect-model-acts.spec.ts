import type { EffectCast } from '@axe/domain/effect/effect-cast';
import { type ActedCast, modelActsOf } from '@axe/domain/effect/effect-model-acts';

const NOWHERE = () => null;

function cast(fields: Partial<EffectCast> = {}): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'knight',
    origin: { x: 0, y: 0, z: 0 },
    targets: [{ identifier: 'orc', x: 100, y: 0, z: 0 }],
    seed: 1,
    ...fields,
  };
}

function acted(fields: Partial<ActedCast> = {}): ActedCast {
  return { key: 7, cast: cast(), kind: 'slash', startedAt: 1000, blows: [], ...fields };
}

const blow = (atMs: number, holdMs = 0) => ({ atMs, holdMs, shake: '' as const, push: 0 });

describe('modelActsOf', () => {
  it('has the one who cast strike a blow as a look struck by hand begins, towards the first one struck', () => {
    expect(modelActsOf([acted()], NOWHERE).get('knight')).toEqual({
      key: '7:blow',
      role: 'attack',
      atMs: 1000,
      toward: { x: 1, y: 0 },
    });
  });

  it('has the one who cast work a spell for a look worked or loosed from afar', () => {
    for (const kind of ['projectile', 'flame', 'heal', 'beam'] as const) {
      expect(modelActsOf([acted({ kind })], NOWHERE).get('knight')?.role).toBe('cast');
    }
  });

  it('has each one struck take the blow as the first blow lands, from where the effect is cast', () => {
    const acts = modelActsOf(
      [
        acted({
          cast: cast({
            targets: [
              { identifier: 'orc', x: 100, y: 0, z: 0 },
              { identifier: 'goblin', x: 0, y: 50, z: 0 },
            ],
          }),
          blows: [blow(300), blow(600)],
        }),
      ],
      NOWHERE
    );

    expect(acts.get('orc')).toEqual({ key: '7:hit', role: 'hit', atMs: 1300, toward: { x: -1, y: 0 } });
    expect(acts.get('goblin')).toEqual({ key: '7:hit', role: 'hit', atMs: 1300, toward: { x: 0, y: -1 } });
  });

  it('has nobody take a blow from an effect that lands none, as one that heals', () => {
    const acts = modelActsOf([acted({ kind: 'heal' })], NOWHERE);

    expect([...acts.keys()]).toEqual(['knight']);
  });

  it('has each one an effect brings down go down as it begins, whoever cast it or nobody', () => {
    const felled = acted({ kind: 'dissolve', cast: cast({ casterIdentifier: '', origin: null }), blows: [blow(200)] });

    expect(modelActsOf([felled], NOWHERE)).toEqual(new Map([['orc', { key: '7:down', role: 'defeat', atMs: 1000 }]]));
  });

  it('reads where a caster stands for a cast that names no point, and acts the way a piece faces where neither is known', () => {
    const fromAbove = acted({ cast: cast({ origin: null }), blows: [blow(100)] });

    expect(modelActsOf([fromAbove], () => ({ x: 100, y: 100 })).get('knight')?.toward).toEqual({ x: 0, y: -1 });
    expect(modelActsOf([fromAbove], NOWHERE).get('knight')?.toward).toBeUndefined();
    expect(modelActsOf([fromAbove], NOWHERE).get('orc')?.toward).toBeUndefined();
  });

  it('does not strike the one who cast an effect on itself', () => {
    const self = acted({
      kind: 'nova',
      cast: cast({ targets: [{ identifier: 'knight', x: 0, y: 0, z: 0 }] }),
      blows: [blow(100)],
    });

    expect(modelActsOf([self], NOWHERE)).toEqual(new Map([['knight', { key: '7:blow', role: 'cast', atMs: 1000 }]]));
  });

  it('has a piece in several acts act the gravest, and of two alike the later', () => {
    const struck = acted({ key: 1, blows: [blow(100)] });
    const striking = acted({
      key: 2,
      cast: cast({ casterIdentifier: 'orc', targets: [{ identifier: 'goblin', x: 0, y: 9, z: 0 }] }),
    });
    const felling = acted({ key: 3, kind: 'bisect', cast: cast({ casterIdentifier: '' }) });
    const again = acted({ key: 4, blows: [blow(50)] });

    expect(modelActsOf([struck, striking], NOWHERE).get('orc')?.key).toBe('1:hit');
    expect(modelActsOf([striking, struck], NOWHERE).get('orc')?.key).toBe('1:hit');
    expect(modelActsOf([struck, felling, again], NOWHERE).get('orc')?.key).toBe('3:down');
    expect(modelActsOf([struck, again], NOWHERE).get('orc')?.key).toBe('4:hit');
  });

  it('counts a blow that lands after a hold from when the hold lets go', () => {
    const held = acted({ blows: [blow(300, 80), blow(600)] });

    expect(modelActsOf([held], NOWHERE).get('orc')?.atMs).toBe(1300);
  });

  it('acts on the body a part is drawn as, and never strikes a body with its own part’s blow', () => {
    const body = (identifier: string) => (identifier === 'claw' ? 'dragon' : identifier);
    const onPart = acted({ cast: cast({ targets: [{ identifier: 'claw', x: 100, y: 0, z: 0 }] }), blows: [blow(100)] });
    const byPart = acted({
      cast: cast({ casterIdentifier: 'claw', targets: [{ identifier: 'dragon', x: 5, y: 0, z: 0 }] }),
      blows: [blow(100)],
    });

    expect(modelActsOf([onPart], NOWHERE, body).get('dragon')?.role).toBe('hit');
    expect(modelActsOf([byPart], NOWHERE, body)).toEqual(
      new Map([['dragon', { key: '7:blow', role: 'attack', atMs: 1000 }]])
    );
  });
});
