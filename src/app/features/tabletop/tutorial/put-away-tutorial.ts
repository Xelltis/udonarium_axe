import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { FIRST_TABLE, SAMPLE_PARTIES, SAMPLE_PIECES } from '@axe/application/tabletop/tabletop-default-setup';
import { TUTORIAL_PARTS } from '@axe/application/tabletop/tutorial-board';
import { ImageFile } from '@axe/core/storage/image-file';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GROUND_CHUNK_SAMPLE_COUNT } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { detachAllFrom, standingOn } from '@axe/features/tabletop/white-board/white-board-contents';

/** The objects held under some names, leaving out the names nothing is held under now. */
function heldUnder(identifiers: readonly string[]): GameObject[] {
  return identifiers
    .map((identifier) => ObjectStore.instance.get(identifier))
    .filter((object): object is GameObject => object !== null);
}

/**
 * Takes the tutorial off the table in one go: the boards, the note, and the dice, coin, crate and
 * light they speak of. The sample pieces stay to be played with, and whatever was set on a board is
 * put back on the table where it appeared to be. Answers how many things were taken away.
 */
export function putAwayTutorial(tabletop: TabletopService): number {
  const parts = heldUnder(TUTORIAL_PARTS);
  const lying = [
    ...tabletop.characters,
    ...tabletop.terrains,
    ...tabletop.tableMasks,
    ...tabletop.textNotes,
    ...tabletop.cards,
    ...tabletop.diceSymbols,
  ];
  for (const part of parts) {
    if (part instanceof WhiteBoard) detachAllFrom(part, standingOn(part, lying));
  }
  for (const part of parts) part.destroy();
  return parts.length;
}

/**
 * Clears the first table down to a blank one: the tutorial goes, the sample pieces and their two
 * parties go, all the ground is laid flat and its paint taken off, and the table loses its picture and
 * shows its grid, as a new table is made with. The pieces put on the table since stay where they are.
 */
export function clearToBlankTable(tabletop: TabletopService): void {
  putAwayTutorial(tabletop);
  for (const sample of heldUnder([...SAMPLE_PIECES, ...SAMPLE_PARTIES])) sample.destroy();
  const table = ObjectStore.instance.get<GameTable>(FIRST_TABLE);
  if (!table) return;
  table.imageIdentifier = ImageFile.Empty.identifier;
  table.gridShow = true;
  const ground = groundFieldOn(table);
  for (const chunk of ground?.readChunks() ?? []) {
    ground!.writeChunk({ cx: chunk.cx, cy: chunk.cy, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: null });
  }
}
