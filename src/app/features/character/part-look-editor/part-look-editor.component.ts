import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DEFAULT_PART_LAYER,
  emptyPartMask,
  paintPartMask,
  type PartLayer,
  partLayerOf,
  type PartMask,
  partMaskOf,
  writePartLayer,
  writePartMask,
} from '@axe/domain/character/part-look';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** How a part is worked on: its own picture laid over the body's, or its piece of the body's picture painted. */
export type PartLookMode = 'layer' | 'paint';

/** How wide a brush may be, as a share of the body's picture. */
export const BRUSH_WIDTH_RANGE = { min: 0.02, max: 0.5 } as const;

/** A part as the editor shows it. */
interface EditedPart {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly layer: PartLayer | null;
  readonly mask: PartMask | null;
}

/**
 * Where the parts of a piece are drawn on its picture: each part's own picture laid over the body's,
 * moved by dragging it, sized and set before or behind; or the piece of the body's picture it stands
 * for, painted on it with a brush. A lost part's picture is not laid, and its piece is cut out of the
 * body's. Each change is kept as it is let go of.
 */
@Component({
  selector: 'part-look-editor',
  templateUrl: './part-look-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  imports: [TranslocoModule, SafePipe],
})
export class PartLookEditorComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly links = inject(PieceLinksService);
  private readonly images = inject(ImageService);
  private readonly rolePermission = inject(RolePermissionService);

  /** The body whose parts are worked on, and the part chosen of them. */
  readonly bodyIdentifier = signal('');
  readonly partIdentifier = signal('');
  readonly mode = signal<PartLookMode>('layer');
  readonly brushWidth = signal(0.1);
  readonly erasing = signal(false);

  protected readonly brushRange = BRUSH_WIDTH_RANGE;
  protected readonly canEdit = computed(() => this.rolePermission.canEditTabletop());

  /** A layer or a painting being worked on and not yet let go of, which shows in place of the part's own. */
  private readonly draftLayer = signal<PartLayer | null>(null);
  private readonly draftMask = signal<PartMask | null>(null);

  protected readonly body = computed(() => {
    const id = this.bodyIdentifier();
    this.objectChange.versionOf(id)();
    const body = this.objectStore.get<GameCharacter>(id);
    return body instanceof GameCharacter ? body : null;
  });

  protected readonly bodyUrl = computed(() => {
    const body = this.body();
    this.objectChange.fileVersion();
    return body ? this.images.getEmptyOr(body.imageFile).url : '';
  });

  protected readonly parts = computed<EditedPart[]>(() => {
    const body = this.body();
    if (!body) return [];
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.fileVersion();
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      this.objectChange.versionOf(piece.identifier)();
    }
    return this.links.partsOf(body).map((part) => ({
      id: part.identifier,
      name: part.name,
      url: this.images.getEmptyOr(part.imageFile).url,
      layer: partLayerOf(part.partLayer),
      mask: partMaskOf(part.partMask),
    }));
  });

  /** The part chosen, the first where none is or the one chosen is gone. */
  protected readonly chosen = computed(() => {
    const parts = this.parts();
    return parts.find((part) => part.id === this.partIdentifier()) ?? parts[0] ?? null;
  });

  /** The layer of the chosen part as it shows now: the one being dragged, or its own. */
  protected readonly chosenLayer = computed(() => this.draftLayer() ?? this.chosen()?.layer ?? null);

  /** Every part's layer as it shows now, the lowest first, the chosen one as it is being dragged. */
  protected readonly layers = computed(() =>
    this.parts()
      .map((part) => ({ part, layer: part.id === this.chosen()?.id ? this.chosenLayer() : part.layer }))
      .filter((one): one is { part: EditedPart; layer: PartLayer } => one.layer !== null)
      .sort((a, b) => a.layer.order - b.layer.order)
  );

  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly paintCanvas = viewChild<ElementRef<HTMLCanvasElement>>('paint');
  private dragging: { from: { x: number; y: number }; layer: PartLayer } | null = null;
  private painting = false;

  constructor() {
    afterRenderEffect(() => this.drawMasks());
  }

  protected choose(id: string): void {
    this.partIdentifier.set(id);
    this.draftLayer.set(null);
    this.draftMask.set(null);
  }

  protected setMode(mode: PartLookMode): void {
    this.mode.set(mode);
  }

  /** Lays the chosen part's own picture over the body's, where it was not. */
  protected layChosen(): void {
    this.writeLayer(this.chosen()?.layer ?? DEFAULT_PART_LAYER);
  }

  protected clearLayer(): void {
    const part = this.chosenPiece();
    if (part) part.partLayer = '';
  }

  protected resize(event: Event): void {
    const layer = this.chosenLayer();
    const width = Number((event.target as HTMLInputElement).value);
    if (layer && Number.isFinite(width)) this.writeLayer({ ...layer, width });
  }

  /** Brings the chosen part's picture one step forward or back among the pictures, the body's at 0. */
  protected reorder(step: 1 | -1): void {
    const layer = this.chosenLayer();
    if (!layer) return;
    let order = layer.order + step;
    if (order === 0) order += step;
    this.writeLayer({ ...layer, order });
  }

  protected setBrush(event: Event): void {
    const width = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(width)) this.brushWidth.set(width);
  }

  protected clearMask(): void {
    const part = this.chosenPiece();
    if (part) part.partMask = '';
  }

  protected pressLayer(event: PointerEvent): void {
    const layer = this.chosenLayer();
    if (!this.canEdit() || !layer || this.mode() !== 'layer') return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging = { from: this.pointOf(event), layer };
  }

  protected moveLayer(event: PointerEvent): void {
    if (!this.dragging) return;
    const now = this.pointOf(event);
    const { from, layer } = this.dragging;
    this.draftLayer.set({ ...layer, x: layer.x + now.x - from.x, y: layer.y + now.y - from.y });
  }

  protected letGoOfLayer(): void {
    if (!this.dragging) return;
    this.dragging = null;
    const draft = this.draftLayer();
    this.draftLayer.set(null);
    if (draft) this.writeLayer(draft);
  }

  protected pressPaint(event: PointerEvent): void {
    if (!this.canEdit() || this.mode() !== 'paint' || !this.chosen()) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.painting = true;
    this.draftMask.set(this.chosen()!.mask ?? emptyPartMask());
    this.paintAt(event);
  }

  protected movePaint(event: PointerEvent): void {
    if (this.painting) this.paintAt(event);
  }

  protected letGoOfPaint(): void {
    if (!this.painting) return;
    this.painting = false;
    const draft = this.draftMask();
    this.draftMask.set(null);
    const part = this.chosenPiece();
    if (draft && part) part.partMask = writePartMask(draft);
  }

  private paintAt(event: PointerEvent): void {
    const mask = this.draftMask();
    if (!mask) return;
    const at = this.pointOf(event);
    this.draftMask.set(paintPartMask(mask, at.x, at.y, this.brushWidth(), !this.erasing()));
  }

  /** Where a pointer is over the body's picture, as shares of it. */
  private pointOf(event: PointerEvent): { x: number; y: number } {
    const box = this.stage()?.nativeElement.getBoundingClientRect();
    if (!box || !(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }

  private chosenPiece(): GameCharacter | null {
    const id = this.chosen()?.id;
    const part = id ? this.objectStore.get<GameCharacter>(id) : null;
    return part instanceof GameCharacter && this.canEdit() ? part : null;
  }

  private writeLayer(layer: PartLayer): void {
    const part = this.chosenPiece();
    if (!part) return;
    GameObject.batch(() => (part.partLayer = writePartLayer(layer)));
  }

  /** Draws the painted pieces of the body's picture: the chosen part's strongly, the others faintly. */
  private drawMasks(): void {
    const canvas = this.paintCanvas()?.nativeElement;
    if (!canvas) return;
    const chosen = this.chosen();
    const masks = this.parts().map((part) => ({
      mask: part.id === chosen?.id ? (this.draftMask() ?? part.mask) : part.mask,
      chosen: part.id === chosen?.id,
    }));
    const context = canvas.getContext('2d');
    if (!context) return;
    const size = masks.find((one) => one.mask)?.mask?.size ?? 96;
    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);
    for (const { mask, chosen: strong } of masks) {
      if (!mask) continue;
      context.fillStyle = strong ? 'rgba(255, 80, 80, 0.55)' : 'rgba(80, 160, 255, 0.3)';
      for (let at = 0; at < mask.cells.length; at++) {
        if (mask.cells[at]) context.fillRect(at % mask.size, Math.floor(at / mask.size), 1, 1);
      }
    }
  }
}
