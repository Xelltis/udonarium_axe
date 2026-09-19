import { ReplayEventKind } from '@axe/domain/replay/replay-event';
import { REPLAY_FRAME_PRESETS, replayFrameLayout } from '@axe/domain/replay/replay-frame-layout';
import type { ReplayShot } from '@axe/domain/replay/replay-storyboard';
import type { ReplayFrameAssets } from '@axe/infrastructure/replay/replay-canvas';
import { DEFAULT_REPLAY_FRAME_STYLE, paintReplayFrame } from '@axe/infrastructure/replay/replay-frame-painter';
import { image, recorder } from '@axe/testing/canvas-recorder';

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

  it('draws nothing extra for a cut-in that is one picture', () => {
    const assets: ReplayFrameAssets = { imageOf: (identifier) => (identifier === 'pic' ? image(400, 200) : null) };
    const { ctx, images } = recorder();

    paintReplayFrame(ctx, layout, shot({ cutInId: 'pic' }), assets, 0, DEFAULT_REPLAY_FRAME_STYLE, null, 0);

    expect(images).toHaveLength(1);
  });
});
