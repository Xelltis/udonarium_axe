import { digestOf, isCatalogDigest, sameDigest } from '@axe/core/sync/catalog-digest';
import type { CatalogItem } from '@axe/core/sync/object-store';

describe('digestOf', () => {
  const catalog: CatalogItem[] = [
    { identifier: 'card-1', version: 3.25 },
    { identifier: 'card-2', version: 1.5 },
    { identifier: 'table', version: 12.125 },
  ];

  it('is the same for the same objects at the same versions, in whatever order', () => {
    expect(sameDigest(digestOf(catalog), digestOf([...catalog].reverse()))).toBe(true);
  });

  it('counts the objects', () => {
    expect(digestOf(catalog).count).toBe(3);
    expect(digestOf([])).toEqual({ count: 0, hash: 0 });
  });

  it('differs when an object is missing, another is listed, or a version has moved', () => {
    const base = digestOf(catalog);

    expect(sameDigest(base, digestOf(catalog.slice(1)))).toBe(false);
    expect(sameDigest(base, digestOf([...catalog.slice(1), { identifier: 'card-9', version: 3.25 }]))).toBe(false);
    expect(sameDigest(base, digestOf([{ identifier: 'card-1', version: 4.25 }, ...catalog.slice(1)]))).toBe(false);
    expect(sameDigest(base, digestOf([{ identifier: 'card-1', version: 3.250001 }, ...catalog.slice(1)]))).toBe(false);
  });

  it('differs when two objects swap versions', () => {
    const swapped: CatalogItem[] = [
      { identifier: 'card-1', version: 1.5 },
      { identifier: 'card-2', version: 3.25 },
      { identifier: 'table', version: 12.125 },
    ];

    expect(sameDigest(digestOf(catalog), digestOf(swapped))).toBe(false);
  });

  it('survives being sent as plain numbers', () => {
    const sent = JSON.parse(JSON.stringify(digestOf(catalog))) as unknown;

    expect(isCatalogDigest(sent)).toBe(true);
    expect(sameDigest(sent as never, digestOf(catalog))).toBe(true);
  });

  it('gets through several thousand objects in a few milliseconds', () => {
    const large: CatalogItem[] = Array.from({ length: 5000 }, (_, n) => ({
      identifier: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      version: n + 0.5,
    }));
    digestOf(large);

    const started = performance.now();
    digestOf(large);

    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('isCatalogDigest', () => {
  it('turns down what is not two numbers', () => {
    expect(isCatalogDigest(null)).toBe(false);
    expect(isCatalogDigest({})).toBe(false);
    expect(isCatalogDigest({ count: 1 })).toBe(false);
    expect(isCatalogDigest({ count: '1', hash: 2 })).toBe(false);
    expect(isCatalogDigest({ count: 1, hash: Number.NaN })).toBe(false);
  });
});
