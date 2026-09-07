import { TestBed } from '@angular/core/testing';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { GameTableGestureService } from '@axe/features/tabletop/game-table/game-table-gesture.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableGestureService', () => {
  let service: GameTableGestureService;
  let gameTableEl: HTMLElement;

  const callSetTransform = (rX: number, rY: number, rZ: number): void => {
    service.setTransform(0, 0, 0, rX, rY, rZ);
  };

  /** The view is written out on the next frame, so a test that reads it waits for one. */
  const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, GameTableGestureService],
    });
    service = TestBed.inject(GameTableGestureService);
    gameTableEl = document.createElement('div');
    (service as unknown as { gameTableEl: HTMLElement }).gameTableEl = gameTableEl;
  });

  describe('tiltLocked', () => {
    it('adds the tilt while it is unlocked', () => {
      service.viewRotateX = 50;
      service.tiltLocked = false;
      callSetTransform(10, 0, 0);
      expect(service.viewRotateX).toBe(60);
    });

    it('ignores the tilt and holds the view flat while it is locked', () => {
      service.viewRotateX = 50;
      service.tiltLocked = true;
      callSetTransform(10, 0, 0);
      expect(service.viewRotateX).toBe(0);
    });

    it('snaps the tilt back to nothing when the view is reset while locked', () => {
      service.viewRotateX = 35;
      service.viewRotateY = 12;
      service.tiltLocked = true;
      callSetTransform(0, 0, 0);
      expect(service.viewRotateX).toBe(0);
      expect(service.viewRotateY).toBe(0);
    });

    it('still turns about the vertical while locked', () => {
      service.viewRotateZ = 10;
      service.tiltLocked = true;
      callSetTransform(0, 0, 30);
      expect(service.viewRotateZ).toBe(40);
    });
  });

  describe('orthographicProjection', () => {
    it('keeps the perspective transform unchanged by default', async () => {
      service.viewPositionZ = -3000;
      callSetTransform(0, 0, 0);
      await nextFrame();

      expect(gameTableEl.style.transform).not.toContain('scale(');
      expect(gameTableEl.style.transform).toContain('translateZ(-3000.0000px)');
    });

    it('replaces perspective zoom with an equivalent scale', async () => {
      service.viewPositionZ = -3000;
      service.orthographicProjection = true;
      callSetTransform(0, 0, 0);
      await nextFrame();

      expect(gameTableEl.style.transform).toContain('scale(0.500000)');
      expect(gameTableEl.style.transform).toContain('translateZ(-3000.0000px)');
    });
  });

  describe('showing the view', () => {
    it('writes it out once for a run of moves, on the frame after them', async () => {
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      expect(gameTableEl.style.transform).toBe('');

      await nextFrame();

      expect(service.viewRotateZ).toBe(40);
      expect(gameTableEl.style.transform).toContain('rotateZ(40.0000deg)');
    });

    it('tells the table which way it faces once for that run', async () => {
      const rotation = TestBed.inject(UiSignalService).tableViewRotation;
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      await nextFrame();

      expect(rotation()).toEqual({ x: 50, y: 0, z: 30 });
    });

    it('says nothing about the way it faces when the view was only slid', async () => {
      const rotation = TestBed.inject(UiSignalService).tableViewRotation;
      service.setTransform(40, 0, 0, 0, 0, 0);
      await nextFrame();

      expect(gameTableEl.style.transform).toContain('translateX(140.0000px)');
      expect(rotation()).toBeNull();
    });

    it('lets go of the gestures it listens with when the table goes', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      service.initialize(
        root,
        gameTableEl,
        document.createElement('div'),
        document.createElement('canvas'),
        () => true
      );
      service.isTableTransformMode = true;
      expect(root.style.touchAction).toBe('none');

      root.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, cancelable: true }));
      const zoomed = service.viewPositionZ;
      expect(zoomed).not.toBe(0);

      service.destroy();
      root.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, cancelable: true }));

      expect(service.viewPositionZ).toBe(zoomed);
      expect(root.style.touchAction).toBe('');
      root.remove();
    });

    it('drops a frame it was still waiting for when the table goes', async () => {
      callSetTransform(0, 0, 10);
      service.destroy();
      await nextFrame();

      expect(gameTableEl.style.transform).toBe('');
    });
  });

  describe('viewLocked', () => {
    /** What a drag or a pinch on the board arrives as. */
    const dragTable = (tX: number, tY: number, tZ: number, rZ: number): void => {
      service.isTableTransformMode = true;
      const gesture = service as unknown as {
        onTableTouchTransform(
          tX: number,
          tY: number,
          tZ: number,
          rX: number,
          rY: number,
          rZ: number,
          event: unknown,
          srcEvent: unknown
        ): void;
        onTableMouseTransform(
          tX: number,
          tY: number,
          tZ: number,
          rX: number,
          rY: number,
          rZ: number,
          event: unknown,
          srcEvent: unknown
        ): void;
      };
      const srcEvent = { cancelable: false, preventDefault: () => undefined };
      gesture.onTableTouchTransform(tX, tY, tZ, 0, 0, rZ, {}, srcEvent);
      gesture.onTableMouseTransform(tX, tY, tZ, 0, 0, rZ, {}, srcEvent);
    };

    beforeEach(() => {
      // The gestures only answer to the board itself, never to a focused field.
      document.body.focus();
    });

    it('moves the view while it is unlocked', () => {
      dragTable(40, 30, -20, 15);

      expect(service.viewPositionX).not.toBe(100);
      expect(service.viewPositionY).not.toBe(0);
      expect(service.viewRotateZ).not.toBe(10);
    });

    it('holds the view still against panning, zooming and turning', () => {
      service.viewLocked = true;
      const before = {
        x: service.viewPositionX,
        y: service.viewPositionY,
        z: service.viewPositionZ,
        rotateZ: service.viewRotateZ,
      };

      dragTable(40, 30, -20, 15);

      expect(service.viewPositionX).toBe(before.x);
      expect(service.viewPositionY).toBe(before.y);
      expect(service.viewPositionZ).toBe(before.z);
      expect(service.viewRotateZ).toBe(before.rotateZ);
    });

    it('still lets the view be set outright, which is how real size is reached', () => {
      service.viewLocked = true;

      service.snapToViewPositionZ(1155);

      expect(service.viewPositionZ).toBe(1155);
    });
  });

  describe('snapToViewPositionZ', () => {
    it('lands on the depth asked for, wherever the camera was', () => {
      service.viewPositionZ = -800;

      service.snapToViewPositionZ(1155);

      expect(service.viewPositionZ).toBe(1155);
    });

    it('goes past the zoom the gestures stop at, which real size needs', async () => {
      service.orthographicProjection = true;

      // 3000 * (1 - 1/1.626), the depth one inch per square asks for on a 4K panel.
      service.snapToViewPositionZ(1155.0);
      await nextFrame();

      expect(gameTableEl.style.transform).toContain('scale(1.626016)');
    });
  });
});
