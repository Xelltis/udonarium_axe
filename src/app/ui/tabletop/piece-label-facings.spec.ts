import { pieceLabelFacings } from '@axe/ui/tabletop/piece-label-facings';

describe('the labels hung round a piece', () => {
  const rotation = { x: 50, y: 0, z: 90 };

  it('lifts a label in the 3D view and moves it up the screen in the flat view', () => {
    const lifted = pieceLabelFacings({ mode2d: () => false, widthPx: () => 50 }).orbit(30, 60);
    const moved = pieceLabelFacings({ mode2d: () => true, widthPx: () => 50 }).orbit(30, 60);

    expect(lifted(rotation)).toBe('translateY(-30px)');
    expect(moved(rotation)).toBe('translateX(-60.00px) translateZ(-0.00px)');
  });

  it('hangs a label from the middle of the piece’s ground', () => {
    const labels = pieceLabelFacings({ mode2d: () => false, widthPx: () => 100 });

    expect(labels.stand(() => 'rotateX(10deg)')(rotation)).toBe('translateX(-50%) translateX(50px) rotateX(10deg)');
  });

  it('reads the piece as each facing is asked for, so a piece grown since is hung from its new middle', () => {
    let width = 50;
    const labels = pieceLabelFacings({ mode2d: () => false, widthPx: () => width });
    const before = labels.stand(() => '');

    width = 150;

    expect(before(null)).toBe('translateX(-50%) translateX(25px) ');
    expect(labels.stand(() => '')(null)).toBe('translateX(-50%) translateX(75px) ');
  });
});
