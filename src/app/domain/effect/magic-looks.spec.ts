import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { launchSoundTimes } from '@axe/domain/effect/effect-sound-times';
import { isSpiritShot, magicShotOf, SPIRIT_GATHERS_MS } from '@axe/domain/effect/magic-looks';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.tagName = '射撃';
  preset.durationMs = 900;
  preset.soundIdentifier = 'sound';
  Object.assign(preset, fields);
  return preset;
}

describe('what a bolt of no element is drawn as', () => {
  it('is a spear of holy light where it lands in light or is of the holy family', () => {
    expect(magicShotOf(shotOf({ impactKind: 'smite' }))).toBe('holy');
    expect(magicShotOf(shotOf({ impactKind: 'heal' }))).toBe('holy');
    expect(magicShotOf(shotOf({ impactKind: 'burst', tagName: '聖' }))).toBe('holy');
  });

  it('is a knot of a curse where it lands in a miasma or a curse, or is of the dark family', () => {
    expect(magicShotOf(shotOf({ impactKind: 'miasma' }))).toBe('curse');
    expect(magicShotOf(shotOf({ impactKind: 'curse' }))).toBe('curse');
    expect(magicShotOf(shotOf({ impactKind: 'burst', tagName: '闇' }))).toBe('curse');
  });

  it('is a ball of spirit where it lands in an impact, unless its family has an element of its own', () => {
    expect(magicShotOf(shotOf({ impactKind: 'impact' }))).toBe('spirit');
    expect(magicShotOf(shotOf({ impactKind: 'impact', tagName: '物理' }))).toBe('spirit');
    expect(magicShotOf(shotOf({ impactKind: 'impact', tagName: '氷' }))).toBe('arcane');
  });

  it('is a bolt of plain magic otherwise', () => {
    expect(magicShotOf(shotOf({ impactKind: 'burst' }))).toBe('arcane');
    expect(magicShotOf(shotOf({ impactKind: 'frost' }))).toBe('arcane');
    expect(magicShotOf(shotOf())).toBe('arcane');
  });
});

describe('a shot of spirit', () => {
  it('is a bolt on its own that lands in an impact, and no shot of another look', () => {
    expect(isSpiritShot(shotOf({ impactKind: 'impact' }))).toBe(true);
    expect(isSpiritShot(shotOf({ impactKind: 'impact', projectileStyle: 'blaster' }))).toBe(false);
    expect(isSpiritShot(shotOf({ impactKind: 'impact', projectileStyle: 'arrow' }))).toBe(false);
    expect(isSpiritShot(shotOf({ impactKind: 'burst' }))).toBe(false);
  });

  it('is gathered before it is thrown, its sound and its landing coming that much later', () => {
    const spirit = shotOf({ impactKind: 'impact' });
    const plain = shotOf({ impactKind: 'burst' });
    const [shot] = projectileTiming(spirit).shots;
    const [other] = projectileTiming(plain).shots;

    expect(shot.launch * spirit.duration).toBeCloseTo(SPIRIT_GATHERS_MS, 6);
    expect((shot.land - shot.launch) * spirit.duration).toBeCloseTo((other.land - other.launch) * plain.duration, 6);
    expect(other.launch).toBe(0);
    expect(launchSoundTimes(spirit)).toEqual([SPIRIT_GATHERS_MS]);
  });

  it('gathers for no more than a share of an effect too short for it, and still lands within it', () => {
    const short = shotOf({ impactKind: 'impact', durationMs: 300 });
    const [shot] = projectileTiming(short).shots;

    expect(shot.launch).toBeLessThanOrEqual(0.45);
    expect(shot.land).toBeLessThanOrEqual(1);
    expect(shot.land).toBeGreaterThan(shot.launch);
  });

  it('follows the first of a volley with the rest at their interval, only the first being gathered for', () => {
    const volley = shotOf({ impactKind: 'impact', shots: 3, shotInterval: 100, durationMs: 1200 });
    const launches = projectileTiming(volley).shots.map((shot) => Math.round(shot.launch * volley.duration));

    expect(launches).toEqual([200, 300, 400]);
  });
});
