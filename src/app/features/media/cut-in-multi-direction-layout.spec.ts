import {
  CUT_IN_SHARED_EDGE_OVERLAP_RATIO,
  makeCutInMultiDirectionLayout,
} from '@axe/features/media/cut-in-multi-direction-layout';

function layout(mode: 'none' | 'vertical' | 'vertical-right' | 'vertical-left' | 'four-directions') {
  return makeCutInMultiDirectionLayout({
    mode,
    viewportWidth: 1200,
    viewportHeight: 800,
    cutInWidth: 2000,
    cutInHeight: 1200,
    chromeHeight: 28,
  });
}

describe('multi-direction cut-in layout', () => {
  it('makes no faces when the feature is off', () => {
    expect(layout('none')).toEqual([]);
    expect(makeCutInMultiDirectionLayout({ ...layoutInput(), mode: 'unexpected' })).toEqual([]);
  });

  it('puts south on the left and north on the right in two-way mode', () => {
    const faces = layout('vertical');

    expect(faces.map(({ direction, rotationDegrees }) => [direction, rotationDegrees])).toEqual([
      ['north', 180],
      ['south', 0],
    ]);
    expect(faces.find((face) => face.direction === 'south')?.logicalBounds).toEqual({
      left: 0,
      top: 0,
      width: 600,
      height: 800,
    });
    expect(faces.find((face) => face.direction === 'north')?.logicalBounds.left).toBe(600);
  });

  it('makes three equal-area regions with the requested side seat', () => {
    const right = layout('vertical-right');
    const left = layout('vertical-left');

    expect(right.map((face) => face.direction)).toEqual(['east', 'north', 'south']);
    expect(left.map((face) => face.direction)).toEqual(['west', 'north', 'south']);
    for (const face of [...right, ...left]) {
      expect(face.logicalBounds.width * face.logicalBounds.height).toBeCloseTo((1200 * 800) / 3);
    }
  });

  it('makes four equal-area H-shaped regions and keeps south on top', () => {
    const faces = layout('four-directions');

    expect(faces.map((face) => face.direction)).toEqual(['west', 'east', 'north', 'south']);
    expect(faces.at(-1)?.primary).toBe(true);
    for (const face of faces) {
      expect(face.logicalBounds.width * face.logicalBounds.height).toBe(1200 * 800 * 0.25);
    }
  });

  it('extends only shared edges by five percent per face', () => {
    const faces = layout('vertical');
    const south = faces.find((face) => face.direction === 'south')!;
    const north = faces.find((face) => face.direction === 'north')!;
    const extension = 600 * CUT_IN_SHARED_EDGE_OVERLAP_RATIO;

    expect(south.permittedBounds).toEqual({ left: 0, top: 0, width: 600 + extension, height: 800 });
    expect(north.permittedBounds).toEqual({ left: 600 - extension, top: 0, width: 600 + extension, height: 800 });
    expect(south.permittedBounds.left + south.permittedBounds.width - north.permittedBounds.left).toBe(extension * 2);
  });

  it('fits sideways panels by their rotated outer dimensions', () => {
    const east = layout('vertical-right').find((face) => face.direction === 'east')!;
    const visualWidth = east.height;
    const visualHeight = east.width;

    expect(visualWidth).toBeLessThanOrEqual(east.permittedBounds.width);
    expect(visualHeight).toBeLessThanOrEqual(east.permittedBounds.height);
    expect(east.left + east.width / 2).toBeCloseTo(east.permittedBounds.left + east.permittedBounds.width / 2);
    expect(east.top + east.height / 2).toBeCloseTo(east.permittedBounds.top + east.permittedBounds.height / 2);
  });

  it('does not enlarge a cut-in that already fits', () => {
    const faces = makeCutInMultiDirectionLayout({
      ...layoutInput(),
      mode: 'vertical',
      cutInWidth: 320,
      cutInHeight: 180,
      chromeHeight: 28,
    });
    const north = faces.find((face) => face.direction === 'north')!;

    expect(north.width).toBe(320);
    expect(north.height).toBe(208);
    expect(north.left + north.width / 2).toBe(900);
    expect(north.top + north.height / 2).toBe(400);
  });

  it('never returns negative sizes for a tiny viewport', () => {
    const faces = makeCutInMultiDirectionLayout({
      mode: 'four-directions',
      viewportWidth: 10,
      viewportHeight: 8,
      cutInWidth: 480,
      cutInHeight: 320,
      chromeHeight: 28,
    });

    for (const face of faces) {
      expect(face.width).toBeGreaterThanOrEqual(0);
      expect(face.height).toBeGreaterThanOrEqual(0);
      expect(face.permittedBounds.left).toBeGreaterThanOrEqual(0);
      expect(face.permittedBounds.top).toBeGreaterThanOrEqual(0);
    }
  });
});

function layoutInput() {
  return {
    mode: 'none',
    viewportWidth: 1200,
    viewportHeight: 800,
    cutInWidth: 2000,
    cutInHeight: 1200,
    chromeHeight: 28,
  } as const;
}
