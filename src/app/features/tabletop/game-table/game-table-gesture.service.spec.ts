import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BackdropFrameService } from '@axe/application/ui/backdrop-frame.service';
import { type MarqueeRect, SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { orthographicScale } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { SwitchNoticeService } from '@axe/features/tabletop/board-switch/switch-notice.service';
import { SwitchPressService } from '@axe/features/tabletop/board-switch/switch-press.service';
import {
  GameTableGestureService,
  MOUSE_ZOOM_MAX_Z,
  mouseZoomInLimitZ,
  touchZoomInLimitZ,
  ZOOM_MIN_Z,
  zoomOutLimitZ,
  zoomReachFor,
  zoomStepFor,
} from '@axe/features/tabletop/game-table/game-table-gesture.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableGestureService', () => {
  let service: GameTableGestureService;
  let rootEl: HTMLElement;

  /** The view the table was last drawn with. */
  const shown = () => TestBed.inject(TableCameraService).view;

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
    rootEl = document.createElement('div');
    (service as unknown as { rootEl: HTMLElement }).rootEl = rootEl;
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
    it('draws the table in perspective by default', async () => {
      service.viewPositionZ = -3000;
      callSetTransform(0, 0, 0);
      await nextFrame();

      expect(shown()).toMatchObject({ positionZ: -3000, orthographic: false });
    });

    it('draws it without perspective once asked, the push back standing in as a scale', async () => {
      service.viewPositionZ = -3000;
      service.orthographicProjection = true;
      callSetTransform(0, 0, 0);
      await nextFrame();

      expect(shown()).toMatchObject({ positionZ: -3000, orthographic: true });
      expect(orthographicScale(shown()!.positionZ)).toBe(0.5);
    });
  });

  describe('showing the view', () => {
    it('writes it out once for a run of moves, on the frame after them', async () => {
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      expect(shown()).toBeNull();

      await nextFrame();

      expect(service.viewRotateZ).toBe(40);
      expect(shown()?.rotateZ).toBe(40);
    });

    it('tells the table which way it faces once for that run', async () => {
      const rotation = TestBed.inject(UiSignalService).tableViewRotation;
      callSetTransform(0, 0, 10);
      callSetTransform(0, 0, 10);
      await nextFrame();

      expect(rotation()).toEqual({ x: 50, y: 0, z: 30 });
    });

    it('writes where the camera stands to the table, in the frame the table moves in', async () => {
      service.setTransform(40, 0, 0, 0, 0, 0);
      expect(rootEl.dataset['camera']).toBeUndefined();

      await nextFrame();

      expect(rootEl.dataset['camera']).toBe('140.0000,0.0000,0.0000,50.0000,0.0000,10.0000,0');
    });

    it('says nothing about the way it faces when the view was only slid', async () => {
      const rotation = TestBed.inject(UiSignalService).tableViewRotation;
      service.setTransform(40, 0, 0, 0, 0, 0);
      await nextFrame();

      expect(shown()?.positionX).toBe(140);
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
      service.initialize(root, () => true);
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

    it('forgets the piece a finger last pressed on a tap on the bare table, and not on one on a piece', () => {
      const root = document.createElement('div');
      const piece = document.createElement('div');
      root.appendChild(piece);
      document.body.appendChild(root);
      service.initialize(root, () => true);
      const selection = TestBed.inject(SelectionSignalService);
      const tap = (on: HTMLElement, pointerId: number) => {
        const at = { bubbles: true, pointerId, pointerType: 'touch', clientX: 10, clientY: 10 };
        on.dispatchEvent(new PointerEvent('pointerdown', at));
        on.dispatchEvent(new PointerEvent('pointerup', at));
      };

      try {
        selection.pressObject('touched', 'GameCharacter', true);
        tap(piece, 1);
        expect(selection.touchedObject()).toBe('touched');

        tap(root, 2);
        expect(selection.touchedObject()).toBeNull();

        const passthrough = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        passthrough.setAttribute('data-table-passthrough', '');
        piece.appendChild(passthrough);
        selection.pressObject('touched', 'GameCharacter', true);
        tap(passthrough as unknown as HTMLElement, 3);
        expect(selection.touchedObject()).toBeNull();
      } finally {
        service.destroy();
        root.remove();
      }
    });

    it('keeps the piece a finger last pressed once a marquee adding to the selection takes it in, whichever it meets first', () => {
      const selection = TestBed.inject(SelectionSignalService);
      const pieceAt = (name: string, x: number) =>
        ({
          identifier: name,
          aliasName: 'character',
          location: { name: 'table', x, y: 0 },
        }) as unknown as TabletopObject;
      vi.spyOn(
        service as unknown as { collectSelectableObjects(): TabletopObject[] },
        'collectSelectableObjects'
      ).mockReturnValue([pieceAt('other', 0), pieceAt('touched', 100)]);
      const end = (modifiers: { shift: boolean; ctrl: boolean; touch: boolean }) =>
        (service as unknown as { onMarqueeEnd(rect: MarqueeRect, modifiers: unknown): void }).onMarqueeEnd(
          { x1: -10, y1: -10, x2: 300, y2: 300 },
          modifiers
        );

      selection.pressObject('touched', 'character', true);
      end({ shift: true, ctrl: false, touch: false });
      expect([...selection.selectedObjects()]).toEqual(['other', 'touched']);
      expect(selection.touchedObject()).toBe('touched');

      end({ shift: false, ctrl: true, touch: false });
      expect(selection.selectedObjects().size).toBe(0);
      expect(selection.touchedObject()).toBeNull();
    });

    it('takes no piece kept from this reader’s sight into a drawn box, nor a part drawn as its body', () => {
      const seen = GameCharacter.create('勇者', 1, '');
      const hidden = GameCharacter.create('潜む魔物', 1, '');
      const head = GameCharacter.create('頭', 1, '');
      for (const piece of [seen, hidden, head]) piece.setLocation('table');
      head.ridingOn = seen.identifier;
      head.rideSeat = 'part';
      vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((piece) => piece !== hidden);
      try {
        const taken = (
          service as unknown as { collectSelectableObjects(): TabletopObject[] }
        ).collectSelectableObjects();

        expect(taken).toContain(seen);
        expect(taken).not.toContain(hidden);
        expect(taken).not.toContain(head);
      } finally {
        for (const piece of [head, hidden, seen]) piece.destroy();
      }
    });

    it('hands a marquee waiting on a press where the pointer went, and stops once the table goes', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      service.initialize(root, () => true);
      const follow = vi.fn();
      const marquee = (service as unknown as { marqueeGesture: { isArmed: boolean; follow: unknown } }).marqueeGesture;
      Object.defineProperty(marquee, 'isArmed', { get: () => true });
      marquee.follow = follow;

      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 40, pointerType: 'pen' }));
      expect(follow).toHaveBeenCalledTimes(1);
      expect(follow.mock.calls[0][0]).toHaveLength(1);
      expect(follow.mock.calls[0][1]).toEqual({ pointerType: 'pen', whole: false });

      service.destroy();
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 40 }));
      expect(follow).toHaveBeenCalledTimes(1);
      root.remove();
    });

    it('drops a frame it was still waiting for when the table goes', async () => {
      callSetTransform(0, 0, 10);
      service.destroy();
      await nextFrame();

      expect(shown()).toBeNull();
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

    it('comes in past life size and stops well short of the eye', () => {
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
    it('goes back far enough to take in the whole of a board too large for the usual limit', () => {
      const layout = { width: 1280, height: 720, boardWidth: 100 * 256, boardHeight: 100 * 256 };
      const furthest = zoomOutLimitZ(256, layout);
      const depth = TABLE_PERSPECTIVE_PX - furthest;

      expect(furthest).toBeLessThan(zoomOutLimitZ(256));
      expect((720 * depth) / TABLE_PERSPECTIVE_PX).toBeGreaterThan(Math.hypot(25600, 25600));
    });

    it('keeps the usual limit over a board it takes in whole from there', () => {
      const layout = { width: 1920, height: 1080, boardWidth: 32 * 50, boardHeight: 20 * 50 };

      expect(zoomOutLimitZ(50, layout)).toBe(ZOOM_MIN_Z);
    });

    it('takes the usual step nearer than the usual limit, and longer ones as far again back past it', () => {
      expect(zoomStepFor(50, 0)).toBe(1);
      expect(zoomStepFor(50, ZOOM_MIN_Z)).toBe(1);
      expect(zoomStepFor(50, ZOOM_MIN_Z * 3 - TABLE_PERSPECTIVE_PX * 2)).toBeCloseTo(3);
    });

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

      expect(orthographicScale(shown()!.positionZ)).toBeCloseTo(1.626016, 6);
    });
  });

  describe('pressing painted ground', () => {
    type Gestures = {
      rootEl: HTMLElement;
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
      gestures.rootEl = floor;
      gestures.getGridShow = () => false;
      vi.spyOn(TestBed.inject(TablePickService), 'landingAt').mockReturnValue({ x: 125, y: 75, z: 0 });
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

    it('holds no marquee ready on a press on the bare table while a piece is followed, as a drag then turns the camera round it', () => {
      const arm = vi.fn(() => true);
      (gestures as unknown as { marqueeGesture: unknown }).marqueeGesture = {
        arm,
        release: () => false,
        cancel: () => undefined,
        isActive: false,
        isArmed: false,
      };
      const following = vi.spyOn(TestBed.inject(ThirdPersonService), 'following').mockReturnValue(true);

      click(floor);
      expect(arm).not.toHaveBeenCalled();
      following.mockReturnValue(false);
      click(floor);
      expect(arm).toHaveBeenCalledTimes(1);
    });

    it('stretches an open marquee to where the move is, rather than where the pointer was last kept', () => {
      const updatePointer = vi.fn();
      (gestures as unknown as { marqueeGesture: unknown }).marqueeGesture = {
        updatePointer,
        isActive: true,
        isArmed: false,
      };
      const move = new MouseEvent('mousemove', { cancelable: true });
      Object.defineProperties(move, { pageX: { value: 140 }, pageY: { value: 90 } });

      (
        gestures as unknown as {
          onTableMouseTransform(...args: unknown[]): void;
        }
      ).onTableMouseTransform(0, 0, 0, 0, 0, 0, {}, move);

      expect(updatePointer).toHaveBeenCalledWith(140, 90);
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
