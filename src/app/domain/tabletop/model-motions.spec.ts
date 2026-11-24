import { askedRoleOf } from '@axe/domain/tabletop/model-asked-roles';
import {
  actHolds,
  MADE_MOTION_MS,
  MADE_REST,
  madePoseAt,
  motionNameFor,
} from '@axe/domain/tabletop/model-motion-poses';
import {
  ACT_ROLES,
  MODEL_MOTIONS_AS_MADE,
  modelMotionsOf,
  writeModelMotions,
} from '@axe/domain/tabletop/model-motions';

describe('the motions a piece asks its model for in a fight', () => {
  it('are the model’s own, moved by hand where it has none, where nothing was stored', () => {
    for (const value of ['', undefined, null, 'Slash', '[]', '{"attack":']) {
      expect(modelMotionsOf(value)).toEqual(MODEL_MOTIONS_AS_MADE);
    }
    expect(writeModelMotions(MODEL_MOTIONS_AS_MADE)).toBe('');
  });

  it('come back as they were stored', () => {
    const motions = { attack: 'Slash', cast: '', hit: 'Flinch', defeat: 'Die', made: false };

    expect(modelMotionsOf(writeModelMotions(motions))).toEqual(motions);
  });

  it('are moved by hand unless that was turned off outright', () => {
    expect(modelMotionsOf('{"made":0}').made).toBe(true);
    expect(modelMotionsOf('{"made":false}').made).toBe(false);
  });
});

describe('the motion a model plays for a role', () => {
  const names = ['T-Pose', 'Idle_Loop', 'Run', 'Sword_Slash', 'Spell_Cast', 'Hit_React', 'Death'];

  it('is the one asked for by name where the model has it, whatever its letters’ case', () => {
    expect(motionNameFor('attack', names, 'Run')).toBe('Run');
    expect(motionNameFor('attack', names, 'death')).toBe('Death');
  });

  it('is the model’s own, told by its name, where none is asked for or the one asked for is lacking', () => {
    expect(motionNameFor('idle', names, '')).toBe('Idle_Loop');
    expect(motionNameFor('walk', names, 'Stroll')).toBe('Run');
    expect(motionNameFor('attack', names, '')).toBe('Sword_Slash');
    expect(motionNameFor('cast', names, '')).toBe('Spell_Cast');
    expect(motionNameFor('hit', names, '')).toBe('Hit_React');
    expect(motionNameFor('defeat', names, '')).toBe('Death');
  });

  it('stands in the first motion of a model with nothing named for standing, but none named for another role', () => {
    expect(motionNameFor('idle', ['Run', 'Wave'], '')).toBe('Wave');
    expect(motionNameFor('idle', ['Punch', 'Death', 'Walk'], '')).toBeNull();
    expect(motionNameFor('idle', ['Punch'], 'Punch')).toBe('Punch');
    expect(motionNameFor('idle', [], '')).toBeNull();
  });

  it('strikes a blow for a spell where the model has nothing for working one', () => {
    expect(motionNameFor('cast', ['Idle', 'Punch'], '')).toBe('Punch');
  });

  it('does not take a motion named for a blow for the taking of one', () => {
    expect(motionNameFor('hit', ['Attack_Hit', 'Idle'], '')).toBeNull();
    expect(motionNameFor('hit', ['Attack_Hit', 'GetHit'], '')).toBe('GetHit');
  });

  it('is none for a role the model has nothing for', () => {
    expect(motionNameFor('walk', ['Idle'], '')).toBeNull();
    expect(motionNameFor('defeat', ['Idle', 'Run'], '')).toBeNull();
  });

  it('tells motions named in Japanese', () => {
    const named = ['待機', '歩き', '攻撃1', '魔法詠唱', '被弾', '死亡'];
    expect(motionNameFor('idle', named, '')).toBe('待機');
    expect(motionNameFor('walk', named, '')).toBe('歩き');
    expect(motionNameFor('attack', named, '')).toBe('攻撃1');
    expect(motionNameFor('cast', named, '')).toBe('魔法詠唱');
    expect(motionNameFor('hit', named, '')).toBe('被弾');
    expect(motionNameFor('defeat', named, '')).toBe('死亡');
  });
});

describe('a model moved by hand', () => {
  it('stands as it was made for standing, and before a motion begins', () => {
    expect(madePoseAt('idle', 500)).toEqual(MADE_REST);
    expect(madePoseAt('attack', -1)).toEqual(MADE_REST);
    expect(madePoseAt('attack', Number.NaN)).toEqual(MADE_REST);
  });

  it('hops along for as long as it walks, back on the floor between hops', () => {
    expect(madePoseAt('walk', 0).lift).toBeCloseTo(0);
    expect(madePoseAt('walk', MADE_MOTION_MS.walk / 2).lift).toBeGreaterThan(0.1);
    expect(madePoseAt('walk', MADE_MOTION_MS.walk).lift).toBeCloseTo(0);
    expect(madePoseAt('walk', MADE_MOTION_MS.walk * 20.5).lift).toBeGreaterThan(0.1);
  });

  it('thrusts out for a blow and is thrown back by one taken, and stands again after either', () => {
    const thrust = madePoseAt('attack', MADE_MOTION_MS.attack * 0.46);
    const thrown = madePoseAt('hit', MADE_MOTION_MS.hit * 0.2);

    expect(thrust.forward).toBeGreaterThan(0.4);
    expect(thrust.pitchDeg).toBeGreaterThan(10);
    expect(thrown.forward).toBeLessThan(-0.2);
    expect(thrown.pitchDeg).toBeLessThan(-10);
    for (const role of ['attack', 'cast', 'hit'] as const) {
      expect(madePoseAt(role, MADE_MOTION_MS[role])).toEqual(MADE_REST);
      expect(madePoseAt(role, MADE_MOTION_MS[role] * 5)).toEqual(MADE_REST);
    }
  });

  it('goes down on its back and stays there', () => {
    const down = madePoseAt('defeat', MADE_MOTION_MS.defeat);

    expect(down.pitchDeg).toBeLessThan(-80);
    expect(madePoseAt('defeat', MADE_MOTION_MS.defeat * 100)).toEqual(down);
    expect(actHolds({ role: 'defeat' })).toBe(true);
    for (const role of ACT_ROLES.filter((one) => one !== 'defeat')) expect(actHolds({ role })).toBe(false);
  });

  it('moves without a jump from one moment to the next', () => {
    for (const role of ACT_ROLES) {
      let before = madePoseAt(role, 0);
      for (let ms = 10; ms <= MADE_MOTION_MS[role]; ms += 10) {
        const now = madePoseAt(role, ms);
        expect(Math.abs(now.pitchDeg - before.pitchDeg)).toBeLessThan(8);
        expect(Math.abs(now.forward - before.forward)).toBeLessThan(0.1);
        before = now;
      }
    }
  });
});

describe('the role a word asks a model to play', () => {
  it('is told in any of the room’s tongues, whatever its width and its letters’ case', () => {
    expect(askedRoleOf('attack')).toBe('attack');
    expect(askedRoleOf(' 攻撃 ')).toBe('attack');
    expect(askedRoleOf('ＣＡＳＴ')).toBe('cast');
    expect(askedRoleOf('魔法')).toBe('cast');
    expect(askedRoleOf('被弾')).toBe('hit');
    expect(askedRoleOf('피격')).toBe('hit');
  });

  it('is none for the name of a motion, nor for going down, which would leave the model down', () => {
    expect(askedRoleOf('Wave')).toBeNull();
    expect(askedRoleOf('defeat')).toBeNull();
    expect(askedRoleOf('')).toBeNull();
  });
});
