import type { ReplayBoardPiece, ReplayBoardScene } from '@axe/domain/replay/replay-board-view';
import type { ReplayBoardSegment, ReplayMotion } from '@axe/domain/replay/video/replay-video-timeline';
import type { ReplayFrameAssets } from '@axe/infrastructure/replay/replay-canvas';
import { paintReplayBoard, type ReplayBoardPaint } from '@axe/infrastructure/replay/video/replay-board-painter';
import { image, recorder } from '@axe/testing/canvas-recorder';

function piece(identifier: string, overrides: Partial<ReplayBoardPiece> = {}): ReplayBoardPiece {
  return {
    identifier,
    aliasName: 'character',
    x: 100,
    y: 100,
    z: 0,
    size: 1,
    rotate: 0,
    name: '',
    imageIdentifier: '',
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
    tiled: false,
    elevation: 0,
    view: 3,
    door: null,
    sideImageIdentifier: '',
    ...overrides,
  };
}

function scene(pieces: ReplayBoardPiece[]): ReplayBoardScene {
  return {
    width: 20,
    height: 20,
    gridSize: 50,
    gridType: 0,
    gridShow: false,
    gridColor: '',
    imageIdentifier: 'table',
    backgroundImageIdentifier: '',
    pieces,
    overlay: null,
  };
}

function beat(motions: Partial<ReplayMotion>[], pops: ReplayBoardSegment['pops'] = []): ReplayBoardSegment {
  return {
    kind: 'board',
    startMs: 0,
    durationMs: 2000,
    seq: 1,
    boardFrom: 0,
    boardTo: 1,
    chapter: '',
    background: '',
    focus: [],
    motions: motions.map((motion) => ({
      kind: 'path',
      targetId: 'a',
      startMs: 0,
      durationMs: 1000,
      route: [],
      fromAngle: 0,
      toAngle: 0,
      ...motion,
    })),
    pops,
    beams: [],
  };
}

const surface = image(1000, 1000);
const figure = image(100, 200);
const paving = image(64, 64);
const bricks = image(64, 64);
const torch = image(32, 32);
const pictures: Record<string, ReturnType<typeof image>> = {
  table: surface,
  fig: figure,
  paving,
  bricks,
  torch,
};
const assets: ReplayFrameAssets = { imageOf: (identifier) => pictures[identifier] ?? null };

function paint(overrides: Partial<ReplayBoardPaint>) {
  const canvas = recorder();
  paintReplayBoard(
    canvas.ctx,
    {
      scene: scene([]),
      before: null,
      camera: { x: 0, y: 0, width: 1000, height: 1000 },
      area: { x: 0, y: 0, width: 1000, height: 1000 },
      beat: null,
      highlight: null,
      dim: 0,
      labelSize: 20,
      popSize: 40,
      fontFamily: 'sans-serif',
      ...overrides,
    },
    assets
  );
  return canvas;
}

describe('drawing the board of a replay video', () => {
  it('lays the table picture over the whole table', () => {
    const drawn = paint({}).images.find((one) => one.image === surface)!;

    expect(drawn).toMatchObject({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it('sizes the shadow under a figure with the figure, closer in or further out', () => {
    const shadowAt = (width: number) =>
      paint({
        scene: scene([piece('a', { imageIdentifier: 'fig' })]),
        camera: { x: 0, y: 0, width, height: width },
      }).images.find((one) => one.image === figure)!.shadowBlur;

    expect(shadowAt(250)).toBeCloseTo(shadowAt(1000) * 4);
  });

  it('lifts the top of a raised block straight up the screen, however it is turned on the table', () => {
    const topAt = (rotate: number) =>
      paint({
        scene: scene([piece('t', { shape: 'terrain', width: 2, height: 2, elevation: 2, view: 3, rotate })]),
      }).fills.find((one) => one.color === '#5d6270')!;
    const square = topAt(0);
    const turned = topAt(90);

    expect(turned.y).toBeCloseTo(square.y);
  });

  it('writes the name of a figure under it', () => {
    const texts = paint({ scene: scene([piece('a', { name: '勇者' })]) }).texts.map((text) => text.text);

    expect(texts).toContain('勇者');
  });

  it('writes the face a die shows, or hides it when rolled in secret', () => {
    const shown = paint({ scene: scene([piece('d', { shape: 'die', text: '6' })]) }).texts.map((text) => text.text);
    const hidden = paint({ scene: scene([piece('d', { shape: 'die', isConcealed: true })]) }).texts.map(
      (text) => text.text
    );

    expect(shown).toContain('6');
    expect(hidden).toContain('?');
  });

  it('says how many cards a pile holds', () => {
    const texts = paint({ scene: scene([piece('p', { shape: 'card', height: 0, count: 12 })]) }).texts;

    expect(texts.map((text) => text.text)).toContain('12');
  });

  it('writes the title of a note', () => {
    const texts = paint({
      scene: scene([piece('n', { shape: 'note', title: '覚え書き', width: 3, height: 2 })]),
    }).texts;

    expect(texts.map((text) => text.text)).toContain('覚え書き');
  });

  it('carries a moving piece along its way through the beat', () => {
    const board = scene([piece('a', { x: 500, imageIdentifier: 'fig' })]);
    const move = beat([
      {
        route: [
          { x: 100, y: 100, z: 0 },
          { x: 500, y: 100, z: 0 },
        ],
      },
    ]);
    const xAt = (localMs: number) =>
      paint({ scene: board, beat: { segment: move, localMs } }).images.find((one) => one.image === figure)!.x;

    expect(xAt(0)).toBeLessThan(xAt(500));
    expect(xAt(500)).toBeLessThan(xAt(1500));
  });

  it('fades out a piece leaving the table and then draws it no more', () => {
    const before = scene([piece('a', { imageIdentifier: 'fig' })]);
    const leave = beat([{ kind: 'depart' }]);
    const figures = (localMs: number) =>
      paint({ scene: scene([]), before, beat: { segment: leave, localMs } }).images.filter(
        (one) => one.image === figure
      ).length;

    expect(figures(300)).toBe(1);
    expect(figures(1500)).toBe(0);
  });

  it('raises a change of value over its piece while the beat plays', () => {
    const board = scene([piece('a')]);
    const hurt = beat([], [{ targetId: 'a', label: 'HP', value: '7', delta: -3, startMs: 0 }]);
    const texts = (localMs: number) =>
      paint({ scene: board, beat: { segment: hurt, localMs } }).texts.map((text) => text.text);

    expect(texts(400)).toEqual(expect.arrayContaining(['-3', 'HP 7']));
    expect(texts(1900)).not.toContain('-3');
  });

  function tracedWith(board: ReplayBoardScene): { moves: number; lines: number } {
    const canvas = recorder();
    const moveTo = vi.spyOn(canvas.ctx, 'moveTo');
    const lineTo = vi.spyOn(canvas.ctx, 'lineTo');
    paintReplayBoard(
      canvas.ctx,
      {
        scene: board,
        before: null,
        camera: { x: 0, y: 0, width: 1000, height: 1000 },
        area: { x: 0, y: 0, width: 1000, height: 1000 },
        beat: null,
        highlight: null,
        dim: 0,
        labelSize: 20,
        popSize: 40,
        fontFamily: 'sans-serif',
      },
      assets
    );
    return { moves: moveTo.mock.calls.length, lines: lineTo.mock.calls.length };
  }

  it('rules the grid of a square table in straight lines when it is shown', () => {
    expect(tracedWith({ ...scene([]), gridShow: true })).toEqual({ moves: 38, lines: 38 });
    expect(tracedWith(scene([]))).toEqual({ moves: 0, lines: 0 });
  });

  it('draws the grid of a hex table as hexes', () => {
    const traced = tracedWith({ ...scene([]), gridShow: true, gridType: 1 });

    expect(traced.moves).toBeGreaterThan(100);
    expect(traced.lines).toBe(traced.moves * 5);
  });

  it('shapes a mask on a hex table out of hexes, leaving the scratched ones out', () => {
    const mask = piece('m', { shape: 'mask', width: 3, height: 2, color: '#000000', openCells: ['1:1'] });
    const traced = tracedWith({ ...scene([mask]), gridType: 2 });

    expect(traced.moves).toBe(5);
  });

  const wall = (overrides: Partial<ReplayBoardPiece> = {}) =>
    piece('w', {
      shape: 'terrain',
      width: 4,
      height: 1,
      elevation: 3,
      imageIdentifier: 'paving',
      sideImageIdentifier: 'bricks',
      showsName: false,
      ...overrides,
    });

  it('lifts a tall block and turns its front face to the viewer in the picture of its sides', () => {
    const drawn = paint({ scene: scene([wall()]) }).images;
    const top = drawn.find((one) => one.image === paving)!;
    const front = drawn.find((one) => one.image === bricks)!;

    expect(front).toBeDefined();
    expect(top.y).toBeLessThan(100);
    expect(front.y).toBeGreaterThan(top.y);
  });

  it('lays a block that shows only its floor flat, with no sides', () => {
    const drawn = paint({ scene: scene([wall({ view: 1 })]) }).images;

    expect(drawn.some((one) => one.image === bricks)).toBe(false);
    expect(drawn.find((one) => one.image === paving)!.y).toBe(100);
  });

  it('swings a door that stands open out of the way it barred', () => {
    const door = (open: boolean) =>
      wall({ width: 2, height: 0.2, door: { style: 'swing', open, mirrored: false }, imageIdentifier: 'paving' });
    const at = (open: boolean) => paint({ scene: scene([door(open)]) }).images.find((one) => one.image === paving)!;

    expect(at(true).x).not.toBeCloseTo(at(false).x, 1);
  });

  it('stands a light in its picture over the table', () => {
    const drawn = paint({
      scene: scene([piece('l', { shape: 'light', imageIdentifier: 'torch', color: '#ffaa33' })]),
    }).images;

    expect(drawn.some((one) => one.image === torch)).toBe(true);
  });

  it('frames only what the camera sees, at the scale it sees it', () => {
    const drawn = paint({ camera: { x: 500, y: 500, width: 500, height: 500 } }).images.find(
      (one) => one.image === surface
    )!;

    expect(drawn).toMatchObject({ x: -1000, y: -1000, width: 2000, height: 2000 });
  });
});
