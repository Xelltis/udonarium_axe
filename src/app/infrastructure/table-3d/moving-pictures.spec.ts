import {
  frameStandsMs,
  type MovingFrame,
  MovingPictures,
  type MovingSource,
} from '@axe/infrastructure/table-3d/moving-pictures';
import { Texture } from 'three/webgpu';

/** A moving picture of frames that stand as long as given, played as many times as given, that tells which frames it drew. */
function source(
  frames: number,
  plays: number,
  standsMs = 100
): MovingSource & { drawn: number[]; closed: boolean; framesClosed: number } {
  const made = {
    width: 8,
    height: 8,
    frames,
    plays,
    drawn: [] as number[],
    closed: false,
    framesClosed: 0,
    frame: async (index: number): Promise<MovingFrame> => ({
      durationMs: standsMs,
      draw: () => made.drawn.push(index),
      close: () => {
        made.framesClosed++;
      },
    }),
    close: () => {
      made.closed = true;
    },
  };
  return made;
}

/** Lets what was started run through. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Moves the pictures on to each moment in turn, letting each frame be drawn before the next. */
async function advanceThrough(pictures: MovingPictures, moments: readonly number[]): Promise<(number | null)[]> {
  const due: (number | null)[] = [];
  for (const moment of moments) {
    due.push(pictures.advance(moment));
    await settled();
  }
  return due;
}

describe('MovingPictures', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => undefined,
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => vi.restoreAllMocks());

  it('wears a moving picture on a canvas of its own, the first frame standing its while from when it is first moved, and each after it', async () => {
    const moving = source(3, Infinity);
    const drawn = vi.fn();
    const pictures = new MovingPictures(drawn, async () => moving);
    const picture = new Texture();

    pictures.follow('blob:apng', picture);
    await settled();

    expect(picture.image).toBeInstanceOf(HTMLCanvasElement);
    expect(moving.drawn).toEqual([0]);
    expect(await advanceThrough(pictures, [5000, 5050])).toEqual([5100, 5100]);
    expect(moving.drawn).toEqual([0]);
    await advanceThrough(pictures, [5100, 5200, 5300]);
    expect(moving.drawn).toEqual([0, 1, 2, 0]);
    expect(drawn).toHaveBeenCalledTimes(4);
  });

  it('counts each frame from when it was due, so frames drawn late do not fall further behind', async () => {
    const moving = source(4, Infinity, 40);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    pictures.follow('blob:gif', new Texture());
    await settled();

    const due = await advanceThrough(pictures, [0, 50, 67, 100, 133]);

    expect(due).toEqual([40, null, 80, null, null]);
    expect(moving.drawn).toEqual([0, 1, 2, 3]);
  });

  it('has a frame told to stand ten milliseconds or less stand a tenth of a second, as browsers do', () => {
    expect([frameStandsMs(0), frameStandsMs(10), frameStandsMs(20), frameStandsMs(70)]).toEqual([100, 100, 20, 70]);
  });

  it('stops once it has played as many times as it is made for, and wants no more frames', async () => {
    const moving = source(2, 1);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    pictures.follow('blob:apng', new Texture());
    await settled();

    await advanceThrough(pictures, [0, 100]);
    expect(pictures.advance(200)).toBeNull();

    expect(moving.drawn).toEqual([0, 1]);
  });

  it('moves a picture only while something wearing it is in sight, and waits where it got to while none is', async () => {
    const moving = source(3, Infinity);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    const picture = new Texture();
    pictures.follow('blob:apng', picture);
    await settled();
    let seen = false;
    const inSight = () => seen;

    expect(pictures.advance(0, inSight)).toBeNull();
    expect(pictures.advance(500, inSight)).toBeNull();
    expect(moving.drawn).toEqual([0]);

    seen = true;
    expect(pictures.advance(600, inSight)).toBe(700);
  });

  it('stands each on its first frame while pictures are not to move, and moves them again once they are', async () => {
    const moving = source(3, Infinity);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    pictures.follow('blob:apng', new Texture());
    await settled();
    await advanceThrough(pictures, [0, 100]);

    pictures.setTurning(false);
    await settled();

    expect(moving.drawn).toEqual([0, 1, 0]);
    expect(pictures.advance(500)).toBeNull();
    pictures.setTurning(true);
    expect(pictures.advance(600)).toBe(700);
  });

  it('reads a picture once for every texture and coin face wearing it, and dresses each with each frame', async () => {
    const moving = source(2, Infinity);
    const read = vi.fn(async () => moving);
    const pictures = new MovingPictures(() => undefined, read);
    const sprite = new Texture();
    const tiled = new Texture();
    const face = new Texture();
    const painted: HTMLCanvasElement[] = [];

    pictures.follow('blob:apng', sprite);
    pictures.follow('blob:apng', tiled);
    pictures.wear('blob:apng', { texture: face, paint: (frame) => painted.push(frame) });
    await settled();
    await advanceThrough(pictures, [0, 100]);

    expect(read).toHaveBeenCalledOnce();
    expect(sprite.image).toBe(tiled.image);
    expect(painted).toHaveLength(2);
    expect(face.image).not.toBe(sprite.image);
  });

  it('lets go of a picture once nothing wears it, and moves none that stands still', async () => {
    const moving = source(3, Infinity);
    const pictures = new MovingPictures(
      () => undefined,
      async (url) => (url === 'blob:apng' ? moving : null)
    );
    const worn = new Texture();
    const still = new Texture();
    pictures.follow('blob:apng', worn);
    pictures.follow('blob:png', still);
    await settled();

    expect([pictures.moves(worn), pictures.moves(still)]).toEqual([true, false]);
    worn.dispose();

    expect(pictures.moves(worn)).toBe(false);
    expect(moving.closed).toBe(true);
    expect(pictures.advance(1000)).toBeNull();
  });

  it('lets go of a picture whose texture was let go of while it was being read, and wants no frames for it', async () => {
    const moving = source(3, Infinity);
    let arrive: (read: MovingSource) => void = () => undefined;
    const pictures = new MovingPictures(
      () => undefined,
      () => new Promise<MovingSource | null>((resolve) => (arrive = resolve))
    );
    const picture = new Texture();
    pictures.follow('blob:apng', picture);

    picture.dispose();
    arrive(moving);
    await settled();

    expect(moving.closed).toBe(true);
    expect(pictures.shown).toBe(0);
    expect(pictures.advance(1000)).toBeNull();
  });

  it('lets go of what comes after the table is gone, and closes every frame it draws', async () => {
    const moving = source(3, Infinity);
    let arrive: (read: MovingSource) => void = () => undefined;
    const pictures = new MovingPictures(
      () => undefined,
      () => new Promise<MovingSource | null>((resolve) => (arrive = resolve))
    );
    pictures.follow('blob:apng', new Texture());

    pictures.dispose();
    arrive(moving);
    await settled();

    expect([moving.closed, moving.drawn, moving.framesClosed]).toEqual([true, [], 0]);
  });
});
