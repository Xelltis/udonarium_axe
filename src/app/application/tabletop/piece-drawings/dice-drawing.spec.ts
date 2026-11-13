import { type DiceLook, drawDie } from '@axe/application/tabletop/piece-drawings/dice-drawing';
import { floorPlace, stubPictures } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DICE_FRAME_COLOUR } from '@axe/domain/tabletop/world/dice-symbol-sprites';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The colour of a frame sprite's outer band, or nothing for a picture. */
function bandColourOf(sprite: TableWorldSprite): string | undefined {
  return sprite.look.kind === 'frame' ? sprite.look.bands[0]?.colour : undefined;
}

describe('drawDie', () => {
  const made: DiceSymbol[] = [];
  const look: DiceLook = { gridSize: 50, facesEye: true, seesHidden: false, owned: '#abcdef' };

  function die(): DiceSymbol {
    const one = DiceSymbol.create('D6', DiceType.D6, 1);
    made.push(one);
    return one;
  }

  function pictures() {
    const stub = stubPictures();
    stub.sizes.set('blob:face', { url: 'blob:face', width: 100, height: 100 });
    return stub;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('draws a die on the floor with its frame and the picture of its face', () => {
    const one = die();
    vi.spyOn(one, 'imageFile', 'get').mockReturnValue({ isEmpty: false, url: 'blob:face' } as never);

    const drawn = drawDie(one, floorPlace(100, 200), look, pictures());

    expect(drawn.map((sprite) => sprite.id)).toEqual([`${one.identifier}#frame`, `${one.identifier}#picture`]);
    expect(drawn[0].centre).toEqual({ x: 125, y: 225, z: 1 });
    expect(bandColourOf(drawn[0])).toBe(DICE_FRAME_COLOUR);
    expect(drawn[1]).toMatchObject({ look: { kind: 'picture', url: 'blob:face' }, facing: 'eye' });
  });

  it('blacks out the face of a die kept back from this seat, frames an owned die in its colour, and dims a spent one', () => {
    const one = die();
    vi.spyOn(one, 'imageFile', 'get').mockReturnValue({ isEmpty: false, url: 'blob:face' } as never);
    one.owner = 'somebody-else';

    const hidden = drawDie(one, floorPlace(0, 0), look, pictures());
    const seen = drawDie(one, floorPlace(0, 0), { ...look, seesHidden: true }, pictures());

    expect(bandColourOf(hidden[0])).toBe('#abcdef');
    expect(hidden[1].brightness).toBe(0);
    expect(seen[1].brightness).toBe(1);
  });
});
