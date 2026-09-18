import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TerrainBatchService } from '@axe/application/tabletop/terrain-batch.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid } from '@axe/domain/tabletop/hex-geometry';
import { HexCapSheet } from '@axe/domain/tabletop/terrain-batch/hex-caps';
import { shadeRgbOf } from '@axe/ui/tabletop/shaded-background';

/** The blocks on a sheet darkened by one amount, gathered into one path, with their joins with other sheets. */
interface ShadeGroup {
  readonly key: string;
  /** How dark the group is over the shade laid under the whole sheet. */
  readonly over: string;
  /** How dark the group is in all, which is what its joins are drawn in. */
  readonly whole: string;
  readonly path: string;
  readonly seams: string;
}

/** How a sheet is darkened: a shade under all of it, and each group of blocks the rest of the way. */
interface SheetShade {
  readonly under: string | null;
  readonly groups: readonly ShadeGroup[];
  readonly seams: string;
}

/** The pictures a sheet is filled from, drawn as a block drawn alone lays them. */
interface SheetTile {
  /** The size of one tile laid from the sheet's own corner, under everything, in pixels. */
  readonly width: number;
  readonly height: number;
  /** The size of one tile laid from each block's own corner, as a share of the block. */
  readonly shareX: number;
  readonly shareY: number;
}

let sheetCount = 0;

/**
 * The tops of blocks on a hex board, drawn on one sheet.
 *
 * Each block is a path of its own filled from a pattern laid from the corner of that path, which
 * is where a block drawn alone starts its picture. A copy of the picture laid from the sheet's own
 * corner lies under them all, so the hairlines where paths meet show more of the top rather than
 * the floor below.
 *
 * The shade comes in two coats for the same reason: the lightest shade on the sheet goes over all of
 * it at once, and each block is darkened the rest of the way, so a hairline between two blocks lit
 * alike shows no lighter than either. Where the sheet meets another, the picture and the full shade
 * are drawn a pixel out over the join, whichever of the two sheets happens to be drawn last.
 *
 * Only the blocks themselves are hit by the pointer. The sheet is a rectangle round them, and taken
 * whole it would stand over the doors and pieces between the blocks and swallow the clicks meant
 * for them.
 */
@Component({
  selector: '[appTerrainHexSheet]',
  templateUrl: './terrain-hex-sheet.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chrome-smooth-image-trick pointer-events-none absolute top-0 left-0 backface-hidden',
    '[style.width.px]': 'sheet().width',
    '[style.height.px]': 'sheet().height',
    '[style.transform]': 'transform()',
  },
})
export class TerrainHexSheetComponent {
  private readonly batch = inject(TerrainBatchService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);

  readonly sheet = input.required<HexCapSheet>({ alias: 'appTerrainHexSheet' });

  private readonly id = `terrain-sheet-${++sheetCount}`;
  protected readonly underId = `${this.id}-under`;
  protected readonly ownId = `${this.id}-own`;
  protected readonly outsideId = `${this.id}-outside`;

  /** Everything but the sheet's own cells, which is where its joins are drawn. */
  protected readonly outside = computed(() => {
    const { width, height, outline } = this.sheet();
    return `M-4 -4H${width + 4}V${height + 4}H-4Z${outline}`;
  });

  protected readonly transform = computed(() => {
    const sheet = this.sheet();
    return `translate3d(${sheet.left}px, ${sheet.top}px, ${sheet.topPx}px)`;
  });

  private readonly wearer = computed(() => {
    const wearer = this.batch.terrainOf(this.sheet().wearer);
    if (wearer) this.objectChange.versionOf(wearer.identifier)();
    return wearer;
  });

  protected readonly url = computed(() => {
    this.objectChange.fileVersion();
    const wearer = this.wearer();
    return wearer ? this.imageService.getSkeletonOr(wearer.faceImage('top')).url : '';
  });

  protected readonly tile = computed<SheetTile>(() => {
    const gridSize = this.tabletopService.gridSize();
    const wearer = this.wearer();
    const size = wearer ? Math.max(1, wearer.width) : 1;
    const { bbox } = calcHexFlowerParams(
      size,
      gridSize,
      isFlatTopGrid(this.tabletopService.currentTableVersion().gridType)
    );
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    if (wearer?.isTiledTexture ?? true) {
      return { width: gridSize, height: gridSize, shareX: gridSize / width, shareY: gridSize / height };
    }
    return { width, height, shareX: 1, shareY: 1 };
  });

  protected readonly shade = computed<SheetShade>(() => {
    const blocks = this.sheet().blocks.map((block) => ({
      block,
      alpha: Math.round(Math.max(0, Math.min(1, 1 - this.batch.hexTopBrightness(block.identifier))) * 1000) / 1000,
    }));
    const least = Math.min(...blocks.map(({ alpha }) => alpha));
    const byAlpha = new Map<number, { paths: string[]; seams: string[] }>();
    for (const { block, alpha } of blocks) {
      const group = byAlpha.get(alpha) ?? { paths: [], seams: [] };
      group.paths.push(block.path);
      if (block.seams) group.seams.push(block.seams);
      byAlpha.set(alpha, group);
    }
    const groups: ShadeGroup[] = [];
    for (const [alpha, group] of byAlpha) {
      const over = least < 1 ? (alpha - least) / (1 - least) : 0;
      groups.push({
        key: alpha.toFixed(3),
        over: over > 0.0005 ? over.toFixed(3) : '0',
        whole: alpha.toFixed(3),
        path: group.paths.join(''),
        seams: group.seams.join(''),
      });
    }
    return {
      under: least > 0.0005 ? least.toFixed(3) : null,
      groups,
      seams: blocks.map(({ block }) => block.seams).join(''),
    };
  });

  protected readonly shadeRgb = computed(() => shadeRgbOf(this.visionService.ambientShade()?.color));
}
