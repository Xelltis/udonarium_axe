import { floorPlace, stubPictures } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { drawTextNote } from '@axe/application/tabletop/piece-drawings/text-note-drawing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TextNote } from '@axe/domain/tabletop/text-note';

describe('drawTextNote', () => {
  const made: TextNote[] = [];

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('draws a note from the picture the page takes of its panel, and nothing before there is one', () => {
    const note = TextNote.create('title', 'text');
    made.push(note);
    note.rotate = 90;
    const pictures = stubPictures();

    expect(drawTextNote(note, floorPlace(100, 200), 50, pictures)).toEqual([]);

    pictures.pages.set(note.identifier, { url: 'blob:panel', widthPx: 100, heightPx: 50 });
    const drawn = drawTextNote(note, floorPlace(100, 200), 50, pictures);

    expect(drawn).toMatchObject([
      {
        id: `${note.identifier}#panel`,
        owner: note.identifier,
        look: { url: 'blob:panel' },
        widthPx: 100,
        heightPx: 50,
      },
    ]);
  });

  it('draws the back of a note standing up in the paper the page paints its panel on', () => {
    const note = TextNote.create('title', 'text');
    made.push(note);
    const pictures = stubPictures();
    pictures.pages.set(note.identifier, {
      url: 'blob:panel',
      widthPx: 100,
      heightPx: 50,
      paper: { colour: '#161b22', opacity: 0.9 },
    });

    note.isUpright = true;
    expect(drawTextNote(note, floorPlace(100, 200), 50, pictures)).toMatchObject([
      { id: `${note.identifier}#panel`, look: { kind: 'picture', url: 'blob:panel' } },
      { id: `${note.identifier}#back`, look: { kind: 'colour', colour: '#161b22' }, opacity: 0.9 },
    ]);

    note.isUpright = false;
    expect(drawTextNote(note, floorPlace(100, 200), 50, pictures).map((sprite) => sprite.id)).toEqual([
      `${note.identifier}#panel`,
    ]);
  });
});
