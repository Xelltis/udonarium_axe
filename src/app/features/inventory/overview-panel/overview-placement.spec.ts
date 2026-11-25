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
});
