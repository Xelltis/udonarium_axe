import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DEFAULT_PART_LAYER,
  emptyPartMask,
  paintPartMask,
  type PartFaces,
  partFacesOf,
  type PartLayer,
  partLayerOf,
  type PartMask,
  partMaskOf,
  writePartFaces,
  writePartLayer,
  writePartMask,
} from '@axe/domain/character/part-look';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import type { ModelStage } from '@axe/infrastructure/model-viewer/model-viewer-port';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * How a part is worked on: its own picture laid over the body's, its piece of the body's picture
 * painted, or the faces of the body's model it stands for painted.
 */
export type PartLookMode = 'layer' | 'paint' | 'faces';

/** How wide a brush may be, as a share of the body's picture. */
export const BRUSH_WIDTH_RANGE = { min: 0.02, max: 0.5 } as const;

/** A part as the editor shows it. */
interface EditedPart {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly layer: PartLayer | null;
  readonly mask: PartMask | null;
  readonly faces: PartFaces;
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
  private readonly tablePieces = inject(TablePiecesService);
  private readonly loadViewer = inject(MODEL_VIEWER_LOADER);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);

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

  /** The URL of the body's model, where it is drawn as one and the model is read; empty otherwise. */
  protected readonly modelUrl = computed(() => {
    const body = this.body();
    this.objectChange.fileVersion();
    const model = body ? pieceModelOf(body) : null;
    return model ? this.tablePieces.modelUrlOf(model.identifier) : '';
  });

  /** The ways the parts may be worked on: the body's model's faces as well, where it is drawn as one. */
  protected readonly modes = computed<PartLookMode[]>(() =>
    this.modelUrl() ? ['layer', 'paint', 'faces'] : ['layer', 'paint']
  );

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
      faces: partFacesOf(part.partFaces),
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
  private readonly modelCanvas = viewChild<ElementRef<HTMLCanvasElement>>('model');
  private dragging: { from: { x: number; y: number }; layer: PartLayer } | null = null;
  private painting = false;
  /** The stage the body's model is shown on to paint its faces, and the faces being painted. */
  private readonly modelStage = signal<ModelStage | null>(null);
  /** What the stage is being made for, and the stage once made, while the model is still loading on it. */
  private stageFor: { canvas: HTMLCanvasElement; url: string; made: ModelStage | null } | null = null;
  private readonly draftFaces = signal<Map<number, Set<number>> | null>(null);
  private turningFrom: { x: number; y: number } | null = null;
  /** The fingers on the model, where each is now: two of them turn it, as a right-drag does. */
  private readonly fingers = new Map<number, { x: number; y: number }>();

  constructor() {
    afterRenderEffect(() => this.drawMasks());
    afterRenderEffect(() => this.followModel());
    afterRenderEffect(() => this.showModelFaces());
    inject(DestroyRef).onDestroy(() => this.letGoOfStage());
  }

  /** Starts the stage the body's model is painted on as its canvas comes, and lets it go as it goes. */
  private followModel(): void {
    const canvas = this.modelCanvas()?.nativeElement ?? null;
    const url = this.modelUrl();
    if (this.stageFor && this.stageFor.canvas === canvas && this.stageFor.url === url) return;
    this.letGoOfStage();
    if (!canvas || !url) return;
    const making = { canvas, url, made: null as ModelStage | null };
    this.stageFor = making;
    void this.loadViewer().then((viewer) => {
      if (this.stageFor !== making) return;
      const made = viewer?.createModelStage(canvas) ?? null;
      if (!made) return;
      making.made = made;
      made.setTurning(false);
      void made.show(url).then(() => {
        if (this.stageFor === making) this.modelStage.set(made);
      });
    });
  }

  /** Lets go of the stage the body's model is painted on, made or still being made. */
  private letGoOfStage(): void {
    this.stageFor?.made?.dispose();
    this.stageFor = null;
    this.modelStage.set(null);
  }

  /** Shows the faces painted on the body's model: the chosen part's strongly, the others' faintly. */
  private showModelFaces(): void {
    const stage = this.modelStage();
    if (!stage) return;
    const chosen = this.chosen();
    stage.showFaces(
      this.draftFaces() ?? chosen?.faces ?? new Map(),
      this.parts()
        .filter((part) => part.id !== chosen?.id)
        .map((part) => part.faces)
    );
  }

  /**
   * Paints the faces a press lands on, or turns the model with a right-drag, or with two fingers: a
   * second finger takes back what the first had begun to paint, as the two are there to turn it.
   */
  protected pressModel(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    if (event.pointerType === 'touch') {
      this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.fingers.size >= 2) {
        this.painting = false;
        this.draftFaces.set(null);
        this.turningFrom = this.middleOfFingers();
        return;
      }
    }
    if (event.button !== 0) {
      event.preventDefault();
      this.turningFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!this.canEdit() || !this.chosen()) return;
    this.painting = true;
    this.draftFaces.set(new Map([...this.chosen()!.faces].map(([mesh, triangles]) => [mesh, new Set(triangles)])));
    this.paintModelAt(event);
  }

  protected moveModel(event: PointerEvent): void {
    if (this.fingers.has(event.pointerId)) this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.turningFrom) {
      const now = this.fingers.size >= 2 ? this.middleOfFingers() : { x: event.clientX, y: event.clientY };
      this.modelStage()?.turnBy(now.x - this.turningFrom.x, now.y - this.turningFrom.y);
      this.turningFrom = now;
      return;
    }
    if (this.painting) this.paintModelAt(event);
  }

  /** The middle of the fingers on the model. */
  private middleOfFingers(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const finger of this.fingers.values()) {
      x += finger.x;
      y += finger.y;
    }
    return { x: x / this.fingers.size, y: y / this.fingers.size };
  }

  protected letGoOfModel(event?: PointerEvent): void {
    if (event) this.fingers.delete(event.pointerId);
    // Fingers that turned the model paint nothing as they are lifted one by one, and the one left turns
    // it on from where it stands rather than from the middle the two were turning it by.
    if (this.fingers.size > 0) {
      if (this.turningFrom) this.turningFrom = this.middleOfFingers();
      return;
    }
    this.turningFrom = null;
    if (!this.painting) return;
    this.painting = false;
    const draft = this.draftFaces();
    this.draftFaces.set(null);
    const part = this.chosenPiece();
    if (draft && part) part.partFaces = writePartFaces(draft);
  }

  protected clearFaces(): void {
    const part = this.chosenPiece();
    if (!part || part.partFaces === '') return;
    const was = part.partFaces;
    part.partFaces = '';
    this.offerToPutBack(part, 'feature.ride.part.look.paintCleared', () => (part.partFaces = was));
  }

  /** Says what was just taken off a part, with a press that puts it back, as long as the part is there. */
  private offerToPutBack(part: GameCharacter, said: string, putBack: () => void): void {
    this.snackbar.show(this.t(said, { name: part.name }), {
      action: {
        label: this.t('feature.ride.part.look.putBack'),
        run: () => {
          if (this.objectStore.get(part.identifier) === part) putBack();
        },
      },
    });
  }

  private paintModelAt(event: PointerEvent): void {
    const stage = this.modelStage();
    const draft = this.draftFaces();
    const canvas = this.modelCanvas()?.nativeElement;
    if (!stage || !draft || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const near = stage.facesNear(event.clientX - box.left, event.clientY - box.top, this.brushWidth());
    if (near.size < 1) return;
    const next = new Map([...draft].map(([mesh, triangles]) => [mesh, new Set(triangles)]));
    for (const [mesh, triangles] of near) {
      const set = next.get(mesh) ?? new Set<number>();
      for (const triangle of triangles) {
        if (this.erasing()) set.delete(triangle);
        else set.add(triangle);
      }
      if (set.size > 0) next.set(mesh, set);
      else next.delete(mesh);
    }
    this.draftFaces.set(next);
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
    if (!part || part.partLayer === '') return;
    const was = part.partLayer;
    part.partLayer = '';
    this.offerToPutBack(part, 'feature.ride.part.look.unlaid', () => (part.partLayer = was));
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
    if (!part || part.partMask === '') return;
    const was = part.partMask;
    part.partMask = '';
    this.offerToPutBack(part, 'feature.ride.part.look.paintCleared', () => (part.partMask = was));
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
