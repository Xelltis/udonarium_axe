import { picturesOf, releaseReadPictures } from '@axe/infrastructure/three-kit/read-pictures';
import { MeshStandardMaterial, Texture } from 'three';

/** Pixels decoded from a file, as a bitmap is, which can be closed. */
function bitmap(): { width: number; height: number; close: ReturnType<typeof vi.fn> } {
  return { width: 4, height: 4, close: vi.fn() };
}

/** What the card does once it has been sent a picture. */
function send(picture: Texture): void {
  picture.onUpdate?.(picture);
}

describe('picturesOf', () => {
  it('names every picture a material wears once, whatever it wears it as', () => {
    const colour = new Texture();
    const bumps = new Texture();
    const material = new MeshStandardMaterial({ map: colour, normalMap: bumps, emissiveMap: colour });

    expect(picturesOf(material)).toEqual([colour, bumps]);
  });
});

describe('releaseReadPictures', () => {
  it('closes the pixels of a picture drawn once the card has been sent it, and not before', () => {
    const pixels = bitmap();
    const colour = new Texture(pixels as unknown as HTMLImageElement);

    releaseReadPictures([colour], []);
    expect(pixels.close).not.toHaveBeenCalled();

    send(colour);
    expect(pixels.close).toHaveBeenCalledTimes(1);
    expect(colour.onUpdate).toBeNull();
  });

  it('closes the pixels of a picture not drawn at once', () => {
    const pixels = bitmap();

    releaseReadPictures([], [new Texture(pixels as unknown as HTMLImageElement)]);

    expect(pixels.close).toHaveBeenCalledTimes(1);
  });

  it('keeps pixels shared by pictures drawn until every one of them has been sent', () => {
    const pixels = bitmap();
    const colour = new Texture(pixels as unknown as HTMLImageElement);
    const copy = colour.clone();
    const unused = colour.clone();

    releaseReadPictures([colour, copy], [unused]);
    send(colour);
    expect(pixels.close).not.toHaveBeenCalled();

    send(copy);
    expect(pixels.close).toHaveBeenCalledTimes(1);
  });

  it('still tells whatever else listened for the picture being sent', () => {
    const colour = new Texture(bitmap() as unknown as HTMLImageElement);
    const listener = vi.fn();
    colour.onUpdate = listener;

    releaseReadPictures([colour], []);
    send(colour);

    expect(listener).toHaveBeenCalledWith(colour);
    expect(colour.onUpdate).toBe(listener);
  });

  it('leaves pixels that cannot be closed as they are', () => {
    const canvas = { width: 4, height: 4 };
    const colour = new Texture(canvas as unknown as HTMLImageElement);

    releaseReadPictures([colour], [new Texture(canvas as unknown as HTMLImageElement)]);

    expect(() => send(colour)).not.toThrow();
  });
});
