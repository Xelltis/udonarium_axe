import {
  centeredRect,
  clampRect,
  editedName,
  flipPoint,
  flipRect,
  movedRect,
  orientedSize,
  rectFromCorners,
  resizedSize,
  scaledSize,
  turned,
  turnPoint,
  turnRect,
  UPRIGHT,
} from '@axe/domain/media/image-edit';

describe('image-edit', () => {
  const size = { width: 40, height: 30 };

  describe('turning and mirroring', () => {
    it('swaps the sides of a picture turned a quarter, and keeps them for a half', () => {
      expect(orientedSize(size, { ...UPRIGHT, quarterTurns: 1 })).toEqual({ width: 30, height: 40 });
      expect(orientedSize(size, { ...UPRIGHT, quarterTurns: 2 })).toEqual(size);
    });

    it('goes round in quarters either way', () => {
      expect(turned(UPRIGHT, true).quarterTurns).toBe(1);
      expect(turned(UPRIGHT, false).quarterTurns).toBe(3);
      expect(turned({ ...UPRIGHT, quarterTurns: 3 }, true).quarterTurns).toBe(0);
    });

    it('carries the top-left pixel to the top-right on a clockwise turn, and back again', () => {
      const turnedOnce = turnPoint({ x: 0, y: 0 }, size, true);
      expect(turnedOnce).toEqual({ x: 29, y: 0 });
      expect(turnPoint(turnedOnce, { width: 30, height: 40 }, false)).toEqual({ x: 0, y: 0 });
    });

    it('turns a rectangle with the picture, so turning four times brings it back', () => {
      const rect = { x: 5, y: 3, width: 10, height: 6 };
      let current = rect;
      let currentSize = size;
      for (let quarter = 0; quarter < 4; quarter++) {
        current = turnRect(current, currentSize, true);
        currentSize = { width: currentSize.height, height: currentSize.width };
        expect(current.x).toBeGreaterThanOrEqual(0);
        expect(current.x + current.width).toBeLessThanOrEqual(currentSize.width);
      }
      expect(current).toEqual(rect);
    });

    it('mirrors points and rectangles across and up and down', () => {
      expect(flipPoint({ x: 0, y: 5 }, size, true)).toEqual({ x: 39, y: 5 });
      expect(flipPoint({ x: 3, y: 0 }, size, false)).toEqual({ x: 3, y: 29 });
      expect(flipRect({ x: 0, y: 0, width: 10, height: 5 }, size, true)).toEqual({ x: 30, y: 0, width: 10, height: 5 });
      expect(flipRect({ x: 0, y: 0, width: 10, height: 5 }, size, false)).toEqual({
        x: 0,
        y: 25,
        width: 10,
        height: 5,
      });
    });
  });

  describe('the rectangle cut out', () => {
    it('keeps a rectangle on whole pixels, inside the picture and at least a pixel each way', () => {
      expect(clampRect({ x: -4.2, y: 28, width: 0, height: 10 }, size)).toEqual({ x: 0, y: 20, width: 1, height: 10 });
      expect(clampRect({ x: 35, y: 0, width: 100, height: 100 }, size)).toEqual({ x: 0, y: 0, width: 40, height: 30 });
    });

    it('draws out a free rectangle from either corner', () => {
      expect(rectFromCorners({ x: 10, y: 10 }, { x: 20, y: 25 }, null, size)).toEqual({
        x: 10,
        y: 10,
        width: 10,
        height: 15,
      });
      expect(rectFromCorners({ x: 20, y: 25 }, { x: 10, y: 10 }, null, size)).toEqual({
        x: 10,
        y: 10,
        width: 10,
        height: 15,
      });
    });

    it('holds a dragged rectangle to the ratio asked for and within the picture', () => {
      const square = rectFromCorners({ x: 10, y: 10 }, { x: 18, y: 12 }, 1, size);
      expect(square.width).toBe(square.height);
      const wide = rectFromCorners({ x: 30, y: 25 }, { x: 40, y: 30 }, 2, size);
      expect(wide.x + wide.width).toBeLessThanOrEqual(40);
      expect(wide.y + wide.height).toBeLessThanOrEqual(30);
      expect(wide.width).toBe(wide.height * 2);
    });

    it('lays a ratio in the middle of the picture as large as it fits', () => {
      expect(centeredRect(1, size)).toEqual({ x: 5, y: 0, width: 30, height: 30 });
      expect(centeredRect(16 / 9, { width: 160, height: 160 })).toEqual({ x: 0, y: 35, width: 160, height: 90 });
    });

    it('moves a rectangle no further than the edge', () => {
      expect(movedRect({ x: 30, y: 20, width: 10, height: 10 }, 50, -50, size)).toEqual({
        x: 30,
        y: 0,
        width: 10,
        height: 10,
      });
    });
  });

  describe('the size it comes out at', () => {
    it('follows the picture from a width or a height while the proportions are held', () => {
      expect(resizedSize(size, { width: 20 }, true)).toEqual({ width: 20, height: 15 });
      expect(resizedSize(size, { height: 60 }, true)).toEqual({ width: 80, height: 60 });
    });

    it('takes both as given when they are not held, and keeps the picture with nothing asked', () => {
      expect(resizedSize(size, { width: 10, height: 50 }, false)).toEqual({ width: 10, height: 50 });
      expect(resizedSize(size, {}, true)).toEqual(size);
    });

    it('scales by a share, never down to nothing', () => {
      expect(scaledSize(size, 50)).toEqual({ width: 20, height: 15 });
      expect(scaledSize(size, 0)).toEqual({ width: 1, height: 1 });
    });
  });

  describe('the name it is stored under', () => {
    it('keeps its own name with the extension of the type it came out as', () => {
      expect(editedName('portrait.jpg')).toBe('portrait.png');
      expect(editedName('portrait.jpg', 'image/webp')).toBe('portrait.webp');
      expect(editedName('.png')).toBe('image.png');
    });

    it('never takes the hash of the picture it came from', () => {
      const hash = 'a'.repeat(64);
      expect(editedName(`${hash}.webp`)).toBe(`${hash}-edited.png`);
    });
  });
});
