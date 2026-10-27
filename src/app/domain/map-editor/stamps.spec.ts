import { STAMP_CATEGORIES, StampCategory } from '@axe/domain/map-editor/stamp-types';
import { getStampById, getStampsByCategory, STAMPS } from '@axe/domain/map-editor/stamps';
import { describe, expect, it } from 'vitest';

describe('STAMPS', () => {
  it('total count is at least 40', () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(40);
  });

  it('all ids are unique', () => {
    const ids = STAMPS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every svg starts with <svg', () => {
    STAMPS.forEach((s) => {
      expect(s.svg.trimStart()).toMatch(/^<svg/);
    });
  });

  it('every svg contains viewBox="0 0 100 100"', () => {
    STAMPS.forEach((s) => {
      expect(s.svg).toContain('viewBox="0 0 100 100"');
    });
  });

  it('every svg references currentColor', () => {
    STAMPS.forEach((s) => {
      expect(s.svg).toContain('currentColor');
    });
  });

  it('every stamp has a valid category', () => {
    const valid = new Set<string>(STAMP_CATEGORIES);
    STAMPS.forEach((s) => {
      expect(valid.has(s.category)).toBe(true);
    });
  });

  const builtinCategories = STAMP_CATEGORIES.filter((cat) => cat !== 'image');

  it.each(builtinCategories)('category %s has at least 5 stamps', (cat: StampCategory) => {
    const count = STAMPS.filter((s) => s.category === cat).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

describe('getStampsByCategory', () => {
  it('returns only stamps matching the given category', () => {
    const results = getStampsByCategory('door');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((s) => expect(s.category).toBe('door'));
  });

  it('returns different sets for different categories', () => {
    const doors = getStampsByCategory('door');
    const stairs = getStampsByCategory('stair');
    const doorIds = new Set(doors.map((s) => s.id));
    stairs.forEach((s) => expect(doorIds.has(s.id)).toBe(false));
  });
});

describe('getStampById', () => {
  it('returns the correct stamp for a known id', () => {
    const stamp = getStampById('door-single');
    expect(stamp).toBeDefined();
    expect(stamp?.id).toBe('door-single');
    expect(stamp?.category).toBe('door');
  });

  it('returns undefined for an unknown id', () => {
    expect(getStampById('not-a-real-id')).toBeUndefined();
  });

  it('can look up every stamp by its own id', () => {
    STAMPS.forEach((s) => {
      expect(getStampById(s.id)).toBe(s);
    });
  });
});
