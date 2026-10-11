import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ImageRelinkService } from '@axe/application/file/image-relink.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { canvasToBlob } from '@axe/core/storage/canvas-blob';
import { FileArchiver, MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ConnectedColorEraser } from '@axe/domain/media/erase-connected-color';
import {
  centeredRect,
  editedName,
  EditOrientation,
  EditPoint,
  EditRect,
  EditSize,
  flipPoint,
  flipRect,
  movedRect,
  orientedSize,
  rectFromCorners,
  resizedSize,
  scaledSize,
  turned,
  turnPoint,
  turnRect,
  UPRIGHT,
  wholeRect,
} from '@axe/domain/media/image-edit';
import { TranslocoModule } from '@jsverse/transloco';

/** Where the picture stands in being looked at, edited and stored. */
export type ImageEditorState = 'loading' | 'ready' | 'failed' | 'saving';

/** What a press on the picture does: draw the part to keep, or clear a run of colour. */
export type ImageEditorTool = 'crop' | 'erase';

/** A picture to edit, and what becomes of it. */
export interface ImageEditRequest {
  readonly blob: Blob;
  /** The name it is stored under. */
  readonly name: string;
  /** The picture already in the room it is to take the place of, when it is one. */
  readonly replaces?: ImageFile;
  /** Where it stands in a run of pictures being taken in, counted from one. */
  readonly position?: { readonly index: number; readonly count: number };
}

/** How an edit ended. */
export type ImageEditOutcome =
  | { readonly kind: 'added'; readonly image: ImageFile }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'restAsTheyAre' }
  | { readonly kind: 'closed' };

/** The ratios offered for the part kept, width over height; null leaves it free, 0 takes the picture's own. */
export const CROP_RATIOS: readonly { readonly key: string; readonly ratio: number | null }[] = [
  { key: 'free', ratio: null },
  { key: 'original', ratio: 0 },
  { key: '1:1', ratio: 1 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '3:4', ratio: 3 / 4 },
  { key: '16:9', ratio: 16 / 9 },
];

/** What the buttons over the picture do to it, each with its mark and its name. */
export const ORIENT_ACTIONS = [
  { id: 'turn-left', icon: 'rotate_left', label: 'ui.imageEditor.turnLeft' },
  { id: 'turn-right', icon: 'rotate_right', label: 'ui.imageEditor.turnRight' },
  { id: 'flip-across', icon: 'flip', label: 'ui.imageEditor.flipAcross' },
  { id: 'flip-up-down', icon: 'flip', label: 'ui.imageEditor.flipUpDown' },
  { id: 'reset', icon: 'restart_alt', label: 'ui.imageEditor.reset' },
] as const;

export type OrientActionId = (typeof ORIENT_ACTIONS)[number]['id'];

/** The shares of its size a picture can be put out at with one press. */
export const SCALE_PRESETS = [25, 50, 75, 100] as const;

interface Picture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

type Drag =
  | { readonly kind: 'draw'; readonly from: EditPoint }
  | { readonly kind: 'move'; readonly last: EditPoint }
  | { readonly kind: 'corner'; readonly anchor: EditPoint };

const DEFAULT_TOLERANCE = 32;
/** The quality a picture is written out at as a WebP, the same as storing a picture converts at. */
const WEBP_QUALITY = 0.9;
/** The room left round the picture inside the area it is shown in, in screen pixels. */
const AREA_PADDING_PX = 16;
/** How near a corner of the kept part a press has to be, in screen pixels, to take hold of it. */
const HANDLE_REACH_PX = 14;

/**
 * Shows one picture before it is stored, and lets it be worked on first: turned or mirrored, its
 * background cleared, cut down to the part wanted and drawn out at another size.
 *
 * Each point picked on the picture clears the run of colour joined to it, within the tolerance on
 * the slider; the points are kept, so moving the slider redoes them all from the picture as it
 * came, and the last can be taken back. Turning or mirroring carries the points and the kept part
 * round with it. A picture left as it came is stored as it came; one worked on is stored as a PNG
 * under a name of its own. One that takes the place of a picture in the room has everything that
 * showed the old one show it instead.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'image-editor',
  templateUrl: './image-editor.component.html',
  host: { class: 'text-ui-text flex h-full flex-col gap-2 p-3 text-[13px]' },
  imports: [TranslocoModule],
})
export class ImageEditorComponent {
  private readonly panelService = inject(PanelService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly relink = inject(ImageRelinkService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frameRef = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly areaRef = viewChild.required<ElementRef<HTMLElement>>('area');
  /** The room the picture has to be shown in, measured as the panel changes size. */
  private readonly area = signal<EditSize>({ width: 440, height: 280 });

  readonly cropRatios = CROP_RATIOS;
  readonly orientActions = ORIENT_ACTIONS;
  readonly scalePresets = SCALE_PRESETS;

  readonly state = signal<ImageEditorState>('loading');
  /** Whether the last try at storing the picture failed, which leaves it open to try again. */
  readonly saveFailed = signal(false);
  /** What the last try at storing came out at, over the size limit, and the edit it came from. */
  private readonly oversized = signal<{ readonly bytes: number; readonly edit: string } | null>(null);
  readonly tool = signal<ImageEditorTool>('crop');
  readonly tolerance = signal(DEFAULT_TOLERANCE);
  /** The points cleared from, on the picture as it is turned. */
  readonly points = signal<readonly EditPoint[]>([]);
  readonly orientation = signal<EditOrientation>(UPRIGHT);
  /** The part kept, on the picture as it is turned; null keeps the whole of it. */
  readonly crop = signal<EditRect | null>(null);
  readonly ratioKey = signal<string>('free');
  /** The size it is put out at; null puts it out at the size of the part kept. */
  readonly output = signal<EditSize | null>(null);
  readonly keepProportions = signal(true);
  readonly request = signal<ImageEditRequest | null>(null);

  private original: Picture | null = null;
  private oriented: Picture | null = null;
  private eraser: ConnectedColorEraser | null = null;
  private redrawPending = false;
  private drag: Drag | null = null;
  private settle: ((outcome: ImageEditOutcome) => void) | null = null;

  /** The size of the picture as it is turned, which everything drawn on it is measured against. */
  readonly pictureSize = computed<EditSize>(() => {
    this.orientation();
    this.state();
    const original = this.original;
    if (!original) return { width: 1, height: 1 };
    return orientedSize({ width: original.width, height: original.height }, this.orientation());
  });

  /** How large the picture is shown: as large as the room for it allows, never past four times its size. */
  readonly displaySize = computed<EditSize>(() => {
    const picture = this.pictureSize();
    const room = this.area();
    const scale = Math.min(room.width / picture.width, room.height / picture.height, 4);
    return {
      width: Math.max(1, Math.floor(picture.width * scale)),
      height: Math.max(1, Math.floor(picture.height * scale)),
    };
  });

  /** The part kept, the whole of the picture when nothing has been cut. */
  readonly keptRect = computed<EditRect>(() => this.crop() ?? wholeRect(this.pictureSize()));

  /** The size the picture comes out at. */
  readonly outputSize = computed<EditSize>(
    () => this.output() ?? { width: this.keptRect().width, height: this.keptRect().height }
  );

  /** The kept part as shares of the picture, for the frame drawn over it. */
  readonly cropBox = computed(() => {
    const rect = this.crop();
    if (!rect) return null;
    const size = this.pictureSize();
    const percent = (value: number, of: number) => `${(value / of) * 100}%`;
    return {
      left: percent(rect.x, size.width),
      top: percent(rect.y, size.height),
      width: percent(rect.width, size.width),
      height: percent(rect.height, size.height),
    };
  });

  /** Everything done to the picture that changes what is stored, in a form that can be compared. */
  private readonly editKey = computed(() =>
    JSON.stringify([this.orientation(), this.keptRect(), this.outputSize(), this.points(), this.tolerance()])
  );

  /**
   * How large the picture came out when it was last too large to store, in bytes; null once
   * anything is done to it after that, or when it was not too large.
   */
  readonly tooLargeBytes = computed(() => {
    const oversized = this.oversized();
    return oversized && oversized.edit === this.editKey() ? oversized.bytes : null;
  });

  /** {@link tooLargeBytes} in megabytes to one place, for the message saying so. */
  readonly tooLargeSize = computed(() => {
    const bytes = this.tooLargeBytes();
    return bytes === null ? null : megabytes(bytes);
  });

  /**
   * How large the picture came, in megabytes to one place, when that is over the size limit, to
   * say why it is open and what adding it will do; null for one within the limit.
   */
  readonly overLimitSize = computed(() => {
    const size = this.request()?.blob.size ?? 0;
    return size > MAX_LOADED_IMAGE_BYTES ? megabytes(size) : null;
  });

  /** Whether the picture has been worked on at all, which decides whether it is stored as it came. */
  readonly edited = computed(() => {
    const orientation = this.orientation();
    const size = this.pictureSize();
    const kept = this.keptRect();
    const out = this.outputSize();
    return (
      orientation.quarterTurns !== 0 ||
      orientation.flipX ||
      orientation.flipY ||
      this.points().length > 0 ||
      kept.width !== size.width ||
      kept.height !== size.height ||
      out.width !== kept.width ||
      out.height !== kept.height
    );
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.finish({ kind: 'closed' }));
    queueMicrotask(() => this.watchArea(destroyRef));
  }

  private watchArea(destroyRef: DestroyRef): void {
    const element = this.areaRef().nativeElement;
    const read = () => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0)
        this.area.set({ width: box.width - AREA_PADDING_PX, height: box.height - AREA_PADDING_PX });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  }

  /**
   * Opens a picture to work on, settling once it is stored, left out or the panel is closed.
   * A picture the browser cannot read is shown as one that failed.
   */
  open(request: ImageEditRequest): Promise<ImageEditOutcome> {
    this.finish({ kind: 'closed' });
    const settled = new Promise<ImageEditOutcome>((resolve) => (this.settle = resolve));
    void this.load(request);
    return settled;
  }

  private async load(request: ImageEditRequest): Promise<void> {
    this.request.set(request);
    this.points.set([]);
    this.orientation.set(UPRIGHT);
    this.crop.set(null);
    this.ratioKey.set('free');
    this.output.set(null);
    this.saveFailed.set(false);
    this.oversized.set(null);
    this.tool.set('crop');
    this.state.set('loading');
    try {
      const bitmap = await createImageBitmap(request.blob);
      const canvas = this.canvasRef().nativeElement;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('no 2d context');
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      this.original = { width: canvas.width, height: canvas.height, pixels: new Uint8ClampedArray(data) };
      this.oriented = this.original;
      this.eraser = new ConnectedColorEraser(canvas.width, canvas.height);
      this.state.set('ready');
    } catch {
      this.original = null;
      this.oriented = null;
      this.eraser = null;
      this.state.set('failed');
    }
  }

  selectTool(tool: ImageEditorTool): void {
    this.tool.set(tool);
  }

  /** Turns the picture a quarter, carrying the points cleared and the part kept round with it. */
  turn(clockwise: boolean): void {
    if (this.state() !== 'ready') return;
    const before = this.pictureSize();
    this.points.update((points) => points.map((point) => turnPoint(point, before, clockwise)));
    this.crop.update((rect) => (rect ? turnRect(rect, before, clockwise) : null));
    this.output.update((size) => (size ? { width: size.height, height: size.width } : null));
    this.orientation.update((orientation) => turned(orientation, clockwise));
    this.reorient();
  }

  /**
   * Mirrors the picture across or up and down, carrying the points and the part kept with it. A
   * mirror after a quarter turn runs along the other side of the picture as it came.
   */
  flip(across: boolean): void {
    if (this.state() !== 'ready') return;
    const size = this.pictureSize();
    this.points.update((points) => points.map((point) => flipPoint(point, size, across)));
    this.crop.update((rect) => (rect ? flipRect(rect, size, across) : null));
    this.orientation.update((orientation) => {
      const sideways = orientation.quarterTurns % 2 === 1;
      const acrossSource = sideways ? !across : across;
      return acrossSource
        ? { ...orientation, flipX: !orientation.flipX }
        : { ...orientation, flipY: !orientation.flipY };
    });
    this.reorient();
  }

  /** Does what one of the buttons over the picture does. */
  act(id: OrientActionId): void {
    if (id === 'turn-left') this.turn(false);
    else if (id === 'turn-right') this.turn(true);
    else if (id === 'flip-across') this.flip(true);
    else if (id === 'flip-up-down') this.flip(false);
    else this.reset();
  }

  /** Takes a ratio for the part kept, laying the largest such part in the middle of the picture. */
  chooseRatio(key: string): void {
    const choice = CROP_RATIOS.find((one) => one.key === key);
    if (!choice || this.state() !== 'ready') return;
    this.ratioKey.set(key);
    const ratio = this.ratioOf(choice.ratio);
    if (ratio === null) return;
    this.setCrop(centeredRect(ratio, this.pictureSize()));
  }

  /** Keeps the whole picture again. */
  keepWhole(): void {
    this.ratioKey.set('free');
    this.setCrop(null);
  }

  /**
   * Begins drawing, moving or reshaping the part kept, or clears from the point pressed. A press
   * beside the picture draws from its nearest edge, so a part can be drawn out from a corner;
   * clearing takes a press on the picture itself.
   */
  press(event: PointerEvent): void {
    if (this.state() !== 'ready' || event.button !== 0) return;
    const point = this.pointOf(event);
    if (!point) return;
    if (this.tool() === 'erase') {
      if (!this.isOnPicture(event)) return;
      this.points.update((points) => [...points, { x: Math.floor(point.x), y: Math.floor(point.y) }]);
      this.redraw();
      return;
    }
    (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    const rect = this.crop();
    const corner = rect ? this.cornerNear(rect, event) : null;
    if (rect && corner) {
      this.drag = { kind: 'corner', anchor: corner };
    } else if (
      rect &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      this.drag = { kind: 'move', last: point };
    } else {
      this.drag = { kind: 'draw', from: point };
    }
  }

  /** Follows the pointer while the part kept is being drawn, moved or reshaped. */
  pull(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const point = this.pointOf(event);
    if (!point) return;
    const size = this.pictureSize();
    const ratio = this.ratioOf(CROP_RATIOS.find((one) => one.key === this.ratioKey())?.ratio ?? null);
    if (drag.kind === 'move') {
      const rect = this.crop();
      if (!rect) return;
      this.setCrop(movedRect(rect, point.x - drag.last.x, point.y - drag.last.y, size));
      this.drag = { kind: 'move', last: point };
      return;
    }
    const from = drag.kind === 'draw' ? drag.from : drag.anchor;
    if (Math.abs(point.x - from.x) < 1 && Math.abs(point.y - from.y) < 1) return;
    this.setCrop(rectFromCorners(from, point, ratio, size));
  }

  /** Lets go of the part kept. */
  release(): void {
    this.drag = null;
  }

  /** Sets the width it is put out at, the height following while proportions are kept. */
  setOutputWidth(value: number): void {
    if (!(value > 0)) return;
    const kept = this.keptRect();
    this.output.set(
      resizedSize(
        kept,
        this.keepProportions() ? { width: value } : { width: value, height: this.outputSize().height },
        this.keepProportions()
      )
    );
  }

  /** Sets the height it is put out at, the width following while proportions are kept. */
  setOutputHeight(value: number): void {
    if (!(value > 0)) return;
    const kept = this.keptRect();
    this.output.set(
      resizedSize(
        kept,
        this.keepProportions() ? { height: value } : { width: this.outputSize().width, height: value },
        this.keepProportions()
      )
    );
  }

  /** Puts it out at a share of the size of the part kept. */
  scaleTo(percent: number): void {
    const size = scaledSize(this.keptRect(), percent);
    this.output.set(percent === 100 ? null : size);
  }

  setKeepProportions(keep: boolean): void {
    this.keepProportions.set(keep);
    if (keep && this.output()) this.setOutputWidth(this.outputSize().width);
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

  /** Puts everything back as the picture came. */
  reset(): void {
    if (this.state() !== 'ready') return;
    this.points.set([]);
    this.orientation.set(UPRIGHT);
    this.crop.set(null);
    this.ratioKey.set('free');
    this.output.set(null);
    this.reorient();
  }

  /** Leaves this picture out; alone, that closes the panel. */
  skip(): void {
    this.finish({ kind: 'skipped' });
    if (!this.request()?.position || this.request()!.position!.count <= 1) this.panelService.close();
  }

  /** Takes this picture and the rest still to come in as they are. */
  takeRestAsTheyAre(): void {
    this.finish({ kind: 'restAsTheyAre' });
  }

  /** Puts the picture away unstored. */
  cancel(): void {
    this.panelService.close();
  }

  /** Closes the panel once whoever opened it is done with it. */
  close(): void {
    this.panelService.close();
  }

  /**
   * Stores the picture, as it came or worked on, and settles. A picture left as it came is stored
   * as it came unless it is over the size limit, when it is written out again in case that brings
   * it under. One still over the limit is kept open to be cut down or made smaller, and said to be
   * too large, and one that could not be stored is kept open, said so, to try again. One that takes
   * the place of a picture in the room has everything showing the old one show it instead, unless it
   * is added as a copy, which leaves the old one where it is. A seat that may not edit the table
   * stores nothing.
   */
  async add(asCopy = false): Promise<void> {
    const request = this.request();
    if (!this.rolePermission.canEditTabletop || !request) return;
    if (this.state() !== 'ready') return;
    const edit = this.editKey();
    this.state.set('saving');
    this.saveFailed.set(false);
    this.oversized.set(null);
    try {
      let file: File;
      if (this.edited() || request.blob.size > MAX_LOADED_IMAGE_BYTES) {
        const blob = await this.encode();
        file = new File([blob], editedName(request.name, blob.type), { type: blob.type });
      } else {
        file = new File([request.blob], request.name, { type: request.blob.type });
      }
      const { images } = await this.fileArchiver.loadImages([file]);
      const image = images[0];
      if (!image) {
        this.oversized.set({ bytes: file.size, edit });
        this.state.set('ready');
        return;
      }
      if (!asCopy && request.replaces && request.replaces.identifier !== image.identifier) {
        this.relink.replace(request.replaces, image);
      }
      this.state.set('ready');
      this.finish({ kind: 'added', image });
    } catch {
      this.saveFailed.set(true);
      this.state.set('ready');
    }
  }

  private finish(outcome: ImageEditOutcome): void {
    const settle = this.settle;
    this.settle = null;
    settle?.(outcome);
  }

  private ratioOf(ratio: number | null): number | null {
    if (ratio === null) return null;
    if (ratio > 0) return ratio;
    const size = this.pictureSize();
    return size.width / size.height;
  }

  private setCrop(rect: EditRect | null): void {
    const size = this.pictureSize();
    const whole = !rect || (rect.width >= size.width && rect.height >= size.height);
    const kept = whole ? null : rect;
    const before = this.keptRect();
    this.crop.set(kept);
    const output = this.output();
    if (output && this.keepProportions()) {
      const after = this.keptRect();
      const share = output.width / before.width;
      this.output.set(scaledSize(after, share * 100));
    }
  }

  private isOnPicture(event: PointerEvent): boolean {
    const box = this.frameRef().nativeElement.getBoundingClientRect();
    return (
      event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom
    );
  }

  /** The point on the picture under the pointer, brought to its nearest edge from beside it. */
  private pointOf(event: PointerEvent): EditPoint | null {
    const box = this.frameRef().nativeElement.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    const size = this.pictureSize();
    return {
      x: Math.min(Math.max(0, ((event.clientX - box.left) / box.width) * size.width), size.width),
      y: Math.min(Math.max(0, ((event.clientY - box.top) / box.height) * size.height), size.height),
    };
  }

  /** The corner across from the one pressed near, which stays put while that one is pulled. */
  private cornerNear(rect: EditRect, event: PointerEvent): EditPoint | null {
    const box = this.frameRef().nativeElement.getBoundingClientRect();
    const size = this.pictureSize();
    const toScreenX = (x: number) => box.left + (x / size.width) * box.width;
    const toScreenY = (y: number) => box.top + (y / size.height) * box.height;
    const corners = [
      { at: { x: rect.x, y: rect.y }, across: { x: rect.x + rect.width, y: rect.y + rect.height } },
      { at: { x: rect.x + rect.width, y: rect.y }, across: { x: rect.x, y: rect.y + rect.height } },
      { at: { x: rect.x, y: rect.y + rect.height }, across: { x: rect.x + rect.width, y: rect.y } },
      { at: { x: rect.x + rect.width, y: rect.y + rect.height }, across: { x: rect.x, y: rect.y } },
    ];
    const hit = corners.find(
      ({ at }) => Math.hypot(toScreenX(at.x) - event.clientX, toScreenY(at.y) - event.clientY) <= HANDLE_REACH_PX
    );
    return hit?.across ?? null;
  }

  /** Lays the picture out turned and mirrored as it now stands, then clears from the points again. */
  private reorient(): void {
    const original = this.original;
    if (!original) return;
    const orientation = this.orientation();
    const size = orientedSize(original, orientation);
    const source = document.createElement('canvas');
    source.width = original.width;
    source.height = original.height;
    const sourceContext = source.getContext('2d');
    const canvas = this.canvasRef().nativeElement;
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext || !context) return;
    const frame = sourceContext.createImageData(original.width, original.height);
    frame.data.set(original.pixels);
    sourceContext.putImageData(frame, 0, 0);
    context.save();
    context.clearRect(0, 0, size.width, size.height);
    context.translate(size.width / 2, size.height / 2);
    context.rotate((orientation.quarterTurns * Math.PI) / 2);
    context.scale(orientation.flipX ? -1 : 1, orientation.flipY ? -1 : 1);
    context.drawImage(source, -original.width / 2, -original.height / 2);
    context.restore();
    const { data } = context.getImageData(0, 0, size.width, size.height);
    this.oriented = { width: size.width, height: size.height, pixels: new Uint8ClampedArray(data) };
    this.eraser = new ConnectedColorEraser(size.width, size.height);
    this.redraw();
  }

  private redraw(): void {
    const oriented = this.oriented;
    const eraser = this.eraser;
    if (!oriented || !eraser) return;
    const pixels = new Uint8ClampedArray(oriented.pixels);
    for (const { x, y } of this.points()) eraser.erase(pixels, x, y, this.tolerance());
    const context = this.canvasRef().nativeElement.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const frame = context.createImageData(oriented.width, oriented.height);
    frame.data.set(pixels);
    context.putImageData(frame, 0, 0);
  }

  /**
   * Cuts the part kept out of the picture as it is shown, draws it at the size it comes out at and
   * writes it out as a PNG or a WebP, whichever is smaller, as storing a picture would.
   */
  private async encode(): Promise<Blob> {
    const kept = this.keptRect();
    const size = this.outputSize();
    const out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const context = out.getContext('2d');
    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        this.canvasRef().nativeElement,
        kept.x,
        kept.y,
        kept.width,
        kept.height,
        0,
        0,
        size.width,
        size.height
      );
    }
    const [png, webp] = await Promise.all([
      canvasToBlob(out, 'image/png', 1),
      canvasToBlob(out, 'image/webp', WEBP_QUALITY),
    ]);
    if (!png) throw new Error('encode');
    return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : png;
  }
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
