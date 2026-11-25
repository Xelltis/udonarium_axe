import { type MovingFrame, MovingPictures, type MovingSource } from '@axe/infrastructure/table-3d/moving-pictures';
import { Texture } from 'three/webgpu';

/** A moving picture of frames that stand 100 ms each, played as many times as given, that tells which frames it drew. */
function source(frames: number, plays: number): MovingSource & { drawn: number[]; closed: boolean } {
  const made = {
    width: 8,
    height: 8,
    frames,
    plays,
    drawn: [] as number[],
    closed: false,
    frame: async (index: number): Promise<MovingFrame> => ({
      durationMs: 100,
      draw: () => made.drawn.push(index),
      close: () => undefined,
    }),
    close: () => {
      made.closed = true;
    },
  };
  return made;
}

/** Lets what was started run through. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MovingPictures', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => undefined,
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => vi.restoreAllMocks());

  it('wears a moving picture on a canvas of its own, frame after frame as each stands its while, and tells it drew', async () => {
    const moving = source(3, Infinity);
    const drawn = vi.fn();
    const pictures = new MovingPictures(drawn, async () => moving);
    const picture = new Texture();

    pictures.follow('blob:apng', picture);
    await settled();

    expect(picture.image).toBeInstanceOf(HTMLCanvasElement);
    expect(moving.drawn).toEqual([0]);
    expect(pictures.advance(50)).toBe(true);
    await settled();
    expect(moving.drawn).toEqual([0]);
    pictures.advance(100);
    await settled();
    pictures.advance(200);
    await settled();
    pictures.advance(300);
    await settled();
    expect(moving.drawn).toEqual([0, 1, 2, 0]);
    expect(drawn).toHaveBeenCalledTimes(4);
  });

  it('stops once it has played as many times as it is made for, and wants no more frames', async () => {
    const moving = source(2, 1);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    pictures.follow('blob:apng', new Texture());
    await settled();

    pictures.advance(100);
    await settled();
    expect(pictures.advance(200)).toBe(false);
    await settled();

    expect(moving.drawn).toEqual([0, 1]);
  });

  it('stands each on its first frame while pictures are not to move, and moves them again once they are', async () => {
    const moving = source(3, Infinity);
    const pictures = new MovingPictures(
      () => undefined,
      async () => moving
    );
    pictures.follow('blob:apng', new Texture());
    await settled();
    pictures.advance(100);
    await settled();

    pictures.setTurning(false);
    await settled();

    expect(moving.drawn).toEqual([0, 1, 0]);
    expect(pictures.advance(500)).toBe(false);
    pictures.setTurning(true);
    expect(pictures.advance(600)).toBe(true);
  });

  it('lets go of a picture once its texture is let go of, and moves none that stands still', async () => {
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
    expect(pictures.advance(1000)).toBe(false);
  });
});
