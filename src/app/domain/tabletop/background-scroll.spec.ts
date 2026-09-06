import {
  backgroundScrollAnimation,
  backgroundScrollMargin,
  backgroundTileSize,
  MAX_BACKGROUND_SCROLL_SPEED,
  MIN_BACKGROUND_SCROLL_SECONDS,
} from '@axe/domain/tabletop/background-scroll';

describe('backgroundScrollAnimation()', () => {
  it('takes as long as one tile needs to pass', () => {
    expect(backgroundScrollAnimation(100, 400)).toEqual({ durationSeconds: 4, reversed: false });
  });

  it('runs the other way for a speed that is going backwards', () => {
    expect(backgroundScrollAnimation(-100, 400)).toEqual({ durationSeconds: 4, reversed: true });
  });

  it('stands still where nothing is asked of it', () => {
    expect(backgroundScrollAnimation(0, 400).durationSeconds).toBe(0);
  });

  it('stands still until the picture has been measured, rather than guessing at a seam', () => {
    expect(backgroundScrollAnimation(100, 0).durationSeconds).toBe(0);
    expect(backgroundScrollAnimation(100, -5).durationSeconds).toBe(0);
  });

  it('stands still for a speed or a size that is no number at all', () => {
    expect(backgroundScrollAnimation(Number.NaN, 400).durationSeconds).toBe(0);
    expect(backgroundScrollAnimation(100, Number.POSITIVE_INFINITY).durationSeconds).toBe(0);
  });

  it('holds a runaway speed to what the eye can still follow', () => {
    const runaway = backgroundScrollAnimation(MAX_BACKGROUND_SCROLL_SPEED * 10, 400);
    const fastest = backgroundScrollAnimation(MAX_BACKGROUND_SCROLL_SPEED, 400);

    expect(runaway).toEqual(fastest);
  });

  it('never runs a lap quicker than the eye can follow it', () => {
    // One pixel of tile at full speed is half a millisecond a lap: two thousand laps a second,
    // and nothing to read from any of them.
    const blur = backgroundScrollAnimation(MAX_BACKGROUND_SCROLL_SPEED, 1);

    expect(blur.durationSeconds).toBe(MIN_BACKGROUND_SCROLL_SECONDS);
  });

  it('leaves a lap the eye can follow at the length it asked for', () => {
    expect(backgroundScrollAnimation(100, 400).durationSeconds).toBe(4);
  });
});

describe('backgroundTileSize()', () => {
  it('draws the picture at the size it was made', () => {
    expect(backgroundTileSize({ width: 256, height: 128 }, 1)).toEqual({ width: 256, height: 128 });
  });

  it('blows it up or shrinks it by the scale asked for', () => {
    expect(backgroundTileSize({ width: 256, height: 128 }, 2)).toEqual({ width: 512, height: 256 });
  });

  it('answers nothing until the picture has been measured', () => {
    expect(backgroundTileSize(null, 1)).toBeNull();
    expect(backgroundTileSize({ width: 0, height: 128 }, 1)).toBeNull();
  });

  it('holds the scale to what leaves a picture worth looking at', () => {
    expect(backgroundTileSize({ width: 100, height: 100 }, 0)).toEqual({ width: 10, height: 10 });
    expect(backgroundTileSize({ width: 100, height: 100 }, 1000)).toEqual({ width: 1000, height: 1000 });
    expect(backgroundTileSize({ width: 100, height: 100 }, Number.NaN)).toEqual({ width: 100, height: 100 });
  });

  it('lands on whole pixels, since a fraction of one is a seam every tile along', () => {
    expect(backgroundTileSize({ width: 512, height: 300 }, 1.3)).toEqual({ width: 666, height: 390 });
  });

  it('leaves a pixel to draw on however small the scale', () => {
    expect(backgroundTileSize({ width: 3, height: 3 }, 0.1)).toEqual({ width: 1, height: 1 });
  });

  it('never draws a tile larger than the board it is laid on', () => {
    // A drift needs one tile of spare cloth, so a tile past the board grows the sheet without
    // bound. Held to the board, the sheet is at worst twice the board.
    const board = { width: 1000, height: 800 };

    expect(backgroundTileSize({ width: 2000, height: 4000 }, 10, board)).toEqual({ width: 1000, height: 800 });
  });

  it('leaves a tile the board has room for at the size it asked for', () => {
    const board = { width: 1000, height: 800 };

    expect(backgroundTileSize({ width: 256, height: 128 }, 2, board)).toEqual({ width: 512, height: 256 });
  });

  it('holds each side to its own, since a board need not be square', () => {
    const board = { width: 1000, height: 200 };

    expect(backgroundTileSize({ width: 400, height: 400 }, 1, board)).toEqual({ width: 400, height: 200 });
  });

  it('holds nothing where no board was named, or where the board measures nothing', () => {
    expect(backgroundTileSize({ width: 2000, height: 2000 }, 1)).toEqual({ width: 2000, height: 2000 });
    expect(backgroundTileSize({ width: 2000, height: 2000 }, 1, null)).toEqual({ width: 2000, height: 2000 });
    expect(backgroundTileSize({ width: 2000, height: 2000 }, 1, { width: 0, height: 0 })).toEqual({
      width: 2000,
      height: 2000,
    });
  });
});

describe('backgroundScrollMargin()', () => {
  it('gives a drifting axis one tile of spare cloth, on the side it is heading for', () => {
    expect(backgroundScrollMargin({ width: 256, height: 128 }, true, true)).toEqual({ x: 256, y: 128 });
  });

  it('gives a still axis none, since the tiles already reach the edge', () => {
    expect(backgroundScrollMargin({ width: 256, height: 128 }, true, false)).toEqual({ x: 256, y: 0 });
    expect(backgroundScrollMargin({ width: 256, height: 128 }, false, false)).toEqual({ x: 0, y: 0 });
  });

  it('gives none at all until the picture has been measured', () => {
    expect(backgroundScrollMargin(null, true, true)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the board covered the whole drift through, by a tile larger than the board itself', () => {
    // The sheet spans [0, board + margin] and slides anywhere within [-tile, 0]. Cover the board
    // at both ends of that and it is covered throughout, whatever the tile measures.
    const board = 800;
    const tile = { width: 2000, height: 2000 };
    const margin = backgroundScrollMargin(tile, true, true);

    for (const slid of [0, -tile.width]) {
      expect(slid).toBeLessThanOrEqual(0);
      expect(board + margin.x + slid).toBeGreaterThanOrEqual(board);
    }
  });
});
