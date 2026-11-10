import { inject, Injectable, untracked } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isPartLost, partAtPicturePoint, partFacesOf, partLayerOf, partMaskOf } from '@axe/domain/character/part-look';

/**
 * The part of a piece a press on the piece lands on, where its parts are drawn as pieces of its
 * picture, laid over it or painted on it, or as faces of its model painted over it. A press there aims at, or opens the menu of, the part
 * rather than the body; a move of it moves the body, as one of any other part of it does.
 */
@Injectable({ providedIn: 'root' })
export class PiecePartPickService {
  private readonly pick = inject(TablePickService);
  private readonly pieces = inject(TablePiecesService);
  private readonly links = inject(PieceLinksService);
  private readonly images = inject(ImageService);
  private readonly sizes = inject(PictureSizeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly table3d = inject(Table3dService);

  /** The part of a body a press at a point of the page lands on, or null where it lands on none of them. */
  partAt(body: GameCharacter, pageX: number, pageY: number): GameCharacter | null {
    return untracked(() => {
      const parts = this.links.partsOf(body);
      if (parts.length < 1) return null;
      const face = this.table3d.modelFaceAt(pageX, pageY);
      if (face && face.owner === body.identifier) {
        return (
          parts.find((part) => !isPartLost(part) && partFacesOf(part.partFaces).get(face.mesh)?.has(face.triangle)) ??
          null
        );
      }
      const hit = this.pick.pressedAt(pageX, pageY);
      if (!hit || hit.target.id !== body.identifier || hit.u === undefined || hit.v === undefined) return null;
      const drawn = this.pieces.sprites().filter((sprite) => sprite.owner === body.identifier);
      if (drawn[hit.shapeIndex]?.id !== `${body.identifier}#picture`) return null;
      const picture = drawn[hit.shapeIndex];
      const bodyAspect = picture.heightPx / Math.max(1e-6, picture.widthPx);
      const id = partAtPicturePoint(
        parts.map((part) => {
          const size = this.sizes.sizeOf(this.images.getEmptyOr(part.imageFile).url);
          return {
            id: part.identifier,
            layer: partLayerOf(part.partLayer),
            aspect: size && size.width > 0 ? size.height / size.width : 1,
            mask: partMaskOf(part.partMask),
            lost: isPartLost(part),
            bodyAspect,
          };
        }),
        hit.u,
        hit.v
      );
      const part = id ? this.objectStore.get<GameCharacter>(id) : null;
      return part instanceof GameCharacter ? part : null;
    });
  }
}
