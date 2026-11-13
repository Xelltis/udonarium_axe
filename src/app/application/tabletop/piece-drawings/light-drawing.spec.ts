import { drawLight } from '@axe/application/tabletop/piece-drawings/light-drawing';
import { floorPlace, stubPictures } from '@axe/application/tabletop/piece-drawings/piece-drawing-fixtures';
import { ObjectStore } from '@axe/core/sync/object-store';
import { LightSource } from '@axe/domain/tabletop/light-source';

describe('drawLight', () => {
  const made: LightSource[] = [];

  function light(): LightSource {
    const one = LightSource.create('L');
    made.push(one);
    return one;
  }

  afterEach(() => {
    for (const one of made.splice(0)) ObjectStore.instance.remove(one);
  });

  it('stands a light as its own picture, held in its cell keeping its shape', () => {
    const one = light();
    vi.spyOn(one, 'imageFile', 'get').mockReturnValue({ isEmpty: false, url: 'blob:lantern' } as never);
    const pictures = stubPictures();
    pictures.sizes.set('blob:lantern', { url: 'blob:lantern', width: 100, height: 120 });
    pictures.pages.set(one.identifier, { url: 'blob:bulb', widthPx: 36, heightPx: 36 });

    const drawn = drawLight(one, floorPlace(100, 200), 50, pictures);

    expect(drawn).toMatchObject([
      { id: `${one.identifier}#mark`, look: { url: 'blob:lantern' }, widthPx: 100 * (50 / 120), heightPx: 50 },
    ]);
  });

  it('stands a light with no picture of its own as the picture the page takes of its mark, clear while unlit', () => {
    const one = light();
    const pictures = stubPictures();
    pictures.pages.set(one.identifier, { url: 'blob:bulb', widthPx: 36, heightPx: 36 });

    const lit = drawLight(one, floorPlace(100, 200), 50, pictures);
    one.lightEnabled = false;
    const unlit = drawLight(one, floorPlace(100, 200), 50, pictures);

    expect(lit).toMatchObject([{ look: { url: 'blob:bulb' }, widthPx: 36, heightPx: 36 }]);
    expect(lit[0].opacity).toBeUndefined();
    expect(unlit[0].opacity).toBeLessThan(1);
  });

  it('draws nothing for a light with neither picture', () => {
    expect(drawLight(light(), floorPlace(0, 0), 50, stubPictures())).toEqual([]);
  });
});
