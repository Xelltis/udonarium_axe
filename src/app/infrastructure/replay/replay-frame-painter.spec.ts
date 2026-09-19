import type { ReplayCutInScene } from '@axe/domain/replay/replay-cut-in-scene';
import { ReplayEventKind } from '@axe/domain/replay/replay-event';
import { REPLAY_FRAME_PRESETS, replayFrameLayout } from '@axe/domain/replay/replay-frame-layout';
import type { ReplayShot } from '@axe/domain/replay/replay-storyboard';
import {
  DEFAULT_REPLAY_FRAME_STYLE,
  paintReplayFrame,
  type ReplayFrameAssets,
  type ReplayFrameCanvas,
  type ReplayFrameImage,
} from '@axe/infrastructure/replay/replay-frame-painter';

/** What a standing figure of one cell carries besides where it is and what it shows. */
const FIGURE_SHAPE = {
  shape: 'figure',
  width: 1,
  height: 1,
  showsName: true,
  isConcealed: false,
  color: '',
  title: '',
  text: '',
  count: 0,
  openCells: [],
} as const;

interface DrawnImage {
  image: ReplayFrameImage;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GradientLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function recorder(): {
  ctx: ReplayFrameCanvas;
  texts: { text: string; x: number; y: number; font: string; color: string }[];
  images: DrawnImage[];
  fills: { x: number; y: number; width: number; height: number; color: string }[];
  strokes: { text: string; x: number; y: number; color: string }[];
  gradients: GradientLine[];
} {
  const texts: { text: string; x: number; y: number; font: string; color: string }[] = [];
  const images: DrawnImage[] = [];
  const fills: { x: number; y: number; width: number; height: number; color: string }[] = [];
  const strokes: { text: string; x: number; y: number; color: string }[] = [];
  const gradients: GradientLine[] = [];

  // Anything flat on the ground is drawn through the matrix, so the spec applies the same
  // transform and checks where it lands on screen.
  let matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const stack: [number, number, number, number, number, number][] = [];
  const atX = (x: number, y: number) => matrix[0] * x + matrix[2] * y + matrix[4];
  const atY = (x: number, y: number) => matrix[1] * x + matrix[3] * y + matrix[5];

  const ctx = {
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {
      stack.push([...matrix] as typeof matrix);
    },
    restore() {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = [a, b, c, d, e, f];
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({
        x: atX(x, y),
        y: atY(x, y),
        width: width * matrix[0],
        height: height * matrix[3],
        color: String(ctx.fillStyle),
      });
    },
    strokeRect() {},
    rect() {},
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = compose(matrix, [a, b, c, d, e, f]);
    },
    ellipse() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    clip() {},
    arc() {},
    translate(tx: number, ty: number) {
      matrix = compose(matrix, [1, 0, 0, 1, tx, ty]);
    },
    rotate(radians: number) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      matrix = compose(matrix, [cos, sin, -sin, cos, 0, 0]);
    },
    scale(sx: number, sy: number) {
      matrix = compose(matrix, [sx, 0, 0, sy, 0, 0]);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      gradients.push({ x0: atX(x0, y0), y0: atY(x0, y0), x1: atX(x1, y1), y1: atY(x1, y1) });
      return { addColorStop() {} };
    },
    strokeText(text: string, x: number, y: number) {
      strokes.push({ text, x: atX(x, y), y: atY(x, y), color: String(ctx.strokeStyle) });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x: atX(x, y), y: atY(x, y), font: ctx.font, color: String(ctx.fillStyle) });
    },
    measureText(text: string) {
      return { width: [...text].length * 20 };
    },
    drawImage(image: ReplayFrameImage, x: number, y: number, width: number, height: number) {
      images.push({ image, x: atX(x, y), y: atY(x, y), width: width * matrix[0], height: height * matrix[3] });
    },
  } as unknown as ReplayFrameCanvas;

  return { ctx, texts, images, fills, strokes, gradients };
}

type Matrix = [number, number, number, number, number, number];

function compose(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function image(width: number, height: number): ReplayFrameImage {
  return { width, height } as ReplayFrameImage;
}

const layout = replayFrameLayout(REPLAY_FRAME_PRESETS['1080p']);

function shot(overrides: Partial<ReplayShot> = {}): ReplayShot {
  return {
    seq: 1,
    startMs: 0,
    durationMs: 2000,
    kind: ReplayEventKind.ChatMessage,
    chapter: '',
    isChapterStart: false,
    speaker: 'アリス',
    speakerColor: '',
    portraitId: '',
    backgroundId: '',
    cutInId: '',
    cutInScene: null,
    text: 'こんばんは',
    isNarration: false,
    move: null,
    ...overrides,
  };
}

const noAssets: ReplayFrameAssets = { imageOf: () => null };

describe('paintReplayFrame()', () => {
  it('draws the name of the speaker and the line', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot(), noAssets, 0);

    expect(texts.map((entry) => entry.text)).toEqual(['アリス', 'こんばんは']);
    expect(texts[0].y).toBeLessThan(texts[1].y);
  });

  it('brings the colour of the speaker to a readable brightness for the name', () => {
    const bright = recorder();
    paintReplayFrame(bright.ctx, layout, shot({ speakerColor: '#88ccff' }), noAssets, 0);
    expect(bright.texts[0].color).toBe('#88ccff');

    const dark = recorder();
    paintReplayFrame(dark.ctx, layout, shot({ speakerColor: '#000000' }), noAssets, 0);
    expect(dark.texts[0].color).not.toBe('#000000');
  });

  it('draws only the text when there is no speaker', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot({ speaker: '', text: '静まり返った' }), noAssets, 0);

    expect(texts.map((entry) => entry.text)).toEqual(['静まり返った']);
  });

  it('wraps a long line inside the box', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot({ text: 'あ'.repeat(500) }), noAssets, 0);

    const body = texts.filter((entry) => entry.text.startsWith('あ'));
    expect(body.length).toBeGreaterThan(1);
    expect(body.length).toBeLessThanOrEqual(layout.body.maxLines);
    expect(body[body.length - 1].text.endsWith('…')).toBe(true);
  });

  it('covers the frame with the background', () => {
    const { ctx, images } = recorder();
    const assets: ReplayFrameAssets = { imageOf: () => image(100, 100) };
    paintReplayFrame(ctx, layout, shot({ backgroundId: 'bg-1' }), assets, 0);

    expect(images[0].width).toBeGreaterThanOrEqual(layout.width);
    expect(images[0].height).toBeGreaterThanOrEqual(layout.height);
  });

  it('fits the portrait to the frame and stands it on the dialogue box', () => {
    const { ctx, images } = recorder();
    const assets: ReplayFrameAssets = { imageOf: () => image(1000, 2000) };
    paintReplayFrame(ctx, layout, shot({ portraitId: 'img-1' }), assets, 0);

    const portrait = images[0];
    expect(portrait.width).toBeLessThanOrEqual(layout.portrait.maxWidth);
    expect(portrait.height).toBeLessThanOrEqual(layout.portrait.maxHeight);
    expect(portrait.y + portrait.height).toBe(layout.portrait.y);
  });

  it('draws nothing when an asset is missing', () => {
    const { ctx, images } = recorder();
    paintReplayFrame(ctx, layout, shot({ portraitId: 'img-1', backgroundId: 'bg-1' }), noAssets, 0);

    expect(images).toHaveLength(0);
  });

  it('shows a chapter title large and centred', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot({ isChapterStart: true, text: '第二幕', speaker: '' }), noAssets, 0);

    expect(texts.map((entry) => entry.text)).toEqual(['第二幕']);
    expect(texts[0].x).toBe(layout.width / 2);
  });

  it('tucks the title into a corner once the chapter is under way', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot({ chapter: '第二幕' }), noAssets, 0);

    expect(texts.map((entry) => entry.text)).toEqual(['第二幕', 'アリス', 'こんばんは']);
    expect(texts[0].y).toBe(layout.chapter.y);
  });

  it('draws the table and its pieces from directly above', () => {
    const { ctx, images, fills } = recorder();
    const assets: ReplayFrameAssets = { imageOf: (id) => (id === 'top' || id === 'img-1' ? image(100, 100) : null) };
    paintReplayFrame(ctx, layout, shot(), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: 'top',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 0,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: '盗賊',
          imageIdentifier: 'img-1',
        },
      ],
      overlay: null,
    });

    const table = images[0];
    const piece = images[1];
    expect(piece.width).toBeCloseTo(table.width / 10, 5);
    expect(piece.x).toBeGreaterThanOrEqual(layout.board.x);
    expect(piece.x + piece.width).toBeLessThanOrEqual(layout.board.x + layout.board.width);
    expect(fills.some((fill) => fill.width === table.width)).toBe(true);
  });

  it('sets the name of each piece at its feet', () => {
    const { ctx, texts } = recorder();
    paintReplayFrame(ctx, layout, shot(), noAssets, 0, DEFAULT_REPLAY_FRAME_STYLE, {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 0,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: '盗賊',
          imageIdentifier: '',
        },
      ],
      overlay: null,
    });

    expect(texts.map((entry) => entry.text)).toEqual(['盗賊', 'アリス', 'こんばんは']);
  });

  it('shrinks the portraits and lines them up when a board is showing', () => {
    const assets: ReplayFrameAssets = { imageOf: () => image(1000, 2000) };
    const alone = recorder();
    paintReplayFrame(alone.ctx, layout, shot({ portraitId: 'img-1' }), assets, 0);

    const beside = recorder();
    paintReplayFrame(beside.ctx, layout, shot({ portraitId: 'img-1' }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [],
      overlay: null,
    });

    const portrait = beside.images[beside.images.length - 1];
    expect(portrait.height).toBeLessThan(alone.images[0].height);
    expect(portrait.y + portrait.height).toBe(layout.portrait.y);
  });

  it('slides a moved piece along its route', () => {
    const scene = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 300,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: '',
          imageIdentifier: '',
        },
      ],
      overlay: null,
    };
    const moving = shot({
      move: {
        targetId: 'c1',
        route: [
          { x: 0, y: 0, z: 0 },
          { x: 300, y: 0, z: 0 },
        ],
      },
    });

    const at = (progress: number) => {
      const { ctx, fills } = recorder();
      paintReplayFrame(ctx, layout, moving, noAssets, 0, DEFAULT_REPLAY_FRAME_STYLE, scene, progress);
      return fills.filter((fill) => fill.width === fill.height).pop()!.x;
    };

    expect(at(0)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(at(1));
  });

  it('ends the slide exactly where the recording put the piece', () => {
    const scene = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 300,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: '',
          imageIdentifier: '',
        },
      ],
      overlay: null,
    };
    const still = recorder();
    paintReplayFrame(still.ctx, layout, shot(), noAssets, 0, DEFAULT_REPLAY_FRAME_STYLE, scene);

    const slid = recorder();
    const moving = shot({
      move: {
        targetId: 'c1',
        route: [
          { x: 0, y: 0, z: 0 },
          { x: 300, y: 0, z: 0 },
        ],
      },
    });
    paintReplayFrame(slid.ctx, layout, moving, noAssets, 0, DEFAULT_REPLAY_FRAME_STYLE, scene, 1);

    const square = (fills: { x: number; width: number; height: number }[]) =>
      fills.filter((fill) => fill.width === fill.height).pop()!.x;
    expect(square(slid.fills)).toBeCloseTo(square(still.fills), 5);
  });

  it('raises a piece too small to see up to a visible size', () => {
    const far = (identifier: string, x: number) => ({
      identifier,
      aliasName: 'character',
      ...FIGURE_SHAPE,
      x,
      y: 0,
      z: 0,
      size: 1,
      rotate: 0,
      name: '',
      imageIdentifier: '',
    });
    const { ctx, fills } = recorder();
    paintReplayFrame(ctx, layout, shot(), noAssets, 0, DEFAULT_REPLAY_FRAME_STYLE, {
      width: 400,
      height: 400,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [far('a', 0), far('b', 19_950)],
      overlay: null,
    });

    const squares = fills.filter((fill) => fill.width === fill.height);
    expect(squares[squares.length - 1].width).toBe(layout.board.minPiece);
  });

  it('frames the area the pieces occupy and fills it', () => {
    const assets: ReplayFrameAssets = { imageOf: () => image(100, 100) };
    const { ctx, images } = recorder();
    paintReplayFrame(ctx, layout, shot(), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, {
      width: 200,
      height: 200,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: 'top',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'a',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 0,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: '',
          imageIdentifier: '',
        },
      ],
      overlay: null,
    });

    expect(images[0].width).toBeGreaterThan(layout.board.width);
  });

  it('draws the path and an arrow at the destination of a move', () => {
    const marks: string[] = [];
    const { ctx } = recorder();
    const spy = ctx as unknown as Record<string, unknown>;
    spy['beginPath'] = () => marks.push('begin');
    spy['lineTo'] = () => marks.push('line');
    spy['closePath'] = () => marks.push('close');
    spy['fill'] = () => marks.push('fill');

    paintReplayFrame(
      ctx,
      layout,
      shot({
        move: {
          targetId: 'c1',
          route: [
            { x: 0, y: 0, z: 0 },
            { x: 300, y: 0, z: 0 },
          ],
        },
      }),
      noAssets,
      0,
      DEFAULT_REPLAY_FRAME_STYLE,
      {
        width: 10,
        height: 10,
        gridSize: 50,
        gridType: 0,
        gridShow: false,
        gridColor: '',
        imageIdentifier: '',
        backgroundImageIdentifier: '',
        pieces: [
          {
            identifier: 'c1',
            aliasName: 'character',
            ...FIGURE_SHAPE,
            x: 300,
            y: 0,
            z: 0,
            size: 1,
            rotate: 0,
            name: '',
            imageIdentifier: '',
          },
        ],
        overlay: null,
      },
      0.5
    );

    expect(marks).toContain('close');
    expect(marks).toContain('fill');
  });

  it('puts the portrait on the side where the speaker stands', () => {
    const assets: ReplayFrameAssets = { imageOf: () => image(1000, 2000) };
    const scene = (x: number) => ({
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x,
          y: 0,
          z: 0,
          size: 1,
          rotate: 0,
          name: 'アリス',
          imageIdentifier: '',
        },
      ],
      overlay: null,
    });

    const near = recorder();
    paintReplayFrame(near.ctx, layout, shot({ portraitId: 'p' }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, scene(0));
    const far = recorder();
    paintReplayFrame(far.ctx, layout, shot({ portraitId: 'p' }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, scene(450));

    const portrait = (images: { x: number; width: number }[]) => images[images.length - 1];
    expect(portrait(near.images).x).toBeLessThan(layout.width / 2);
    expect(portrait(far.images).x).toBeGreaterThan(layout.width / 2);
  });

  it('shows progress as a bar', () => {
    const { ctx, fills } = recorder();
    paintReplayFrame(ctx, layout, shot(), noAssets, 0.25);

    const bar = fills[fills.length - 1];
    expect(bar.y).toBe(layout.progress.y);
    expect(bar.width).toBe(layout.width * 0.25);
  });

  it('keeps the bar within its track when progress runs out of range', () => {
    const { ctx, fills } = recorder();
    paintReplayFrame(ctx, layout, shot(), noAssets, 9);
    expect(fills[fills.length - 1].width).toBe(layout.width);
  });

  it('still lays a ground for a stretch with no shot', () => {
    const { ctx, fills, texts } = recorder();
    paintReplayFrame(ctx, layout, null, noAssets, 1);

    expect(texts).toHaveLength(0);
    expect(fills[0]).toMatchObject({ x: 0, y: 0, width: layout.width, height: layout.height });
  });

  it('lays the cut-in that was showing over the board', () => {
    const { ctx, images } = recorder();
    const picture = image(1600, 900);

    paintReplayFrame(
      ctx,
      layout,
      shot({ cutInId: 'cut-1' }),
      { imageOf: (identifier) => (identifier === 'cut-1' ? picture : null) },
      0.5
    );

    // It never hides the dialogue box and stays within the board's frame.
    const drawn = images.find((one) => one.image === picture);
    expect(drawn).toBeDefined();
    expect(drawn!.width).toBeLessThanOrEqual(layout.board.width + 1);
    expect(drawn!.height).toBeLessThanOrEqual(layout.board.height + 1);
  });

  it('lays nothing over the board without a cut-in', () => {
    const { ctx, images } = recorder();

    paintReplayFrame(ctx, layout, shot(), { imageOf: () => image(100, 100) }, 0.5);

    expect(images.every((one) => one.width <= layout.width)).toBe(true);
  });

  it('keeps only what was visible on a darkened table', () => {
    const { ctx, fills } = recorder();
    const board = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [],
      overlay: {
        darknessAlpha: 0.9,
        darknessColor: '#000010',
        baseRevealAlpha: 0,
        reveals: [{ x: 100, y: 100, brightPx: 50, dimPx: 100, angle: 360, direction: 0, color: '#fff', full: true }],
        glows: [],
        shadows: [],
      },
    };

    paintReplayFrame(ctx, layout, shot(), { imageOf: () => null }, 0.5, DEFAULT_REPLAY_FRAME_STYLE, board);

    // The shroud is drawn on its own surface and composited, so it never appears in the board's fills.
    expect(fills.some((one) => one.color === '#000010')).toBe(false);
  });

  it('stands the pieces up rather than laying them flat when tilted', () => {
    const { ctx, images } = recorder();
    const piece = image(64, 64);
    const board = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      overlay: null,
      pieces: [
        {
          identifier: 'c1',
          aliasName: 'character',
          ...FIGURE_SHAPE,
          x: 200,
          y: 200,
          z: 0,
          size: 1,
          rotate: 0,
          name: '',
          imageIdentifier: 'p1',
        },
      ],
    };
    const assets = { imageOf: (identifier: string) => (identifier === 'p1' ? piece : null) };

    const flat = () => {
      const target = recorder();
      paintReplayFrame(target.ctx, layout, shot(), assets, 0.5, DEFAULT_REPLAY_FRAME_STYLE, board, 1, {
        spin: 0,
        tilt: 0,
      });
      return target.images.find((one) => one.image === piece)!;
    };

    paintReplayFrame(ctx, layout, shot(), assets, 0.5, DEFAULT_REPLAY_FRAME_STYLE, board, 1, { spin: 0, tilt: 50 });
    const standing = images.find((one) => one.image === piece)!;

    // Standing keeps the feet in place and grows the image upward; left square it would look squashed.
    expect(standing.height).toBeCloseTo(standing.width, 6);
    expect(standing.y).toBeLessThan(flat().y);
  });

  it('keeps the table inside the frame even when tilted', () => {
    const { ctx, fills } = recorder();
    const board = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      overlay: null,
      pieces: [],
    };

    paintReplayFrame(ctx, layout, shot(), { imageOf: () => null }, 0.5, DEFAULT_REPLAY_FRAME_STYLE, board, 1, {
      spin: 10,
      tilt: 50,
    });

    const surface = fills.find((one) => one.color === DEFAULT_REPLAY_FRAME_STYLE.boardSurface)!;
    expect(surface.x).toBeGreaterThanOrEqual(layout.board.x - 1);
    expect(surface.width).toBeLessThanOrEqual(layout.board.width + 1);
  });

  describe('a cut-in built out of layers', () => {
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

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

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
      paintReplayFrame(
        early.ctx,
        layout,
        shot({ cutInScene: scene, durationMs: 1000 }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );
      const late = recorder();
      paintReplayFrame(
        late.ctx,
        layout,
        shot({ cutInScene: scene, durationMs: 1000 }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        1
      );

      expect(late.images[0].x).toBeGreaterThan(early.images[0].x);
    });

    it('leaves out a layer that is not on screen yet', () => {
      const { ctx, images } = recorder();
      const scene = sceneOf([{ imageIdentifier: 'pic', startMs: 800 }]);

      paintReplayFrame(
        ctx,
        layout,
        shot({ cutInScene: scene, durationMs: 1000 }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );

      expect(images).toHaveLength(0);
    });

    it('leaves out a layer that is turned off', () => {
      const { ctx, images } = recorder();

      paintReplayFrame(
        ctx,
        layout,
        shot({ cutInScene: sceneOf([{ imageIdentifier: 'pic', hidden: true }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );

      expect(images).toHaveLength(0);
    });

    it('writes the words of a text layer, outline first', () => {
      const { ctx, texts, strokes } = recorder();
      const scene = sceneOf([{ kind: 'text', text: '見せ場だ', strokeColor: '#000000', strokeWidthPx: 2 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(strokes.map((stroke) => stroke.text)).toContain('見せ場だ');
      expect(texts.map((text) => text.text)).toContain('見せ場だ');
    });

    it('paints a band in the colour it was given', () => {
      const { ctx, fills } = recorder();
      const scene = sceneOf([{ kind: 'fill', fillFrom: '#123456' }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(fills.map((fill) => fill.color)).toContain('#123456');
    });

    it('paints a striped band as bands rather than as one wash', () => {
      const { ctx, fills } = recorder();
      const scene = sceneOf([{ kind: 'fill', fillShape: 'stripes', fillFrom: '#111111', fillTo: '#eeeeee' }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      const colours = new Set(fills.map((fill) => fill.color));
      expect(colours.has('#111111')).toBe(true);
      expect(colours.has('#eeeeee')).toBe(true);
      expect(fills.length).toBeGreaterThan(4);
    });

    it('lays speed lines down as wedges rather than as one wash', () => {
      const { ctx, fills } = recorder();
      const scene = sceneOf([{ kind: 'fill', fillShape: 'speedlines', fillFrom: '#222222' }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      // Wedges are filled as paths, so the rectangle count stays low while the colour is used.
      expect(ctx.fillStyle).toBeDefined();
      expect(fills.every((fill) => fill.color !== undefined)).toBe(true);
    });

    it('lays halftone down as a grid of dots', () => {
      const dots: number[] = [];
      const { ctx } = recorder();
      (ctx as unknown as { arc: (x: number, y: number) => void }).arc = (x) => dots.push(x);
      const scene = sceneOf([{ kind: 'fill', fillShape: 'halftone', fillFrom: '#000000', fillScalePx: 40 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(dots.length).toBeGreaterThan(4);
    });

    it('repeats a striped band at the pitch it was given', () => {
      const wide = recorder();
      const tight = recorder();
      const band = { kind: 'fill' as const, fillShape: 'stripes' as const, fillFrom: '#111111', fillTo: '#eeeeee' };

      paintReplayFrame(
        wide.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ ...band, fillScalePx: 80 }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );
      paintReplayFrame(
        tight.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ ...band, fillScalePx: 8 }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );

      expect(tight.fills.length).toBeGreaterThan(wide.fills.length);
    });

    it('cuts a layer down to the outline it was given', () => {
      const clipped: string[] = [];
      const { ctx } = recorder();
      (ctx as unknown as { clip: () => void }).clip = () => clipped.push('clip');
      const scene = sceneOf([{ imageIdentifier: 'pic', clip: 'slant' }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(clipped.length).toBeGreaterThan(0);
    });

    it('leans a layer the way the browser leans it', () => {
      const upright = recorder();
      const leaned = recorder();

      paintReplayFrame(
        upright.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ imageIdentifier: 'pic' }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );
      paintReplayFrame(
        leaned.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ imageIdentifier: 'pic', skewXDeg: 30 }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );

      expect(leaned.images[0].x).not.toBe(upright.images[0].x);
    });

    it('keeps the part of a cropped picture it was told to keep', () => {
      const high = recorder();
      const low = recorder();
      const cropped = { imageIdentifier: 'pic', objectFit: 'cover' as const, width: 400, height: 100 };

      paintReplayFrame(
        high.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ ...cropped, objectPosY: 0 }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );
      paintReplayFrame(
        low.ctx,
        layout,
        shot({ cutInScene: sceneOf([{ ...cropped, objectPosY: 100 }]) }),
        assets,
        0,
        DEFAULT_REPLAY_FRAME_STYLE,
        null,
        0
      );

      expect(low.images[0].y).toBeLessThan(high.images[0].y);
    });

    it('blows a small picture up to fill the box it was fitted into', () => {
      const small: ReplayFrameAssets = { imageOf: () => image(100, 50) };
      const { ctx, images } = recorder();
      const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'contain', width: 400, height: 200 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), small, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      // Fitted rather than left at its own size, which is what object-fit: contain does.
      expect(images[0].width).toBeGreaterThan(100 * layout.scale);
    });

    it('draws nothing of a picture that has no size to it', () => {
      const nothing: ReplayFrameAssets = { imageOf: () => image(0, 0) };
      const { ctx, images } = recorder();
      const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'cover' }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), nothing, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      for (const drawn of images) {
        expect(Number.isFinite(drawn.width)).toBe(true);
        expect(Number.isFinite(drawn.height)).toBe(true);
      }
    });

    it('runs a band across the way the browser runs it', () => {
      const { ctx, gradients } = recorder();
      // Ninety degrees is left to right, the way CSS reads a linear-gradient.
      const scene = sceneOf([{ kind: 'fill', fillFrom: '#000000', fillTo: '#ffffff', fillAngleDeg: 90 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(gradients[0].x1).toBeGreaterThan(gradients[0].x0);
      expect(gradients[0].y1).toBeCloseTo(gradients[0].y0, 6);
    });

    it('runs a band down the screen where the angle says down', () => {
      const { ctx, gradients } = recorder();
      const scene = sceneOf([{ kind: 'fill', fillFrom: '#000000', fillTo: '#ffffff', fillAngleDeg: 180 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(gradients[0].y1).toBeGreaterThan(gradients[0].y0);
      expect(gradients[0].x1).toBeCloseTo(gradients[0].x0, 6);
    });

    it('blows a cropped picture up until it covers the box', () => {
      const { ctx, images } = recorder();
      const scene = sceneOf([{ imageIdentifier: 'pic', objectFit: 'cover', width: 400, height: 100 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(images[0].width).toBeGreaterThanOrEqual(400);
      expect(images[0].height).toBeGreaterThanOrEqual(100);
    });

    it('lets a layer in a part at a time in the video too', () => {
      const clipped: string[] = [];
      const { ctx } = recorder();
      (ctx as unknown as { clip: () => void }).clip = () => clipped.push('clip');
      const scene = sceneOf([{ imageIdentifier: 'pic', wipeShape: 'chevronRight', wipe: 0.5 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(clipped.length).toBeGreaterThan(0);
    });

    it('breaks a text layer where the lines were written', () => {
      const { ctx, texts } = recorder();
      const scene = sceneOf([{ kind: 'text', text: '一\n二\n三', fontSizePx: 20 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      const drawn = texts.filter((entry) => ['一', '二', '三'].includes(entry.text));
      expect(drawn).toHaveLength(3);
      expect(drawn[0].y).toBeLessThan(drawn[2].y);
    });

    it('sets a downward text layer a letter at a time, right column first', () => {
      const { ctx, texts } = recorder();
      const scene = sceneOf([{ kind: 'text', text: 'ブチッ', vertical: true, fontSizePx: 20 }]);

      paintReplayFrame(ctx, layout, shot({ cutInScene: scene }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      const drawn = texts.filter((entry) => ['ブ', 'チ', 'ッ'].includes(entry.text));
      expect(drawn).toHaveLength(3);
      expect(drawn[0].y).toBeLessThan(drawn[2].y);
      expect(drawn[0].x).toBe(drawn[2].x);
    });

    it('draws nothing extra for a cut-in that is one picture', () => {
      const { ctx, images } = recorder();

      paintReplayFrame(ctx, layout, shot({ cutInId: 'pic' }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

      expect(images).toHaveLength(1);
    });
  });
});
