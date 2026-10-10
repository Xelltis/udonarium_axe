import { TestBed } from '@angular/core/testing';
import { BackdropFrameService } from '@axe/application/ui/backdrop-frame.service';
import { BackdropCamera } from '@axe/domain/tabletop/backdrop-offset';

describe('the register of backdrops that follow the camera', () => {
  let frame: BackdropFrameService;
  const byTurn = (camera: BackdropCamera) => `translateX(${-camera.rotateZ}px)`;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    frame = TestBed.inject(BackdropFrameService);
  });

  it('moves a backdrop as it joins, before the camera has moved at all', () => {
    const element = document.createElement('div');

    frame.register(element, byTurn);

    expect(element.style.transform).toBe('translateX(0px)');
  });

  it('moves it for a camera that now stands elsewhere', () => {
    const element = document.createElement('div');
    frame.register(element, byTurn);

    frame.apply({ rotateX: 50, rotateZ: 30, positionX: 0, positionY: 0 });

    expect(element.style.transform).toBe('translateX(-30px)');
  });

  it('leaves it alone when the camera works out to where it already stands', () => {
    const element = document.createElement('div');
    frame.register(element, byTurn);
    frame.apply({ rotateX: 50, rotateZ: 30, positionX: 0, positionY: 0 });
    element.style.transform = 'scale(2)';

    frame.apply({ rotateX: 60, rotateZ: 30, positionX: 100, positionY: 0 });

    expect(element.style.transform).toBe('scale(2)');
  });

  it('moves nothing more once the backdrop is off the register', () => {
    const element = document.createElement('div');
    const release = frame.register(element, byTurn);
    release();

    frame.apply({ rotateX: 50, rotateZ: 90, positionX: 0, positionY: 0 });

    expect(element.style.transform).toBe('translateX(0px)');
  });

  it('moves a latecomer for the way the camera already stands', () => {
    frame.apply({ rotateX: 50, rotateZ: 45, positionX: 0, positionY: 0 });
    const element = document.createElement('div');

    frame.register(element, byTurn);

    expect(element.style.transform).toBe('translateX(-45px)');
  });
});
