import { cropImageRegion } from '@axe/infrastructure/image/image-region-crop';

describe('cropImageRegion', () => {
  const source = {} as CanvasImageSource;
  let drawImage: ReturnType<typeof vi.fn>;
  let made: HTMLCanvasElement[];

  beforeEach(() => {
    drawImage = vi.fn();
    made = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = createElement(tag);
      if (tag !== 'canvas') return element;
      const canvas = element as HTMLCanvasElement;
      canvas.getContext = (() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext'];
      canvas.toBlob = ((done: BlobCallback, type?: string) =>
        done(new Blob(['x'], { type: type ?? 'image/png' }))) as HTMLCanvasElement['toBlob'];
      made.push(canvas);
      return canvas;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('refuses a rectangle with no area', async () => {
    await expect(cropImageRegion(source, 0, 0, 0, 10)).rejects.toThrow('invalid crop region');
    await expect(cropImageRegion(source, 0, 0, 10, Number.NaN)).rejects.toThrow('invalid crop region');
  });

  it('writes the rectangle at its own size when it fits', async () => {
    const blob = await cropImageRegion(source, 5, 6, 200, 100, 512);

    expect(blob).toBeInstanceOf(Blob);
    expect([made[0].width, made[0].height]).toEqual([200, 100]);
    expect(drawImage).toHaveBeenCalledWith(source, 5, 6, 200, 100, 0, 0, 200, 100);
  });

  it('scales the rectangle down so its longest side fits', async () => {
    await cropImageRegion(source, 0, 0, 2000, 1000, 500);

    expect([made[0].width, made[0].height]).toEqual([500, 250]);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 2000, 1000, 0, 0, 500, 250);
  });

  it('throws where the canvas hands out no context', async () => {
    vi.mocked(document.createElement).mockImplementation(
      () => ({ getContext: () => null }) as unknown as HTMLCanvasElement
    );

    await expect(cropImageRegion(source, 0, 0, 10, 10)).rejects.toThrow('canvas context unavailable');
  });
});
