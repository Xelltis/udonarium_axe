import { TestBed } from '@angular/core/testing';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';

describe('FloorCanvasesService', () => {
  let floors: FloorCanvasesService;

  beforeEach(() => {
    floors = TestBed.inject(FloorCanvasesService);
  });

  function canvas(): HTMLCanvasElement {
    const made = document.createElement('canvas');
    made.width = 200;
    made.height = 100;
    Object.assign(made.style, { left: '30px', top: '40px', width: '100px', height: '50px' });
    return made;
  }

  it('lays a canvas where the page lays it out, at a height over the board', () => {
    const painted = canvas();
    floors.show('move-range', painted, 0.2);

    expect(floors.all()).toEqual([
      { id: 'move-range', canvas: painted, box: { x: 30, y: 40, width: 100, height: 50 }, heightPx: 0.2, revision: 1 },
    ]);
  });

  it('takes a canvas up again with what is painted on it anew, and off the floor once forgotten', () => {
    const painted = canvas();
    floors.show('trigger', painted, 0.1);
    painted.style.left = '60px';
    floors.show('trigger', painted, 0.1);

    expect(floors.all()[0]).toMatchObject({ box: { x: 60 }, revision: 2 });

    floors.forget('trigger');
    expect(floors.all()).toEqual([]);
  });
});
