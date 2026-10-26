import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import { ReplayPhotoService } from '@axe/features/replay/replay-digest-panel/replay-photo.service';

function member(name: string, imageIdentifier = 'img'): ReplayCastMember {
  return { identifier: name, name, imageIdentifier, chatColor: '', onTable: true };
}

function fakeContext(overrides: Record<string, unknown> = {}): unknown {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: () => undefined,
    restore: () => undefined,
    clip: () => undefined,
    beginPath: () => undefined,
    roundRect: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    fillText: () => undefined,
    drawImage: () => undefined,
    measureText: (text: string) => ({ width: [...text].length * 10 }),
    ...overrides,
  };
}

describe('ReplayPhotoService', () => {
  let service: ReplayPhotoService;
  let stored: Map<string, { blob: Blob | null; url: string }>;
  let saved: { name: string }[];
  let closed: number;
  let toBlobResult: Blob | null;
  let context: unknown;

  beforeEach(() => {
    stored = new Map([['img', { blob: new Blob(['x']), url: 'blob:img' }]]);
    saved = [];
    closed = 0;
    toBlobResult = new Blob(['png'], { type: 'image/png' });
    context = fakeContext();

    TestBed.configureTestingModule({
      providers: [{ provide: ImageStorage, useValue: { get: (id: string) => stored.get(id) ?? null } }],
    });
    service = TestBed.inject(ReplayPhotoService);

    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 100, height: 200, close: () => closed++ } as unknown as ImageBitmap)
    );
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      return {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback: (blob: Blob | null) => void) => callback(toBlobResult),
      } as unknown as HTMLElement;
    }) as typeof document.createElement);

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves as a png', async () => {
    const result = await service.save({
      cast: [member('アリス')],
      roomName: '洞窟の夜',
      subtitle: '2026-08-12 の卓',
      fileName: '洞窟の夜_20260812',
    });

    expect(result).toEqual({ saved: true, omitted: 0 });
    expect(saved).toEqual([{ name: '洞窟の夜_20260812.png' }]);
  });

  it('saves nothing when nobody is there', async () => {
    const result = await service.save({ cast: [], roomName: '卓', subtitle: '', fileName: 'x' });

    expect(result).toEqual({ saved: false, omitted: 0 });
    expect(saved).toEqual([]);
  });

  it('reports failure when the sheet cannot be made', async () => {
    context = null;

    const result = await service.save({ cast: [member('アリス')], roomName: '卓', subtitle: '', fileName: 'x' });

    expect(result.saved).toBe(false);
    expect(saved).toEqual([]);
  });

  it('reports failure when it cannot be turned into a picture', async () => {
    toBlobResult = null;

    const result = await service.save({ cast: [member('アリス')], roomName: '卓', subtitle: '', fileName: 'x' });

    expect(result.saved).toBe(false);
  });

  it('releases the images it loaded even when the drawing fails', async () => {
    context = fakeContext({
      fillRect: () => {
        throw new Error('描けません');
      },
    });

    await expect(
      service.save({ cast: [member('アリス')], roomName: '卓', subtitle: '', fileName: 'x' })
    ).rejects.toThrow();
    expect(closed).toBe(1);
  });

  it('draws past an image this browser no longer holds', async () => {
    stored = new Map();

    const result = await service.save({ cast: [member('アリス')], roomName: '卓', subtitle: '', fileName: 'x' });

    expect(result.saved).toBe(true);
  });

  it('reports how many did not fit', async () => {
    const cast = Array.from({ length: 30 }, (_, index) => member(`コマ${index}`));

    const result = await service.save({ cast, roomName: '卓', subtitle: '', fileName: 'x' });

    expect(result).toEqual({ saved: true, omitted: 6 });
  });
});
