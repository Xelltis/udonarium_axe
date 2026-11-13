import type { DrawnPlace } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { characterModelBox, type TableWorldModel } from '@axe/domain/tabletop/world/table-models';

/** What a character's model is drawn from beyond its own fields: what this seat holds of it. */
export interface ModelSources {
  /** Where the bytes of a model held here in full are read from, or nothing for one not held. */
  modelUrlOf(identifier: string): string;
  /** What the parts of a piece stand for of its model, put on what it is drawn with only where any is painted. */
  partFacesOf(character: GameCharacter): Pick<TableWorldModel, 'ownCopy' | 'cutFaces'>;
}

/**
 * A character drawn as a 3D model held here, stood at the middle of its footprint on the floor, or
 * nothing for one with no model held or standing off the floor.
 */
export function drawModel(
  character: GameCharacter,
  place: DrawnPlace,
  walking: boolean,
  gridSize: number,
  from: ModelSources
): TableWorldModel[] {
  const model = pieceModelOf(character);
  const url = model ? from.modelUrlOf(model.identifier) : '';
  if (!model || !url || !place.onFloor) return [];
  const size = Math.max(0, character.size) * gridSize;
  const box = characterModelBox(
    size,
    character.specifyKomaImageFlag ? character.komaImageHeight : null,
    character.specifyKomaImageFlag ? pieceImageWidthApart(character.komaImageWidth) : null
  );
  return [
    {
      owner: character.identifier,
      kind: character.aliasName,
      url,
      model,
      foot: { x: place.x + size / 2, y: place.y + size / 2, z: place.z },
      footprintPx: box.widthPx,
      heightPx: box.heightPx,
      rotateDeg: character.rotate,
      rollDeg: character.roll,
      pivotPx: size / 2,
      altitudePx: character.altitude * gridSize,
      walking,
      ...from.partFacesOf(character),
    },
  ];
}
