import { shortcutSheetPlace } from '@axe/ui/shortcut-sheet-place';

describe('where the cheat sheet goes', () => {
  const screen = { width: 1200, height: 800 };
  const sheet = { width: 400, height: 300 };

  function overlaps(
    place: { left: number; top: number; width: number },
    height: number,
    rect: { left: number; top: number; right: number; bottom: number }
  ) {
    return (
      place.left < rect.right &&
      rect.left < place.left + place.width &&
      place.top < rect.bottom &&
      rect.top < place.top + height
    );
  }

  it('sits in the middle of the screen with nothing to keep clear of', () => {
    expect(shortcutSheetPlace([sheet], screen, [])).toEqual({ left: 400, top: 250, width: 400 });
  });

  it('moves off the names written in the middle', () => {
    const names = { left: 500, top: 350, right: 700, bottom: 450 };
    const place = shortcutSheetPlace([sheet], screen, [names]);
    expect(overlaps(place, sheet.height, names)).toBe(false);
  });

  it('keeps clear of a menu drawn down the left and a bar along the top', () => {
    const menu = { left: 0, top: 0, right: 640, bottom: 800 };
    const bar = { left: 640, top: 0, right: 1200, bottom: 120 };
    const place = shortcutSheetPlace([sheet], screen, [menu, bar]);
    expect(overlaps(place, sheet.height, menu)).toBe(false);
    expect(overlaps(place, sheet.height, bar)).toBe(false);
  });

  it('keeps to its first shape where that one fits', () => {
    const wide = { width: 1000, height: 200 };
    expect(shortcutSheetPlace([sheet, wide], screen, []).width).toBe(400);
  });

  it('lays itself out wide and short to fit the band the names leave', () => {
    const names = { left: 0, top: 0, right: 1200, bottom: 520 };
    const wide = { width: 1000, height: 220 };
    const place = shortcutSheetPlace([sheet, wide], screen, [names]);
    expect(place.width).toBe(1000);
    expect(overlaps(place, wide.height, names)).toBe(false);
  });

  it('covers as little as it can where there is no room clear of everything', () => {
    const wall = { left: 0, top: 0, right: 1200, bottom: 650 };
    const place = shortcutSheetPlace([sheet], screen, [wall]);
    expect(place.top).toBe(screen.height - sheet.height - 16);
  });

  it('stays on the screen when it is bigger than the screen', () => {
    expect(shortcutSheetPlace([{ width: 1600, height: 900 }], screen, [])).toEqual({ left: 16, top: 16, width: 1600 });
  });
});
