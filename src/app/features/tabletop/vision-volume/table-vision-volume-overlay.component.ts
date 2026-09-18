import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { PERF_VISION_VOLUME_PAINT, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { effectiveSightRadiusPx } from '@axe/domain/tabletop/fog/sight-radius';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { EYE_HEIGHT_CELLS, eyeHeightPx } from '@axe/domain/tabletop/vision-scene';
import { visionLobesOf } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { fillCells, overlayScale } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { visionVolumeShape, VolumeRib, VolumeRing } from '@axe/features/tabletop/vision-volume/vision-volume-geometry';
import { translateZCss, Z_OFFSET_VISION_VOLUME_PX } from '@axe/ui/tabletop/z-offset';

/** Bright on purpose: the shape is a measuring aid, not scenery. */
const DEFAULT_VOLUME_COLOR = '#39ff14';
/** Under this a colour is too dark to read against the board, so the bright one is used. */
const MIN_VOLUME_LUMINANCE = 0.35;
const FLOOR_ALPHA = 0.18;
const RING_OPACITY = '0.75';
const RIB_OPACITY = '0.55';

interface VisionVolume {
  identifier: string;
  color: string;
  rings: VolumeRing[];
  ribs: VolumeRib[];
  cells: CellBits | null;
}

/**
 * How far a piece can see, drawn where it stands.
 *
 * Two things are shown, because they are two different answers. The wire shape is what the
 * piece reaches on its own, walls and other people's lamps left out of it. The tint on the
 * floor is the ground it actually sees. Where the tint falls short of the wire something is
 * in the way; where it runs past, somebody else is carrying a light.
 */
@Component({
  selector: 'table-vision-volume-overlay',
  templateUrl: './table-vision-volume-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle],
})
export class TableVisionVolumeOverlayComponent {
  private readonly visionService = inject(VisionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('floorCanvas');

  protected readonly zTransform = translateZCss(Z_OFFSET_VISION_VOLUME_PX);

  /** Whether the table is dark, which is what tells a piece's own light from what it can see by. */
  private readonly darknessEnabled = computed(() => this.tabletopService.currentTableVersion().darknessEnabled);

  /** How much floor there is to tint, compared by its measurements rather than by the table it came from. */
  private readonly floorSize = computed(
    () => {
      const table = this.tabletopService.currentTableVersion();
      return { width: table.width, height: table.height };
    },
    { equal: (a, b) => a.width === b.width && a.height === b.height }
  );

  readonly volumes = computed<VisionVolume[]>(() => {
    this.objectChange.collectionOf('character')();
    const gridSize = this.tabletopService.gridSize();
    const darknessEnabled = this.darknessEnabled();
    const volumes: VisionVolume[] = [];
    for (const character of this.tabletopService.characters) {
      this.objectChange.versionOf(character.identifier)();
      if (!character.showVisionRange || !character.isVisibleOnTable) continue;
      if (surfaceOf(character) !== 'floor') continue;
      if (!this.visionService.isTokenVisible(character)) continue;
      const spec = character.visionSpec;
      const radiusPx = effectiveSightRadiusPx({
        darknessEnabled,
        visionType: character.visionType as VisionType,
        visionRangePx: character.visionRange * gridSize,
        ownLightDimPx: character.lightEnabled
          ? Math.max(character.lightBrightRadius, character.lightDimRadius) * gridSize
          : 0,
      });
      if (radiusPx < 1) continue;
      const centre = (gridSize * (character.size || 1)) / 2;
      const shape = visionVolumeShape({
        x: character.location.x + centre,
        y: character.location.y + centre,
        z: eyeHeightPx(character.altitude, character.posZ, gridSize) - EYE_HEIGHT_CELLS * gridSize,
        radiusPx,
        direction: spec.direction,
        lobes: visionLobesOf(spec),
      });
      volumes.push({
        identifier: character.identifier,
        color: this.colorOf(character),
        rings: shape.rings,
        ribs: shape.ribs,
        cells: this.visionService.visibleCellsOf(character.identifier)?.cells ?? null,
      });
    }
    return volumes;
  });

  constructor() {
    effect(() => {
      const canvas = this.canvasRef().nativeElement;
      const volumes = this.volumes();
      const cells = this.visionService.sharedVisibleCells();
      const context = canvas.getContext('2d');
      if (!context) return;
      const grid = cells?.grid;
      if (!grid || volumes.every((volume) => !volume.cells)) {
        if (canvas.width !== 0) canvas.width = 0;
        if (canvas.height !== 0) canvas.height = 0;
        // Left at the board's size, an empty canvas is still a box as large as the board.
        canvas.style.width = '';
        canvas.style.height = '';
        this.painted = null;
        return;
      }
      const floor = this.floorSize();
      const key = [
        grid.cols,
        grid.rows,
        grid.type,
        grid.sizePx,
        floor.width,
        floor.height,
        ...volumes.map((volume) => `${volume.identifier}:${volume.color}`),
      ].join('|');
      if (this.painted?.key === key && sameCells(this.painted.cells, volumes)) return;
      this.painted = { key, cells: volumes.map((volume) => volume.cells) };
      this.paintFloor(canvas, context, grid, volumes);
    });
  }

  /** What the floor was last tinted from, so a scene that tints it the same way is let pass. */
  private painted: { key: string; cells: (CellBits | null)[] } | null = null;

  private paintFloor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    volumes: readonly VisionVolume[]
  ): void {
    perfCounters.bump(PERF_VISION_VOLUME_PAINT);
    const floor = this.floorSize();
    const width = floor.width * grid.sizePx;
    const height = floor.height * grid.sizePx;
    const scale = overlayScale(width, height);
    const pixelWidth = Math.ceil(width * scale);
    const pixelHeight = Math.ceil(height * scale);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.globalAlpha = FLOOR_ALPHA;
    for (const volume of volumes) {
      const seen = volume.cells;
      if (!seen) continue;
      context.fillStyle = volume.color;
      fillCells(context, grid, (index: number) => seen.get(index));
    }
    context.globalAlpha = 1;
  }

  private colorOf(character: GameCharacter): string {
    const cursor = character.owner ? PeerCursor.findByUserId(character.owner) : null;
    const owned = cursor?.chatColorCode?.[0];
    return owned && luminanceOf(owned) >= MIN_VOLUME_LUMINANCE ? owned : DEFAULT_VOLUME_COLOR;
  }

  protected ringStyle(volume: VisionVolume, ring: VolumeRing): Record<string, string> {
    const style: Record<string, string> = {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: ring.size + 'px',
      height: ring.size + 'px',
      'transform-origin': '0 0',
      transform: ring.transform,
      'border-radius': '50%',
      border: '1px solid ' + volume.color,
      opacity: RING_OPACITY,
      'pointer-events': 'none',
    };
    if (ring.clipPath) style['clip-path'] = ring.clipPath;
    return style;
  }

  protected ribStyle(volume: VisionVolume, rib: VolumeRib): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: rib.size + 'px',
      height: rib.size + 'px',
      'transform-origin': '0 0',
      transform: rib.transform,
      'border-top': '1px solid ' + volume.color,
      'border-right': '1px solid ' + volume.color,
      'border-top-right-radius': '100% 100%',
      opacity: RIB_OPACITY,
      'pointer-events': 'none',
    };
  }
}

function sameCells(kept: readonly (CellBits | null)[], volumes: readonly VisionVolume[]): boolean {
  return kept.length === volumes.length && kept.every((cells, index) => cells === volumes[index].cells);
}

function luminanceOf(color: string): number {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
  if (full.length < 6) return 1;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 1;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
