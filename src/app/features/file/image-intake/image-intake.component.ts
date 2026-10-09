import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ConnectedColorEraser } from '@axe/domain/media/erase-connected-color';
import { TranslocoModule } from '@jsverse/transloco';

/** Where the picture stands in being looked at and stored. */
export type ImageIntakeState = 'loading' | 'ready' | 'failed' | 'tooLarge' | 'saving';

interface Picture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

const DEFAULT_TOLERANCE = 32;

/**
 * Shows one picture before it is stored, and lets its background be cleared first.
 *
 * Each point picked on the picture clears the run of colour joined to it, within the tolerance on
 * the slider; the points are kept, so moving the slider redoes them all from the picture as it
 * came, and the last can be taken back. A picture left as it came is stored as it came, and one
 * cleared is stored as a PNG under a name of its own.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'image-intake',
  templateUrl: './image-intake.component.html',
  host: { class: 'text-ui-text flex h-full flex-col gap-2 p-3 text-[13px]' },
  imports: [TranslocoModule],
})
export class ImageIntakeComponent {
  private readonly panelService = inject(PanelService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly state = signal<ImageIntakeState>('loading');
  /** Whether the last try at storing the picture failed, which leaves it open to try again. */
  readonly saveFailed = signal(false);
  readonly tolerance = signal(DEFAULT_TOLERANCE);
  readonly points = signal<readonly { x: number; y: number }[]>([]);

  private source: Blob | null = null;
  private name = '';
  private original: Picture | null = null;
  private eraser: ConnectedColorEraser | null = null;
  private redrawPending = false;

  /**
   * Opens a picture to look at, to be stored as `name` once added.
   *
   * A picture the browser cannot read is shown as one that failed.
   */
  async open(blob: Blob, name: string): Promise<void> {
    this.source = blob;
    this.name = name;
    this.points.set([]);
    this.state.set('loading');
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = this.canvasRef().nativeElement;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('no 2d context');
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      this.original = { width: canvas.width, height: canvas.height, pixels: new Uint8ClampedArray(data) };
      this.eraser = new ConnectedColorEraser(canvas.width, canvas.height);
      this.state.set('ready');
    } catch {
      this.original = null;
      this.eraser = null;
      this.state.set('failed');
    }
  }

  /** Clears the run of colour joined to the point picked on the picture. */
  pick(event: MouseEvent): void {
    if (this.state() !== 'ready' || !this.original) return;
    const canvas = this.canvasRef().nativeElement;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.floor(((event.clientX - box.left) / box.width) * this.original.width);
    const y = Math.floor(((event.clientY - box.top) / box.height) * this.original.height);
    this.points.update((points) => [...points, { x, y }]);
    this.redraw();
  }

  /**
   * Sets how far from a picked colour is still cleared, and redoes every point picked on the next
   * frame, once however many times the slider moved before it.
   */
  setTolerance(value: number): void {
    this.tolerance.set(Math.max(0, Math.min(128, Math.round(value) || 0)));
    if (this.redrawPending) return;
    this.redrawPending = true;
    requestAnimationFrame(() => {
      this.redrawPending = false;
      this.redraw();
    });
  }

  /** Takes back the last point picked. */
  undo(): void {
    this.points.update((points) => points.slice(0, -1));
    this.redraw();
  }

  /** Puts the picture away unstored. */
  cancel(): void {
    this.panelService.close();
  }

  /**
   * Stores the picture, as it came or cleared, and closes; one over the size limit is kept open and
   * said to be too large, and one that could not be stored is kept open, said so, to try again. A
   * seat that may not edit the table stores nothing.
   */
  async add(): Promise<void> {
    if (!this.rolePermission.canEditTabletop || !this.source) return;
    if (this.state() !== 'ready' && this.state() !== 'tooLarge') return;
    this.state.set('saving');
    this.saveFailed.set(false);
    try {
      const file =
        this.points().length > 0
          ? new File([await this.encode()], withPngExtension(this.name), { type: 'image/png' })
          : new File([this.source], this.name, { type: this.source.type });
      const { images } = await this.fileArchiver.loadImages([file]);
      if (images.length > 0) {
        this.panelService.close();
      } else {
        this.state.set('tooLarge');
      }
    } catch {
      this.saveFailed.set(true);
      this.state.set('ready');
    }
  }

  private redraw(): void {
    const original = this.original;
    const eraser = this.eraser;
    if (!original || !eraser) return;
    const pixels = new Uint8ClampedArray(original.pixels);
    for (const { x, y } of this.points()) eraser.erase(pixels, x, y, this.tolerance());
    const context = this.canvasRef().nativeElement.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const frame = context.createImageData(original.width, original.height);
    frame.data.set(pixels);
    context.putImageData(frame, 0, 0);
  }

  private encode(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      this.canvasRef().nativeElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/png')
    );
  }
}

function withPngExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base.length > 0 ? base : 'image'}.png`;
}
