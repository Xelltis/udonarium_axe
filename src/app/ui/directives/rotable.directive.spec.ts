import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { vi } from 'vitest';

@Component({
  selector: 'test-host',
  template: `<div appRotable [rotable.option]="rotableOption"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RotableDirective],
})
class TestHostComponent {
  rotableOption = {};
}

describe('RotableDirective', () => {
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
      vi.spyOn(TestBed.inject(CoordinateService), 'convertLocalToLocal').mockImplementation(() => ({ ...pointer }));
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isDragging', 'get').mockReturnValue(true);
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(true);
      const writable = directive as unknown as Record<string, unknown>;
      writable['grabbingElement'] = element;
      writable['input'] = {
        isGrabbing: true,
        isDragging: false,
        pointer: { x: 0, y: 0, z: 0 },
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

    it('says nothing more once the turn is let go', () => {
      moveTo(31, true);

      directive.cancel();

      expect(guide()).toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }));
      expect(guide()).toBeNull();
    });
  });
});
