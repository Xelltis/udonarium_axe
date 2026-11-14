import type { DrawnPlace, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { TextNote } from '@axe/domain/tabletop/text-note';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { textNoteSprites } from '@axe/domain/tabletop/world/text-note-sprites';

/** A note drawn at a place from the picture the page takes of its panel, with the paper the page paints the panel on. */
export function drawTextNote(
  note: TextNote,
  place: DrawnPlace,
  gridSize: number,
  pictures: PiecePictures
): TableWorldSprite[] {
  return textNoteSprites({
    id: note.identifier,
    ...place,
    altitudePx: note.altitude * gridSize,
    rotateDeg: note.rotate,
    upright: note.isUpright,
    face: pictures.pageOf(note.identifier),
  });
}
