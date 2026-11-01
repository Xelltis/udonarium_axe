import { surfaceCrossing } from '@axe/domain/tabletop/surface-space';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';

describe('white board frame', () => {
  let board: WhiteBoard;

  beforeEach(() => {
    board = new WhiteBoard();
    board.initialize();
    board.location = { name: 'table', x: 100, y: 200 };
    board.width = 4;
    board.height = 3;
  });

  afterEach(() => board.destroy());

  function at(x: number, y: number) {
    const frame = whiteBoardFrame(board, 50);
    return {
      x: frame.origin.x + frame.u.x * x + frame.v.x * y,
      y: frame.origin.y + frame.u.y * x + frame.v.y * y,
      z: frame.origin.z + frame.u.z * x + frame.v.z * y,
    };
  }

  it('lies flat where it stands, facing up, at a pitch of nothing', () => {
    const frame = whiteBoardFrame(board, 50);
    expect(frame.origin.x).toBeCloseTo(100, 9);
    expect(frame.origin.y).toBeCloseTo(200, 9);
    expect(frame.normal.z).toBeCloseTo(1, 9);
    expect(at(200, 150).x).toBeCloseTo(300, 9);
    expect(at(200, 150).y).toBeCloseTo(350, 9);
  });

  it('stands upright on its foot at ninety, with its top as high as it is tall', () => {
    board.pitch = 90;
    const top = at(0, 0);
    const foot = at(0, 150);
    expect(foot.y).toBeCloseTo(350, 9);
    expect(foot.z).toBeCloseTo(0, 9);
    expect(top.y).toBeCloseTo(350, 9);
    expect(top.z).toBeCloseTo(150, 9);
  });

  it('turns about the middle of its foot', () => {
    board.rotate = 90;
    // The foot's middle stays put; the far end of the foot swings from east of it to south of it.
    expect(at(100, 150).x).toBeCloseTo(200, 9);
    expect(at(100, 150).y).toBeCloseTo(350, 9);
    expect(at(200, 150).x).toBeCloseTo(200, 9);
    expect(at(200, 150).y).toBeCloseTo(450, 9);
  });

  it('gives the point of its face a line of sight crosses, in the face’s own axes', () => {
    board.pitch = 60;
    board.rotate = 30;
    const target = at(120, 40);
    const crossing = surfaceCrossing(
      whiteBoardFrame(board, 50),
      { x: target.x, y: target.y + 500, z: target.z + 900 },
      (() => {
        const d = { x: 0, y: -500, z: -900 };
        const length = Math.hypot(d.x, d.y, d.z);
        return { x: d.x / length, y: d.y / length, z: d.z / length };
      })()
    )!;
    expect(crossing.localX).toBeCloseTo(120, 6);
    expect(crossing.localY).toBeCloseTo(40, 6);
  });
});
