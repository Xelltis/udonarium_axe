import { type CharacterLook, drawCharacter } from '@axe/application/tabletop/piece-drawings/character-drawing';
import { floorPlace } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';

describe('drawCharacter', () => {
  const made: GameCharacter[] = [];
  const look: CharacterLook = {
    gridSize: 50,
    mode2d: false,
    facesEye: true,
    fitsInCell: false,
    turnsWithPiece: false,
    lookedThrough: '',
  };
  const pedestal = { url: 'blob:pedestal', widthPx: 50, heightPx: 50 };
  const picture = { url: 'blob:hero', width: 100, height: 120 };

  function hero(): GameCharacter {
    const one = GameCharacter.create('hero', 1, 'hero.png');
    one.isDropShadow = true;
    made.push(one);
    return one;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('draws the pedestal, the shadow and the picture of a character, the picture standing on its cell', () => {
    const one = hero();
    one.rotate = 45;

    const drawn = drawCharacter(one, floorPlace(100, 200), look, { pedestal, picture, lean: null, modelled: false });

    expect(drawn.map((sprite) => sprite.id)).toEqual([
      `${one.identifier}#pedestal`,
      `${one.identifier}#shadow`,
      `${one.identifier}#picture`,
    ]);
    expect(drawn.every((sprite) => sprite.owner === one.identifier && !sprite.hidden)).toBe(true);
    expect(drawn[2]).toMatchObject({ look: { url: 'blob:hero' }, facing: 'eye' });
    expect(drawn[2].opacity).toBeUndefined();
  });

  it('draws a piece in stealth half clear, and the one the camera looks through fainter still', () => {
    const one = hero();
    one.stealth = '1';
    const place = floorPlace(0, 0);

    const stealthy = drawCharacter(one, place, look, { pedestal, picture, lean: null, modelled: false });
    const lookedThrough = drawCharacter(
      one,
      place,
      { ...look, lookedThrough: one.identifier },
      { pedestal, picture, lean: null, modelled: false }
    );

    expect(stealthy[2].opacity).toBe(0.5);
    expect(lookedThrough[2].opacity).toBeCloseTo(0.15, 6);
  });

  it('leaves all but the pedestal of a character drawn as a model undrawn, still there to be picked', () => {
    const one = hero();

    const drawn = drawCharacter(one, floorPlace(0, 0), look, { pedestal, picture, lean: null, modelled: true });

    expect(drawn.map((sprite) => [sprite.id.split('#')[1], sprite.hidden === true])).toEqual([
      ['pedestal', false],
      ['shadow', true],
      ['picture', true],
    ]);
  });
});
