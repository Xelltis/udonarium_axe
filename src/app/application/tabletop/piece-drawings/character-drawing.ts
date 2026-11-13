import type { DrawnPlace, GridLook } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import type { SurfaceLean } from '@axe/domain/tabletop/terrain-slope-surface';
import { type CharacterLayout, characterSprites } from '@axe/domain/tabletop/world/character-sprites';
import type { PagePicture, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** What every character is drawn with alike, as the table in view shows the pictures of pieces. */
export interface CharacterLook extends GridLook {
  readonly mode2d: boolean;
  readonly facesEye: boolean;
  readonly fitsInCell: boolean;
  readonly turnsWithPiece: boolean;
  /** The character the table's camera looks through, or nothing. */
  readonly lookedThrough: string;
}

/** What a character is drawn from beyond its own fields: what this seat holds of it. */
export interface CharacterSources {
  /** The picture the page takes of its pedestal, or null for none. */
  readonly pedestal: PagePicture | null;
  /** Its picture, as its parts paint it or as its file is, with how big that is, or null while not known. */
  readonly picture: CharacterLayout['picture'];
  /** How the ground under it leans where it is drawn, or null where it is level or it stands off the floor. */
  readonly lean: SurfaceLean | null;
  /** Whether it is drawn as a 3D model held here, which leaves its picture and its shadow undrawn. */
  readonly modelled: boolean;
}

/** How faint the piece the table's camera follows is drawn while the camera stands near enough to look through it. */
const SEEN_THROUGH = 0.3;

/**
 * A character drawn at a place from its picture and the picture the page takes of its pedestal; one
 * drawn as a model keeps only its pedestal drawn, the rest still picked where it stands.
 */
export function drawCharacter(
  character: GameCharacter,
  place: DrawnPlace,
  look: CharacterLook,
  from: CharacterSources
): TableWorldSprite[] {
  const drawn = characterSprites({
    id: character.identifier,
    ...place,
    sizePx: Math.max(0, character.size) * look.gridSize,
    rotateDeg: character.rotate,
    rollDeg: character.roll,
    dropShadow: character.isDropShadow,
    lean: from.lean,
    altitudePx: character.altitude * look.gridSize,
    pedestal: from.pedestal,
    picture: from.picture,
    pictureHeightPx: character.specifyKomaImageFlag ? character.komaImageHeight : null,
    pictureWidthPx: character.specifyKomaImageFlag ? pieceImageWidthApart(character.komaImageWidth) : null,
    fitsInCell: look.fitsInCell,
    facesEye: look.facesEye,
    turnsWithPiece: look.turnsWithPiece,
    opacity: (character.stealth === '1' ? 0.5 : 1) * (look.lookedThrough === character.identifier ? SEEN_THROUGH : 1),
  });
  return from.modelled ? drawn.map(standInForModel) : drawn;
}

/**
 * A sprite of a character drawn as a 3D model: its picture and its shadow left undrawn, still picked
 * where they stand, and its pedestal drawn as it is.
 */
function standInForModel(sprite: TableWorldSprite): TableWorldSprite {
  return sprite.id.endsWith('#pedestal') ? sprite : { ...sprite, hidden: true };
}
