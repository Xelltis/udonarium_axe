import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IMAGE_REGION_CROPPER } from '@axe/application/file/image-region-cropper';
import { RASTER_IMAGE_LOADER } from '@axe/application/file/raster-image-loader';
import { ModalService } from '@axe/application/ui/modal.service';
import {
  fitCropStage,
  TEXTURE_CROP_FRAME,
  TEXTURE_CROP_MIN_STAGE,
  TEXTURE_CROP_STAGE,
  TextureCropDialogComponent,
} from '@axe/features/map-editor/editor/texture-crop-dialog.component';
import { cropImageRegion } from '@axe/infrastructure/image/image-region-crop';
import { loadRasterImage } from '@axe/infrastructure/map-editor/raster-image';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TextureCropDialogComponent', () => {
  let fixture: ComponentFixture<TextureCropDialogComponent>;
  let component: TextureCropDialogComponent;
  let modalService: { option: unknown; title: string; resolve: ReturnType<typeof vi.fn> };
  let cropRegion: ReturnType<typeof vi.fn<typeof cropImageRegion>>;
  let loadImage: ReturnType<typeof vi.fn<typeof loadRasterImage>>;

  async function setup(option: unknown): Promise<void> {
    cropRegion = vi.fn();
    loadImage = vi.fn().mockRejectedValue(new Error('no picture'));
    modalService = { option, title: '', resolve: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [TextureCropDialogComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(ModalService, { useValue: modalService });
    TestBed.overrideProvider(IMAGE_REGION_CROPPER, { useValue: cropRegion });
    TestBed.overrideProvider(RASTER_IMAGE_LOADER, { useValue: loadImage });
    fixture = TestBed.createComponent(TextureCropDialogComponent);
    component = fixture.componentInstance;
  }

  function setImage(w: number, h: number): void {
    (
      component as unknown as { image: { naturalWidth: number; naturalHeight: number; width: number; height: number } }
    ).image = { naturalWidth: w, naturalHeight: h, width: w, height: h };
  }

  it('can be created', async () => {
    await setup({ objectUrl: 'blob:x' });
    expect(component).toBeTruthy();
  });

  it('starts fitted to cover, with the smallest scale the frame allows', async () => {
    await setup({ objectUrl: 'blob:x' });
    const image = { naturalWidth: 800, naturalHeight: 400, width: 800, height: 400 } as HTMLImageElement;
    loadImage.mockResolvedValue(image);
    await (component as unknown as { prepare: () => Promise<void> }).prepare();

    const minScale = TEXTURE_CROP_FRAME / 400;
    expect(component['scale']()).toBeCloseTo(minScale, 5);
    expect(component['tx']()).toBeCloseTo((TEXTURE_CROP_STAGE - 800 * minScale) / 2, 5);
    expect(component['ty']()).toBeCloseTo((TEXTURE_CROP_STAGE - 400 * minScale) / 2, 5);
  });

  it('limits the panning so the frame stays covered', async () => {
    await setup({ objectUrl: 'blob:x' });
    setImage(400, 400);
    (component as unknown as { minScale: number }).minScale = TEXTURE_CROP_FRAME / 400;
    component['scale'].set(TEXTURE_CROP_FRAME / 400);
    component['tx'].set(9999);
    component['ty'].set(9999);
    (component as unknown as { clamp: () => void }).clamp();
    const frameLeft = (TEXTURE_CROP_STAGE - TEXTURE_CROP_FRAME) / 2;
    expect(component['tx']()).toBeLessThanOrEqual(frameLeft);
    expect(component['ty']()).toBeLessThanOrEqual(frameLeft);
  });

  it('maps the frame back into image coordinates and resolves the cropped bytes', async () => {
    await setup({ objectUrl: 'blob:x' });
    setImage(600, 600);
    const scale = 2;
    component['scale'].set(scale);
    component['tx'].set(-100);
    component['ty'].set(-40);
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    cropRegion.mockResolvedValue(blob);

    await (component as unknown as { apply: () => Promise<void> }).apply();

    const frameLeft = (TEXTURE_CROP_STAGE - TEXTURE_CROP_FRAME) / 2;
    const sx = (frameLeft - -100) / scale;
    const sy = (frameLeft - -40) / scale;
    const sSize = TEXTURE_CROP_FRAME / scale;
    expect(cropRegion).toHaveBeenCalledWith(expect.anything(), sx, sy, sSize, sSize, 512);
    expect(modalService.resolve).toHaveBeenCalledWith(blob);
  });

  it('resolves nothing on cancel', async () => {
    await setup({ objectUrl: 'blob:x' });
    component['cancel']();
    expect(modalService.resolve).toHaveBeenCalledWith(null);
  });

  it('resolves nothing before the image has loaded', async () => {
    await setup({ objectUrl: 'blob:x' });
    (component as unknown as { image: HTMLImageElement | null }).image = null;
    await (component as unknown as { apply: () => Promise<void> }).apply();
    expect(modalService.resolve).toHaveBeenCalledWith(null);
  });
});

describe('fitCropStage', () => {
  it('keeps its usual size on a wide screen', () => {
    expect(fitCropStage(1280)).toBe(TEXTURE_CROP_STAGE);
  });

  it('shrinks with a margin on a narrow one', () => {
    expect(fitCropStage(360)).toBe(312);
  });

  it('keeps a floor on a very narrow screen', () => {
    expect(fitCropStage(200)).toBe(TEXTURE_CROP_MIN_STAGE);
  });
});
