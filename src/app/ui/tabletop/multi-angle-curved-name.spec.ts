import { makeMultiAngleCurvedName } from '@axe/ui/tabletop/multi-angle-curved-name';

describe('makeMultiAngleCurvedName', () => {
  it('builds one complete counter-clockwise path with a normally readable bottom tangent', () => {
    const layout = makeMultiAngleCurvedName('Goblin', 50);

    expect(layout.path.match(/ A /g)).toHaveLength(2);
    expect(layout.path.match(/ 0 0 0 /g)).toHaveLength(2);
    expect(layout.radius).toBeGreaterThan(25);
    expect(layout.svgSize).toBeGreaterThan(50);
  });

  it('places a short label four times at equal quarter points', () => {
    const layout = makeMultiAngleCurvedName('Orc', 50);

    expect(layout.text).toBe('Orc');
    expect(layout.paddedText).toBe('\u00a0\u00a0Orc\u00a0\u00a0');
    expect(layout.repeatCount).toBe(4);
    expect(layout.startOffsets).toEqual(['75%', '0%', '25%', '50%']);
    expect(layout.separatorOffsets).toEqual(['87.5%', '12.5%', '37.5%', '62.5%']);
    expect(layout.minimumGap).toBe(24);
  });

  it.each([
    { text: '1234567', expected: 3 },
    { text: '1234567890', expected: 2 },
    { text: '12345678901234567890', expected: 1 },
  ])('reduces $text to $expected copies when the arcs would overlap', ({ text, expected }) => {
    expect(makeMultiAngleCurvedName(text, 50).repeatCount).toBe(expected);
  });

  it('accounts for full-width glyphs when choosing the number of copies', () => {
    const compact = makeMultiAngleCurvedName('ABC', 50);
    const fullWidth = makeMultiAngleCurvedName('状態異常', 50);

    expect(compact.repeatCount).toBe(4);
    expect(fullWidth.repeatCount).toBeLessThan(compact.repeatCount);
  });

  it('fits more copies around a larger piece when its circumference permits it', () => {
    expect(makeMultiAngleCurvedName('長めの状態', 50).repeatCount).toBeLessThan(
      makeMultiAngleCurvedName('長めの状態', 150).repeatCount
    );
  });

  it('omits a separator when only one label fits', () => {
    expect(makeMultiAngleCurvedName('12345678901234567890', 50).separatorOffsets).toEqual([]);
  });

  it('shortens a name that would occupy too much of the circle', () => {
    const layout = makeMultiAngleCurvedName('Very Long Character Name That Cannot Fit', 20);

    expect(layout.text).toContain('…');
    expect(layout.text).not.toContain('Very Long Character Name That Cannot Fit');
  });

  it('scales the circle and caps the type size for a large piece', () => {
    const small = makeMultiAngleCurvedName('Knight', 50);
    const large = makeMultiAngleCurvedName('Knight', 200);

    expect(large.radius).toBeGreaterThan(small.radius);
    expect(large.fontSize).toBe(15);
  });
});
