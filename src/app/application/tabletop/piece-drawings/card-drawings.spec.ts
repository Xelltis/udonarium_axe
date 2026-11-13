import {
  type CardLook,
  drawCard,
  drawCardStack,
  stackSizeOf,
} from '@axe/application/tabletop/piece-drawings/card-drawings';
import { floorPlace, stubPictures } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';

describe('the cards', () => {
  const made: (Card | CardStack)[] = [];
  const look: CardLook = { gridSize: 50, thick: true, plate: '#123456' };

  function card(name = 'card'): Card {
    const one = Card.create(name, 'front-picture', 'back-picture');
    vi.spyOn(one, 'frontImage', 'get').mockReturnValue({ isEmpty: false, url: 'blob:front' } as never);
    vi.spyOn(one, 'backImage', 'get').mockReturnValue({ isEmpty: false, url: 'blob:back' } as never);
    made.push(one);
    return one;
  }

  function sizedPictures() {
    const pictures = stubPictures();
    pictures.sizes.set('blob:front', { url: 'blob:front', width: 100, height: 150 });
    pictures.sizes.set('blob:back', { url: 'blob:back', width: 100, height: 150 });
    return pictures;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('lays a card with the picture of the face it shows, as wide as the card', () => {
    const one = card();
    one.state = CardState.BACK;

    const drawn = drawCard(one, floorPlace(100, 200), look, sizedPictures());

    expect(drawn).toMatchObject([
      { id: `${one.identifier}#face`, owner: one.identifier, kind: 'card', look: { url: 'blob:back' }, widthPx: 100 },
    ]);
  });

  it('lays a card from the picture the page takes of its face before the picture of its face', () => {
    const one = card();
    const pictures = sizedPictures();
    pictures.pages.set(one.identifier, { url: 'blob:words', widthPx: 100, heightPx: 150 });

    expect(drawCard(one, floorPlace(100, 200), look, pictures)).toMatchObject([{ look: { url: 'blob:words' } }]);
  });

  it('stands a stack as thick as its cards on the floor, its top card on the plate', () => {
    const stack = CardStack.create('stack');
    made.push(stack);
    for (let i = 0; i < 3; i++) stack.putOnTop(card(`card-${i}`));
    vi.spyOn(stack, 'imageFile', 'get').mockReturnValue({ isEmpty: false, url: 'blob:front' } as never);

    const drawn = drawCardStack(stack, floorPlace(100, 200), look, sizedPictures());

    expect(drawn.map((sprite) => sprite.id)).toEqual([
      `${stack.identifier}#layer-0`,
      `${stack.identifier}#layer-1`,
      `${stack.identifier}#plate`,
      `${stack.identifier}#top`,
    ]);
    expect(drawn[2]).toMatchObject({ look: { kind: 'frame', bands: [{ colour: '#123456' }] } });
    expect(drawn[3]).toMatchObject({ look: { url: 'blob:front' } });
    expect(drawn[3].widthPx).toBeLessThan(drawn[2].widthPx);
    expect(stackSizeOf(stack)).toBe(2);
  });

  it('draws an empty stack two cells wide with no top card, and flat where the table is flat', () => {
    const stack = CardStack.create('stack');
    made.push(stack);

    const drawn = drawCardStack(stack, floorPlace(100, 200), { ...look, thick: false }, sizedPictures());

    expect(drawn.map((sprite) => sprite.id.split('#')[1])).toEqual(['plate']);
    expect(drawn[0].widthPx).toBe(100);
    expect(stackSizeOf(stack)).toBe(2);
  });
});
