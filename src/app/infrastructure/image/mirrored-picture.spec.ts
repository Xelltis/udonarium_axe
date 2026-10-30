import { mirroredPictureUrl } from '@axe/infrastructure/image/mirrored-picture';

describe('mirroredPictureUrl', () => {
  const asked: { src: string; crossOrigin: string | null }[] = [];

  class PictureAsked {
    src = '';
    crossOrigin: string | null = null;
    decode(): Promise<void> {
      asked.push({ src: this.src, crossOrigin: this.crossOrigin });
      return Promise.reject(new Error('not drawn here'));
    }
  }

  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal('Image', PictureAsked);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks for a picture from another site as one to be read back, and one of the page’s own as it is', async () => {
    expect(await mirroredPictureUrl('https://cdn.example.com/fighter.png')).toBeNull();
    expect(await mirroredPictureUrl('blob:http://localhost/1234')).toBeNull();

    expect(asked).toEqual([
      { src: 'https://cdn.example.com/fighter.png', crossOrigin: 'anonymous' },
      { src: 'blob:http://localhost/1234', crossOrigin: null },
    ]);
  });
});
