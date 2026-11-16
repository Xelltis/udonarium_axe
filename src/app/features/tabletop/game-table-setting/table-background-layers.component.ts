import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import {
  MAX_BACKGROUND_LAYER_SCALE,
  MAX_BACKGROUND_SCROLL_SPEED,
  MIN_BACKGROUND_LAYER_SCALE,
} from '@axe/domain/tabletop/background-scroll';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  asTableLayerPlacement,
  MAX_TABLE_BACKGROUND_LAYERS,
  moveBackgroundLayer as movedLayerRun,
  TABLE_LAYER_PLACEMENTS,
  TableBackgroundLayer,
  TableLayerPlacement,
} from '@axe/domain/tabletop/table-background-layer';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** One layer as the list draws it. */
interface BackgroundLayerRow {
  layer: TableBackgroundLayer;
  placement: TableLayerPlacement;
  number: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/**
 * The pictures a table lays behind itself, under its board and over it, for whoever edits the
 * table to add, order and tune. It stands as the section of the table's settings that lists them.
 */
@Component({
  selector: 'table-background-layers',
  templateUrl: './table-background-layers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class TableBackgroundLayersComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageService = inject(ImageService);
  private readonly modalService = inject(ModalService);

  /** The table whose layers are listed. */
  readonly table = input.required<GameTable>();
  /** Whether the settings the list stands in let the table be changed. */
  readonly editable = input.required<boolean>();

  /**
   * Whether a layer may be written now: the settings allow it and the table is still in the room,
   * asked at the moment of writing rather than when the list was last drawn.
   */
  private get isEditable(): boolean {
    return this.editable() && this.objectStore.get(this.table().identifier) !== null;
  }

  readonly maxBackgroundScrollSpeed = MAX_BACKGROUND_SCROLL_SPEED;
  readonly minBackgroundLayerScale = MIN_BACKGROUND_LAYER_SCALE;
  readonly maxBackgroundLayerScale = MAX_BACKGROUND_LAYER_SCALE;
  readonly tableLayerPlacements = TABLE_LAYER_PLACEMENTS;

  /**
   * The layers grouped the way they are drawn: everything behind the table, then everything under
   * the board, then everything over it. Read off the table as it stands now, so a write that
   * follows another sees what the first one did.
   */
  get backgroundLayers(): TableBackgroundLayer[] {
    const laid = this.table().backgroundLayers;
    const placed = (placement: TableLayerPlacement) =>
      laid.filter((layer) => asTableLayerPlacement(layer.placement) === placement);
    return [...placed('backdrop'), ...placed('under'), ...placed('over')];
  }

  /**
   * The layers as the list draws them, each with the run it belongs to, its place in that run
   * counted from one, and whether it can move a step either way. Worked out once for the whole
   * list whenever the table or one of its layers changes.
   */
  protected readonly rows = computed<BackgroundLayerRow[]>(() => {
    this.objectChange.versionOf(this.table().identifier)();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    const editable = this.editable();
    const layers = this.backgroundLayers;
    const lengths = new Map<TableLayerPlacement, number>();
    for (const layer of layers) {
      this.objectChange.versionOf(layer.identifier)();
      const placement = asTableLayerPlacement(layer.placement);
      lengths.set(placement, (lengths.get(placement) ?? 0) + 1);
    }
    const counted = new Map<TableLayerPlacement, number>();
    return layers.map((layer) => {
      const placement = asTableLayerPlacement(layer.placement);
      const number = (counted.get(placement) ?? 0) + 1;
      counted.set(placement, number);
      return {
        layer,
        placement,
        number,
        canMoveUp: editable && number > 1,
        canMoveDown: editable && number < (lengths.get(placement) ?? 0),
      };
    });
  });

  /** Whether the list offers another layer, under the per-table limit. */
  protected readonly canAdd = computed(() => this.editable() && this.rows().length < MAX_TABLE_BACKGROUND_LAYERS);

  /** The run one layer belongs to, which is what moving it up and down happens within. */
  private backgroundLayerRun(layer: TableBackgroundLayer): TableBackgroundLayer[] {
    const placement = asTableLayerPlacement(layer.placement);
    return this.backgroundLayers.filter((laid) => asTableLayerPlacement(laid.placement) === placement);
  }

  /** Its place in that run, counted from one, which is what the heading says. */
  backgroundLayerNumber(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return this.backgroundLayerRun(layer).indexOf(layer) + 1;
  }

  /**
   * Whether a background layer can move the given number of steps without leaving its run; false
   * while the table cannot be edited.
   */
  canMoveBackgroundLayer(layer: TableBackgroundLayer, offset: number): boolean {
    if (!this.isEditable) return false;
    const run = this.backgroundLayerRun(layer);
    const to = run.indexOf(layer) + offset;
    return 0 <= to && to < run.length;
  }

  /**
   * Moves one layer a step through its run.
   *
   * The whole run is numbered again afterwards, so an order never drifts into a gap and the two
   * runs stay tidy however often they are shuffled.
   */
  moveBackgroundLayer(layer: TableBackgroundLayer, offset: number): void {
    if (!this.isEditable) return;
    const run = this.backgroundLayerRun(layer);
    const moved = movedLayerRun(run, run.indexOf(layer), offset);
    moved.forEach((laid, order) => {
      if (laid.order === order) return;
      laid.order = order;
      laid.update();
    });
  }

  /** Whether another background layer can be added, under the per-table limit. */
  get canAddBackgroundLayer(): boolean {
    return this.isEditable && this.backgroundLayers.length < MAX_TABLE_BACKGROUND_LAYERS;
  }

  /** A new layer goes in front of the ones already laid, which is where the eye expects it. */
  addBackgroundLayer(): void {
    if (!this.canAddBackgroundLayer) return;
    const layer = new TableBackgroundLayer();
    layer.initialize();
    layer.order = this.backgroundLayers.reduce((highest, laid) => Math.max(highest, laid.order + 1), 0);
    this.table().appendChild(layer);
  }

  /** Destroys a background layer; ignored while the table cannot be edited. */
  removeBackgroundLayer(layer: TableBackgroundLayer): void {
    if (!this.isEditable) return;
    layer.destroy();
  }

  /** Opens the image picker and sets the chosen picture on a background layer. */
  openBackgroundLayerImage(layer: TableBackgroundLayer): void {
    if (!this.isEditable) return;
    void this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!value) return;
      layer.imageIdentifier = value;
      layer.update();
    });
  }

  /** A background layer's picture, or the empty image. */
  backgroundLayerImage(layer: TableBackgroundLayer): ImageFile {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(layer.identifier)();
    return this.imageService.getEmptyOr(layer.imageIdentifier);
  }

  /** Whether a background layer is drawn. */
  backgroundLayerEnabled(layer: TableBackgroundLayer): boolean {
    this.objectChange.versionOf(layer.identifier)();
    return layer.enabled;
  }
  /** Turns a background layer on or off and syncs it. */
  setBackgroundLayerEnabled(layer: TableBackgroundLayer, value: boolean): void {
    this.writeBackgroundLayer(layer, () => (layer.enabled = value));
  }

  /** How fast a background layer scrolls sideways. */
  backgroundLayerSpeedX(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.speedX;
  }
  /** Sets how fast a background layer scrolls sideways, held to the speed limit either way, and syncs it. */
  setBackgroundLayerSpeedX(layer: TableBackgroundLayer, value: number): void {
    this.writeBackgroundLayer(layer, () => (layer.speedX = clampScrollSpeed(value)));
  }

  /** How fast a background layer scrolls up and down. */
  backgroundLayerSpeedY(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.speedY;
  }
  /**
   * Sets how fast a background layer scrolls up and down, held to the speed limit either way, and
   * syncs it.
   */
  setBackgroundLayerSpeedY(layer: TableBackgroundLayer, value: number): void {
    this.writeBackgroundLayer(layer, () => (layer.speedY = clampScrollSpeed(value)));
  }

  /** A background layer's opacity, as a percentage. */
  backgroundLayerOpacityPercent(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return Math.round(layer.opacity * 100);
  }
  /**
   * Sets a background layer's opacity from a percentage held between 0 and 100, fully opaque when
   * unreadable, and syncs it.
   */
  setBackgroundLayerOpacityPercent(layer: TableBackgroundLayer, value: number): void {
    const percent = Number(value);
    const clamped = Number.isFinite(percent) ? clamp(percent, 0, 100) : 100;
    this.writeBackgroundLayer(layer, () => (layer.opacity = clamped / 100));
  }

  /** How much a background layer's picture is scaled. */
  backgroundLayerScale(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.scale;
  }
  /** Sets a background layer's scale within the allowed range, 1 when unreadable, and syncs it. */
  setBackgroundLayerScale(layer: TableBackgroundLayer, value: number): void {
    const scale = Number(value);
    const clamped = Number.isFinite(scale) ? clamp(scale, MIN_BACKGROUND_LAYER_SCALE, MAX_BACKGROUND_LAYER_SCALE) : 1;
    this.writeBackgroundLayer(layer, () => (layer.scale = clamped));
  }

  /** How much a backdrop follows the camera, as a percentage. */
  backgroundLayerFollowPercent(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return Math.round(layer.follow * 100);
  }
  /** Sets how much a backdrop follows the camera from a percentage held between 0 and 100, and syncs it. */
  setBackgroundLayerFollowPercent(layer: TableBackgroundLayer, value: number): void {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    this.writeBackgroundLayer(layer, () => (layer.cameraFollow = clamp(percent, 0, 100) / 100));
  }

  /** How high a backdrop stands on the screen, as a percentage from its foot. */
  backgroundLayerHeightPercent(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return Math.round(layer.height * 100);
  }
  /** Sets how high a backdrop stands from a percentage held between 0 and 100, and syncs it. */
  setBackgroundLayerHeightPercent(layer: TableBackgroundLayer, value: number): void {
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    this.writeBackgroundLayer(layer, () => (layer.backdropHeight = clamp(percent, 0, 100) / 100));
  }

  /**
   * Stands a layer behind the table, under its board or over it, and syncs it. Changing sides puts it
   * at the front of the run it lands in, where the eye expects it.
   */
  setBackgroundLayerPlacement(layer: TableBackgroundLayer, value: TableLayerPlacement): void {
    if (asTableLayerPlacement(layer.placement) === value) return;
    this.writeBackgroundLayer(layer, () => {
      layer.placement = value;
      layer.order = this.backgroundLayers.reduce((highest, laid) => Math.max(highest, laid.order + 1), 0);
    });
  }

  /** Writing is announced, so the board redraws without waiting for something else to happen. */
  private writeBackgroundLayer(layer: TableBackgroundLayer, write: () => void): void {
    if (!this.isEditable) return;
    write();
    layer.update();
  }
}

/** Held to a pace the eye can follow, whatever the box was typed into. */
function clampScrollSpeed(value: number): number {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return 0;
  return clamp(speed, -MAX_BACKGROUND_SCROLL_SPEED, MAX_BACKGROUND_SCROLL_SPEED);
}
