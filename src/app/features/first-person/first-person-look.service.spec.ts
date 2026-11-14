import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MotionService } from '@axe/application/ui/motion.service';
import type { FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { LOOK_PITCH_LIMIT_DEG, LOOK_REST, lookEased } from '@axe/domain/tabletop/first-person/first-person-look';
import {
  FirstPersonLookService,
  LOOK_DRAG_THRESHOLD_PX,
  LOOK_RETURN_MS,
} from '@axe/features/first-person/first-person-look.service';

describe('FirstPersonLookService', () => {
  const DEG_PER_PX = 0.5;
  const piece = signal<{ identifier: string } | null>({ identifier: 'hero' });
  const pose = signal<FirstPersonPose | null>({ x: 0, y: 0, z: 0, yaw: 0 });
  const motion = signal(false);
  const lookAround = vi.fn();
  let look: FirstPersonLookService;
  let view: HTMLElement;

  /** A pointer event of the view as the service reads it. */
  function pointer(x: number, y: number, overrides: Partial<PointerEvent> = {}): PointerEvent {
    return {
      isPrimary: true,
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      target: view,
      currentTarget: view,
      ...overrides,
    } as unknown as PointerEvent;
  }

  /** Presses at a point and drags past the threshold, then on by the pixels given. */
  function dragBy(dx: number, dy: number): void {
    look.press(pointer(100, 100));
    look.drag(pointer(100 + LOOK_DRAG_THRESHOLD_PX, 100), DEG_PER_PX);
    look.drag(pointer(100 + LOOK_DRAG_THRESHOLD_PX + dx, 100 + dy), DEG_PER_PX);
  }

  beforeEach(() => {
    piece.set({ identifier: 'hero' });
    pose.set({ x: 0, y: 0, z: 0, yaw: 0 });
    motion.set(false);
    lookAround.mockClear();
    view = document.createElement('div');
    TestBed.configureTestingModule({
      providers: [
        FirstPersonLookService,
        { provide: FirstPersonService, useValue: { piece, pose, lookAround } },
        { provide: MotionService, useValue: { enabled: motion } },
      ],
    });
    look = TestBed.inject(FirstPersonLookService);
    TestBed.tick();
    lookAround.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('telling a look from a click', () => {
    it('leaves a press that moves less than the threshold a click', () => {
      look.press(pointer(100, 100));
      look.drag(pointer(100 + LOOK_DRAG_THRESHOLD_PX - 1, 100), DEG_PER_PX);

      expect(look.dragging()).toBe(false);
      expect(look.look()).toEqual(LOOK_REST);
      expect(look.away()).toBe(false);
      expect(look.takeClickAsLook()).toBe(false);
      expect(lookAround).not.toHaveBeenCalled();
    });

    it('becomes a look at the threshold, measured from where it was crossed', () => {
      look.press(pointer(100, 100));
      look.drag(pointer(100, 100 + LOOK_DRAG_THRESHOLD_PX), DEG_PER_PX);

      expect(look.dragging()).toBe(true);
      expect(look.away()).toBe(true);
      expect(look.look()).toEqual(LOOK_REST);
      expect(lookAround).toHaveBeenLastCalledWith(true);
    });

    it('turns towards where the pointer goes and tips up as it goes up, by the degrees for each pixel', () => {
      dragBy(20, -10);

      expect(look.look()).toEqual({ yaw: 10, pitch: 5 });
    });

    it('tips no further than short of straight up', () => {
      dragBy(0, -1000);

      expect(look.look().pitch).toBe(LOOK_PITCH_LIMIT_DEG);
    });

    it('swallows the click that ends a look, once', () => {
      dragBy(20, 0);
      look.letGo(pointer(128, 100));

      expect(look.takeClickAsLook()).toBe(true);
      expect(look.takeClickAsLook()).toBe(false);
    });

    it('forgets a look’s click at the next press', () => {
      dragBy(20, 0);
      look.letGo();

      look.press(pointer(50, 50));

      expect(look.takeClickAsLook()).toBe(false);
    });
  });

  describe('the presses left alone', () => {
    it('leaves a press on a control to the control', () => {
      const button = document.createElement('button');
      view.append(button);

      look.press(pointer(100, 100, { target: button }));
      look.drag(pointer(200, 100), DEG_PER_PX);

      expect(look.dragging()).toBe(false);
    });

    it('leaves any but the main button of a mouse, and any but the first finger', () => {
      look.press(pointer(100, 100, { button: 2 }));
      look.drag(pointer(200, 100), DEG_PER_PX);
      expect(look.dragging()).toBe(false);

      look.press(pointer(100, 100, { isPrimary: false, pointerType: 'touch' }));
      look.drag(pointer(200, 100), DEG_PER_PX);
      expect(look.dragging()).toBe(false);
    });

    it('takes no heed of another pointer while one is pressed', () => {
      look.press(pointer(100, 100));

      look.drag(pointer(300, 100, { pointerId: 2 }), DEG_PER_PX);
      expect(look.dragging()).toBe(false);

      look.drag(pointer(100 + LOOK_DRAG_THRESHOLD_PX, 100), DEG_PER_PX);
      look.letGo(pointer(0, 0, { pointerId: 2 }));
      expect(look.dragging()).toBe(true);
    });
  });

  describe('letting go', () => {
    it('leaves the view where it was dragged to', () => {
      dragBy(20, -10);

      look.letGo(pointer(128, 90));

      expect(look.dragging()).toBe(false);
      expect(look.look()).toEqual({ yaw: 10, pitch: 5 });
      expect(look.away()).toBe(true);
    });

    it('lets go when the pointer comes back with nothing held', () => {
      dragBy(20, 0);

      look.drag(pointer(400, 100, { buttons: 0 }), DEG_PER_PX);

      expect(look.dragging()).toBe(false);
      expect(look.look()).toEqual({ yaw: 10, pitch: 0 });
    });

    it('goes on from where the view was left at the next drag', () => {
      dragBy(20, 0);
      look.letGo();

      dragBy(10, 0);

      expect(look.look()).toEqual({ yaw: 15, pitch: 0 });
    });
  });

  describe('going back to where the piece faces', () => {
    it('goes back at once where motion is turned down, and stops drawing the sight all round', () => {
      dragBy(20, -10);
      look.letGo();

      look.release();

      expect(look.look()).toEqual(LOOK_REST);
      expect(look.away()).toBe(false);
      expect(lookAround).toHaveBeenLastCalledWith(false);
    });

    it('eases back over the return time where motion is on, the short way round', () => {
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((step) => frames.push(step));
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      motion.set(true);
      look.lookTo({ yaw: 350, pitch: 20 });

      look.release();
      expect(look.look()).toEqual({ yaw: -10, pitch: 20 });

      frames.shift()!(1000 + LOOK_RETURN_MS / 2);
      expect(look.look()).toEqual(lookEased({ yaw: -10, pitch: 20 }, 0.5));
      expect(look.away()).toBe(true);

      frames.shift()!(1000 + LOOK_RETURN_MS);
      expect(look.look()).toEqual(LOOK_REST);
      expect(lookAround).toHaveBeenLastCalledWith(false);
      expect(frames).toHaveLength(0);
    });

    it('drops the way back when the view is dragged again before it arrives', () => {
      const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(77);
      motion.set(true);
      look.lookTo({ yaw: 40, pitch: 0 });
      look.release();

      look.lookTo({ yaw: 25, pitch: 0 });

      expect(cancel).toHaveBeenCalledWith(77);
      expect(look.look()).toEqual({ yaw: 25, pitch: 0 });
    });

    it('goes back once the piece moves or turns', () => {
      dragBy(20, 0);
      look.letGo();

      pose.set({ x: 1, y: 0, z: 0, yaw: 0 });
      TestBed.tick();

      expect(look.look()).toEqual(LOOK_REST);
    });

    it('stays where it is dragged while the piece moves under a drag', () => {
      dragBy(20, 0);

      pose.set({ x: 1, y: 0, z: 0, yaw: 0 });
      TestBed.tick();

      expect(look.look()).toEqual({ yaw: 10, pitch: 0 });
      expect(look.dragging()).toBe(true);
    });

    it('starts level and ahead, with no press held, on looking out of another piece', () => {
      dragBy(20, -10);

      piece.set({ identifier: 'rogue' });
      TestBed.tick();

      expect(look.look()).toEqual(LOOK_REST);
      expect(look.dragging()).toBe(false);
      look.drag(pointer(300, 100), DEG_PER_PX);
      expect(look.dragging()).toBe(false);
    });

    it('drops a drag under way and goes back when asked to look ahead', () => {
      dragBy(20, -10);

      look.lookAhead();

      expect(look.dragging()).toBe(false);
      expect(look.look()).toEqual(LOOK_REST);
    });
  });
});
