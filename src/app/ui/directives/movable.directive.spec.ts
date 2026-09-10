import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';

@Component({
  selector: 'test-host',
  template: `<div appMovable [movable.option]="movableOption"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MovableDirective],
})
class TestHostComponent {
  movableOption = {};
}

describe('MovableDirective', () => {
  it('should be defined', () => {
    expect(MovableDirective).toBeDefined();
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

    it('says which piece is moving only while it moves', () => {
      fixture.detectChanges();
      const element = fixture.debugElement.children[0].nativeElement as HTMLElement;
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);

      expect(element.style.willChange).toBe('');

      directive['promoteWhileMoving'](true);
      expect(element.style.willChange).toBe('transform');

      directive.cancel();
      expect(element.style.willChange).toBe('');
    });

    it('sets a position with no tabletop object', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      expect(() => directive['setPosition'](null as unknown as TabletopObject)).not.toThrow();
    });

    it('sets a position for an object with no location', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      expect(() => directive['setPosition']({} as unknown as TabletopObject)).not.toThrow();
    });

    it('does not transition without a tabletop object', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      expect(directive['shouldTransition'](null as unknown as TabletopObject)).toBe(false);
    });

    it('does not transition for an object with no location', () => {
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      expect(directive['shouldTransition']({} as unknown as TabletopObject)).toBe(false);
    });
  });

  describe('what is stuck to a board', () => {
    let fixture: ComponentFixture<TestHostComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();
    });

    function directiveFor(surface: string | undefined): MovableDirective {
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      directive['tabletopObject'] = { location: { name: 'table', x: 0, y: 0, surface } } as TabletopObject;
      return directive;
    }

    it('keeps the spot it was put on, rather than jumping to a line of the table', () => {
      // A board is not ruled into squares, so what is stuck to one is not snapped to them.
      expect(directiveFor('some-board-identifier').isGridSnap).toBe(false);
    });

    it('still snaps on the table itself, and on a wall of it', () => {
      expect(directiveFor(undefined).isGridSnap).toBe(true);
      expect(directiveFor('north-wall').isGridSnap).toBe(true);
    });
  });
});

describe('MovableDirective drop preview', () => {
  interface Internals {
    input: {
      isDragging: boolean;
      pointer: { x: number; y: number; z: number };
      cancel(): void;
      destroy(): void;
    } | null;
    onInputMoveNow(e: MouseEvent): void;
    surfaceUnderPointer(): HTMLElement | null;
    surfaceElement(): HTMLElement;
    clearDragPreview(): void;
    updateDragPreview(surface: HTMLElement | null): void;
  }

  @Component({
    selector: 'preview-host',
    template: `<div appMovable [movable.option]="{}"></div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class PreviewHostComponent {}

  function mount(isDragging: boolean): Internals {
    TestBed.configureTestingModule({ imports: [PreviewHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(PreviewHostComponent);
    fixture.detectChanges();
    const directive = fixture.debugElement
      .query((node) => node.name === 'div')
      .injector.get(MovableDirective) as unknown as Internals;
    directive.input = {
      isDragging,
      pointer: { x: 0, y: 0, z: 0 },
      cancel: () => undefined,
      destroy: () => undefined,
    };
    return directive;
  }

  it('looks for the face under the pointer once per move', () => {
    const directive = mount(true);
    const own = directive.surfaceElement();
    const look = vi.spyOn(directive, 'surfaceUnderPointer').mockReturnValue(own);
    const preview = vi.spyOn(directive, 'updateDragPreview').mockImplementation(() => undefined);

    directive.onInputMoveNow(new MouseEvent('mousemove'));

    expect(look).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0][0]).toBe(own);
  });

  it('is given nothing to draw on the move that grabs, since nothing is being dragged yet', () => {
    // The input handler sets isDragging after the move callback returns, so the first move
    // always runs with it unset, and the preview clears itself whatever face it is handed.
    const directive = mount(false);
    const own = directive.surfaceElement();
    vi.spyOn(directive, 'surfaceUnderPointer').mockReturnValue(own);
    const clear = vi.spyOn(directive, 'clearDragPreview').mockImplementation(() => undefined);

    directive.onInputMoveNow(new MouseEvent('mousemove'));

    expect(clear).toHaveBeenCalled();
  });
});

describe('MovableDirective where a dragged piece comes to rest', () => {
  @Component({
    selector: 'contact-host',
    template: `<div appMovable [movable.option]="{}"></div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class ContactHostComponent {}

  const GRID = 50;

  function sized(object: TabletopObject, widthCells: number, depthCells: number): HTMLElement {
    const element = document.createElement('div');
    Object.defineProperty(element, 'offsetWidth', { value: widthCells * GRID, configurable: true });
    Object.defineProperty(element, 'offsetHeight', { value: depthCells * GRID, configurable: true });
    return element;
  }

  function block(opts: {
    identifier: string;
    x?: number;
    y?: number;
    w?: number;
    d?: number;
    h: number;
    altitude?: number;
    posZ?: number;
  }): Terrain {
    const w = opts.w ?? 2;
    const d = opts.d ?? 2;
    const terrain = Terrain.create('block', w, d, opts.h, '', '', opts.identifier);
    terrain.location.x = opts.x ?? 0;
    terrain.location.y = opts.y ?? 0;
    terrain.altitude = opts.altitude ?? 0;
    terrain.posZ = opts.posZ ?? 0;
    return terrain;
  }

  function mount(dragged: TabletopObject, standing: { object: TabletopObject; w: number; d: number }[]) {
    TestBed.configureTestingModule({ imports: [ContactHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(ContactHostComponent);
    fixture.detectChanges();
    const overlap = TestBed.inject(TabletopOverlapService);
    for (const one of standing) overlap.register(one.object, sized(one.object, one.w, one.d));
    const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
    directive['tabletopObject'] = dragged;
    directive.posZ = dragged.posZ;
    return directive;
  }

  it('slides a block under a canopy standing three cells off the ground', () => {
    const canopy = block({ identifier: 'canopy', h: 1, altitude: 3 });
    const directive = mount(block({ identifier: 'dragged', h: 1, x: 500, y: 500 }), [{ object: canopy, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(0);
  });

  it('still climbs a block resting on the ground, which leaves no room beneath', () => {
    const box = block({ identifier: 'box', h: 1 });
    const directive = mount(block({ identifier: 'dragged', h: 1, x: 500, y: 500 }), [{ object: box, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
  });

  it('walks a character under the same canopy rather than onto its roof', () => {
    const canopy = block({ identifier: 'canopy', h: 1, altitude: 3 });
    const walker = GameCharacter.create('walker', 1, '');
    walker.location.x = 500;
    walker.location.y = 500;
    const directive = mount(walker, [{ object: canopy, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(0);
  });

  it('keeps a character already up on the canopy up there', () => {
    const canopy = block({ identifier: 'canopy', h: 1, altitude: 3 });
    const walker = GameCharacter.create('walker', 1, '');
    walker.posZ = 4 * GRID;
    const directive = mount(walker, [{ object: canopy, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(4 * GRID);
  });

  it('rests a canopy on a tower by the gap under it, not by its own height again', () => {
    const tower = block({ identifier: 'tower', h: 4 });
    const dragged = block({ identifier: 'dragged', h: 1, altitude: 3, x: 500, y: 500 });
    const directive = mount(dragged, [{ object: tower, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
  });

  function grab(directive: MovableDirective, atLocal: { x: number; y: number }): void {
    TestBed.inject(PointerDeviceService).isDragging = true;
    directive.targetStartRect = directive.nativeElement.getBoundingClientRect();
    (directive as unknown as { input: unknown }).input = {
      isGrabbing: true,
      isDragging: true,
      pointer: { x: 0, y: 0, z: 0 },
      cancel: () => undefined,
      destroy: () => undefined,
    };
    vi.spyOn(directive['coordinateService'], 'convertToLocal').mockReturnValue({ ...atLocal, z: 0 });
  }

  it('a turn of the wheel lifts the piece onto a rock hanging above it', () => {
    const rock = block({ identifier: 'rock', h: 1, altitude: 3 });
    const walker = GameCharacter.create('walker', 1, '');
    const directive = mount(walker, [{ object: rock, w: 2, d: 2 }]);
    grab(directive, { x: 50, y: 50 });

    expect(directive.contactSupportZ(50, 50)).toBe(0);

    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));

    expect(directive.contactSupportZ(50, 50)).toBe(4 * GRID);
  });

  it('a turn the other way sets it back down on the ground it came from', () => {
    const rock = block({ identifier: 'rock', h: 1, altitude: 3 });
    const walker = GameCharacter.create('walker', 1, '');
    const directive = mount(walker, [{ object: rock, w: 2, d: 2 }]);
    grab(directive, { x: 50, y: 50 });

    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
    expect(directive.contactSupportZ(50, 50)).toBe(4 * GRID);

    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: 1, cancelable: true }));

    expect(directive.contactSupportZ(50, 50)).toBe(0);
  });

  it('stays put when the wheel is turned past the last height there is', () => {
    const rock = block({ identifier: 'rock', h: 1, altitude: 3 });
    const walker = GameCharacter.create('walker', 1, '');
    const directive = mount(walker, [{ object: rock, w: 2, d: 2 }]);
    grab(directive, { x: 50, y: 50 });

    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));
    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));

    expect(directive.contactSupportZ(50, 50)).toBe(4 * GRID);
  });

  it('keeps the wheel to itself while a piece is held, so the table does not zoom under it', () => {
    const directive = mount(block({ identifier: 'dragged', h: 1 }), []);
    grab(directive, { x: 50, y: 50 });
    const wheel = new WheelEvent('wheel', { deltaY: -1, cancelable: true });
    const stop = vi.spyOn(wheel, 'stopPropagation');

    directive['liftByWheel'](wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it('lets the wheel through when no piece is held', () => {
    const directive = mount(block({ identifier: 'dragged', h: 1 }), []);
    const wheel = new WheelEvent('wheel', { deltaY: -1, cancelable: true });

    directive['liftByWheel'](wheel);

    expect(wheel.defaultPrevented).toBe(false);
  });

  it('carries a character kept above the ground up over a box, the way gravity would', () => {
    const box = block({ identifier: 'box', h: 2 });
    const flier = GameCharacter.create('flier', 1, '');
    flier.altitude = 4;
    const directive = mount(flier, [{ object: box, w: 2, d: 2 }]);

    const supportZ = directive.contactSupportZ(50, 50);

    expect(supportZ).toBe(2 * GRID);
    expect(supportZ).toBe(GravityService.contactTopZ(box, 'floor', GRID));
  });

  it('still carries it up on the move after one that found only the floor', () => {
    const box = block({ identifier: 'box', h: 2 });
    const flier = GameCharacter.create('flier', 1, '');
    flier.altitude = 4;
    const directive = mount(flier, [{ object: box, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(500, 500)).toBe(0);

    expect(directive.contactSupportZ(50, 50)).toBe(2 * GRID);
  });

  it('reads the height a piece is kept at as clearance, not as a step it has taken', () => {
    const rock = block({ identifier: 'rock', h: 1, altitude: 7 });
    const flier = GameCharacter.create('flier', 1, '');
    flier.altitude = 4;
    const directive = mount(flier, [{ object: rock, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(0);
  });

  it('a turn of the wheel is still what puts that piece on the rock', () => {
    const rock = block({ identifier: 'rock', h: 1, altitude: 7 });
    const flier = GameCharacter.create('flier', 1, '');
    flier.altitude = 4;
    const directive = mount(flier, [{ object: rock, w: 2, d: 2 }]);
    grab(directive, { x: 50, y: 50 });

    directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));

    expect(directive.contactSupportZ(50, 50)).toBe(8 * GRID);
  });
});
