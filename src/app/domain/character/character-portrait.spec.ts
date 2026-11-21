import {
  addShownPortrait,
  portraitElementAt,
  portraitNameOf,
  portraitPicturesOf,
  setPortraitNameOf,
} from '@axe/domain/character/character-portrait';
import { shownImageIdentifier } from '@axe/domain/character/shown-image';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

function makeCharacter(portraits: number): GameCharacter {
  const character = GameCharacter.create('立ち絵持ち', 1, '');
  const image = character.imageDataElement!;
  for (let i = image.children.length; i < portraits; i++) {
    image.appendChild(DataElement.create('imageIdentifier', `img-${i}`, { type: 'image' }, ''));
  }
  return character;
}

describe('character portrait names', () => {
  it('has no name until one is given', () => {
    const character = makeCharacter(2);
    try {
      expect(portraitNameOf(portraitElementAt(character, 0))).toBe('');
    } finally {
      character.destroy();
    }
  });

  it('keeps the name that was written on the portrait', () => {
    const character = makeCharacter(2);
    try {
      setPortraitNameOf(portraitElementAt(character, 1)!, '笑顔');

      expect(portraitNameOf(portraitElementAt(character, 1))).toBe('笑顔');
      expect(portraitNameOf(portraitElementAt(character, 0))).toBe('');
    } finally {
      character.destroy();
    }
  });

  it('drops the space around a name as it is written down', () => {
    const character = makeCharacter(1);
    try {
      setPortraitNameOf(portraitElementAt(character, 0)!, '  笑顔  ');

      expect(portraitNameOf(portraitElementAt(character, 0))).toBe('笑顔');
    } finally {
      character.destroy();
    }
  });

  it('has nothing to hand back beyond the portraits a piece holds', () => {
    const character = makeCharacter(2);
    try {
      expect(portraitElementAt(character, -1)).toBeNull();
      expect(portraitElementAt(character, 2)).toBeNull();
    } finally {
      character.destroy();
    }
  });

  it('reads a name off nothing as no name', () => {
    expect(portraitNameOf(null)).toBe('');
    expect(portraitNameOf(undefined)).toBe('');
  });
});

describe('a portrait added to be shown', () => {
  it('goes after the portraits a piece has, named as given, and is the one the piece shows', () => {
    const piece = GameCharacter.create('騎士', 1, 'first-picture');

    const added = addShownPortrait(piece, 'model-picture', '3Dモデル');

    expect(portraitPicturesOf(piece)).toEqual(['first-picture', 'model-picture']);
    expect(portraitNameOf(added)).toBe('3Dモデル');
    expect(shownImageIdentifier(piece.imageDataElement, piece.detailDataElement)).toBe('model-picture');
    piece.destroy();
  });

  it('is added to nothing where a piece has no list of pictures', () => {
    const piece = GameCharacter.create('騎士', 1, '');
    piece.imageDataElement?.destroy();

    expect(addShownPortrait(piece, 'model-picture', '')).toBeNull();
    piece.destroy();
  });
});
