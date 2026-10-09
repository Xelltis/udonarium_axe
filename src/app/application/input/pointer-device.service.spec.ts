import { ApplicationRef, effect, Injector, signal } from '@angular/core';
import { inject, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';

describe('PointerDeviceService', () => {
  let service: PointerDeviceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PointerDeviceService],
    });

    service = TestBed.inject(PointerDeviceService);
    service.initialize();
  });

  afterEach(() => {
    service.destroy();
  });

  it('should ...', inject([PointerDeviceService], (service: PointerDeviceService) => {
    expect(service).toBeTruthy();
  }));

  it('keeps the last position for a pointer event that carries none', () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 80 }));
    const before = { ...service.pointers[0] };

    document.body.dispatchEvent(new Event('contextmenu', { bubbles: true }));

    expect(service.pointers[0]).toEqual(before);
    expect(Number.isFinite(service.pointers[0].x)).toBe(true);
    expect(Number.isFinite(service.pointers[0].y)).toBe(true);
  });

  it('stops dragging when the button comes up', () => {
    service.isDragging = true;

    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(service.isDragging).toBe(false);
  });

  it('stops dragging on a move with no button held', () => {
    service.isDragging = true;

    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0 }));

    expect(service.isDragging).toBe(false);
  });

  it('stops dragging when the window loses focus', () => {
    service.isDragging = true;

    window.dispatchEvent(new FocusEvent('blur'));

    expect(service.isDragging).toBe(false);
  });

  it('keeps dragging when a field on the page loses focus to the press that started it', () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    try {
      field.focus();
      service.isDragging = true;

      field.blur();

      expect(service.isDragging).toBe(true);
    } finally {
      field.remove();
    }
  });

  it('stops dragging when the page is hidden', () => {
    service.isDragging = true;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(service.isDragging).toBe(false);
  });

  it('does not pick up a dragging dependency from a setter inside an effect', () => {
    const appRef = TestBed.inject(ApplicationRef);
    const injector = TestBed.inject(Injector);
    const trigger = signal(0);
    let runCount = 0;

    const effectRef = effect(
      () => {
        trigger();
        service.isDragging = false;
        runCount++;
      },
      { injector }
    );

    appRef.tick();
    expect(runCount).toBe(1);

    service.isDragging = true;
    appRef.tick();
    expect(runCount).toBe(1);

    trigger.set(1);
    appRef.tick();
    expect(runCount).toBe(2);

    effectRef.destroy();
  });

  describe('a long press', () => {
    interface FakeTouchEvent {
      touches: Touch[];
      targetTouches: Touch[];
      changedTouches: Touch[];
    }

    function touchEvent(type: string, x: number, y: number, target: EventTarget): Event {
      const touch = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y } as unknown as Touch;
      const event = new Event(type, { bubbles: true, cancelable: true });
      const fake = event as unknown as FakeTouchEvent;
      fake.touches = type === 'touchend' ? [] : [touch];
      fake.targetTouches = fake.touches;
      fake.changedTouches = [touch];
      return event;
    }

    let target: HTMLElement;
    let opened: MouseEvent[];

    beforeEach(() => {
      vi.useFakeTimers();
      target = document.createElement('div');
      document.body.appendChild(target);
      opened = [];
      target.addEventListener('contextmenu', (e) => opened.push(e as MouseEvent));
    });

    afterEach(() => {
      vi.useRealTimers();
      target.remove();
    });

    it('opens the context menu when held', () => {
      target.dispatchEvent(touchEvent('touchstart', 50, 60, target));

      expect(opened).toHaveLength(0);
      vi.advanceTimersByTime(500);

      expect(opened).toHaveLength(1);
      expect(opened[0].clientX).toBe(50);
      expect(opened[0].clientY).toBe(60);
    });

    it('does not open when the finger moves', () => {
      target.dispatchEvent(touchEvent('touchstart', 50, 60, target));
      document.body.dispatchEvent(touchEvent('touchmove', 90, 120, target));

      vi.advanceTimersByTime(500);

      expect(opened).toHaveLength(0);
    });

    it('does not open when the finger lifts at once', () => {
      target.dispatchEvent(touchEvent('touchstart', 50, 60, target));
      document.body.dispatchEvent(touchEvent('touchend', 50, 60, target));

      vi.advanceTimersByTime(500);

      expect(opened).toHaveLength(0);
    });

    it('does not open under two fingers', () => {
      const two = touchEvent('touchstart', 50, 60, target);
      const fake = two as unknown as FakeTouchEvent;
      fake.touches = [fake.touches[0], fake.touches[0]];
      target.dispatchEvent(two);

      vi.advanceTimersByTime(500);

      expect(opened).toHaveLength(0);
    });
  });
});
