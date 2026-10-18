import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { BackdropFrameService } from '@axe/application/ui/backdrop-frame.service';
import { SwitchNoticeService } from '@axe/application/ui/switch-notice.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  GameTableGestureService,
  MOUSE_ZOOM_MAX_Z,
  mouseZoomInLimitZ,
  touchZoomInLimitZ,
  ZOOM_MIN_Z,
  zoomOutLimitZ,
  zoomReachFor,
} from '@axe/features/tabletop/game-table/game-table-gesture.service';
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

    it('moves the backdrops for a slide of the view alone, in the frame the table moves in', async () => {
      const backdrops = vi.spyOn(TestBed.inject(BackdropFrameService), 'apply');
      service.setTransform(40, 0, 0, 0, 0, 0);
      await nextFrame();

      expect(backdrops).toHaveBeenCalledWith({ rotateX: 50, rotateZ: 10, positionX: 140, positionY: 0 });
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

  describe('zooming with the wheel and the keys', () => {
    /** One notch of the wheel, which arrives as a step of at most 300 towards or away from the board. */
    const wheel = (tZ: number): void => {
      service.isTableTransformMode = true;
      const gesture = service as unknown as { onTableMouseTransform(...args: unknown[]): void };
      gesture.onTableMouseTransform(0, 0, tZ, 0, 0, 0, {}, { cancelable: false, preventDefault: () => undefined });
    };

    beforeEach(() => {
      document.body.focus();
    });

    it('comes in past life size and stops short of the board passing behind the camera', () => {
      for (let notch = 0; notch < 40; notch++) wheel(180);

      expect(service.viewPositionZ).toBe(MOUSE_ZOOM_MAX_Z);
      expect(MOUSE_ZOOM_MAX_Z).toBeGreaterThan(0);
    });

    it('goes back no further than any other gesture does', () => {
      for (let notch = 0; notch < 40; notch++) wheel(-300);

      expect(service.viewPositionZ).toBe(ZOOM_MIN_Z);
    });

    it('goes back a little further over a table of larger cells', async () => {
      const table = new GameTable();
      table.gridSize = 200;
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));

      for (let notch = 0; notch < 60; notch++) wheel(-300);

      expect(service.viewPositionZ).toBe(zoomOutLimitZ(200));
      expect(zoomOutLimitZ(200)).toBeLessThan(ZOOM_MIN_Z);
      table.destroy();
    });

    it('leaves a view set nearer still where it is, coming in, and lets it back out', () => {
      service.snapToViewPositionZ(MOUSE_ZOOM_MAX_Z + 200);

      wheel(180);
      expect(service.viewPositionZ).toBe(MOUSE_ZOOM_MAX_Z + 200);

      wheel(-180);
      expect(service.viewPositionZ).toBe(MOUSE_ZOOM_MAX_Z + 200 - 540);
    });
  });

  describe('how far the zoom limits follow the size of a cell', () => {
    it('keeps the limits set for the usual cell', () => {
      expect(zoomReachFor(50)).toBe(1);
      expect(zoomOutLimitZ(50)).toBe(ZOOM_MIN_Z);
      expect(mouseZoomInLimitZ(50)).toBe(MOUSE_ZOOM_MAX_Z);
      expect(touchZoomInLimitZ(50)).toBe(0);
    });

    it('follows a little, by the square root, within bounds', () => {
      expect(zoomReachFor(72)).toBeCloseTo(1.2);
      expect(zoomReachFor(256)).toBe(1.5);
      expect(zoomReachFor(16)).toBe(0.75);
      expect(zoomReachFor(Number.NaN)).toBe(1);
    });

    it('lets smaller cells be looked at more closely, short of the plane the camera stands on', () => {
      expect(mouseZoomInLimitZ(25)).toBeGreaterThan(MOUSE_ZOOM_MAX_Z);
      expect(mouseZoomInLimitZ(25)).toBeLessThan(TABLE_PERSPECTIVE_PX);
      expect(touchZoomInLimitZ(25)).toBeGreaterThan(0);
      expect(mouseZoomInLimitZ(200)).toBeLessThan(MOUSE_ZOOM_MAX_Z);
    });
  });

  describe('suspended', () => {
    const srcEvent = { cancelable: true, preventDefault: vi.fn() };

    const moveTable = (tX: number, tY: number, tZ: number, rZ: number): void => {
      service.isTableTransformMode = true;
      const gesture = service as unknown as {
        onTableTouchTransform(...args: unknown[]): void;
        onTableMouseTransform(...args: unknown[]): void;
      };
      gesture.onTableTouchTransform(tX, tY, tZ, 0, 0, rZ, {}, srcEvent);
      gesture.onTableMouseTransform(tX, tY, tZ, 0, 0, rZ, {}, srcEvent);
    };

    beforeEach(() => {
      document.body.focus();
      srcEvent.preventDefault.mockClear();
    });

    it('holds the view still against panning, zooming and turning, from the keys as well', () => {
      service.suspended = true;
      const before = {
        x: service.viewPositionX,
        y: service.viewPositionY,
        z: service.viewPositionZ,
        rotateZ: service.viewRotateZ,
      };

      moveTable(40, 30, -20, 15);

      expect(service.viewPositionX).toBe(before.x);
      expect(service.viewPositionY).toBe(before.y);
      expect(service.viewPositionZ).toBe(before.z);
      expect(service.viewRotateZ).toBe(before.rotateZ);
    });

    it('leaves the key to whatever is showing in place of the table', () => {
      service.suspended = true;

      moveTable(40, 30, -20, 15);

      expect(srcEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('moves the view again once it is let go', () => {
      service.suspended = true;
      service.suspended = false;

      moveTable(40, 30, -20, 15);

      expect(service.viewPositionX).not.toBe(100);
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

  describe('pressing painted ground', () => {
    type Gestures = {
      gameObjectsEl: HTMLElement;
      gridCanvasEl: HTMLCanvasElement;
      getGridShow: () => boolean;
      onTableMouseStart(e: MouseEvent): void;
      onTableMouseEnd(e: MouseEvent): void;
    };
    let gestures: Gestures;
    let press: ReturnType<typeof vi.spyOn>;
    let floor: HTMLElement;

    beforeEach(() => {
      gestures = service as unknown as Gestures;
      floor = document.createElement('div');
      gestures.gameObjectsEl = floor;
      gestures.gridCanvasEl = document.createElement('canvas');
      gestures.getGridShow = () => false;
      vi.spyOn(TestBed.inject(CoordinateService), 'calcTabletopLocalCoordinate').mockReturnValue({
        x: 125,
        y: 75,
        z: 0,
      });
      press = vi.spyOn(TestBed.inject(SwitchPressService), 'pressGroundAt').mockResolvedValue('pressed');
    });

    afterEach(() => vi.restoreAllMocks());

    function click(target: HTMLElement, button = 0): void {
      const event = new MouseEvent('mousedown', { button, clientX: 10, clientY: 10 });
      Object.defineProperty(event, 'target', { value: target });
      gestures.onTableMouseStart(event);
      gestures.onTableMouseEnd(new MouseEvent('mouseup', { button, clientX: 10, clientY: 10 }));
    }

    it('presses the ground under a left click on the bare table', () => {
      click(floor);

      expect(press).toHaveBeenCalledWith(125, 75);
    });

    it('presses nothing after a click that turned the view', () => {
      const event = new MouseEvent('mousedown', { button: 0 });
      Object.defineProperty(event, 'target', { value: floor });
      gestures.onTableMouseStart(event);
      service.isTableTransformed = true;
      gestures.onTableMouseEnd(new MouseEvent('mouseup', { button: 0 }));

      expect(press).not.toHaveBeenCalled();
    });

    it('leaves a click on a block with a switch of its own to the block, and a right click to the menu', () => {
      const block = document.createElement('div');
      block.setAttribute('data-table-passthrough', '');
      block.setAttribute('data-switch-host', '');

      click(block);
      click(floor, 2);

      expect(press).not.toHaveBeenCalled();
    });

    it('says beside the pointer why a press on the ground came to nothing', async () => {
      press.mockResolvedValue('tooFar');
      const show = vi.spyOn(TestBed.inject(SwitchNoticeService), 'show');

      click(floor);
      await Promise.resolve();
      await Promise.resolve();

      expect(show).toHaveBeenCalledWith('もっと近づかないと押せません', 10, 10);
    });
  });
});
