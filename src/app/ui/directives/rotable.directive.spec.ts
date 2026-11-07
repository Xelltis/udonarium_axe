import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { isPressTaken } from '@axe/ui/directives/movable-interaction';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { vi } from 'vitest';

@Component({
  selector: 'test-host',
  template: `<div appRotable [rotable.option]="rotableOption" [rotable.refuseTouch]="refuseTouch()"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RotableDirective],
})
class TestHostComponent {
  rotableOption = {};
  readonly refuseTouch = signal(false);
}

@Component({
  selector: 'test-nested-host',
  template: `<div appRotable class="outer">
    <div class="rotate-grab own"></div>
    <div appRotable class="inner"><div class="rotate-grab inner-grab"></div></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RotableDirective],
})
class NestedHostComponent {}

describe('RotableDirective', () => {
  it('takes no press on a handle of a directive standing inside it, which is that one’s to take', () => {
    TestBed.configureTestingModule({ imports: [NestedHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(NestedHostComponent);
    fixture.detectChanges();
    const outer = fixture.debugElement.children[0].injector.get(RotableDirective);
    const root = fixture.nativeElement as HTMLElement;
    const allowed = (grab: string) => {
      (outer as unknown as Record<string, unknown>)['grabbingElement'] = root.querySelector(grab);
      return (outer as unknown as { isAllowedToRotate: boolean }).isAllowedToRotate;
    };

    expect(allowed('.own')).toBe(true);
    expect(allowed('.inner-grab')).toBe(false);
  });

  it('should be defined', () => {
    expect(RotableDirective).toBeDefined();
  });

  describe('with no tabletop object set', () => {
    let fixture: ComponentFixture<TestHostComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
    });

    beforeEach(() => {
      fixture = TestBed.createComponent(TestHostComponent);
    });

    it('builds without a tabletop object', () => {
      expect(() => fixture.detectChanges()).not.toThrow();
    });

    it('registers the update handler safely with no tabletop object', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(RotableDirective);
      expect(directive['tabletopObject']).toBeFalsy();
      // with no tabletop object, initialize registers nothing
      // the guard is unnecessary, but the branch is covered here
    });

    it('survives an input start before the handler is ready', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(RotableDirective);
      const writableDirective = directive as unknown as {
        [key: string]: unknown;
        onInputStart: (event: MouseEvent | TouchEvent) => void;
      };
      writableDirective['grabbingSelecter'] = '';
      writableDirective['input'] = null;

      const element = fixture.nativeElement.querySelector('div') as HTMLElement;
      const event = {
        target: element,
        button: 0,
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      expect(() => writableDirective.onInputStart(event)).not.toThrow();
    });
  });

  describe('a change to its piece while it is being turned', () => {
    let directive: RotableDirective;
    let queued: (() => void)[];
    let cancelled: ReturnType<typeof vi.fn>;
    let held: { isGrabbing: boolean };

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(RotableDirective);
      const writable = directive as unknown as Record<string, unknown>;
      writable['tabletopObject'] = { identifier: 'piece', rotate: 30 };
      vi.spyOn(directive as unknown as { setRotate(): void }, 'setRotate').mockImplementation(() => {});
      cancelled = vi.spyOn(directive, 'cancel').mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
      queued = [];
      vi.spyOn(TestBed.inject(BatchService), 'add').mockImplementation((task) => {
        queued.push(task);
      });
      held = { isGrabbing: false };
      writable['input'] = Object.assign(held, { cancel: () => undefined, destroy: () => undefined });
    });

    const changed = (isSendFromSelf: boolean) =>
      directive['handleObjectChange']({ identifier: 'piece', aliasName: 'character', isSendFromSelf } as never);

    it('keeps hold of a piece taken up just after this seat changed it', () => {
      changed(true);
      held.isGrabbing = true;

      for (const task of queued) task();

      expect(cancelled).not.toHaveBeenCalled();
    });

    it('lets go of it for a change made elsewhere', () => {
      changed(false);
      held.isGrabbing = true;

      for (const task of queued) task();

      expect(cancelled).toHaveBeenCalledOnce();
    });
  });

  describe('turning with Alt held', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let directive: RotableDirective;
    let element: HTMLElement;
    let pointer: { x: number; y: number; z: number };

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [TestHostComponent], providers: [...TEST_PROVIDERS] });
      fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(RotableDirective);
      element = fixture.nativeElement.querySelector('div') as HTMLElement;
      pointer = { x: 10, y: 0, z: 0 };
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isDragging', 'get').mockReturnValue(true);
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
      const writable = directive as unknown as Record<string, unknown>;
      writable['grabbingElement'] = element;
      writable['turnsOnScreenAbout'] = () => ({ x: 0, y: 0 });
      writable['input'] = {
        isGrabbing: true,
        isDragging: false,
        get pointer() {
          return pointer;
        },
        cancel: vi.fn(),
        destroy: vi.fn(),
      };
    });

    afterEach(() => {
      directive.cancel();
      vi.restoreAllMocks();
    });

    /** Moves the pointer to a point at this angle from the middle, Alt held or not. */
    function moveTo(degrees: number, altKey: boolean): void {
      const rad = (degrees * Math.PI) / 180;
      pointer = { x: Math.cos(rad) * 100, y: Math.sin(rad) * 100, z: 0 };
      directive.onInputMove(new MouseEvent('mousemove', { altKey, cancelable: true }));
    }

    function guide() {
      return TestBed.inject(RotationGuideService).turn();
    }

    it('turns a piece the screen puts by where the pointer crosses its face at the height of its handles', () => {
      const pointOn = vi
        .spyOn(TestBed.inject(TableSurfaceService), 'pointOn')
        .mockImplementation((surface, x, y) => ({ localX: 100 + x, localY: 200 + y }) as never);
      const writable = directive as unknown as Record<string, unknown>;
      writable['turnsOnScreenAbout'] = null;
      writable['turnsAbout'] = () => ({ surface: 'north-wall', x: 100, y: 200, height: 30 });
      writable['input'] = { ...(writable['input'] as object), pointer: { x: 0, y: 50, z: 0 } };
      const laidOut = element.style.transform;

      directive.onInputMove(new MouseEvent('mousemove', { cancelable: true }));

      expect(pointOn).toHaveBeenCalledWith('north-wall', 0, 50, 30);
      expect(directive.rotate).toBeCloseTo(90);
      expect(element.style.transform).toBe(laidOut);
    });

    it('turns a part the screen puts upright by where the pointer lies round a point of the screen', () => {
      const writable = directive as unknown as Record<string, unknown>;
      writable['turnsOnScreenAbout'] = () => ({ x: 300, y: 200 });
      writable['input'] = { ...(writable['input'] as object), pointer: { x: 300, y: 260, z: 0 } };
      const laidOut = element.style.transform;

      directive.onInputMove(new MouseEvent('mousemove', { cancelable: true }));

      expect(directive.rotate).toBeCloseTo(90);
      expect(element.style.transform).toBe(laidOut);
    });

    it('turns freely without Alt, and says so', () => {
      moveTo(31, false);

      expect(directive.rotate).toBeCloseTo(31);
      expect(guide()).toEqual({ angle: 31, step: 45, snapping: false });
    });

    it('turns in steps of the sides and diagonals with Alt held on a square grid', () => {
      moveTo(31, true);
      expect(directive.rotate).toBe(45);

      moveTo(-100, true);
      expect(directive.rotate).toBe(-90);
      expect(guide()).toEqual({ angle: 270, step: 45, snapping: true });
    });

    it('turns in steps of the faces and corners with Alt held on a hex grid', () => {
      vi.spyOn(TestBed.inject(TableSelecter), 'viewTable', 'get').mockReturnValue({
        gridType: GridType.HEX_VERTICAL,
      } as GameTable);

      moveTo(50, true);

      expect(directive.rotate).toBe(60);
      expect(guide()?.step).toBe(30);
    });

    it('turns a custom range by quarter turns with Alt held, on a hex grid too, and keeps the angle let go', () => {
      vi.spyOn(TestBed.inject(TableSelecter), 'viewTable', 'get').mockReturnValue({
        gridType: GridType.HEX_VERTICAL,
      } as GameTable);
      const range = new RangeArea();
      range.type = 'CUSTOM';
      (directive as unknown as Record<string, unknown>)['tabletopObject'] = range;

      moveTo(70, true);
      expect(directive.rotate).toBe(90);
      expect(guide()?.step).toBe(90);

      directive.onInputEnd(new MouseEvent('mouseup'));
      expect(directive.rotate).toBe(90);
    });

    it('writes a turn still waiting to the piece when the element goes, and emits nothing after', () => {
      vi.useFakeTimers();
      const range = new RangeArea();
      (directive as unknown as Record<string, unknown>)['tabletopObject'] = range;
      const emitted = vi.spyOn(directive.valueChange, 'emit');

      moveTo(31, false);
      fixture.destroy();
      vi.advanceTimersByTime(200);
      vi.useRealTimers();

      expect(range.rotate).toBeCloseTo(31);
      expect(emitted).not.toHaveBeenCalled();
    });

    it('snaps the moment Alt goes down and frees the turn the moment it comes up', () => {
      moveTo(31, false);

      const down = new KeyboardEvent('keydown', { key: 'Alt', cancelable: true });
      document.dispatchEvent(down);
      expect(directive.rotate).toBe(45);
      expect(down.defaultPrevented).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', cancelable: true }));
      expect(directive.rotate).toBeCloseTo(31);
    });

    it('says it is turning from the first step of a turn until the turn is broken off', () => {
      expect(directive.turning()).toBe(false);

      moveTo(31, false);
      expect(directive.turning()).toBe(true);

      directive.cancel();
      expect(directive.turning()).toBe(false);
    });

    it('says it is turning from a first step that finds no point to turn about, and turns on the next', () => {
      const writable = directive as unknown as Record<string, unknown>;
      writable['turnsOnScreenAbout'] = () => null;
      const started = vi.spyOn(directive.ondragstart, 'emit');

      moveTo(31, false);
      expect(directive.turning()).toBe(true);
      expect(started).toHaveBeenCalledTimes(1);
      expect(guide()).toBeNull();

      writable['turnsOnScreenAbout'] = () => ({ x: 0, y: 0 });
      (writable['input'] as { isDragging: boolean }).isDragging = true;
      moveTo(31, false);
      expect(started).toHaveBeenCalledTimes(1);
      expect(guide()?.angle).toBe(31);
    });

    it('hears no Alt before a step of the turn has found the angle it turns to', () => {
      const writable = directive as unknown as Record<string, unknown>;
      writable['turnsOnScreenAbout'] = () => null;
      directive.rotate = 10;

      moveTo(31, false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }));
      expect(directive.rotate).toBe(10);
      expect(guide()).toBeNull();

      writable['turnsOnScreenAbout'] = () => ({ x: 0, y: 0 });
      moveTo(31, false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }));
      expect(directive.rotate).toBe(45);
    });

    it('leaves a finger’s press to the table beneath while told to, and takes a mouse’s all the same', () => {
      (directive as unknown as Record<string, unknown>)['grabbingSelecter'] = '';
      fixture.componentInstance.refuseTouch.set(true);
      fixture.detectChanges();
      const started = vi.spyOn(directive.onstart, 'emit');

      const finger = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(finger, 'target', { value: element });
      const passedOn = vi.spyOn(finger, 'stopPropagation');
      directive.onInputStart(finger);
      expect(started).not.toHaveBeenCalled();
      expect(passedOn).not.toHaveBeenCalled();
      expect(isPressTaken(finger)).toBe(true);

      const mouse = new MouseEvent('mousedown', { bubbles: true, button: 0 });
      Object.defineProperty(mouse, 'target', { value: element });
      directive.onInputStart(mouse);
      expect(started).toHaveBeenCalledTimes(1);
      expect(isPressTaken(mouse)).toBe(false);

      fixture.componentInstance.refuseTouch.set(false);
      fixture.detectChanges();
      directive.onInputStart(finger);
      expect(started).toHaveBeenCalledTimes(2);
    });

    it('leaves a finger’s press beside its handles to the piece, not the table, while told to refuse it', () => {
      fixture.componentInstance.refuseTouch.set(true);
      fixture.detectChanges();
      const finger = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(finger, 'target', { value: element });

      directive.onInputStart(finger);

      expect(isPressTaken(finger)).toBe(false);
    });

    it('says nothing more once the turn is let go', () => {
      moveTo(31, true);

      directive.cancel();

      expect(guide()).toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }));
      expect(guide()).toBeNull();
    });
  });
});
