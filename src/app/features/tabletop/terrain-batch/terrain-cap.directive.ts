import { computed, Directive, inject, input } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TerrainBatchService } from '@axe/application/tabletop/terrain-batch.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SquareCap } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { BatchBackground, capBackground } from '@axe/features/tabletop/terrain-batch/terrain-batch-look';
import { shadeRgbOf } from '@axe/ui/tabletop/shaded-background';

/**
 * The tops of neighbouring blocks on a square board, drawn as one surface.
 *
 * It stands at the height of the tops, cut to their cells, and is shaded cell by cell from the same
 * readings each block's top is shaded from when drawn alone.
 */
@Directive({
  selector: '[appTerrainCap]',
  host: {
    class:
      'chrome-smooth-image-trick absolute top-0 left-0 backface-hidden [pointer-events:var(--terrain-batch-pointer,auto)]',
    'data-table-passthrough': '',
    '[attr.data-terrain-cap]': 'cap().key',
    '[style.width.px]': 'cap().width',
    '[style.height.px]': 'cap().height',
    '[style.transform]': 'transform()',
    '[style.clip-path]': 'clipPath()',
    '[style.background-image]': 'background().image',
    '[style.background-size]': 'background().size',
    '[style.background-position]': 'background().position',
    '[style.background-repeat]': 'background().repeat',
  },
})
export class TerrainCapDirective {
  private readonly batch = inject(TerrainBatchService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);

  readonly cap = input.required<SquareCap>({ alias: 'appTerrainCap' });

  protected readonly transform = computed(() => {
    const cap = this.cap();
    return `translate3d(${cap.left}px, ${cap.top}px, ${cap.topPx}px)`;
  });

  protected readonly clipPath = computed(() => `path('${this.cap().path}')`);

  private readonly url = computed(() => {
    this.objectChange.fileVersion();
    const wearer = this.batch.terrainOf(this.cap().wearer);
    if (!wearer) return '';
    this.objectChange.versionOf(wearer.identifier)();
    return this.imageService.getSkeletonOr(wearer.faceImage('top')).url;
  });

  protected readonly background = computed<BatchBackground>(() => {
    const cap = this.cap();
    const shade = shadeRgbOf(this.visionService.ambientShade()?.color);
    return capBackground(cap, this.batch.capShade(cap), this.url(), this.tabletopService.gridSize(), shade);
  });
}
