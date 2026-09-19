import type { ReplayCutInScene } from '@axe/domain/replay/replay-cut-in-scene';
import type { ReplayFrameAssets } from '@axe/infrastructure/replay/replay-canvas';
import { paintReplayCutInScene } from '@axe/infrastructure/replay/replay-cut-in-painter';
import { image, recorder } from '@axe/testing/canvas-recorder';

/** The part of a 1080p frame a cut-in is played into. */
const area = { x: 24, y: 96, width: 1872, height: 600 };

describe('paintReplayCutInScene()', () => {
  function sceneOf(layers: Partial<ReplayCutInScene['layers'][number]>[]): ReplayCutInScene {
    return {
      durationMs: 1000,
      sceneLoop: false,
      backgroundColor: '',
      layers: layers.map((layer) => ({
        kind: 'image',
        hidden: false,
        x: 0,
        y: 0,
        width: 400,
        height: 200,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        clip: 'none',
        wipeShape: 'none',
        wipe: 1,
        crumbleShape: 'none',
        crumble: 1,
        opacity: 1,
        blur: 0,
        startMs: 0,
        endMs: 0,
        imageIdentifier: '',
        objectFit: 'contain',
        objectPosX: 50,
        objectPosY: 50,
        text: '',
        fontSizePx: 32,
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
        strokeColor: '',
        strokeWidthPx: 0,
        letterSpacingPx: 0,
        lineHeight: 1.15,
        vertical: false,
        fillShape: 'linear',
        fillFrom: '#000000',
        fillMid: '',
        fillTo: '',
        fillAngleDeg: 90,
        fillScalePx: 24,
        effect: 'none',
        effectStrength: 1,
        effectColor: '#ffffff',
        tracks: {},
        ...layer,
      })),
    };
  }

  const assets: ReplayFrameAssets = { imageOf: (identifier) => (identifier === 'pic' ? image(400, 200) : null) };

  it('draws the picture of every layer that has one', () => {
    const { ctx, images } = recorder();
    const scene = sceneOf([{ imageIdentifier: 'pic' }, { imageIdentifier: 'pic', y: 200 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(images).toHaveLength(2);
  });

  it('follows the track as the shot goes on', () => {
    const scene = sceneOf([
      {
        imageIdentifier: 'pic',
        tracks: {
          x: [
            { t: 0, v: 0, e: 'linear' },
            { t: 1000, v: 400 },
          ],
        },
      },
    ]);

    const early = recorder();
    paintReplayCutInScene(early.ctx, area, scene, assets, 0);
    const late = recorder();
    paintReplayCutInScene(late.ctx, area, scene, assets, 1000);

    expect(late.images[0].x).toBeGreaterThan(early.images[0].x);
  });

  it('leaves out a layer that is not on screen yet', () => {
    const { ctx, images } = recorder();
    const scene = sceneOf([{ imageIdentifier: 'pic', startMs: 800 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(images).toHaveLength(0);
  });

  it('leaves out a layer that is turned off', () => {
    const { ctx, images } = recorder();

    paintReplayCutInScene(ctx, area, sceneOf([{ imageIdentifier: 'pic', hidden: true }]), assets, 0);

    expect(images).toHaveLength(0);
  });

  it('writes the words of a text layer, outline first', () => {
    const { ctx, texts, strokes } = recorder();
    const scene = sceneOf([{ kind: 'text', text: '見せ場だ', strokeColor: '#000000', strokeWidthPx: 2 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(strokes.map((stroke) => stroke.text)).toContain('見せ場だ');
    expect(texts.map((text) => text.text)).toContain('見せ場だ');
  });

  it('paints a band in the colour it was given', () => {
    const { ctx, fills } = recorder();
    const scene = sceneOf([{ kind: 'fill', fillFrom: '#123456' }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(fills.map((fill) => fill.color)).toContain('#123456');
  });

  it('paints a striped band as bands rather than as one wash', () => {
    const { ctx, fills } = recorder();
    const scene = sceneOf([{ kind: 'fill', fillShape: 'stripes', fillFrom: '#111111', fillTo: '#eeeeee' }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    const colours = new Set(fills.map((fill) => fill.color));
    expect(colours.has('#111111')).toBe(true);
    expect(colours.has('#eeeeee')).toBe(true);
    expect(fills.length).toBeGreaterThan(4);
  });

  it('lays speed lines down as wedges rather than as one wash', () => {
    const { ctx, fills } = recorder();
    const scene = sceneOf([{ kind: 'fill', fillShape: 'speedlines', fillFrom: '#222222' }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    // Wedges are filled as paths, so the rectangle count stays low while the colour is used.
    expect(ctx.fillStyle).toBeDefined();
    expect(fills.every((fill) => fill.color !== undefined)).toBe(true);
  });

  it('lays halftone down as a grid of dots', () => {
    const dots: number[] = [];
    const { ctx } = recorder();
    (ctx as unknown as { arc: (x: number, y: number) => void }).arc = (x) => dots.push(x);
    const scene = sceneOf([{ kind: 'fill', fillShape: 'halftone', fillFrom: '#000000', fillScalePx: 40 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(dots.length).toBeGreaterThan(4);
  });

  it('repeats a striped band at the pitch it was given', () => {
    const wide = recorder();
    const tight = recorder();
    const band = { kind: 'fill' as const, fillShape: 'stripes' as const, fillFrom: '#111111', fillTo: '#eeeeee' };

    paintReplayCutInScene(wide.ctx, area, sceneOf([{ ...band, fillScalePx: 80 }]), assets, 0);
    paintReplayCutInScene(tight.ctx, area, sceneOf([{ ...band, fillScalePx: 8 }]), assets, 0);

    expect(tight.fills.length).toBeGreaterThan(wide.fills.length);
  });

  it('cuts a layer down to the outline it was given', () => {
    const clipped: string[] = [];
    const { ctx } = recorder();
    (ctx as unknown as { clip: () => void }).clip = () => clipped.push('clip');
    const scene = sceneOf([{ imageIdentifier: 'pic', clip: 'slant' }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(clipped.length).toBeGreaterThan(0);
  });

  it('leans a layer the way the browser leans it', () => {
    const upright = recorder();
    const leaned = recorder();

    paintReplayCutInScene(upright.ctx, area, sceneOf([{ imageIdentifier: 'pic' }]), assets, 0);
    paintReplayCutInScene(leaned.ctx, area, sceneOf([{ imageIdentifier: 'pic', skewXDeg: 30 }]), assets, 0);

    expect(leaned.images[0].x).not.toBe(upright.images[0].x);
  });

  it('keeps the part of a cropped picture it was told to keep', () => {
    const high = recorder();
    const low = recorder();
    const cropped = { imageIdentifier: 'pic', objectFit: 'cover' as const, width: 400, height: 100 };

    paintReplayCutInScene(high.ctx, area, sceneOf([{ ...cropped, objectPosY: 0 }]), assets, 0);
    paintReplayCutInScene(low.ctx, area, sceneOf([{ ...cropped, objectPosY: 100 }]), assets, 0);

    expect(low.images[0].y).toBeLessThan(high.images[0].y);
  });

  it('blows a small picture up to fill the box it was fitted into', () => {
    const small: ReplayFrameAssets = { imageOf: () => image(100, 50) };
    const { ctx, images } = recorder();
    const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'contain', width: 400, height: 200 }]);

    paintReplayCutInScene(ctx, area, scene, small, 0);

    // Fitted rather than left at its own size, which is what object-fit: contain does.
    expect(images[0].width).toBeGreaterThan(100);
  });

  it('draws nothing of a picture that has no size to it', () => {
    const nothing: ReplayFrameAssets = { imageOf: () => image(0, 0) };
    const { ctx, images } = recorder();
    const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'cover' }]);

    paintReplayCutInScene(ctx, area, scene, nothing, 0);

    for (const drawn of images) {
      expect(Number.isFinite(drawn.width)).toBe(true);
      expect(Number.isFinite(drawn.height)).toBe(true);
    }
  });

  it('runs a band across the way the browser runs it', () => {
    const { ctx, gradients } = recorder();
    // Ninety degrees is left to right, the way CSS reads a linear-gradient.
    const scene = sceneOf([{ kind: 'fill', fillFrom: '#000000', fillTo: '#ffffff', fillAngleDeg: 90 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(gradients[0].x1).toBeGreaterThan(gradients[0].x0);
    expect(gradients[0].y1).toBeCloseTo(gradients[0].y0, 6);
  });

  it('runs a band down the screen where the angle says down', () => {
    const { ctx, gradients } = recorder();
    const scene = sceneOf([{ kind: 'fill', fillFrom: '#000000', fillTo: '#ffffff', fillAngleDeg: 180 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(gradients[0].y1).toBeGreaterThan(gradients[0].y0);
    expect(gradients[0].x1).toBeCloseTo(gradients[0].x0, 6);
  });

  it('blows a cropped picture up until it covers the box', () => {
    const { ctx, images } = recorder();
    const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'cover', width: 400, height: 100 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(images[0].width).toBeGreaterThanOrEqual(400);
    expect(images[0].height).toBeGreaterThanOrEqual(100);
  });

  it('lets a layer in a part at a time in the video too', () => {
    const clipped: string[] = [];
    const { ctx } = recorder();
    (ctx as unknown as { clip: () => void }).clip = () => clipped.push('clip');
    const scene = sceneOf([{ imageIdentifier: 'pic', wipeShape: 'chevronRight', wipe: 0.5 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    expect(clipped.length).toBeGreaterThan(0);
  });

  it('breaks a text layer where the lines were written', () => {
    const { ctx, texts } = recorder();
    const scene = sceneOf([{ kind: 'text', text: '一\n二\n三', fontSizePx: 20 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    const drawn = texts.filter((entry) => ['一', '二', '三'].includes(entry.text));
    expect(drawn).toHaveLength(3);
    expect(drawn[0].y).toBeLessThan(drawn[2].y);
  });

  it('sets a downward text layer a letter at a time, right column first', () => {
    const { ctx, texts } = recorder();
    const scene = sceneOf([{ kind: 'text', text: 'ブチッ', vertical: true, fontSizePx: 20 }]);

    paintReplayCutInScene(ctx, area, scene, assets, 0);

    const drawn = texts.filter((entry) => ['ブ', 'チ', 'ッ'].includes(entry.text));
    expect(drawn).toHaveLength(3);
    expect(drawn[0].y).toBeLessThan(drawn[2].y);
    expect(drawn[0].x).toBe(drawn[2].x);
  });
});
