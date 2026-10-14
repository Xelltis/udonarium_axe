import { GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import {
  asHazardExtraCost,
  asHazardKind,
  DEFAULT_HAZARD_KIND,
  HAZARD_KINDS,
  HAZARD_PRESETS,
  hazardExtraCostOf,
  hazardPresetOf,
} from '@axe/domain/tabletop/hazard-presets';
import { describe, expect, it } from 'vitest';

describe('the dangerous ground a master can lay in one stroke', () => {
  it('says what every kind comes to', () => {
    for (const kind of HAZARD_KINDS) expect(HAZARD_PRESETS[kind]).toBeDefined();
  });

  it('draws every one of them as a look that clings to the ground', () => {
    for (const kind of HAZARD_KINDS) {
      expect(GROUND_AMBIENCE_KINDS).toContain(HAZARD_PRESETS[kind].ambience);
    }
  });

  it('gives every one of them something to do: a going, a taking or a mark', () => {
    for (const kind of HAZARD_KINDS) {
      const held = HAZARD_PRESETS[kind];
      const does = held.extraCost > 0 || held.blocksSight || held.amount.length > 0 || held.ailment.length > 0;
      expect(does).toBe(true);
    }
  });

  it('takes what it takes as a turn in it opens, where standing in it is what hurts', () => {
    expect(HAZARD_PRESETS.lava.moment).toBe('turnStart');
    expect(HAZARD_PRESETS.vent.moment).toBe('turnStart');
  });

  it('lays water as water, slow to cross and nothing more', () => {
    expect(HAZARD_PRESETS.water).toMatchObject({ ambience: 'water', extraCost: 1, amount: '', ailment: '' });
  });

  it('reads what the brush charges, leaving anything unset to the kind rather than to nothing', () => {
    expect(asHazardExtraCost(undefined)).toBeNull();
    expect(asHazardExtraCost(null)).toBeNull();
    expect(asHazardExtraCost('')).toBeNull();
    expect(asHazardExtraCost('deep')).toBeNull();
    expect(asHazardExtraCost(0)).toBe(0);
    expect(asHazardExtraCost('3')).toBe(3);
    expect(asHazardExtraCost(99)).toBe(9);
    expect(asHazardExtraCost(-2)).toBe(0);
  });

  it('charges the kind\u2019s own where the brush is not set', () => {
    expect(hazardExtraCostOf('lava', null)).toBe(2);
    expect(hazardExtraCostOf('lava', 0)).toBe(0);
    expect(hazardExtraCostOf('ice', 4)).toBe(4);
  });

  it('reads a kind it has never heard of as a bog', () => {
    expect(asHazardKind('quicksand')).toBe(DEFAULT_HAZARD_KIND);
    expect(hazardPresetOf('quicksand')).toBe(HAZARD_PRESETS[DEFAULT_HAZARD_KIND]);
  });

  it('reads the kinds it knows', () => {
    for (const kind of HAZARD_KINDS) expect(asHazardKind(kind)).toBe(kind);
  });
});
