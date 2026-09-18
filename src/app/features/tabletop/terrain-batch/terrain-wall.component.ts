import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TerrainBatchService } from '@axe/application/tabletop/terrain-batch.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SquareWall } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { WallLight, WallSilhouette } from '@axe/domain/tabletop/vision-scene';
import { terrainWallFace } from '@axe/features/tabletop/terrain/terrain-wall-face';
import {
  BatchBackground,
  wallBackground,
  wallPlacement,
} from '@axe/features/tabletop/terrain-batch/terrain-batch-look';
import {
  wallLightLayerStyle,
  wallSilhouetteBackground,
  wallSilhouetteStyle,
} from '@axe/features/tabletop/wall-projection';
import { shadeRgbOf } from '@axe/ui/tabletop/shaded-background';

/**
 * One side of a block on a square board that nothing beside it hides, standing on its own.
 *
 * It is the face a block drawn alone draws on that side, with the same picture, shade, pools of
 * light and shadows of pieces, without the boxes a block drawn alone nests it in.
 */
@Component({
  selector: '[appTerrainWall]',
  templateUrl: './terrain-wall.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  host: {
    class:
      'chrome-smooth-image-trick absolute top-0 left-0 backface-hidden [pointer-events:var(--terrain-batch-pointer,auto)]',
    'data-table-passthrough': '',
    '[attr.data-terrain]': 'wall().identifier',
    '[style.width.px]': 'wall().lengthPx',
    '[style.height.px]': 'wall().heightPx',
    '[style.transform]': 'placement().transform',
    '[style.transform-origin]': 'placement().origin',
    '[style.background-image]': 'background().image',
    '[style.background-size]': 'background().size',
    '[style.background-position]': 'background().position',
    '[style.background-repeat]': 'background().repeat',
  },
})
export class TerrainWallComponent {
  private readonly batch = inject(TerrainBatchService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  protected readonly visionService = inject(VisionService);

  readonly wall = input.required<SquareWall>({ alias: 'appTerrainWall' });

  protected readonly placement = computed(() => wallPlacement(this.wall()));

  private readonly terrain = computed(() => {
    const terrain = this.batch.terrainOf(this.wall().identifier);
    if (terrain) this.objectChange.versionOf(terrain.identifier)();
    return terrain;
  });

  private readonly url = computed(() => {
    this.objectChange.fileVersion();
    const terrain = this.terrain();
    return terrain ? this.imageService.getSkeletonOr(terrain.faceImage(this.wall().side)).url : '';
  });

  /** The picture pools of light are drawn in, which is the block's wall picture, as a block drawn alone does. */
  protected readonly wallUrl = computed(() => {
    this.objectChange.fileVersion();
    const terrain = this.terrain();
    return terrain ? this.imageService.getSkeletonOr(terrain.wallImage).url : '';
  });

  private readonly tiled = computed(() => this.terrain()?.isTiledTexture ?? true);

  protected readonly background = computed<BatchBackground>(() => {
    const wall = this.wall();
    const shade = shadeRgbOf(this.visionService.ambientShade()?.color);
    return wallBackground(
      wall,
      this.batch.wallShade(wall),
      this.url(),
      this.tabletopService.gridSize(),
      this.tiled(),
      shade
    );
  });

  /** A face starts at its north or west end, and the west and east faces stand up from the south. */
  private readonly mirrored = computed(() => this.wall().side === 'west' || this.wall().side === 'east');

  private readonly face = computed(() => {
    const terrain = this.terrain();
    if (!terrain || !this.visionService.active()) return null;
    const gridSize = this.tabletopService.gridSize();
    return terrainWallFace(this.wall().side, {
      x: terrain.location.x,
      y: terrain.location.y,
      widthPx: terrain.width * gridSize,
      depthPx: terrain.depth * gridSize,
      heightPx: terrain.height * gridSize,
      rotateDeg: terrain.rotate,
    });
  });

  protected readonly pools = computed<readonly WallLight[]>(() => {
    const face = this.face();
    return face ? this.visionService.wallLights(face) : [];
  });

  protected readonly silhouettes = computed<readonly WallSilhouette[]>(() => {
    const face = this.face();
    return face ? this.visionService.wallSilhouettes(face) : [];
  });

  protected poolStyle(pool: WallLight): Record<string, string> {
    const tile = this.tiled() ? this.tabletopService.gridSize() : 0;
    return wallLightLayerStyle(pool, this.mirrored(), this.wall().lengthPx, tile);
  }

  protected silhouetteBackground(silhouette: WallSilhouette): string {
    return wallSilhouetteBackground(silhouette);
  }

  protected silhouetteStyle(silhouette: WallSilhouette): Record<string, string> {
    return wallSilhouetteStyle(silhouette, this.mirrored(), this.wall().lengthPx);
  }
}
