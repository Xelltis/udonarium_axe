import { characterModelBox } from '@axe/domain/tabletop/world/table-models';

describe('characterModelBox', () => {
  it('is as wide as the cell and twice as tall where no size is asked for the picture', () => {
    expect(characterModelBox(50, null, null)).toEqual({ widthPx: 50, heightPx: 100 });
  });

  it('is as tall as the picture is asked to be, keeping its own shape', () => {
    expect(characterModelBox(50, 250, null)).toEqual({ widthPx: 125, heightPx: 250 });
  });

  it('is as wide as the picture is asked to be apart from its height', () => {
    expect(characterModelBox(50, 250, 60)).toEqual({ widthPx: 60, heightPx: 250 });
  });
});
