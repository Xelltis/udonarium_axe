import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DICE_ENGINE_LOADER,
  DICE_PICTURE_LOADER,
  DiceEngine,
  DiceRenderService,
  LATE_START_MS,
  TABLE_FADE_SECONDS,
  TABLE_HOLD_SECONDS,
} from '@axe/application/dice/dice-render.service';
import { DiceThrow, DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { MyDiceService } from '@axe/application/dice/my-dice.service';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { DiceMaterial, PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';
import { Config } from '@axe/domain/peer/config';
import type { PreparedThrow } from '@axe/infrastructure/dice-3d/dice-3d-engine';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const ROLL_SECONDS = 1;
const FRAMES_PER_SECOND = 60;

/** An engine that draws nothing and remembers what it was asked to draw. */
class StandInEngine {
  readonly canvas = document.createElement('canvas');
  isLost = false;
  readonly drawn: { id: string; seconds: number; width: number; kind: string }[] = [];
  disposed = false;

  readonly accents: string[] = [];
  readonly inks: string[] = [];
  readonly materials: string[] = [];
  /** The picture each set-up was made wearing, as its key and fit, or '' for none. */
  readonly pictures: string[] = [];
  readonly warmed: string[] = [];
  /** What each set-up's dice had their own swirls worked out from. */
  readonly seeds: string[] = [];
  /** What each set-up was made for, in the order made, and those let go. */
  readonly made: string[] = [];
  readonly released: string[] = [];
  /** The pictures let go, by key. */
  readonly forgotten: string[] = [];

  prepare(draw: {
    color: string;
    accent?: string;
    ink?: string;
    material?: string;
    picture?: { key: string; fit: string };
    seedKey?: string;
    result?: { frameCount: number };
  }): PreparedThrow {
    this.seeds.push(draw.seedKey ?? '');
    this.pictures.push(draw.picture ? `${draw.picture.key}:${draw.picture.fit}` : '');
    this.accents.push(draw.accent ?? '');
    this.inks.push(draw.ink ?? '');
    this.materials.push(draw.material ?? 'resin');
    this.made.push(draw.color);
    const seconds = draw.result ? (draw.result.frameCount - 1) / FRAMES_PER_SECOND : ROLL_SECONDS;
    return {
      totalSeconds: seconds,
      restSeconds: seconds,
      endSeconds: seconds,
      id: draw.color,
    } as unknown as PreparedThrow;
  }

  warm(material: string): Promise<void> {
    this.warmed.push(material);
    return Promise.resolve();
  }

  release(prepared: PreparedThrow): void {
    this.released.push((prepared as unknown as { id: string }).id);
  }

  forgetPicture(key: string): void {
    this.forgotten.push(key);
  }

  render(prepared: PreparedThrow, seconds: number, view: { kind: string }, size: { width: number; height: number }) {
    this.drawn.push({ id: (prepared as unknown as { id: string }).id, seconds, width: size.width, kind: view.kind });
    return { x: 0, y: 0, width: size.width, height: size.height };
  }

  dispose(): void {
    this.disposed = true;
  }
}

function throwOf(id: string, change: Partial<DiceThrow> = {}): DiceThrow {
  return {
    key: id,
    messageIdentifier: id,
    part: 0,
    stage: 'frame',
    placement: null,
    dice: [{ shape: 'd6', labels: 'standard', target: 0, shows: '1' }],
    overflow: 0,
    look: PLAIN_DICE_LOOK,
    color: id,
    tray: { halfWidth: 8, halfDepth: 2.4 },
    aspect: 10 / 3,
    phase: 'rolling',
    result: {
      frameCount: 61,
      restFrame: 50,
      frames: new Float32Array(),
      landed: [0],
      corrections: [],
      attempt: 0,
      fault: null,
    },
    startedAt: 0,
    still: false,
    shown: ['1'],
    outcome: '',
    ...change,
  };
}

describe('DiceRenderService', () => {
  let frames: FrameRequestCallback[];
  let throws: ReturnType<typeof signal<ReadonlyMap<string, DiceThrow>>>;
  let failed: string[];
  let played: [string, number][];
  let engine: StandInEngine;
  let loads: number;
  let service: DiceRenderService;
  /** Reads a picture the dice wear, which a test puts off or hands over as it needs. */
  let readPicture: (identifier: string) => Promise<unknown>;

  async function nextFrame(at: number): Promise<void> {
    await Promise.resolve();
    TestBed.tick();
    const due = frames.splice(0);
    for (const callback of due) callback(at);
    await Promise.resolve();
  }

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    throws = signal<ReadonlyMap<string, DiceThrow>>(new Map());
    failed = [];
    played = [];
    engine = new StandInEngine();
    loads = 0;
    readPicture = async () => null;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: DiceThrowService,
          useValue: {
            throws,
            fail: (id: string) => failed.push(id),
            played: (id: string, at: number) => played.push([id, at]),
          },
        },
        {
          provide: CoordinateService,
          useValue: { tabletopTransformVersion: signal(0), tabletopSceneMatrix: () => new Matrix3D() },
        },
        { provide: DICE_PICTURE_LOADER, useValue: (identifier: string) => readPicture(identifier) },
        {
          provide: DICE_ENGINE_LOADER,
          useValue: () => {
            loads++;
            return Promise.resolve(engine as unknown as DiceEngine);
          },
        },
      ],
    });
    service = TestBed.inject(DiceRenderService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the engine only once a throw is put on show', async () => {
    throws.set(new Map([['a', throwOf('a')]]));
    await nextFrame(0);
    expect(loads).toBe(0);

    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);

    expect(loads).toBe(1);
  });

  it('readies the engine in a quiet moment once the room shows its dice, before any roll', async () => {
    const before = Config.instance.diceStage;
    try {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(loads).toBe(0);

      Config.instance.diceStage = 'frame';
      TestBed.tick();

      await vi.waitFor(() => expect(loads).toBe(1));
    } finally {
      Config.instance.diceStage = before;
    }
  });

  it('draws a tumbling throw frame after frame, from when it began, and stops once it is at rest', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 1000 })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(1000);
    await nextFrame(1000);

    await nextFrame(1500);
    await nextFrame(2500);
    await nextFrame(3000);

    expect(engine.drawn.map((d) => d.seconds)).toEqual([0, 0.5, ROLL_SECONDS]);
    expect(frames).toHaveLength(0);
  });

  it('plays a throw from the first frame it is drawn in, though the engine was still loading when it was worked out', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(3000);
    await nextFrame(3400);

    expect(engine.drawn.map((d) => d.seconds)).toEqual([0, 0.4]);
  });

  it('carries a throw on from where it was after a frame that took long to draw, as one building shaders does', async () => {
    let clock = 0;
    const clockRead = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      const render = engine.render.bind(engine);
      engine.render = (...args: Parameters<StandInEngine['render']>) => {
        if (engine.drawn.length === 0) clock += 5000;
        return render(...args);
      };
      throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(100);
      await nextFrame(5100);
      await nextFrame(5600);

      expect(engine.drawn.map((d) => d.seconds)).toEqual([0, 0, 0.5]);
      expect(played).toEqual([
        ['a', 100],
        ['a', 5100],
      ]);
    } finally {
      clockRead.mockRestore();
    }
  });

  it('tells the throws when one began to play, so it comes to rest when its dice do on the screen', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(2500);
    await nextFrame(2600);

    expect(played).toEqual([['a', 2500]]);
  });

  it('flashes the dice of a critical or a fumble, and no other roll', async () => {
    throws.set(
      new Map([
        ['a', throwOf('a', { outcome: 'critical' })],
        ['b', throwOf('b', { outcome: 'fumble' })],
        ['c', throwOf('c', { outcome: 'success' })],
      ])
    );
    for (const id of ['a', 'b', 'c']) service.register(document.createElement('canvas'), id).resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);

    expect(engine.accents).toEqual(['critical', 'fumble', '']);
  });

  it('inks the numbers in the colour the one who rolled chose', async () => {
    throws.set(
      new Map([
        ['a', throwOf('a', { look: { ...PLAIN_DICE_LOOK, material: 'resin', body: '', ink: '#e8c547' } })],
        ['b', throwOf('b')],
      ])
    );
    for (const id of ['a', 'b']) service.register(document.createElement('canvas'), id).resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);

    expect(engine.inks).toEqual(['#e8c547', '']);
  });

  describe('wearing a picture of the roller’s own', () => {
    const PICTURE = 'ab'.repeat(32);
    const pictured = (pictureFit: 'wrap' | 'faces') =>
      throwOf('a', { phase: 'settled', still: true, look: { ...PLAIN_DICE_LOOK, picture: PICTURE, pictureFit } });

    /** A canvas that takes the copied picture, so the stage counts as drawn once it is. */
    function drawable(): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      const context = { clearRect: () => undefined, drawImage: () => undefined };
      canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
      return canvas;
    }

    it('draws the dice without the picture until it has arrived, and again with it once it has', async () => {
      let handOver: (picture: unknown) => void = () => undefined;
      readPicture = () => new Promise((resolve) => (handOver = resolve));
      throws.set(new Map([['a', pictured('faces')]]));
      service.register(drawable(), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);
      expect(engine.pictures).toEqual(['']);
      expect(engine.drawn).toHaveLength(1);

      handOver({ width: 4, height: 4 });
      await nextFrame(32);
      await nextFrame(48);

      expect(engine.pictures).toEqual(['', `${PICTURE}:faces`]);
      expect(engine.released).toEqual(['a']);
      expect(engine.drawn).toHaveLength(2);
    });

    it('asks again for a picture that had not arrived, once the room’s images have changed', async () => {
      const asked: string[] = [];
      readPicture = async (identifier) => {
        asked.push(identifier);
        return asked.length > 1 ? { width: 4, height: 4 } : null;
      };
      throws.set(new Map([['a', pictured('wrap')]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);
      TestBed.tick();
      await nextFrame(32);
      await nextFrame(48);

      expect(asked).toEqual([PICTURE, PICTURE]);
      expect(engine.pictures.at(-1)).toBe(`${PICTURE}:wrap`);
    });

    it('has this seat’s own picture put back among the room’s images when a line wants it and they lack it', async () => {
      const dice = TestBed.inject(MyDiceService);
      vi.spyOn(dice, 'look').mockReturnValue({ ...PLAIN_DICE_LOOK, picture: PICTURE });
      const shared = vi.spyOn(dice, 'ensureShared').mockResolvedValue();
      throws.set(new Map([['a', pictured('wrap')]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      expect(shared).toHaveBeenCalled();
    });

    it('leaves someone else’s picture to arrive by itself', async () => {
      const shared = vi.spyOn(TestBed.inject(MyDiceService), 'ensureShared').mockResolvedValue();
      throws.set(new Map([['a', pictured('wrap')]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      expect(shared).not.toHaveBeenCalled();
    });

    it('does not read again a picture that arrived but could not be read', async () => {
      const asked: string[] = [];
      readPicture = async (identifier) => {
        asked.push(identifier);
        throw new Error('not a picture');
      };
      throws.set(new Map([['a', pictured('wrap')]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);
      throws.set(new Map([...throws(), ['b', throwOf('b')]]));
      TestBed.tick();
      await nextFrame(32);
      await nextFrame(48);

      expect(asked).toEqual([PICTURE]);
      expect(engine.pictures.at(-1)).toBe('');
    });

    it('lets a picture go once no throw kept wears it, with what was set up wearing it', async () => {
      const close = vi.fn();
      readPicture = async () => ({ width: 4, height: 4, close });
      throws.set(new Map([['a', pictured('wrap')]]));
      service.register(drawable(), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);
      await nextFrame(32);
      expect(engine.pictures.at(-1)).toBe(`${PICTURE}:wrap`);
      expect(engine.forgotten).toEqual([]);

      throws.set(new Map([['b', throwOf('b')]]));
      TestBed.tick();

      expect(engine.forgotten).toEqual([PICTURE]);
      expect(engine.released).toContain('a');
      expect(close).toHaveBeenCalled();
    });
  });

  describe('in the material the one who rolled chose', () => {
    const made = (material: DiceMaterial) => ({ ...PLAIN_DICE_LOOK, material, body: '', ink: '' });

    it('draws each throw in its own material', async () => {
      throws.set(
        new Map([
          ['a', throwOf('a', { look: made('marble') })],
          ['b', throwOf('b', { look: made('metal') })],
          ['c', throwOf('c')],
        ])
      );
      for (const id of ['a', 'b', 'c']) service.register(document.createElement('canvas'), id).resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      expect(engine.materials).toEqual(['marble', 'metal', 'resin']);
    });

    it('draws glass as resin on a device drawn lightly, which a second drawing of the scene would slow', async () => {
      TestBed.inject(RenderLiteService).setting.set('on');
      throws.set(new Map([['a', throwOf('a', { look: made('glass') })]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      expect(engine.materials).toEqual(['resin']);
    });

    it('builds the shaders of a material while a throw that wears it is worked out', async () => {
      throws.set(new Map([['a', throwOf('a', { phase: 'settled', still: true })]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);
      expect(engine.warmed).toEqual([]);

      throws.set(
        new Map([
          ['a', throwOf('a', { phase: 'settled', still: true })],
          ['b', throwOf('b', { phase: 'working', result: null, look: made('metal') })],
        ])
      );
      TestBed.tick();

      expect(engine.warmed).toEqual(['metal']);
    });

    it('builds the shaders of this seat’s own material once the engine is here', async () => {
      TestBed.inject(MyDiceService).set(made('marble'));
      throws.set(new Map([['a', throwOf('a')]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(16);

      expect(engine.warmed).toContain('marble');
      localStorage.removeItem('my-dice');
    });
  });

  it('shows a throw first drawn long after it was worked out at rest, without throwing it again', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(LATE_START_MS + 500);

    expect(engine.drawn.map((d) => d.seconds)).toEqual([ROLL_SECONDS]);
    expect(frames).toHaveLength(0);
  });

  it('draws a throw once for every canvas it is on show on', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    service.register(document.createElement('canvas'), 'a').resize(420, 126);
    await nextFrame(0);
    await nextFrame(100);

    expect(engine.drawn).toHaveLength(1);
    expect(engine.drawn[0].width).toBe(420);
  });

  it('draws a throw at rest once, and again only when it changes', async () => {
    throws.set(new Map([['a', throwOf('a', { phase: 'settled', still: true })]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);
    await nextFrame(32);
    expect(engine.drawn).toHaveLength(1);

    throws.set(new Map([['a', throwOf('a', { phase: 'settled', still: true, shown: ['2'] })]]));
    await nextFrame(48);

    expect(engine.drawn).toHaveLength(2);
  });

  it('draws nothing for a canvas taken off the stage', async () => {
    throws.set(new Map([['a', throwOf('a', { startedAt: 0 })]]));
    const handle = service.register(document.createElement('canvas'), 'a');
    handle.resize(300, 90);
    handle.release();
    await nextFrame(0);
    await nextFrame(16);

    expect(engine.drawn).toHaveLength(0);
  });

  it('lets a throw’s set-up go once the last canvas showing it is taken off the stage', async () => {
    throws.set(new Map([['a', throwOf('a', { phase: 'settled', still: true })]]));
    const one = service.register(document.createElement('canvas'), 'a');
    const two = service.register(document.createElement('canvas'), 'a');
    one.resize(300, 90);
    two.resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);

    one.release();
    expect(engine.released).toEqual([]);
    two.release();
    expect(engine.released).toEqual(['a']);
  });

  it('sets a throw up again when its recording is cut down to where it rests, letting the old set-up go', async () => {
    const whole = throwOf('a', { phase: 'settled' });
    throws.set(new Map([['a', whole]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(LATE_START_MS + 500);

    throws.set(new Map([['a', { ...whole, result: { ...whole.result!, frameCount: 1, restFrame: 0 } }]]));
    await nextFrame(LATE_START_MS + 600);

    expect(engine.made).toEqual(['a', 'a']);
    expect(engine.released).toEqual(['a']);
    expect(engine.drawn).toHaveLength(2);
    expect(engine.seeds).toEqual(['a', 'a']);
  });

  it('puts every throw away when the engine cannot start', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: DiceThrowService, useValue: { throws, fail: (id: string) => failed.push(id) } },
        { provide: DICE_ENGINE_LOADER, useValue: () => Promise.reject(new Error('no WebGL')) },
      ],
    });
    service = TestBed.inject(DiceRenderService);
    throws.set(new Map([['a', throwOf('a')]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);

    await nextFrame(0);
    await vi.waitFor(() => expect(failed).toEqual(['a']));

    throws.set(new Map([...throws(), ['b', throwOf('b')]]));
    await nextFrame(16);

    expect(failed).toContain('b');
  });

  it('leaves a throw at rest alone while another changes', async () => {
    const canvas = document.createElement('canvas');
    // The test's document draws nothing on a canvas; this one takes the strokes and keeps none.
    const context = { clearRect: () => undefined, drawImage: () => undefined };
    canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
    throws.set(new Map([['a', throwOf('a', { phase: 'settled', still: true })]]));
    service.register(canvas, 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);
    expect(engine.drawn).toHaveLength(1);

    throws.set(new Map([...throws(), ['b', throwOf('b', { phase: 'working', result: null })]]));
    await nextFrame(32);

    expect(engine.drawn).toHaveLength(1);
  });

  it('puts every throw away when the engine loses its drawing context', async () => {
    throws.set(new Map([['a', throwOf('a')]]));
    service.register(document.createElement('canvas'), 'a').resize(300, 90);
    await nextFrame(0);
    await nextFrame(16);
    engine.isLost = true;

    await nextFrame(32);

    expect(failed).toEqual(['a']);
  });

  describe('on the table', () => {
    /** The sheet over the table, as large as the screen of the test. */
    function sheet(): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }) as DOMRect;
      // The test's document draws nothing on a canvas; this one takes the strokes and keeps none.
      const context = { clearRect: () => undefined, drawImage: () => undefined, globalAlpha: 1 };
      canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
      service.registerTable(canvas).resize(800, 600);
      return canvas;
    }

    function onTable(id: string, change: Partial<DiceThrow> = {}): DiceThrow {
      return throwOf(id, {
        stage: 'table',
        placement: {
          model: [20, 0, 0, 0, 0, -20, 0, 0, 0, 0, 20, 0, 400, 300, 0, 1],
          tray: { halfWidth: 4, halfDepth: 3 },
        },
        tray: { halfWidth: 4, halfDepth: 3 },
        ...change,
      });
    }

    it('draws a throw on the table with the table’s own view, and leaves the line frames to theirs', async () => {
      sheet();
      throws.set(new Map([['a', onTable('a', { startedAt: 0 })]]));
      service.register(document.createElement('canvas'), 'a').resize(300, 90);
      await nextFrame(0);
      await nextFrame(100);

      expect(engine.drawn.map((d) => d.kind)).toEqual(['table']);
    });

    it('keeps the dice on the table a while after they stop, then lets them fade and stops drawing', async () => {
      sheet();
      throws.set(new Map([['a', onTable('a', { startedAt: 0, phase: 'settled' })]]));
      await nextFrame(0);
      await nextFrame(100);
      // It began to play in the first frame it was drawn in.
      const end = 100 + (ROLL_SECONDS + TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS) * 1000;

      await nextFrame(end - 100);
      const drawnBefore = engine.drawn.length;
      expect(frames).toHaveLength(1);
      await nextFrame(end + 10);

      expect(engine.drawn).toHaveLength(drawnBefore);
      expect(frames).toHaveLength(0);
    });

    it('keeps the trays of one roll on the table together, fading them from when the last comes to rest', async () => {
      sheet();
      const first = onTable('a', { messageIdentifier: 'roll', startedAt: 0, phase: 'settled' });
      throws.set(new Map([['a', first]]));
      await nextFrame(0);
      await nextFrame(100);
      const later = onTable('b', { messageIdentifier: 'roll', part: 1, startedAt: 1500, phase: 'settled' });
      throws.set(
        new Map([
          ['a', first],
          ['b', later],
        ])
      );
      await nextFrame(1500);
      const gone = 100 + (ROLL_SECONDS + TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS) * 1000 + 10;
      engine.drawn.length = 0;

      await nextFrame(gone);

      expect(engine.drawn.map((d) => d.id)).toEqual(['a', 'b']);

      const end = 1500 + (ROLL_SECONDS + TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS) * 1000;
      await nextFrame(end - 50);
      engine.drawn.length = 0;
      await nextFrame(end + 10);
      expect(engine.drawn).toEqual([]);
      expect(engine.released).toEqual(['a', 'b']);
    });

    it('keeps a roll on the table its while from when it came to rest, though its recording is cut down meanwhile', async () => {
      sheet();
      const whole = onTable('a', { startedAt: 0, phase: 'settled' });
      throws.set(new Map([['a', whole]]));
      await nextFrame(0);
      await nextFrame(100);
      const end = 100 + (ROLL_SECONDS + TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS) * 1000;
      await nextFrame(1500);

      throws.set(new Map([['a', { ...whole, result: { ...whole.result!, frameCount: 1, restFrame: 0 } }]]));
      await nextFrame(end - 100);
      engine.drawn.length = 0;
      await nextFrame(end - 50);
      expect(engine.drawn.map((d) => d.id)).toEqual(['a']);

      await nextFrame(end + 10);
      expect(engine.released).toContain('a');
    });

    it('lets the set-up of a throw gone from the table go, and does not set it up again', async () => {
      sheet();
      throws.set(new Map([['a', onTable('a', { startedAt: 0, phase: 'settled' })]]));
      await nextFrame(0);
      await nextFrame(100);
      const end = 100 + (ROLL_SECONDS + TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS) * 1000;
      await nextFrame(end + 10);
      expect(engine.released).toEqual(['a']);

      throws.set(new Map([...throws(), ['b', throwOf('b', { phase: 'settled', still: true })]]));
      service.register(document.createElement('canvas'), 'b').resize(300, 90);
      await nextFrame(end + 100);

      expect(engine.made).toEqual(['a', 'b']);
    });

    it('draws nothing for a tray that lies off the screen', async () => {
      sheet();
      throws.set(
        new Map([
          [
            'a',
            onTable('a', {
              placement: {
                model: [20, 0, 0, 0, 0, -20, 0, 0, 0, 0, 20, 0, 5000, 5000, 0, 1],
                tray: { halfWidth: 4, halfDepth: 3 },
              },
            }),
          ],
        ])
      );
      await nextFrame(0);
      await nextFrame(100);

      expect(engine.drawn).toHaveLength(0);
    });
  });
});
