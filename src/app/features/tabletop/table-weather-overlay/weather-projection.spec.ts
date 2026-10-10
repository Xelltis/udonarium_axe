import {
  type ScreenPoint,
  weatherDepthDirection,
  weatherMaskImage,
} from '@axe/features/tabletop/table-weather-overlay/weather-projection';

/** The board projected as a box up to the ceiling, eight points, the far side foreshortened. */
const BOX: ScreenPoint[] = [
  { x: 110, y: 300 },
  { x: 290, y: 300 },
  { x: 320, y: 380 },
  { x: 80, y: 380 },
  { x: 115, y: 120 },
  { x: 285, y: 120 },
  { x: 315, y: 200 },
  { x: 85, y: 200 },
];

describe('weatherMaskImage()', () => {
  it('fades out rather than stopping', () => {
    const mask = weatherMaskImage(BOX);

    // Cut by a polygon it shows a straight edge in mid-air, like a glass case over the board.
    expect(mask).not.toContain('polygon');
    expect(mask).toMatch(/^radial-gradient\(/);
    expect(mask).toContain('transparent 100%');
  });

  it('covers the board and the space above it together', () => {
    const mask = weatherMaskImage(BOX);
    const [radiusX, radiusY] = [...mask.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]));

    expect(radiusX).toBeGreaterThanOrEqual((320 - 80) / 2);
    expect(radiusY).toBeGreaterThanOrEqual((380 - 120) / 2);
  });

  it('starts fading past the edge of the board', () => {
    // Starting inside it, the ring floats visibly over the boards.
    const mask = weatherMaskImage(BOX);
    const [radiusX] = [...mask.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]));
    const solid = Number(/#000 ([\d.]+)%/.exec(mask)![1]);

    expect((radiusX * solid) / 100).toBeGreaterThanOrEqual((320 - 80) / 2);
    // Falling off in one step shows the edge as a ring; a stop in between eases the slope.
    expect([...mask.matchAll(/rgba\(/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('lands on the step it is given, so a small move leaves it as it was', () => {
    const mask = weatherMaskImage(BOX, 8);
    const moved = weatherMaskImage(
      BOX.map((point) => ({ x: point.x + 2, y: point.y - 1 })),
      8
    );

    for (const value of [...mask.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]))) {
      expect(value % 8).toBe(0);
    }
    expect(moved).toBe(mask);
    expect(weatherMaskImage(BOX.map((point) => ({ x: point.x + 2, y: point.y - 1 })))).not.toBe(weatherMaskImage(BOX));
  });

  it('masks nothing when it cannot work the shape out', () => {
    expect(weatherMaskImage([])).toBe('none');
    expect(weatherMaskImage([{ x: Number.NaN, y: 0 }])).toBe('none');
    expect(weatherMaskImage([{ x: 5, y: 5 }])).toBe('none');
  });
});

describe('weatherDepthDirection()', () => {
  it('gives the angle from the back of the board to the front', () => {
    const direction = weatherDepthDirection(BOX.slice(0, 4));

    // Running from the top of the screen to the bottom, it points near straight down.
    expect(direction).toMatch(/deg$/);
    expect(Math.abs(Number(direction.replace('deg', '')))).toBeCloseTo(180, 0);
  });

  it('paints straight down when it cannot work the direction out', () => {
    expect(weatherDepthDirection([])).toBe('to bottom');
    expect(
      weatherDepthDirection([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ])
    ).toBe('to bottom');
  });
});
