import { GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import {
  asHazardKind,
  DEFAULT_HAZARD_KIND,
  HAZARD_KINDS,
  HAZARD_PRESETS,
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

  it('reads a kind it has never heard of as a bog', () => {
    expect(asHazardKind('quicksand')).toBe(DEFAULT_HAZARD_KIND);
    expect(hazardPresetOf('quicksand')).toBe(HAZARD_PRESETS[DEFAULT_HAZARD_KIND]);
  });

  it('reads the kinds it knows', () => {
    for (const kind of HAZARD_KINDS) expect(asHazardKind(kind)).toBe(kind);
  });
});
