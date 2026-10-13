import { FirstPersonPlaneQuad, FirstPersonWallQuad } from '@axe/domain/tabletop/first-person/first-person-scene';
import { FOG_VEIL_ALPHA } from '@axe/domain/tabletop/fog/fog-mode';
import {
  billboardHudTransform,
  billboardLiftPx,
  billboardStyle,
  billboardTextScale,
  blurFilter,
  cameraTransform,
  farBlurPx,
  litShade,
  MAX_FAR_BLUR_PX,
  NIGHT_SKY,
  nightSkyAt,
  perspectivePx,
  PIECE_FOOT_MARGIN,
  pieceChromeBottomPercent,
  pieceChromeHeightPx,
  pieceImageFilter,
  planeQuadStyle,
  projectedHeightPx,
  projectedScaleOf,
  scaleOf,
  shadeFor,
  wallQuadStyle,
  waterSkyAt,
  withBillboardCut,
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

  it('tips the world for a camera looking up, before standing it up', () => {
    expect(cameraTransform({ x: 100, y: 200, z: 25, yaw: 90, pitch: 30 }, 2, 500)).toBe(
      'translateZ(500px) rotateX(30deg) rotateX(90deg) rotateZ(-90deg) translate3d(-200px, -400px, -50px)'
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

  it('darkens to the colour it is given, as a face under water darkens to the depths', () => {
    expect(wallQuadStyle(wall(), 2, '', 0.3, false, '6, 53, 79')['backgroundImage']).toBe(
      'linear-gradient(rgba(6, 53, 79, 0.3), rgba(6, 53, 79, 0.3))'
    );
  });

  it('draws only the part a tipped camera keeps, cut to its slant, with the picture still over the whole wall', () => {
    const cut = wall({
      cut: {
        basePx: 10,
        topPx: 40,
        outline: [
          { u: 0, z: 40 },
          { u: 30, z: 10 },
          { u: 30, z: 40 },
        ],
      },
    });

    const style = wallQuadStyle(cut, 2, 'stone.png', 0.2);

    expect(style['height']).toBe('60px');
    expect(style['transform']).toBe('translate3d(200px, 100px, 80px) rotateZ(90deg) rotateX(-90deg)');
    expect(style['backgroundSize']).toBe('100% 100%, 100px 100px');
    expect(style['backgroundPosition']).toBe('0 0, -40px -20px');
    expect(style['clipPath']).toBe('polygon(0px 0px, 60px 60px, 60px 0px)');
  });

  it('cuts nothing off a level wall', () => {
    expect(wallQuadStyle(wall(), 2, 'stone.png', 0.2)['clipPath']).toBeUndefined();
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

  it('raises a piece standing close until its feet come up into the view', () => {
    const eyeZ = 40;
    const lift = billboardLiftPx(0, eyeZ, NEAR_PX, PERSPECTIVE, VIEW_PX);

    expect(lift).toBeGreaterThan(0);
    expect(((eyeZ - lift) * PERSPECTIVE) / NEAR_PX).toBeCloseTo((VIEW_PX / 2) * (1 - PIECE_FOOT_MARGIN), 3);
  });

  it('lets a near piece down to the floor as the eye looks down at its feet, and keeps it raised looking up', () => {
    const level = billboardLiftPx(0, 40, NEAR_PX, PERSPECTIVE, VIEW_PX);

    expect(billboardLiftPx(0, 40, NEAR_PX, PERSPECTIVE, VIEW_PX, -10)).toBeLessThan(level);
    expect(billboardLiftPx(0, 40, NEAR_PX, PERSPECTIVE, VIEW_PX, -60)).toBe(0);
    expect(billboardLiftPx(0, 40, NEAR_PX, PERSPECTIVE, VIEW_PX, 30)).toBeCloseTo(level, 6);
  });

  it('leaves a piece far enough off standing on the floor', () => {
    expect(billboardLiftPx(0, 40, FAR_PX, PERSPECTIVE, VIEW_PX)).toBe(0);
    expect(billboardLiftPx(0, 40, NEAR_PX, PERSPECTIVE, 0)).toBe(0);
  });

  it('deepens the veil for distance as the light on a face falls away', () => {
    expect(litShade(0.2, 1)).toBe(0.2);
    expect(litShade(0.2, 0.5)).toBe(0.6);
    expect(litShade(0.2, 0)).toBe(1);
    expect(litShade(0, 2)).toBe(0);
  });

  it('blurs nothing within the clear distance, and more and more out to the farthest drawn', () => {
    expect(farBlurPx(300, 300, 600)).toBe(0);
    expect(farBlurPx(310, 300, 600)).toBe(0.5);
    expect(farBlurPx(450, 300, 600)).toBe(1.5);
    expect(farBlurPx(600, 300, 600)).toBe(MAX_FAR_BLUR_PX);
    expect(farBlurPx(900, 300, 600)).toBe(MAX_FAR_BLUR_PX);
    expect(blurFilter(0)).toBeNull();
    expect(blurFilter(1.5)).toBe('blur(1.5px)');
  });

  it('blurs the picture of a piece standing far off along with the rest of its filter', () => {
    expect(pieceImageFilter(1, false, 1.5)).toBe('blur(1.5px)');
    expect(pieceImageFilter(0.4, true, 3)).toBe('brightness(0.4) blur(3px) drop-shadow(0 0 8px #ff3b30)');
  });

  it('dims the picture of a piece to the light on it and keeps the glow of a target', () => {
    expect(pieceImageFilter(1, false)).toBeNull();
    expect(pieceImageFilter(0.4, false)).toBe('brightness(0.4)');
    expect(pieceImageFilter(1, true)).toBe('drop-shadow(0 0 8px #ff3b30)');
    expect(pieceImageFilter(0.4, true)).toBe('brightness(0.4) drop-shadow(0 0 8px #ff3b30)');
  });

  it('holds the writing on a near piece to a size that can be read, and asks nothing of a far one', () => {
    const near = billboardTextScale(NEAR_PX, SCALE, PERSPECTIVE);

    expect(near * 24 * projectedScaleOf(NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(28, 3);
    expect(near).toBeLessThan(1);
    expect(billboardTextScale(FAR_PX, SCALE, PERSPECTIVE)).toBe(1);
  });

  it('measures what is told about a piece a row at a time', () => {
    expect(pieceChromeHeightPx({ badges: false, gauges: 0, label: false })).toBe(8);
    expect(pieceChromeHeightPx({ badges: true, gauges: 2, label: true })).toBe(8 + 54 + 48 + 46);
  });

  describe('where what is told about a piece stands', () => {
    const at = {
      heightPx: 75,
      baseZ: 0,
      eyeZ: 40,
      depthPx: FAR_PX,
      perspective: PERSPECTIVE,
      viewHeightPx: VIEW_PX,
      chromeScreenPx: 100,
      marginPx: 64,
    };

    it('stands just above the top of the picture for a piece far enough off', () => {
      expect(pieceChromeBottomPercent(at)).toBe(100);
    });

    it('comes down to stay in the view for a piece so near that the top of it is not', () => {
      const near = pieceChromeBottomPercent({ ...at, depthPx: NEAR_PX });
      const topOfChrome = (((75 * near) / 100 - 40) * PERSPECTIVE) / NEAR_PX + 100;

      expect(near).toBeLessThan(100);
      expect(topOfChrome).toBeCloseTo(VIEW_PX / 2 - 64, 0);
    });

    it('goes back up to the top of the picture as the eye looks up at a near piece', () => {
      expect(pieceChromeBottomPercent({ ...at, depthPx: NEAR_PX, pitchDeg: 20 })).toBeGreaterThan(
        pieceChromeBottomPercent({ ...at, depthPx: NEAR_PX })
      );
      expect(pieceChromeBottomPercent({ ...at, depthPx: NEAR_PX, pitchDeg: 80 })).toBe(100);
    });

    it('stays on the picture rather than below its feet, and asks nothing of a view not yet measured', () => {
      expect(pieceChromeBottomPercent({ ...at, depthPx: NEAR_PX, chromeScreenPx: 10_000 })).toBe(0);
      expect(pieceChromeBottomPercent({ ...at, viewHeightPx: 0 })).toBe(100);
    });
  });

  it('leaves the chrome of a piece alone until it has to be shrunk', () => {
    expect(billboardHudTransform(1)).toBeNull();
    expect(billboardHudTransform(0.6067)).toBe('scale(0.607)');
  });
});

describe('the depths seen from under water', () => {
  it('pales upward to the light from the surface and darkens below', () => {
    expect(waterSkyAt('#06354f', 0, 800)).toBe(
      'linear-gradient(to bottom, color-mix(in srgb, #06354f 55%, #b8e8ff) 0px,' +
        ' color-mix(in srgb, #06354f 80%, #b8e8ff) 240px, #06354f 400px, color-mix(in srgb, #06354f 55%, #000) 800px)'
    );
  });

  it('moves with the eye as it looks up, as the night sky does', () => {
    expect(waterSkyAt('#06354f', 100, 800)).toContain('#06354f 500px');
  });
});

describe('the night sky as the eye looks up or down', () => {
  it('is the level sky while the eye looks level', () => {
    expect(nightSkyAt(0, 800)).toBe(NIGHT_SKY);
  });

  it('moves the haze at the horizon down the view and keeps the top and the foot where they are', () => {
    expect(nightSkyAt(100, 800)).toBe(
      'linear-gradient(to bottom, #04060b 0px, #0b1220 356px, #1c2840 492px, #222f47 500px, #10161f 548px, #06080c 800px)'
    );
  });
});

describe('cutting a piece a tipped camera passes', () => {
  const style = { width: '10px' };

  it('leaves a piece it keeps whole as it was', () => {
    expect(withBillboardCut(style, { lowPx: 0, highPx: 100 }, 0, 100)).toBe(style);
  });

  it('cuts it from below, leaving what is told above it in view', () => {
    expect(withBillboardCut(style, { lowPx: 25, highPx: 100 }, 0, 100)['clipPath']).toBe(
      'inset(-400% -100% 25% -100%)'
    );
  });

  it('cuts it from above, taking what is told above it too', () => {
    expect(withBillboardCut(style, { lowPx: 0, highPx: 60 }, 0, 100)['clipPath']).toBe('inset(40% -100% -100% -100%)');
  });
});
