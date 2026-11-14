import { TestBed } from '@angular/core/testing';
import { BUFF_COLORS } from '@axe/domain/character/buff-appearance';
import { parseBuffStrength } from '@axe/domain/character/buff-badge';
import { BUFF_TIMINGS } from '@axe/domain/character/buff-timing';
import { createDefaultStatusAilments, DEFAULT_STATUS_AILMENTS } from '@axe/domain/character/builtin-status-ailments';
import { formatStatusAilments, newStatusAilment, parseStatusAilments } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';

describe('the states a room starts with', () => {
  function clearStore(): void {}

  beforeEach(() => {
    TestBed.configureTestingModule({});
    clearStore();
    StatusAilmentCatalog.forget();
  });

  afterEach(() => {
    clearStore();
    StatusAilmentCatalog.forget();
  });

  it('goes down and comes back exactly as it was written', () => {
    expect(parseStatusAilments(formatStatusAilments(DEFAULT_STATUS_AILMENTS))).toEqual([...DEFAULT_STATUS_AILMENTS]);
  });

  it('calls each one by a name of its own, which a column is asked for by', () => {
    const names = DEFAULT_STATUS_AILMENTS.map((ailment) => ailment.name);

    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).not.toMatch(/\s/);
  });

  it('shows every moment a state can end at', () => {
    const timings = new Set(DEFAULT_STATUS_AILMENTS.map((ailment) => ailment.timing));

    expect([...timings].sort()).toEqual([...BUFF_TIMINGS].sort());
  });

  it('shows both a state that waits to be cleared and one that counts itself out', () => {
    expect(DEFAULT_STATUS_AILMENTS.some((ailment) => ailment.rounds === 0)).toBe(true);
    expect(DEFAULT_STATUS_AILMENTS.some((ailment) => ailment.rounds > 0)).toBe(true);
  });

  it('uses every colour a buff can wear', () => {
    const colors = new Set(DEFAULT_STATUS_AILMENTS.map((ailment) => ailment.color));

    for (const color of BUFF_COLORS) expect(colors).toContain(color.id);
  });

  it('gives each one a mark and a word about what it does', () => {
    for (const ailment of DEFAULT_STATUS_AILMENTS) {
      expect(ailment.icon.length).toBeGreaterThan(0);
      expect(ailment.effect.length).toBeGreaterThan(0);
    }
  });

  it('shows both an effect the badge can put a number on and one it cannot', () => {
    const strengths = DEFAULT_STATUS_AILMENTS.map((ailment) => parseBuffStrength(ailment.effect));

    expect(strengths.some((strength) => strength.length > 0)).toBe(true);
    expect(strengths.some((strength) => strength.length < 1)).toBe(true);
  });

  it('puts them on a room that keeps none of its own', () => {
    createDefaultStatusAilments(StatusAilmentCatalog.instance);

    expect(StatusAilmentCatalog.instance.ailments).toEqual([...DEFAULT_STATUS_AILMENTS]);
  });

  it('leaves a room that wrote its own alone', () => {
    StatusAilmentCatalog.instance.ailments = [newStatusAilment('自前')];

    createDefaultStatusAilments(StatusAilmentCatalog.instance);

    expect(StatusAilmentCatalog.instance.ailments.map((entry) => entry.name)).toEqual(['自前']);
  });
});
