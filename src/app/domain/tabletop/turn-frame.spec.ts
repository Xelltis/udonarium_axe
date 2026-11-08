import { seenLinePath, TURN_FRAME_MARGIN_PX, type TurnFoot, turnFrame } from '@axe/domain/tabletop/turn-frame';

const FOOT: TurnFoot = { left: 100, top: 200, width: 100, depth: 50, pivot: { x: 150, y: 225 }, rotateDeg: 0 };

describe('the frame that turns a thing, drawn round its foot', () => {
  it('runs a margin outside the foot, as wide and deep as the foot and the margin round it', () => {
    const frame = turnFrame(FOOT);
    const margin = TURN_FRAME_MARGIN_PX;

    expect([frame.width, frame.depth]).toEqual([100 + 2 * margin, 50 + 2 * margin]);
    expect(frame.corners).toEqual([
      { x: 100 - margin, y: 200 - margin },
      { x: 200 + margin, y: 200 - margin },
      { x: 200 + margin, y: 250 + margin },
      { x: 100 - margin, y: 250 + margin },
    ]);
  });

  it('turns with the thing about the point the thing turns about', () => {
    const frame = turnFrame({ ...FOOT, rotateDeg: 90 });
    const front = frame.faceOf(frame.front);

    // Turned a quarter clockwise about its middle, the front edge, below the middle, comes round to its left.
    expect(front.x).toBeCloseTo(150 - 25 - TURN_FRAME_MARGIN_PX);
    expect(front.y).toBeCloseTo(225);
  });

  it('turns about a pivot of its own, as a note turns about the middle of its lower edge', () => {
    const note: TurnFoot = { left: 0, top: -50, width: 100, depth: 50, pivot: { x: 50, y: 0 }, rotateDeg: 180 };
    const frame = turnFrame(note);
    const back = frame.faceOf({ x: frame.width / 2, y: 0 });

    expect(back.x).toBeCloseTo(50);
    expect(back.y).toBeCloseTo(50 + TURN_FRAME_MARGIN_PX);
  });

  it('draws its line round the whole box, from the middle of its front edge, keeping inside the box', () => {
    const frame = turnFrame(FOOT);

    expect(frame.line[0]).toEqual(frame.front);
    expect(frame.line.length).toBeGreaterThan(60);
    for (const point of frame.line) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.x).toBeLessThanOrEqual(frame.width + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(-1e-9);
      expect(point.y).toBeLessThanOrEqual(frame.depth + 1e-9);
    }
    expect(frame.line.some((point) => point.y === 0)).toBe(true);
  });

  it('puts its knobs on the box’s own corners, round from its top left, where they lie on the face', () => {
    const frame = turnFrame(FOOT);

    expect(frame.knobs).toEqual([
      { x: 0, y: 0 },
      { x: frame.width, y: 0 },
      { x: frame.width, y: frame.depth },
      { x: 0, y: frame.depth },
    ]);
    expect(frame.knobs.map((knob) => frame.faceOf(knob))).toEqual(frame.corners);
  });
});

describe('the path of what is seen of a line', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('closes the whole line where every point is seen', () => {
    expect(seenLinePath(square, [true, true, true, true])).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
  });

  it('draws each run of seen points on its own, round past the end, and leaves out a point seen alone', () => {
    expect(seenLinePath(square, [true, false, true, true])).toBe('M 10 10 L 0 10 L 0 0');
    expect(seenLinePath(square, [false, true, false, false])).toBe('');
  });
});
