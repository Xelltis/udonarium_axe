import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageRelinkService } from '@axe/application/file/image-relink.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver, ImageLoadResult, MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import {
  ImageEditorComponent,
  ImageEditOutcome,
  ImageEditRequest,
} from '@axe/ui/components/image-editor/image-editor.component';
import type { MockInstance } from 'vitest';

interface StandIn {
  /** Every frame put on a canvas, newest last. */
  readonly frames: Uint8ClampedArray[];
  /** The size of each canvas a picture was encoded from. */
  readonly encoded: { width: number; height: number }[];
  /** The part of the picture drawn out for each encoding, as x, y, width and height. */
  readonly cut: number[][];
}

/**
 * The page here draws nothing, so the picture is read and drawn through stand-ins: a picture of
 * the size given, white but for a red last pixel, shown in a frame ten screen pixels to a pixel,
 * and canvases that keep the last frame put on them.
 */
function standInCanvas(width = 2, height = 1): StandIn {
  const drawn: StandIn = { frames: [], encoded: [], cut: [] };
  const pixelsOf = (w: number, h: number) => {
    const pixels = new Uint8ClampedArray(w * h * 4).fill(255);
    pixels.set([200, 0, 0, 255], pixels.length - 4);
    return pixels;
  };
  const context = {
    save: () => undefined,
    restore: () => undefined,
    clearRect: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    drawImage: (...args: unknown[]) => {
      if (args.length === 9) drawn.cut.push(args.slice(1, 5) as number[]);
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: pixelsOf(w, h), width: w, height: h }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (frame: { data: Uint8ClampedArray }) => drawn.frames.push(new Uint8ClampedArray(frame.data)),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width * 10,
    bottom: height * 10,
    width: width * 10,
    height: height * 10,
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    drawn.encoded.push({ width: this.width, height: this.height });
    callback(new Blob(['edited'], { type: 'image/png' }));
  });
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => undefined }));
  return drawn;
}

describe('ImageEditorComponent', () => {
  let fixture: ComponentFixture<ImageEditorComponent>;
  let component: ImageEditorComponent;
  let stored: File[];
  let result: ImageLoadResult;
  let close: MockInstance<() => void>;
  let replace: MockInstance<(old: ImageFile, next: ImageFile) => number>;
  let canEdit: boolean;
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageEditorComponent], providers: [...TEST_PROVIDERS] });
    stored = [];
    result = { images: [ImageFile.createEmpty('stored')], oversized: [] };
    vi.spyOn(TestBed.inject(FileArchiver), 'loadImages').mockImplementation(async (files) => {
      stored.push(...(files as File[]));
      return result;
    });
    close = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);
    replace = vi.spyOn(TestBed.inject(ImageRelinkService), 'replace').mockReturnValue(1);
    canEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
    fixture = TestBed.createComponent(ImageEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Opens a picture and waits until it has been read, handing back how the edit ends. The promise
   * of that comes wrapped, or waiting on this would wait for the edit to end as well.
   */
  async function opened(request: Partial<ImageEditRequest> = {}): Promise<{ outcome: Promise<ImageEditOutcome> }> {
    const outcome = component.open({ blob: photo, name: 'photo.jpg', ...request });
    await vi.waitFor(() => expect(component.state()).not.toBe('loading'));
    return { outcome };
  }

  function pointer(type: string, clientX: number, clientY: number): PointerEvent {
    return new PointerEvent(type, { clientX, clientY, pointerId: 1 });
  }

  function drag(from: [number, number], to: [number, number]): void {
    component.press(pointer('pointerdown', ...from));
    component.pull(pointer('pointermove', ...to));
    component.release();
  }

  describe('a picture left as it came', () => {
    it('is added as it came, and the edit ends with it', async () => {
      standInCanvas();
      const { outcome } = await opened();

      await component.add();

      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('photo.jpg');
      expect(await stored[0].text()).toBe('jpeg');
      expect(await outcome).toEqual({ kind: 'added', image: result.images[0] });
    });

    it('says a picture the browser cannot read failed, and adds nothing', async () => {
      standInCanvas();
      vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unreadable')));
      await opened();

      await component.add();

      expect(component.state()).toBe('failed');
      expect(stored).toHaveLength(0);
    });

    it('adds nothing for a seat that may not edit the table', async () => {
      standInCanvas();
      canEdit = false;
      await opened();

      await component.add();

      expect(stored).toHaveLength(0);
    });
  });

  describe('clearing the background', () => {
    it('clears the colour joined to the point picked, and adds the result as a PNG', async () => {
      const canvas = standInCanvas();
      await opened();
      component.selectTool('erase');

      component.press(pointer('pointerdown', 5, 5));
      await component.add();

      expect(Array.from(canvas.frames.at(-1)!)).toEqual([255, 255, 255, 0, 200, 0, 0, 255]);
      expect(stored[0].name).toBe('photo.png');
      expect(stored[0].type).toBe('image/png');
    });

    it('clears nothing for a press beside the picture', async () => {
      standInCanvas();
      await opened();
      component.selectTool('erase');

      component.press(pointer('pointerdown', -5, 5));

      expect(component.points()).toEqual([]);
    });

    it('redoes the points picked as the tolerance moves, and takes the last one back', async () => {
      const canvas = standInCanvas();
      await opened();
      component.selectTool('erase');
      component.press(pointer('pointerdown', 5, 5));

      component.setTolerance(128);
      await new Promise((settled) => requestAnimationFrame(settled));
      expect(canvas.frames.at(-1)![7]).toBeLessThan(255);

      component.undo();
      expect(Array.from(canvas.frames.at(-1)!)).toEqual([255, 255, 255, 255, 200, 0, 0, 255]);
      expect(component.points()).toEqual([]);
    });

    it('redraws once for however many times the slider moved within a frame', async () => {
      const canvas = standInCanvas();
      await opened();
      component.selectTool('erase');
      component.press(pointer('pointerdown', 5, 5));
      const before = canvas.frames.length;

      for (const tolerance of [10, 20, 30, 40]) component.setTolerance(tolerance);
      await new Promise((settled) => requestAnimationFrame(settled));

      expect(canvas.frames.length - before).toBe(1);
      expect(component.tolerance()).toBe(40);
    });
  });

  describe('cutting, turning and sizing', () => {
    it('cuts out the part dragged over and stores only that', async () => {
      const canvas = standInCanvas(40, 30);
      await opened();

      drag([100, 100], [300, 250]);
      await component.add();

      expect(component.crop()).toEqual({ x: 10, y: 10, width: 20, height: 15 });
      expect(canvas.cut.at(-1)).toEqual([10, 10, 20, 15]);
      expect(canvas.encoded.at(-1)).toEqual({ width: 20, height: 15 });
    });

    it('draws from the nearest edge when the press is beside the picture', async () => {
      standInCanvas(40, 30);
      await opened();
      fixture.detectChanges();
      const area: HTMLElement = fixture.nativeElement.querySelector('[data-testid="image-editor-area"]');

      for (const [type, x, y] of [
        ['pointerdown', -50, 100],
        ['pointermove', 200, 200],
        ['pointerup', 200, 200],
      ] as const) {
        area.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
      }

      expect(component.crop()).toEqual({ x: 0, y: 10, width: 20, height: 10 });
    });

    it('keeps the panel from taking a drag that starts on the picture or beside it', () => {
      const area: HTMLElement = fixture.nativeElement.querySelector('[data-testid="image-editor-area"]');

      expect(area.classList).toContain('panel-no-drag');
    });

    it('moves the part kept when it is dragged from inside, and no further than the edge', async () => {
      standInCanvas(40, 30);
      await opened();
      drag([100, 100], [300, 250]);

      drag([200, 150], [900, 150]);

      expect(component.crop()).toEqual({ x: 20, y: 10, width: 20, height: 15 });
    });

    it('lays a ratio chosen in the middle of the picture, as large as it fits', async () => {
      standInCanvas(40, 30);
      await opened();

      component.chooseRatio('1:1');

      expect(component.crop()).toEqual({ x: 5, y: 0, width: 30, height: 30 });
      component.keepWhole();
      expect(component.crop()).toBeNull();
      expect(component.edited()).toBe(false);
    });

    it('turns the picture a quarter, carrying the part kept round with it', async () => {
      const canvas = standInCanvas(40, 30);
      await opened();
      drag([0, 0], [100, 50]);

      component.act('turn-right');
      await component.add();

      expect(component.pictureSize()).toEqual({ width: 30, height: 40 });
      expect(component.crop()).toEqual({ x: 25, y: 0, width: 5, height: 10 });
      expect(canvas.encoded.at(-1)).toEqual({ width: 5, height: 10 });
    });

    it('stores a picture only mirrored as a PNG of the same size', async () => {
      const canvas = standInCanvas(40, 30);
      await opened();

      component.act('flip-across');
      await component.add();

      expect(component.orientation().flipX).toBe(true);
      expect(stored[0].type).toBe('image/png');
      expect(canvas.encoded.at(-1)).toEqual({ width: 40, height: 30 });
    });

    it('draws the picture out at the size asked for, the other side following', async () => {
      const canvas = standInCanvas(40, 30);
      await opened();

      component.setOutputWidth(20);
      expect(component.outputSize()).toEqual({ width: 20, height: 15 });
      component.setKeepProportions(false);
      component.setOutputHeight(40);
      await component.add();

      expect(canvas.encoded.at(-1)).toEqual({ width: 20, height: 40 });
      expect(canvas.cut.at(-1)).toEqual([0, 0, 40, 30]);
    });

    it('scales by a share of the part kept, and goes back to its own size at a hundred', async () => {
      standInCanvas(40, 30);
      await opened();

      component.scaleTo(50);
      expect(component.outputSize()).toEqual({ width: 20, height: 15 });
      component.scaleTo(100);
      expect(component.output()).toBeNull();
      expect(component.edited()).toBe(false);
    });

    it('puts everything back as the picture came', async () => {
      standInCanvas(40, 30);
      await opened();
      drag([100, 100], [300, 250]);
      component.act('turn-left');
      component.scaleTo(25);

      component.act('reset');

      expect(component.edited()).toBe(false);
      expect(component.pictureSize()).toEqual({ width: 40, height: 30 });
    });
  });

  describe('storing it', () => {
    it('stays open and says how large it came out when the picture is over the size limit', async () => {
      standInCanvas();
      result = { images: [], oversized: ['photo.jpg'] };
      await opened();

      await component.add();
      fixture.detectChanges();

      expect(component.state()).toBe('ready');
      expect(component.tooLargeBytes()).toBe(photo.size);
      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-too-large"]')).not.toBeNull();
    });

    it('still lets a picture too large be cut down, and stops saying so once it is', async () => {
      const canvas = standInCanvas(40, 30);
      result = { images: [], oversized: ['photo.jpg'] };
      await opened();
      await component.add();

      drag([100, 100], [300, 250]);
      component.act('turn-right');

      expect(component.crop()).not.toBeNull();
      expect(component.tooLargeBytes()).toBeNull();
      result = { images: [ImageFile.createEmpty('stored')], oversized: [] };
      await component.add();
      expect(canvas.encoded.at(-1)).toEqual({ width: 15, height: 20 });
      expect(stored).toHaveLength(2);
    });

    it('writes a picture over the size limit out again even when nothing was done to it', async () => {
      const canvas = standInCanvas();
      const huge = new Blob([new Uint8Array(MAX_LOADED_IMAGE_BYTES + 1)], { type: 'image/jpeg' });
      await opened({ blob: huge });

      await component.add();

      expect(canvas.encoded.length).toBeGreaterThan(0);
      expect(stored[0].name).toBe('photo.png');
      expect(stored[0].size).toBeLessThan(huge.size);
    });

    it('stores whichever of a PNG and a WebP comes out smaller', async () => {
      standInCanvas();
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
        callback(new Blob([type === 'image/webp' ? 'w' : 'png bytes'], { type: type ?? 'image/png' }))
      );
      await opened();
      component.act('turn-right');

      await component.add();

      expect(stored[0].type).toBe('image/webp');
      expect(stored[0].name).toBe('photo.webp');
    });

    it('stays open, says so and lets it be tried again when the picture could not be stored', async () => {
      standInCanvas();
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
      await opened();
      component.act('turn-right');

      await component.add();
      fixture.detectChanges();

      expect(component.state()).toBe('ready');
      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-save-failed"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-add"]').disabled).toBe(false);
    });

    it('has everything showing the picture it replaces show the new one', async () => {
      standInCanvas(40, 30);
      const old = ImageFile.createEmpty('old');
      const { outcome } = await opened({ replaces: old });

      component.act('turn-right');
      await component.add();

      expect(replace).toHaveBeenCalledWith(old, result.images[0]);
      expect((await outcome).kind).toBe('added');
    });

    it('adds the edit as a copy beside the picture it came from when asked, leaving the room as it was', async () => {
      standInCanvas(40, 30);
      const old = ImageFile.createEmpty('old');
      const { outcome } = await opened({ replaces: old });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-add-copy"]')).not.toBeNull();

      component.act('turn-right');
      await component.add(true);

      expect(replace).not.toHaveBeenCalled();
      expect(stored).toHaveLength(1);
      expect((await outcome).kind).toBe('added');
    });

    it('offers no copy for a picture that takes the place of nothing', async () => {
      standInCanvas();
      await opened();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-add-copy"]')).toBeNull();
    });

    it('replaces nothing when the picture comes back the same', async () => {
      standInCanvas();
      const same = ImageFile.createEmpty('stored');
      await opened({ replaces: same });

      await component.add();

      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe('ending it', () => {
    it('leaves a picture alone out and closes', async () => {
      standInCanvas();
      const { outcome } = await opened();

      component.skip();

      expect(await outcome).toEqual({ kind: 'skipped' });
      expect(close).toHaveBeenCalled();
    });

    it('leaves one of several out and stays open for the next', async () => {
      standInCanvas();
      const { outcome } = await opened({ position: { index: 1, count: 3 } });
      fixture.detectChanges();

      component.skip();

      expect(await outcome).toEqual({ kind: 'skipped' });
      expect(close).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[data-testid="image-editor-position"]')).not.toBeNull();
    });

    it('takes the rest as they are when asked', async () => {
      standInCanvas();
      const { outcome } = await opened({ position: { index: 2, count: 3 } });

      component.takeRestAsTheyAre();

      expect(await outcome).toEqual({ kind: 'restAsTheyAre' });
      expect(stored).toHaveLength(0);
    });

    it('settles as closed when the panel goes away', async () => {
      standInCanvas();
      const { outcome } = await opened();

      fixture.destroy();

      expect(await outcome).toEqual({ kind: 'closed' });
    });
  });
});
