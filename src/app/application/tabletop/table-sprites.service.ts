import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { DICE_FRAME_COLOUR, diceSymbolSprites } from '@axe/domain/tabletop/world/dice-symbol-sprites';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The theme's colour a frame takes for a piece that is somebody's, as the page names it. */
const OWNED_FRAME_COLOUR_PROPERTY = '--ui-panel-border';

/** Where a piece is drawn: on which face, at which corner of it, and how far off it. */
interface DrawnPlace {
  readonly frame: SurfaceFrame;
  readonly onFloor: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The sprites the pieces on the table in view are drawn with, worked out for this seat: what the
 * seat may not see is left out, and a piece it is moving is drawn where it is being moved to.
 *
 * Both the canvas that draws the table and the picking that says what a press lands on read them,
 * so a piece is pressed where it is drawn.
 */
@Injectable({ providedIn: 'root' })
export class TableSpritesService {
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly images = inject(ImageService);
  private readonly pictureSizes = inject(PictureSizeService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly vision = inject(VisionService);
  private readonly transient = inject(TransientPlacementService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly theme = inject(ThemeService);
  private readonly objectStore = inject(ObjectStore);

  /** Every sprite of every piece drawn on the table in view. */
  readonly sprites = computed<readonly TableWorldSprite[]>(() => this.diceSprites());

  /** The walls drawn on the table in view, which are drawn only with a picture. */
  private readonly drawnWalls = computed<ReadonlySet<string>>(() => {
    this.objectChange.fileVersion();
    return new Set(
      tableWallSettings(this.tabletop.currentTableVersion())
        .filter((wall) => wall.shown && this.images.getEmptyOr(wall.imageIdentifier).url)
        .map((wall) => wall.surface)
    );
  });

  private readonly diceSprites = computed(() => {
    this.objectChange.collectionOf(DiceSymbol.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.objectChange.networkVersion();
    this.objectChange.trackMyCursor();
    this.transient.version();
    this.theme.resolved();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const facesEye = this.tabletop.imageBillboard() || this.tabletop.mode2d();
    const owned = this.ownedFrameColour();
    const sprites: TableWorldSprite[] = [];
    for (const die of this.tabletop.diceSymbols) {
      this.objectChange.versionOf(die.identifier)();
      const size = Math.max(0, die.size);
      if (this.vision.isPieceHiddenByFog(die, size)) continue;
      const place = this.placeOf(die);
      if (!place) continue;
      const url = this.images.getEmptyOr(die.imageFile).url;
      const picture = url ? this.pictureSizes.sizeOf(url) : null;
      const reads = die.isVisible || this.rolePermission.canSeeHidden();
      sprites.push(
        ...diceSymbolSprites({
          id: die.identifier,
          ...place,
          sizePx: size * gridSize,
          rotateDeg: die.rotate,
          picture: picture ? { url, ...picture } : null,
          pictureHeightPx: die.specifyKomaImageFlag ? +die.komaImageHeight : null,
          facesEye,
          pictureBrightness: !reads ? 0 : die.isMine ? 0.5 : die.isUsed ? 0.45 : 1,
          frameBrightness: die.isUsed ? 0.45 : 1,
          frameColour: die.hasOwner ? owned : DICE_FRAME_COLOUR,
        })
      );
    }
    return sprites;
  });

  /**
   * Where a piece is drawn: where this seat is moving it, or where it stands. A piece on a wall the
   * table does not draw, or on a board no longer there, is drawn on the floor, as the page draws it.
   */
  private placeOf(piece: TabletopObject): DrawnPlace | null {
    const moving = this.transient.placementOf(piece.identifier);
    const named = moving?.surface ?? (boardSurfaceOf(piece) || surfaceOf(piece));
    const board = this.objectStore.get(named);
    if (board instanceof WhiteBoard) this.objectChange.versionOf(board.identifier)();
    const surface = board instanceof WhiteBoard || this.drawnWalls().has(named) ? named : 'floor';
    const frame = this.surfaces.frameOf(surface);
    if (!frame) return null;
    return {
      frame,
      onFloor: surface === 'floor',
      x: moving?.x ?? piece.location.x,
      y: moving?.y ?? piece.location.y,
      z: moving?.z ?? piece.posZ,
    };
  }

  private ownedFrameColour(): string {
    if (typeof getComputedStyle !== 'function') return DICE_FRAME_COLOUR;
    const colour = getComputedStyle(document.documentElement).getPropertyValue(OWNED_FRAME_COLOUR_PROPERTY).trim();
    return colour || DICE_FRAME_COLOUR;
  }
}
