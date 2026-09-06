import {
  cardRunWidthMm,
  cellWidthInches,
  cellWidthPx,
  clampPxPerMm,
  DEFAULT_CELL_MM,
  dotsPerInch,
  ID1_CARD_WIDTH_MM,
  isAtRealSize,
  isPxPerMm,
  nudgePxPerMm,
  pxPerMmFromCardRun,
  realSizeZoom,
  TABLE_PERSPECTIVE_PX,
  viewPositionZToZoom,
  zoomToViewPositionZ,
} from '@axe/domain/tabletop/physical-scale';

describe('physical scale', () => {
  describe('measuring the panel with a card', () => {
    it('takes the width from however many cards were laid out', () => {
      expect(cardRunWidthMm(1)).toBeCloseTo(85.6, 6);
      expect(cardRunWidthMm(2)).toBeCloseTo(171.2, 6);
    });

    it('reads at least one card, whatever it is asked for', () => {
      expect(cardRunWidthMm(0)).toBe(ID1_CARD_WIDTH_MM);
      expect(cardRunWidthMm(-3)).toBe(ID1_CARD_WIDTH_MM);
    });

    it('turns a matched frame into pixels per millimetre', () => {
      expect(pxPerMmFromCardRun(274, 1)).toBeCloseTo(3.201, 3);
    });

    it('reaches the same answer from one card or from two', () => {
      expect(pxPerMmFromCardRun(548, 2)).toBeCloseTo(pxPerMmFromCardRun(274, 1), 6);
    });

    it('reports the density panels are sold by', () => {
      expect(dotsPerInch(pxPerMmFromCardRun(274, 1))).toBeCloseTo(81.3, 1);
    });
  });

  describe('what the measurement is allowed to be', () => {
    it('accepts a plausible density', () => {
      expect(isPxPerMm(3.2)).toBe(true);
      expect(isPxPerMm(11.8)).toBe(true);
    });

    it('turns down anything that could not have been measured', () => {
      expect(isPxPerMm(0)).toBe(false);
      expect(isPxPerMm(-3)).toBe(false);
      expect(isPxPerMm(1e6)).toBe(false);
      expect(isPxPerMm(Number.NaN)).toBe(false);
      expect(isPxPerMm('3.2')).toBe(false);
      expect(isPxPerMm(null)).toBe(false);
    });

    it('pulls a stray value back into range rather than passing it on', () => {
      expect(clampPxPerMm(1e6)).toBe(40);
      expect(clampPxPerMm(0)).toBe(0.5);
      expect(clampPxPerMm(Number.NaN)).toBe(0.5);
    });
  });

  describe('the zoom that makes a square real', () => {
    it('asks for more than life size on an ordinary desktop panel', () => {
      // A 4K 55 inch television sits near 3.2 px/mm, and a square is 50px of table.
      expect(realSizeZoom(DEFAULT_CELL_MM, 3.201, 50)).toBeCloseTo(1.626, 3);
    });

    it('scales with the square asked for', () => {
      expect(realSizeZoom(50.8, 3.201, 50)).toBeCloseTo(2 * realSizeZoom(25.4, 3.201, 50), 6);
    });

    it('stays at life size when a grid measures nothing', () => {
      expect(realSizeZoom(DEFAULT_CELL_MM, 3.2, 0)).toBe(1);
      expect(realSizeZoom(DEFAULT_CELL_MM, 3.2, Number.NaN)).toBe(1);
    });

    it('gives the width one square takes on the glass', () => {
      expect(cellWidthPx(DEFAULT_CELL_MM, 3.201)).toBeCloseTo(81.3, 1);
    });

    it('reads the same width in the inches a base is sold in', () => {
      expect(cellWidthInches(DEFAULT_CELL_MM)).toBeCloseTo(1, 6);
      expect(cellWidthInches(50.8)).toBeCloseTo(2, 6);
    });

    it('holds a square outside its range before converting', () => {
      expect(cellWidthInches(1e9)).toBeCloseTo(200 / 25.4, 6);
    });
  });

  describe('working the zoom back into a camera depth', () => {
    it('leaves the camera where it is at life size', () => {
      expect(zoomToViewPositionZ(1)).toBe(0);
    });

    it('comes back to the zoom it was asked for', () => {
      for (const zoom of [0.5, 1, 1.626, 3]) {
        expect(viewPositionZToZoom(zoomToViewPositionZ(zoom))).toBeCloseTo(zoom, 6);
      }
    });

    it('agrees with the projection the table is drawn with', () => {
      const z = zoomToViewPositionZ(1.626);
      expect(TABLE_PERSPECTIVE_PX / (TABLE_PERSPECTIVE_PX - z)).toBeCloseTo(1.626, 6);
    });

    it('refuses to pass the depth where the zoom would blow up', () => {
      expect(viewPositionZToZoom(TABLE_PERSPECTIVE_PX)).toBe(20);
      expect(viewPositionZToZoom(TABLE_PERSPECTIVE_PX + 500)).toBe(20);
      expect(viewPositionZToZoom(Number.NaN)).toBe(20);
    });
  });

  describe('telling whether the view is already real size', () => {
    it('recognises the depth it just snapped to', () => {
      const zoom = realSizeZoom(DEFAULT_CELL_MM, 3.201, 50);
      expect(isAtRealSize(zoomToViewPositionZ(zoom), DEFAULT_CELL_MM, 3.201, 50)).toBe(true);
    });

    it('notices once the table has been zoomed away', () => {
      expect(isAtRealSize(0, DEFAULT_CELL_MM, 3.201, 50)).toBe(false);
    });
  });

  describe('settling the last of it by eye', () => {
    it('moves the scale by the agreed fraction', () => {
      expect(nudgePxPerMm(3.2, 1)).toBeCloseTo(3.2064, 6);
      expect(nudgePxPerMm(3.2, -1)).toBeCloseTo(3.2 / 1.002, 6);
    });

    it('builds up over repeated presses', () => {
      let value = 3.2;
      for (let i = 0; i < 10; i++) value = nudgePxPerMm(value, 1);
      expect(value).toBeCloseTo(nudgePxPerMm(3.2, 10), 6);
    });

    it('comes back to where it started when stepped both ways', () => {
      expect(nudgePxPerMm(nudgePxPerMm(3.2, 5), -5)).toBeCloseTo(3.2, 6);
    });

    it('stays in range however far it is pushed', () => {
      expect(nudgePxPerMm(3.2, 100000)).toBe(40);
      expect(nudgePxPerMm(3.2, -100000)).toBe(0.5);
      expect(nudgePxPerMm(3.2, Number.NaN)).toBe(3.2);
    });
  });
});
