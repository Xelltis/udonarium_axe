import {
  commonSpans,
  inSpans,
  InterruptClaim,
  litSpans,
  mayBeStopped,
  pointAtLength,
  resolveClaims,
  spansWithin,
} from '@axe/domain/tabletop/zone/interrupt';

const WAY = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('stepping into a move', () => {
  it('finds the point a distance along a way, round its corners', () => {
    expect(pointAtLength(WAY, 50)).toEqual({ x: 50, y: 0 });
    expect(pointAtLength(WAY, 130)).toEqual({ x: 100, y: 30 });
    expect(pointAtLength(WAY, 999)).toEqual({ x: 100, y: 100 });
  });

  describe('the stretches inside zones', () => {
    it('finds where the way runs through a zone, and joins two that meet along it', () => {
      const spans = spansWithin(WAY, [
        { centre: { x: 50, y: 0 }, square: false, reach: 10 },
        { centre: { x: 65, y: 0 }, square: false, reach: 10 },
      ]);

      expect(spans).toHaveLength(1);
      expect(spans[0].from).toBeCloseTo(40);
      expect(spans[0].to).toBeCloseTo(75);
    });

    it('leaves out the spot the way sets out from, for a way that begins in a zone', () => {
      const spans = spansWithin(WAY, [{ centre: { x: 0, y: 0 }, square: false, reach: 10 }]);

      expect(spans).toHaveLength(1);
      expect(spans[0].from).toBeCloseTo(1);
      expect(spans[0].to).toBeCloseTo(10);
    });

    it('finds nothing where the way stays clear of every zone', () => {
      expect(spansWithin(WAY, [{ centre: { x: 50, y: 50 }, square: false, reach: 10 }])).toEqual([]);
    });
  });

  describe('the stretches a piece reaches', () => {
    it('lights the part of the way within reach', () => {
      const spans = litSpans(WAY, { x: 100, y: 50 }, 30, []);

      expect(spans).toHaveLength(1);
      expect(spans[0].from).toBeCloseTo(120);
      expect(spans[0].to).toBeCloseTo(180);
    });

    it('leaves out a stretch inside a zone, splitting what it reaches in two', () => {
      const zone = { centre: { x: 50, y: 0 }, square: false, reach: 10 };
      const spans = litSpans(WAY, { x: 50, y: 20 }, 40, [zone]);

      expect(spans).toHaveLength(2);
      expect(spans[0].from).toBeCloseTo(15.36, 1);
      expect(spans[0].to).toBeCloseTo(40);
      expect(spans[1].from).toBeCloseTo(60);
      expect(spans[1].to).toBeCloseTo(84.64, 1);
    });

    it('never lights the spot the way sets out from', () => {
      expect(litSpans(WAY, { x: 0, y: 0 }, 20, [])[0].from).toBeGreaterThan(0);
    });

    it('lights nothing for a piece out of reach', () => {
      expect(litSpans(WAY, { x: 300, y: 300 }, 20, [])).toEqual([]);
    });
  });

  it('keeps the stretches every piece reaches, and tells a point in them', () => {
    const common = commonSpans([
      [{ from: 10, to: 60 }],
      [
        { from: 0, to: 20 },
        { from: 50, to: 90 },
      ],
    ]);

    expect(common).toEqual([
      { from: 10, to: 20 },
      { from: 50, to: 60 },
    ]);
    expect(inSpans(common, 55)).toBe(true);
    expect(inSpans(common, 35)).toBe(false);
  });

  it('lets nobody stop a mover whose side outnumbers all of them together by the ratio', () => {
    expect(mayBeStopped(3, 1, 2)).toBe(false);
    expect(mayBeStopped(2, 1, 2)).toBe(true);
    expect(mayBeStopped(1, 0, 2)).toBe(false);
  });

  describe('settling the claims', () => {
    const one = () => 1;

    it('takes the claim nearest the start of the way', () => {
      const claims: InterruptClaim[] = [
        { along: 80, pieces: ['a'] },
        { along: 30, pieces: ['b'] },
      ];

      expect(resolveClaims(claims, () => true, one, 1, 2, 5)).toEqual({ along: 30, pieces: ['b'] });
    });

    it('leaves out a claim the check turns down', () => {
      const claims: InterruptClaim[] = [
        { along: 30, pieces: ['b'] },
        { along: 80, pieces: ['a'] },
      ];

      expect(resolveClaims(claims, (claim) => claim.pieces[0] !== 'b', one, 1, 2, 5)!.pieces).toEqual(['a']);
    });

    it('joins claims at the same point, so together they stop a mover neither stops alone', () => {
      const claims: InterruptClaim[] = [
        { along: 40, pieces: ['a'] },
        { along: 42, pieces: ['b'] },
        { along: 20, pieces: ['c'] },
      ];

      expect(resolveClaims(claims, () => true, one, 3, 2, 5)).toEqual({ along: 40, pieces: ['a', 'b'] });
    });

    it('stops nobody where every claim is outnumbered', () => {
      expect(resolveClaims([{ along: 10, pieces: ['a'] }], () => true, one, 5, 2, 5)).toBeNull();
    });
  });
});
