import { FirstPersonPlaneQuad, FirstPersonWallQuad } from '@axe/domain/tabletop/first-person/first-person-scene';
import { FOG_VEIL_ALPHA } from '@axe/domain/tabletop/fog/fog-mode';
import {
  billboardHudTransform,
  billboardShrink,
  billboardStyle,
  billboardTextScale,
  cameraTransform,
  MAX_PIECE_SCREEN_FRACTION,
  perspectivePx,
  planeQuadStyle,
  projectedHeightPx,
  projectedScaleOf,
  scaleOf,
  shadeFor,
  wallQuadStyle,
} from '@axe/features/first-person/first-person-style';
import { describe, expect, it } from 'vitest';

function wall(overrides: Partial<FirstPersonWallQuad> = {}): FirstPersonWallQuad {
  return {
    kind: 'wall',
    id: 'w',
    terrain: 't',
    x: 100,
    y: 50,
    length: 30,
    angle: 90,
    basePx: 0,
    heightPx: 50,
    image: 'stone',
    uStart: 20,
    fullLength: 50,
    glass: false,
    seeThrough: false,
    door: false,
    depth: 10,
    cell: 0,
    ...overrides,
  };
}

function plane(overrides: Partial<FirstPersonPlaneQuad> = {}): FirstPersonPlaneQuad {
  return {
    kind: 'floor',
    id: 'f',
    terrain: '',
    zPx: 0,
    facing: 'up',
    minX: 100,
    minY: 50,
    width: 50,
    height: 40,
    polygon: [
      { x: 100, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 90 },
      { x: 100, y: 90 },
    ],
    image: 'floor',
    frame: { x: 0, y: 0, width: 500, height: 400, image: 'floor' },
    glass: false,
    depth: 10,
    cell: 0,
    ...overrides,
  };
}

describe('the first-person camera', () => {
  it('sets the eye as far back as the view is wide for the angle it takes in', () => {
    expect(perspectivePx(1000, 90)).toBeCloseTo(500);
    expect(perspectivePx(1000, 60)).toBeCloseTo(866.025, 2);
  });

  it('draws a cell at a fixed size, whatever the grid of the table', () => {
    expect(scaleOf(50)).toBeCloseTo(5.12);
    expect(scaleOf(0)).toBe(1);
  });

  it('carries the world to the eye, turns it to face ahead and stands it up', () => {
    expect(cameraTransform({ x: 100, y: 200, z: 25, yaw: 90 }, 2, 500)).toBe(
      'translateZ(500px) rotateX(90deg) rotateZ(-90deg) translate3d(-200px, -400px, -50px)'
    );
  });

  it('darkens with distance, and never quite to black', () => {
    expect(shadeFor(0, 300)).toBe(0);
    expect(shadeFor(150, 300)).toBeCloseTo(0.425);
    expect(shadeFor(900, 300)).toBe(0.85);
    expect(shadeFor(-10, 300)).toBe(0);
  });
});

describe('placing a wall', () => {
  it('stands it up from its left end, along its length, as tall as it is', () => {
    const style = wallQuadStyle(wall(), 2, 'stone.png', 0.2);

    expect(style['width']).toBe('60px');
    expect(style['height']).toBe('100px');
    expect(style['transformOrigin']).toBe('0 0');
    expect(style['transform']).toBe('translate3d(200px, 100px, 100px) rotateZ(90deg) rotateX(-90deg)');
  });

  it('keeps the picture where it was on the whole wall when the near end is cut off', () => {
    const style = wallQuadStyle(wall(), 2, 'stone.png', 0.2);

    expect(style['backgroundSize']).toBe('100% 100%, 100px 100%');
    expect(style['backgroundPosition']).toBe('0 0, -40px 0');
    expect(style['backgroundImage']).toContain('url("stone.png")');
  });

  it('is only shade where it has no picture', () => {
    expect(wallQuadStyle(wall(), 2, '', 0.3)['backgroundImage']).toBe(
      'linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3))'
    );
  });
});

describe('placing a floor, a ceiling or a lid', () => {
  it('lays a floor flat, cut to the outline it was given, with the table picture lined up under it', () => {
    const style = planeQuadStyle(plane(), 2, 'floor.png', 0);

    expect(style['transform']).toBe('translate3d(200px, 100px, 0px)');
    expect(style['clipPath']).toBe('polygon(0px 0px, 100px 0px, 100px 80px, 0px 80px)');
    expect(style['backgroundSize']).toBe('100% 100%, 1000px 800px');
    expect(style['backgroundPosition']).toBe('0 0, -200px -100px');
  });

  it('lays a second veil over ground the party only remembers, as deep as the one the table lays', () => {
    const style = planeQuadStyle(plane(), 2, 'floor.png', 0.2, true);

    expect(style['backgroundImage']).toBe(
      `linear-gradient(rgba(0, 0, 0, ${FOG_VEIL_ALPHA}), rgba(0, 0, 0, ${FOG_VEIL_ALPHA})), ` +
        'linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url("floor.png")'
    );
    expect(style['backgroundSize']).toBe('100% 100%, 100% 100%, 1000px 800px');
    expect(style['backgroundPosition']).toBe('0 0, 0 0, -200px -100px');
  });

  it('turns a ceiling over, so it faces down onto the eye', () => {
    const style = planeQuadStyle(
      plane({
        kind: 'ceiling',
        facing: 'down',
        zPx: 50,
        frame: null,
        polygon: [
          { x: 100, y: 50 },
          { x: 150, y: 50 },
          { x: 100, y: 90 },
        ],
      }),
      2,
      '',
      0
    );

    expect(style['transform']).toBe('translate3d(200px, 180px, 100px) rotateX(180deg)');
    expect(style['clipPath']).toBe('polygon(0px 80px, 100px 80px, 0px 0px)');
  });
});

describe('placing a piece', () => {
  it('stands it on its feet, facing the eye', () => {
    expect(billboardStyle({ x: 100, y: 50, z: 0 }, 50, 60, 90, 2)).toEqual({
      width: '100px',
      height: '120px',
      transformOrigin: '0 0',
      transform: 'translate3d(200px, 100px, 0px) rotateZ(90deg) rotateX(-90deg) translate(-50%, -100%)',
    });
  });
});

describe('how large a piece comes out on the screen', () => {
  const SCALE = scaleOf(50);
  const PERSPECTIVE = perspectivePx(1280, 90);
  const NEAR_PX = 65;
  const FAR_PX = 215;
  const PIECE_PX = 75;
  const VIEW_PX = 800;

  it('blows up what stands near the eye and shrinks what stands away from it', () => {
    expect(projectedScaleOf(NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(1.923, 3);
    expect(projectedScaleOf(FAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(0.581, 3);
  });

  it('measures the height a piece takes on the screen from the eye it is seen with', () => {
    expect(projectedHeightPx(PIECE_PX, NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(738.46, 2);
    expect(projectedHeightPx(PIECE_PX, FAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(223.26, 2);
  });

  it('pulls a piece that would stand taller than the view down to the share it is allowed', () => {
    const shrink = billboardShrink(PIECE_PX, NEAR_PX, SCALE, PERSPECTIVE, VIEW_PX);

    expect(shrink).toBeLessThan(1);
    expect(projectedHeightPx(PIECE_PX * shrink, NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(
      VIEW_PX * MAX_PIECE_SCREEN_FRACTION,
      3
    );
  });

  it('pulls a piece wider than a narrow view allows down to its share of the width', () => {
    const wide = PIECE_PX * 0.6;
    const shrink = billboardShrink(PIECE_PX, NEAR_PX, SCALE, PERSPECTIVE, VIEW_PX * 4, wide, 300);

    expect(shrink).toBeLessThan(1);
    expect(projectedHeightPx(wide * shrink, NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(
      300 * MAX_PIECE_SCREEN_FRACTION,
      3
    );
    expect(projectedHeightPx(PIECE_PX * shrink, NEAR_PX, SCALE, PERSPECTIVE)).toBeLessThan(VIEW_PX * 4);
  });

  it('leaves a piece that already fits at the size it is', () => {
    expect(billboardShrink(PIECE_PX, FAR_PX, SCALE, PERSPECTIVE, VIEW_PX)).toBe(1);
    expect(billboardShrink(PIECE_PX, NEAR_PX, SCALE, PERSPECTIVE, 0)).toBe(1);
  });

  it('holds the writing on a near piece to a size that can be read, and asks nothing of a far one', () => {
    const shrink = billboardShrink(PIECE_PX, NEAR_PX, SCALE, PERSPECTIVE, VIEW_PX);
    const near = billboardTextScale(shrink, NEAR_PX, SCALE, PERSPECTIVE);

    expect(near * 24 * projectedScaleOf(NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(28, 3);
    expect(near).toBeLessThanOrEqual(shrink);
    expect(billboardTextScale(1, FAR_PX, SCALE, PERSPECTIVE)).toBe(1);
  });

  it('leaves the chrome of a piece alone until it has to be shrunk', () => {
    expect(billboardHudTransform(1)).toBeNull();
    expect(billboardHudTransform(0.6067)).toBe('scale(0.607)');
  });
});
