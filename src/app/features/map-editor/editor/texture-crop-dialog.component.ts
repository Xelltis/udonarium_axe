import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { loadRasterImage } from '@axe/features/map-editor/render/raster-image';
import { cropImageRegion } from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-region';
import { TranslocoModule } from '@jsverse/transloco';

export interface TextureCropDialogOption {
  objectUrl: string;
}

export const TEXTURE_CROP_STAGE = 360;
export const TEXTURE_CROP_FRAME = 288;
export const TEXTURE_CROP_MIN_STAGE = 240;
export const TEXTURE_CROP_MARGIN = 48;

/**
 * The side of the crop stage for a viewport width: the width less a margin, kept between the
 * minimum and the usual size.
 */
export function fitCropStage(viewportWidth: number): number {
  return Math.max(TEXTURE_CROP_MIN_STAGE, Math.min(TEXTURE_CROP_STAGE, viewportWidth - TEXTURE_CROP_MARGIN));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-texture-crop-dialog',
  templateUrl: './texture-crop-dialog.component.html',
  host: { class: 'block text-ui-text' },
  imports: [TranslocoModule],
})
export class TextureCropDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly t = inject(TRANSLATE_FN);

  private readonly cropFn = cropImageRegion;
  private readonly loadImageFn = loadRasterImage;

  private readonly stageSignal = signal(fitCropStage(window.innerWidth));
  protected get stage(): number {
    return this.stageSignal();
  }
  protected get frame(): number {
    return Math.round(this.stage * (TEXTURE_CROP_FRAME / TEXTURE_CROP_STAGE));
  }
  protected readonly objectUrl: string;

  protected readonly tx = signal(0);
  protected readonly ty = signal(0);
  protected readonly scale = signal(1);

  private image: HTMLImageElement | null = null;
  private minScale = 1;
  private dragging = false;
  private dragLastX = 0;
  private dragLastY = 0;

  constructor() {
    const raw = this.modalService.option as Partial<TextureCropDialogOption> | undefined;
    this.objectUrl = raw?.objectUrl ?? '';
    queueMicrotask(() => {
      this.modalService.title = this.t('feature.mapEditor.props.textureCropTitle');
    });
    void this.prepare();

    const onResize = () => {
      const next = fitCropStage(window.innerWidth);
      if (next === this.stageSignal()) return;
      this.stageSignal.set(next);
      void this.prepare();
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private async prepare(): Promise<void> {
    if (!this.objectUrl) return;
    try {
      const image = await this.loadImageFn(this.objectUrl);
      this.image = image;
      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;
      if (!(w > 0) || !(h > 0)) return;
      this.minScale = this.frame / Math.min(w, h);
      this.scale.set(this.minScale);
      this.tx.set((this.stage - w * this.minScale) / 2);
      this.ty.set((this.stage - h * this.minScale) / 2);
    } catch {
      this.image = null;
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragLastX;
    const dy = event.clientY - this.dragLastY;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    this.tx.update((v) => v + dx);
    this.ty.update((v) => v + dy);
    this.clamp();
  }

  protected onPointerUp(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (!this.image) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const before = this.scale();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const after = Math.max(this.minScale, Math.min(this.minScale * 8, before * factor));
    if (after === before) return;
    const ratio = after / before;
    this.scale.set(after);
    this.tx.set(cursorX - (cursorX - this.tx()) * ratio);
    this.ty.set(cursorY - (cursorY - this.ty()) * ratio);
    this.clamp();
  }

  private clamp(): void {
    if (!this.image) return;
    const w = (this.image.naturalWidth || this.image.width) * this.scale();
    const h = (this.image.naturalHeight || this.image.height) * this.scale();
    const frameLeft = (this.stage - this.frame) / 2;
    const frameTop = (this.stage - this.frame) / 2;
    const minX = frameLeft + this.frame - w;
    const minY = frameTop + this.frame - h;
    this.tx.set(Math.min(frameLeft, Math.max(minX, this.tx())));
    this.ty.set(Math.min(frameTop, Math.max(minY, this.ty())));
  }

  protected cancel(): void {
    this.modalService.resolve(null);
  }

  protected async apply(): Promise<void> {
    if (!this.image) {
      this.modalService.resolve(null);
      return;
    }
    const frameLeft = (this.stage - this.frame) / 2;
    const frameTop = (this.stage - this.frame) / 2;
    const scale = this.scale();
    const sx = (frameLeft - this.tx()) / scale;
    const sy = (frameTop - this.ty()) / scale;
    const sSize = this.frame / scale;
    try {
      const blob = await this.cropFn(this.image, sx, sy, sSize, sSize, 512);
      this.modalService.resolve(blob);
    } catch {
      this.modalService.resolve(null);
    }
  }
}
