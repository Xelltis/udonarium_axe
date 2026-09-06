import {
  EDGE_DETAIL_INSET_PX,
  edgeDetailAnchor,
  EdgeDetailSeat,
  makeEdgeDetailSeats,
  sameEdgeDetailSeats,
} from '@axe/ui/tabletop/edge-detail-layout';

/** Where the panel ends up once the browser has rotated it about its top left corner. */
function visualBox(
  seat: EdgeDetailSeat,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const anchor = edgeDetailAnchor(seat, panelWidth, panelHeight, viewportWidth, viewportHeight);
  const radians = (seat.rotationDegrees * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const corners = [
    [0, 0],
    [panelWidth, 0],
    [panelWidth, panelHeight],
    [0, panelHeight],
  ].map(([x, y]) => ({ x: anchor.left + x * cos - y * sin, y: anchor.top + x * sin + y * cos }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe('edge detail layout', () => {
  describe('choosing the seats', () => {
    it('seats one per edge on a screen close to square', () => {
      const seats = makeEdgeDetailSeats(1000, 900);
      expect(seats).toEqual([
        { edge: 'bottom', rotationDegrees: 0, alongEdgeRatio: 0.5 },
        { edge: 'left', rotationDegrees: 90, alongEdgeRatio: 0.5 },
        { edge: 'top', rotationDegrees: 180, alongEdgeRatio: 0.5 },
        { edge: 'right', rotationDegrees: 270, alongEdgeRatio: 0.5 },
      ]);
    });

    it('seats two along each long edge of a wide screen', () => {
      const seats = makeEdgeDetailSeats(1920, 1080);
      expect(seats).toHaveLength(6);
      expect(seats.filter((seat) => seat.edge === 'bottom').map((seat) => seat.alongEdgeRatio)).toEqual([0.25, 0.75]);
      expect(seats.filter((seat) => seat.edge === 'top').map((seat) => seat.alongEdgeRatio)).toEqual([0.25, 0.75]);
      expect(seats.filter((seat) => seat.edge === 'left').map((seat) => seat.alongEdgeRatio)).toEqual([0.5]);
      expect(seats.filter((seat) => seat.edge === 'right').map((seat) => seat.alongEdgeRatio)).toEqual([0.5]);
    });

    it('seats two along each long edge of a tall screen', () => {
      const seats = makeEdgeDetailSeats(1080, 1920);
      expect(seats).toHaveLength(6);
      expect(seats.filter((seat) => seat.edge === 'left').map((seat) => seat.alongEdgeRatio)).toEqual([0.25, 0.75]);
      expect(seats.filter((seat) => seat.edge === 'right').map((seat) => seat.alongEdgeRatio)).toEqual([0.25, 0.75]);
      expect(seats.filter((seat) => seat.edge === 'bottom').map((seat) => seat.alongEdgeRatio)).toEqual([0.5]);
    });

    it('splits from exactly one and a half times as long', () => {
      expect(makeEdgeDetailSeats(1500, 1000)).toHaveLength(6);
      expect(makeEdgeDetailSeats(1499, 1000)).toHaveLength(4);
    });

    it('seats one per edge when the screen has no size to speak of', () => {
      expect(makeEdgeDetailSeats(0, 0)).toHaveLength(4);
    });

    it('compares seats by what they say, not by which array they came from', () => {
      expect(sameEdgeDetailSeats(makeEdgeDetailSeats(1920, 1080), makeEdgeDetailSeats(1900, 1070))).toBe(true);
      expect(sameEdgeDetailSeats(makeEdgeDetailSeats(1920, 1080), makeEdgeDetailSeats(1000, 900))).toBe(false);
    });
  });

  describe('placing one detail', () => {
    const viewportWidth = 1000;
    const viewportHeight = 900;
    const panelWidth = 250;
    const panelHeight = 180;
    const seatOn = (edge: EdgeDetailSeat['edge']) =>
      makeEdgeDetailSeats(viewportWidth, viewportHeight).find((seat) => seat.edge === edge)!;

    it('keeps the bottom detail inset from the bottom and centred across', () => {
      const box = visualBox(seatOn('bottom'), panelWidth, panelHeight, viewportWidth, viewportHeight);
      expect(box.bottom).toBeCloseTo(viewportHeight - EDGE_DETAIL_INSET_PX);
      expect((box.left + box.right) / 2).toBeCloseTo(viewportWidth / 2);
      expect(box.right - box.left).toBeCloseTo(panelWidth);
    });

    it('keeps the top detail inset from the top', () => {
      const box = visualBox(seatOn('top'), panelWidth, panelHeight, viewportWidth, viewportHeight);
      expect(box.top).toBeCloseTo(EDGE_DETAIL_INSET_PX);
      expect((box.left + box.right) / 2).toBeCloseTo(viewportWidth / 2);
    });

    it('lays the left detail on its side, inset from the left', () => {
      const box = visualBox(seatOn('left'), panelWidth, panelHeight, viewportWidth, viewportHeight);
      expect(box.left).toBeCloseTo(EDGE_DETAIL_INSET_PX);
      expect((box.top + box.bottom) / 2).toBeCloseTo(viewportHeight / 2);
      expect(box.right - box.left).toBeCloseTo(panelHeight);
      expect(box.bottom - box.top).toBeCloseTo(panelWidth);
    });

    it('lays the right detail on its side, inset from the right', () => {
      const box = visualBox(seatOn('right'), panelWidth, panelHeight, viewportWidth, viewportHeight);
      expect(box.right).toBeCloseTo(viewportWidth - EDGE_DETAIL_INSET_PX);
      expect((box.top + box.bottom) / 2).toBeCloseTo(viewportHeight / 2);
    });

    it('puts each of two details on the middle of its half of the edge', () => {
      const [near, far] = makeEdgeDetailSeats(1920, 1080).filter((seat) => seat.edge === 'bottom');
      const nearBox = visualBox(near, panelWidth, panelHeight, 1920, 1080);
      const farBox = visualBox(far, panelWidth, panelHeight, 1920, 1080);
      expect((nearBox.left + nearBox.right) / 2).toBeCloseTo(1920 * 0.25);
      expect((farBox.left + farBox.right) / 2).toBeCloseTo(1920 * 0.75);
      expect(nearBox.bottom).toBeCloseTo(1080 - EDGE_DETAIL_INSET_PX);
    });
  });

  describe('a detail larger than the screen', () => {
    it('centres it along the edge, hanging over both ends evenly', () => {
      const seat = makeEdgeDetailSeats(600, 500)[0];
      const box = visualBox(seat, 900, 200, 600, 500);
      expect(box.left).toBeCloseTo(-150);
      expect(600 - box.right).toBeCloseTo(-150);
    });

    it('centres it across the edge instead of pinning it to one side', () => {
      const seat = makeEdgeDetailSeats(600, 500)[0];
      const box = visualBox(seat, 200, 480, 600, 500);
      expect(box.top).toBeCloseTo(10);
      expect(500 - box.bottom).toBeCloseTo(10);
    });

    it('centres it on both axes when neither fits', () => {
      const seat = makeEdgeDetailSeats(600, 500)[0];
      const box = visualBox(seat, 900, 700, 600, 500);
      expect((box.left + box.right) / 2).toBeCloseTo(300);
      expect((box.top + box.bottom) / 2).toBeCloseTo(250);
    });
  });
});
