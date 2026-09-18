import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  untracked,
} from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TerrainBatchService } from '@axe/application/tabletop/terrain-batch.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { OverlapHitSource, TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { capCellAt } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { hexWallsOf } from '@axe/features/tabletop/terrain/terrain-hex-shapes';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { hiddenHexWallsOf } from '@axe/features/tabletop/terrain-batch/terrain-batch-look';
import { TerrainCapDirective } from '@axe/features/tabletop/terrain-batch/terrain-cap.directive';
import { TerrainHexSheetComponent } from '@axe/features/tabletop/terrain-batch/terrain-hex-sheet.component';
import { TerrainWallComponent } from '@axe/features/tabletop/terrain-batch/terrain-wall.component';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { MovableLayerItem } from '@axe/ui/directives/movable-helpers';
import { shadedBackgroundImage, shadeRgbOf } from '@axe/ui/tabletop/shaded-background';

/** One wall of a hex block drawn together with others, placed on the table. */
interface HexWallFace {
  readonly key: string;
  readonly identifier: string;
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  /** How much of the light the wall keeps for the way it is turned. */
  readonly shade: number;
  readonly url: string;
  /** The size of a tile of its picture, or null where the picture is stretched over the wall. */
  readonly tile: string | null;
}

/**
 * The blocks on the table that do not move, drawn together.
 *
 * It stands in the floor with the blocks drawn alone, and does what each of those does for the
 * blocks it draws: a right-click opens the block's menu, a press selects it, and it answers for the
 * blocks under a point and joins the terrain layer a dragged piece lets the pointer through.
 */
@Component({
  selector: 'terrain-batch-layer',
  templateUrl: './terrain-batch-layer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TerrainCapDirective, TerrainWallComponent, TerrainHexSheetComponent],
  host: {
    class: 'pointer-events-none absolute top-0 left-0 transform-3d',
    '[attr.data-merged]': 'layout().merged.size',
    '(contextmenu)': 'onContextMenu($event)',
    '(pointerdown)': 'onPointerDown($event)',
  },
})
export class TerrainBatchLayerComponent {
  private readonly batch = inject(TerrainBatchService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);
  private readonly selection = inject(SelectionSignalService);
  private readonly overlap = inject(TabletopOverlapService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly terrainMenu = inject(TerrainMenuService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly layout = this.batch.layout;

  private readonly capsByKey = computed(() => new Map(this.layout().squareCaps.map((cap) => [cap.key, cap])));

  protected readonly hexWallFaces = computed<readonly HexWallFace[]>(() => {
    const gridSize = this.tabletopService.gridSize();
    const isFlatTop = isFlatTopGrid(this.tabletopService.currentTableVersion().gridType);
    this.objectChange.fileVersion();
    const faces: HexWallFace[] = [];
    for (const walls of this.layout().hexWalls) {
      const terrain = this.batch.terrainOf(walls.identifier);
      if (!terrain) continue;
      this.objectChange.versionOf(terrain.identifier)();
      const params = calcHexFlowerParams(terrain.width, gridSize, isFlatTop);
      const hidden = hiddenHexWallsOf(params, walls.hidden);
      const laid = hexWallsOf(params, terrain.width * gridSize, terrain.depth * gridSize, terrain.isSurfaceShading);
      const url = this.imageService.getSkeletonOr(terrain.wallImage).url;
      const tile = terrain.isTiledTexture ? `${gridSize}px ${gridSize}px` : null;
      laid.forEach((wall, index) => {
        if (hidden[index]) return;
        faces.push({
          key: `${terrain.identifier}:${index}`,
          identifier: terrain.identifier,
          width: wall.edgeLength,
          height: terrain.height * gridSize,
          transform: `translate3d(${terrain.location.x + wall.px}px, ${terrain.location.y + wall.py}px, 0) rotateZ(${wall.angle}rad) rotateX(-90deg) translateY(-100%)`,
          shade: wall.brightness,
          url,
          tile,
        });
      });
    }
    return faces;
  });

  private readonly hexWallLight = computed(() => {
    const light = new Map<string, number>();
    for (const walls of this.layout().hexWalls) {
      light.set(walls.identifier, this.batch.hexWallBrightness(walls.identifier));
    }
    return light;
  });

  private readonly shadeRgb = computed(() => shadeRgbOf(this.visionService.ambientShade()?.color));

  private readonly registered = new Set<string>();

  private readonly layerItem: MovableLayerItem = {
    layerName: 'terrain',
    input: null,
    setPointerEvents: (isEnable) => this.host.style.setProperty('--terrain-batch-pointer', isEnable ? 'auto' : 'none'),
  };

  private readonly hitSource: OverlapHitSource = (hits, x, y) => {
    const found: Terrain[] = [];
    for (const hit of hits) {
      const terrain = this.terrainUnder(hit, x, y);
      if (terrain && !found.includes(terrain)) found.push(terrain);
    }
    return found;
  };

  constructor() {
    effect(() => {
      const merged = this.batch.mergedTerrains();
      untracked(() => this.recordMerged(merged));
    });
    this.overlap.addHitSource(this.hitSource);
    MovableDirective.joinLayer('terrain', this.layerItem);
    inject(DestroyRef).onDestroy(() => {
      this.overlap.removeHitSource(this.hitSource);
      MovableDirective.leaveLayer('terrain', this.layerItem);
      this.recordMerged(new Set());
    });
  }

  protected hexWallBackground(wall: HexWallFace): string {
    const light = this.hexWallLight().get(wall.identifier) ?? 1;
    return shadedBackgroundImage(wall.url, wall.shade * light, this.shadeRgb());
  }

  /** Opens the menu of the block right-clicked; a click anywhere else goes on to the table. */
  protected onContextMenu(event: MouseEvent): void {
    const terrain = event.target instanceof Element ? this.terrainUnder(event.target, event.pageX, event.pageY) : null;
    if (!terrain) return;
    event.stopPropagation();
    event.preventDefault();
    this.terrainMenu.open(terrain);
  }

  /** Selects the block pressed, as pressing a block drawn alone does. */
  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const terrain = this.terrainUnder(event.target, event.pageX, event.pageY);
    if (!terrain) return;
    if (this.selection.press(terrain.identifier, terrain.aliasName, event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  /** The block drawn where the element is hit at a point on the page, or null for anything else. */
  private terrainUnder(target: Element, x: number, y: number): Terrain | null {
    if (!this.host.contains(target)) return null;
    const marked = target.closest('[data-terrain]');
    if (marked) return this.batch.terrainOf(marked.getAttribute('data-terrain') ?? '');
    const gridSize = this.tabletopService.gridSize();
    const capElement = target.closest<HTMLElement>('[data-terrain-cap]');
    const cap = capElement && this.capsByKey().get(capElement.getAttribute('data-terrain-cap') ?? '');
    if (capElement && cap) {
      const local = this.coordinateService.convertToLocal({ x, y, z: 0 }, capElement);
      const cell = capCellAt(cap, local.x, local.y, gridSize);
      return cell ? this.batch.terrainOf(cell.identifier) : null;
    }
    return null;
  }

  /**
   * Keeps the overlap registry holding the blocks drawn here, so what finds the pieces under a
   * point, or rests a piece on what is under it, still finds them.
   */
  private recordMerged(merged: ReadonlySet<string>): void {
    for (const identifier of [...this.registered]) {
      if (merged.has(identifier)) continue;
      this.registered.delete(identifier);
      this.overlap.unregister(identifier, null);
    }
    for (const identifier of merged) {
      if (this.registered.has(identifier) && this.overlap.get(identifier)?.element === null) continue;
      const terrain = this.batch.terrainOf(identifier);
      if (!terrain) continue;
      this.overlap.registerWithoutElement(terrain, () => this.terrainMenu.open(terrain));
      this.registered.add(identifier);
    }
  }
}
