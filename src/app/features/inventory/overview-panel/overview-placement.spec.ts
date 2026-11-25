import { detailPlacement } from '@axe/features/inventory/overview-panel/overview-placement';

describe('detailPlacement', () => {
  const size = { width: 270, height: 240 };
  const screen = { width: 1280, height: 800 };

  it('opens to the right of the pointer and above it where it fits, as it always has', () => {
    expect(detailPlacement({ x: 300, y: 500 }, size, screen)).toEqual({ left: 400, top: 210 });
  });

  it('opens as far below the pointer where it does not fit above, clear of the piece under it', () => {
    expect(detailPlacement({ x: 300, y: 200 }, size, screen)).toEqual({ left: 400, top: 250 });
  });

  it('is pushed inside the screen only where it fits neither above nor below', () => {
    expect(detailPlacement({ x: 300, y: 260 }, size, { width: 1280, height: 520 })).toEqual({ left: 400, top: 280 });
  });

  it('opens to the left of the pointer where it does not fit to the right', () => {
    expect(detailPlacement({ x: 1100, y: 500 }, size, screen)).toEqual({ left: 730, top: 210 });
  });

  it('places a detail turned half round by the box it is seen in, clear of the pointer below it as above', () => {
    const turned = detailPlacement({ x: 300, y: 200 }, size, screen, 180);
    const seen = { left: turned.left - size.width, top: turned.top - size.height };

    expect(seen).toEqual({ left: 400, top: 250 });
  });

  it('places a detail turned a quarter round by the box it is seen in, its width and height swapped', () => {
    const turned = detailPlacement({ x: 300, y: 500 }, size, screen, 90);
    const seen = { left: turned.left - size.height, top: turned.top };

    expect(seen).toEqual({ left: 400, top: 500 - size.width - 50 });
    const back = detailPlacement({ x: 300, y: 500 }, size, screen, 270);
    expect({ left: back.left, top: back.top - size.width }).toEqual(seen);
  });
});
