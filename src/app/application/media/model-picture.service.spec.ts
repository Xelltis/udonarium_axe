import { TestBed } from '@angular/core/testing';
import { ModelPictureService } from '@axe/application/media/model-picture.service';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import { ModelFile } from '@axe/core/storage/model-file';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelPictureService', () => {
  let paint: ReturnType<typeof vi.fn<(url: string, sizePx: number) => Promise<Blob | null>>>;

  const model = (name: string, ready = true) =>
    ({ identifier: `${name}-id`, name: `${name}.glb`, isReady: ready, url: `blob:${name}` }) as unknown as ModelFile;

  beforeEach(() => {
    paint = vi.fn(async () => new Blob(['picture'], { type: 'image/webp' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: MODEL_VIEWER_LOADER,
          useValue: async () => ({
            createModelStage: () => null,
            createModelPainter: () => ({ paint, dispose: () => {} }),
          }),
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows a model the map editor offers by the picture bundled with it, drawing nothing', () => {
    expect(TestBed.inject(ModelPictureService).pictureOf(model('tree_oak'))).toBe(
      'assets/images/model-pictures/tree_oak.icon.webp'
    );
    expect(paint).not.toHaveBeenCalled();
  });

  it('draws a picture of any other model once, the first time it is asked for, and none before its bytes come', async () => {
    const pictures = TestBed.inject(ModelPictureService);

    expect(pictures.pictureOf(model('statue', false))).toBeNull();
    expect(paint).not.toHaveBeenCalled();
    expect(pictures.pictureOf(model('statue'))).toBeNull();
    await vi.waitFor(() => expect(pictures.pictureOf(model('statue'))).toBe('blob:picture'));
    pictures.pictureOf(model('statue'));

    expect(paint.mock.calls).toEqual([['blob:statue', 192]]);
  });

  it('shows none for a model it cannot draw', async () => {
    paint.mockResolvedValue(null);
    const pictures = TestBed.inject(ModelPictureService);

    pictures.pictureOf(model('broken'));
    await vi.waitFor(() => expect(paint).toHaveBeenCalled());

    expect(pictures.pictureOf(model('broken'))).toBeNull();
  });
});
