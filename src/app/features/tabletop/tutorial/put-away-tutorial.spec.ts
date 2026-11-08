import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  FIRST_TABLE,
  makeDefaultTable,
  makeDefaultTabletopObjects,
  SAMPLE_PARTIES,
  SAMPLE_PIECES,
} from '@axe/application/tabletop/tabletop-default-setup';
import { TUTORIAL_PARTS } from '@axe/application/tabletop/tutorial-board';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { boardSurfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { clearToBlankTable, putAwayTutorial } from '@axe/features/tabletop/tutorial/put-away-tutorial';

/** What putting the tutorial away reads of the table: the pieces that may stand on the welcome board. */
function tabletopOf(): TabletopService {
  return {
    characters: ObjectStore.instance.getObjects<GameCharacter>(GameCharacter),
    terrains: [],
    tableMasks: [],
    textNotes: [],
    cards: [],
    diceSymbols: [],
  } as unknown as TabletopService;
}

describe('putting the first table’s tutorial away', () => {
  beforeEach(() => {
    makeDefaultTable(ImageStorage.instance);
    makeDefaultTabletopObjects(ImageStorage.instance, (key) => key);
  });

  it('takes every one of the tutorial’s things off the table, and answers how many', () => {
    expect(putAwayTutorial(tabletopOf())).toBe(TUTORIAL_PARTS.length);

    for (const identifier of TUTORIAL_PARTS) expect(ObjectStore.instance.get(identifier), identifier).toBeNull();
  });

  it('leaves the sample pieces to be played with', () => {
    const pieces = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter).length;

    putAwayTutorial(tabletopOf());

    expect(ObjectStore.instance.getObjects<GameCharacter>(GameCharacter)).toHaveLength(pieces);
  });

  it('puts a piece set on the welcome board back on the table where it appeared to be', () => {
    const board = ObjectStore.instance.get('tutorialBoard')!;
    const piece = ObjectStore.instance.get<GameCharacter>('testCharacter_1')!;
    piece.location = { name: 'table', surface: board.identifier, x: 30, y: 40 };
    const boardAt = { ...(board as unknown as { location: { x: number; y: number } }).location };

    putAwayTutorial(tabletopOf());

    expect(boardSurfaceOf(piece)).toBe('');
    expect(piece.location.x).toBe(boardAt.x + 30);
    expect(piece.location.y).toBe(boardAt.y + 40);
  });

  it('takes away only what is left, once some of it has gone already', () => {
    ObjectStore.instance.get('tutorialCoin')!.destroy();

    expect(putAwayTutorial(tabletopOf())).toBe(TUTORIAL_PARTS.length - 1);
    expect(putAwayTutorial(tabletopOf())).toBe(0);
  });

  describe('clearing the first table down to a blank one', () => {
    it('takes away the tutorial, the sample pieces and their parties', () => {
      clearToBlankTable(tabletopOf());

      for (const identifier of [...TUTORIAL_PARTS, ...SAMPLE_PIECES, ...SAMPLE_PARTIES]) {
        expect(ObjectStore.instance.get(identifier), identifier).toBeNull();
      }
    });

    it('leaves the table with no picture and its grid shown, as a new table is made', () => {
      clearToBlankTable(tabletopOf());
      const table = ObjectStore.instance.get<GameTable>(FIRST_TABLE)!;

      expect(table.imageIdentifier).toBe(ImageFile.Empty.identifier);
      expect(table.gridShow).toBe(true);
    });

    it('lays the step the monsters stood on flat again', () => {
      const table = ObjectStore.instance.get<GameTable>(FIRST_TABLE)!;
      expect(groundSurfaceOf(groundFieldOn(table)!.readChunks()).isFlat).toBe(false);

      clearToBlankTable(tabletopOf());

      expect(groundSurfaceOf(groundFieldOn(table)!.readChunks()).isFlat).toBe(true);
    });

    it('leaves what was made on the table since', () => {
      const made = new GameCharacter();
      made.initialize();

      clearToBlankTable(tabletopOf());

      expect(ObjectStore.instance.get(made.identifier)).toBe(made);
      made.destroy();
    });
  });
});
