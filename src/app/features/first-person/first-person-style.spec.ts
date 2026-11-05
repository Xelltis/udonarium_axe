import {
  billboardHudTransform,
  billboardLiftPx,
  billboardStyle,
  billboardTextScale,
  NIGHT_SKY,
  nightSkyAt,
  perspectivePx,
  PIECE_FOOT_MARGIN,
  pieceChromeBottomPercent,
  pieceChromeHeightPx,
  projectedScaleOf,
  scaleOf,
  shadeFor,
  waterSkyAt,
  withBillboardCut,
} from '@axe/features/first-person/first-person-style';
import { describe, expect, it } from 'vitest';

describe('the first-person camera', () => {
  it('sets the eye as far back as the view is wide for the angle it takes in', () => {
    expect(perspectivePx(1000, 90)).toBeCloseTo(500);
    expect(perspectivePx(1000, 60)).toBeCloseTo(866.025, 2);
  });

  it('draws a cell at a fixed size, whatever the grid of the table', () => {
    expect(scaleOf(50)).toBeCloseTo(5.12);
    expect(scaleOf(0)).toBe(1);
  });

  it('darkens with distance, and never quite to black', () => {
    expect(shadeFor(0, 300)).toBe(0);
    expect(shadeFor(150, 300)).toBeCloseTo(0.425);
    expect(shadeFor(900, 300)).toBe(0.85);
    expect(shadeFor(-10, 300)).toBe(0);
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
  const VIEW_PX = 800;

  it('blows up what stands near the eye and shrinks what stands away from it', () => {
    expect(projectedScaleOf(NEAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(1.923, 3);
    expect(projectedScaleOf(FAR_PX, SCALE, PERSPECTIVE)).toBeCloseTo(0.581, 3);
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
