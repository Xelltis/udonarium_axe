import { drawModel, type ModelSources } from '@axe/application/tabletop/piece-drawings/model-drawing';
import { floorPlace, wallPlace } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';

describe('drawModel', () => {
  const made: GameCharacter[] = [];
  const held: ModelSources = {
    modelUrlOf: (identifier) => (identifier === 'knight-model' ? 'blob:knight' : ''),
    partFacesOf: () => ({}),
  };

  function knight(model = 'knight-model'): GameCharacter {
    const one = GameCharacter.create('knight', 1, '');
    one.modelIdentifier = model;
    one.modelScale = '2';
    made.push(one);
    return one;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('stands the model held here at the middle of the footprint, walking while it is moved', () => {
    const one = knight();

    const drawn = drawModel(one, floorPlace(100, 200), true, 50, held);

    expect(drawn).toEqual([
      expect.objectContaining({
        owner: one.identifier,
        kind: 'character',
        url: 'blob:knight',
        model: expect.objectContaining({ identifier: 'knight-model', scale: 2 }),
        foot: { x: 125, y: 225, z: 0 },
        footprintPx: 50,
        pivotPx: 25,
        walking: true,
      }),
    ]);
  });

  it('fits the model inside the size asked for its picture, tipped over and lifted as the picture is', () => {
    const one = knight();
    one.specifyKomaImageFlag = true;
    one.komaImageHeight = 250;
    one.roll = 90;
    one.altitude = 1;

    expect(drawModel(one, floorPlace(0, 0), false, 50, held)[0]).toMatchObject({
      footprintPx: 125,
      heightPx: 250,
      rollDeg: 90,
      pivotPx: 25,
      altitudePx: 50,
      walking: false,
    });
  });

  it('puts what the parts stand for of the model on it', () => {
    const one = knight();
    const painted: ModelSources = { ...held, partFacesOf: () => ({ ownCopy: true, cutFaces: 'arm' }) };

    expect(drawModel(one, floorPlace(0, 0), false, 50, painted)[0]).toMatchObject({ ownCopy: true, cutFaces: 'arm' });
  });

  it('draws nothing for a model not held here, for no model, or off the floor', () => {
    expect(drawModel(knight('other-model'), floorPlace(0, 0), false, 50, held)).toEqual([]);
    expect(drawModel(knight(''), floorPlace(0, 0), false, 50, held)).toEqual([]);
    expect(drawModel(knight(), wallPlace(0, 0), false, 50, held)).toEqual([]);
  });
});
