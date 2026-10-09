import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver, ImageLoadResult } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageIntakeComponent } from '@axe/features/file/image-intake/image-intake.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

/**
 * The page here draws nothing, so the picture is read and drawn through stand-ins: a white pixel
 * beside a red one, and a canvas that keeps the last frame put on it.
 */
function standInCanvas(): { frames: Uint8ClampedArray[] } {
  const drawn = { frames: [] as Uint8ClampedArray[] };
  const pixels = new Uint8ClampedArray([255, 255, 255, 255, 200, 0, 0, 255]);
  const context = {
    drawImage: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray(pixels), width: 2, height: 1 }),
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (frame: { data: Uint8ClampedArray }) => drawn.frames.push(new Uint8ClampedArray(frame.data)),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['cleared'], { type: 'image/png' }))
  );
  vi.stubGlobal('createImageBitmap', async () => ({ width: 2, height: 1, close: () => undefined }));
  return drawn;
}

describe('ImageIntakeComponent', () => {
  let fixture: ComponentFixture<ImageIntakeComponent>;
  let component: ImageIntakeComponent;
  let stored: File[];
  let result: ImageLoadResult;
  let close: MockInstance<() => void>;
  let canEdit: boolean;
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageIntakeComponent], providers: [...TEST_PROVIDERS] });
    stored = [];
    result = { images: [ImageFile.createEmpty('stored')], oversized: [] };
    vi.spyOn(TestBed.inject(FileArchiver), 'loadImages').mockImplementation(async (files) => {
      stored.push(...(files as File[]));
      return result;
    });
    close = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);
    canEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
    fixture = TestBed.createComponent(ImageIntakeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function pickAt(clientX: number, clientY: number): void {
    component.pick(new MouseEvent('click', { clientX, clientY }));
  }

  it('adds the picture as it came when nothing was cleared', async () => {
    standInCanvas();
    await component.open(photo, 'photo.jpg');

    await component.add();

    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('photo.jpg');
    expect(await stored[0].text()).toBe('jpeg');
    expect(close).toHaveBeenCalled();
  });

  it('clears the colour joined to the point picked, and adds the result as a PNG', async () => {
    const canvas = standInCanvas();
    await component.open(photo, 'photo.jpg');

    pickAt(10, 50);
    await component.add();

    expect(Array.from(canvas.frames.at(-1)!)).toEqual([255, 255, 255, 0, 200, 0, 0, 255]);
    expect(stored[0].name).toBe('photo.png');
    expect(stored[0].type).toBe('image/png');
  });

  it('redoes the points picked as the tolerance moves, and takes the last one back', async () => {
    const canvas = standInCanvas();
    await component.open(photo, 'photo.jpg');
    pickAt(10, 50);

    component.setTolerance(128);
    expect(canvas.frames.at(-1)![7]).toBeLessThan(255);

    component.undo();
    expect(Array.from(canvas.frames.at(-1)!)).toEqual([255, 255, 255, 255, 200, 0, 0, 255]);
    expect(component.points()).toEqual([]);
  });

  it('says a picture the browser cannot read failed, and adds nothing', async () => {
    standInCanvas();
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unreadable')));

    await component.open(photo, 'photo.jpg');
    await component.add();

    expect(component.state()).toBe('failed');
    expect(stored).toHaveLength(0);
  });

  it('stays open and says so when the picture is over the size limit', async () => {
    standInCanvas();
    result = { images: [], oversized: ['photo.jpg'] };
    await component.open(photo, 'photo.jpg');

    await component.add();
    fixture.detectChanges();

    expect(component.state()).toBe('tooLarge');
    expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="image-intake-too-large"]')).not.toBeNull();
  });

  it('adds nothing for a seat that may not edit the table', async () => {
    standInCanvas();
    canEdit = false;
    await component.open(photo, 'photo.jpg');

    await component.add();

    expect(stored).toHaveLength(0);
  });
});
