import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable, GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { TERRAIN_PICK_LAYER } from '@axe/domain/tabletop/pick/terrain-pick';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
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

    it('snaps to the cell under the grid snap on a table that has no squares to lay pieces out in', () => {
      const table = new GameTable();
      table.gridSize = 50;
      table.gridSnapStyle = GridSnapStyle.GRID;
      table.initialize();
      onTestFinished(() => table.destroy());
      fixture.detectChanges();
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      directive.posX = 60;
      directive.posY = 90;

      directive.snapToGrid();

      expect([directive.posX, directive.posY]).toEqual([50, 100]);
    });
  });

  describe('a change to its piece while it is picked up', () => {
    let directive: MovableDirective;
    let queued: (() => void)[];
    let cancelled: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      (directive as unknown as { tabletopObject: TabletopObject }).tabletopObject = new GameCharacter('piece');
      directive.posX = 1;
      vi.spyOn(directive as unknown as { setPosition(): void }, 'setPosition').mockImplementation(() => {});
      cancelled = vi.spyOn(directive, 'cancel').mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
      queued = [];
      vi.spyOn(TestBed.inject(BatchService), 'add').mockImplementation((task) => {
        queued.push(task);
      });
      directive.input = {
        isGrabbing: false,
        cancel: () => undefined,
        destroy: () => undefined,
      } as unknown as MovableDirective['input'];
    });

    const changed = (isSendFromSelf: boolean) =>
      directive['handleObjectChange']({ identifier: 'piece', aliasName: 'character', isSendFromSelf } as never);

    it('keeps hold of a piece picked up just after this seat changed it, as just after it was made', () => {
      changed(true);
      (directive.input as unknown as { isGrabbing: boolean }).isGrabbing = true;

      for (const task of queued) task();

      expect(cancelled).not.toHaveBeenCalled();
    });

    it('lets go of it for a change made elsewhere', () => {
      changed(false);
      (directive.input as unknown as { isGrabbing: boolean }).isGrabbing = true;

      for (const task of queued) task();

      expect(cancelled).toHaveBeenCalledOnce();
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

  describe('where the piece is drawn', () => {
    let fixture: ComponentFixture<TestHostComponent>;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      fixture = TestBed.createComponent(TestHostComponent);
      fixture.detectChanges();
    });

    function drawnAt(surface: string | undefined, x: number, y: number, z: number): HTMLElement {
      const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
      directive['tabletopObject'] = { location: { name: 'table', x, y, surface } } as TabletopObject;
      directive.posX = x;
      directive.posY = y;
      directive.posZ = z;
      directive['markLocation']();
      return fixture.debugElement.children[0].nativeElement as HTMLElement;
    }

    it('writes where it stands on its surface', () => {
      expect(drawnAt(undefined, 120, 80, 25).dataset['location']).toBe('120,80,25');
    });

    it('leaves its element where the screen puts it, marking where and on which face it stands', () => {
      const element = drawnAt('north-wall', 50, 60, 10);

      expect(element.style.transform).toBe('');
      expect(element.dataset['location']).toBe('50,60,10');
      expect(element.dataset['onSurface']).toBe('north-wall');
    });
  });
});

describe('MovableDirective a piece drawn inside another', () => {
  @Component({
    selector: 'nested-host',
    template: `<div appMovable data-e2e="board" [movable.option]="{}">
      <div appMovable data-e2e="piece" [movable.option]="{}" [movable.disable]="pieceLocked"></div>
    </div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class NestedHostComponent {
    pieceLocked = false;
  }

  interface Pressed {
    input: { isGrabbing: boolean } | null;
  }

  /** Both pieces, once they listen for presses, which they start to a little after they are drawn. */
  async function mount(pieceLocked: boolean): Promise<{ board: Pressed; piece: Pressed; pieceElement: HTMLElement }> {
    TestBed.configureTestingModule({ imports: [NestedHostComponent], providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    const fixture = TestBed.createComponent(NestedHostComponent);
    fixture.componentInstance.pieceLocked = pieceLocked;
    fixture.detectChanges();
    const directiveOf = (name: string) =>
      fixture.debugElement
        .query((node) => node.attributes['data-e2e'] === name)
        .injector.get(MovableDirective) as unknown as Pressed;
    const pieceElement = fixture.nativeElement.querySelector('[data-e2e="piece"]') as HTMLElement;
    const board = directiveOf('board');
    const piece = directiveOf('piece');
    await vi.waitFor(() => expect(board.input && piece.input).toBeTruthy());
    return { board, piece, pieceElement };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is taken up alone when pressed, rather than carried along with what it is drawn in', async () => {
    const { board, piece, pieceElement } = await mount(false);

    pieceElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

    expect(piece.input?.isGrabbing).toBe(true);
    expect(board.input?.isGrabbing).toBe(false);
  });

  it('leaves the press to what it is drawn in when it is locked', async () => {
    const { board, piece, pieceElement } = await mount(true);

    pieceElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

    expect(piece.input?.isGrabbing).toBe(false);
    expect(board.input?.isGrabbing).toBe(true);
  });
});

describe('MovableDirective layers', () => {
  @Component({
    selector: 'layer-host',
    template: `<div appMovable [movable.option]="{ layerName: 'character', colideLayers: ['terrain'] }"></div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class LayerHostComponent {}

  it('lets something that is not a piece join a layer, and leave it', () => {
    TestBed.configureTestingModule({ imports: [LayerHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(LayerHostComponent);
    fixture.detectChanges();
    const directive = fixture.debugElement.children[0].injector.get(MovableDirective);
    const joined = { layerName: 'terrain', input: null, setPointerEvents: vi.fn() };
    const left = { layerName: 'wall', input: null, setPointerEvents: vi.fn() };
    MovableDirective.joinLayer('terrain', joined);
    MovableDirective.joinLayer('wall', left);
    MovableDirective.leaveLayer('wall', left);

    directive.setCollidableLayer(true);

    expect(joined.setPointerEvents).toHaveBeenCalledWith(true);
    expect(left.setPointerEvents).not.toHaveBeenCalled();
    MovableDirective.leaveLayer('terrain', joined);
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
    width: number;
    height: number;
    tableSurfaces: TableSurfaceService;
    onInputMoveNow(e: MouseEvent): void;
    surfaceUnderPointer(): string | null;
    currentSurface(): string;
    clearDragPreview(): void;
    updateDragPreview(surface: string | null): void;
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

  /** A wall a thousand pixels long and three hundred high, with the pointer at a point of it. */
  function overWall(directive: Internals, localX: number, localY: number): void {
    vi.spyOn(directive.tableSurfaces, 'pointOn').mockReturnValue({
      t: 1,
      point: { x: localX, y: 0, z: localY },
      localX,
      localY,
    });
    vi.spyOn(directive.tableSurfaces, 'sizeOf').mockReturnValue({ width: 1000, height: 300 });
  }

  /** Where the drop preview is drawn now, as the canvas is told. */
  function preview() {
    return TestBed.inject(TransientPlacementService).dropPreview();
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('looks for the face under the pointer once per move', () => {
    const directive = mount(true);
    const own = directive.currentSurface();
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
    vi.spyOn(directive, 'surfaceUnderPointer').mockReturnValue(directive.currentSurface());
    const clear = vi.spyOn(directive, 'clearDragPreview').mockImplementation(() => undefined);

    directive.onInputMoveNow(new MouseEvent('mousemove'));

    expect(clear).toHaveBeenCalled();
  });

  it('draws where the piece would land on the face under the pointer, by the face’s name', () => {
    const directive = mount(true);
    directive.width = 40;
    directive.height = 60;
    overWall(directive, 500, 100);

    directive.updateDragPreview('north-wall');

    expect(preview()).toEqual({ surface: 'north-wall', x: 480, y: 70, width: 40, height: 60 });
  });

  it('keeps it inside a face of the table, which nothing hangs over the edge of', () => {
    const directive = mount(true);
    directive.width = 40;
    directive.height = 60;
    overWall(directive, 995, 5);
    vi.spyOn(directive.tableSurfaces, 'overhangs').mockReturnValue(false);

    directive.updateDragPreview('north-wall');

    expect(preview()).toMatchObject({ x: 960, y: 0 });
  });

  it('lets it hang over the edge of a face that allows it', () => {
    const directive = mount(true);
    directive.width = 40;
    directive.height = 60;
    overWall(directive, 995, 5);
    vi.spyOn(directive.tableSurfaces, 'overhangs').mockReturnValue(true);

    directive.updateDragPreview('north-wall');

    expect(preview()).toMatchObject({ x: 975, y: -25 });
  });

  it('draws nothing where the pointer is off the face altogether', () => {
    const directive = mount(true);
    overWall(directive, 1010, 100);

    directive.updateDragPreview('north-wall');

    expect(preview()).toBeNull();
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

  it('climbs a block drawn together with others, in no element of its own', () => {
    const box = block({ identifier: 'box', h: 1 });
    const directive = mount(block({ identifier: 'dragged', h: 1, x: 500, y: 500 }), []);
    TestBed.inject(TabletopOverlapService).registerWithoutElement(box, () => undefined);

    expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
    expect(directive.contactSupportZ(150, 50)).toBe(0);
  });

  it('rests a canopy on a tower by the gap under it, not by its own height again', () => {
    const tower = block({ identifier: 'tower', h: 4 });
    const dragged = block({ identifier: 'dragged', h: 1, altitude: 3, x: 500, y: 500 });
    const directive = mount(dragged, [{ object: tower, w: 2, d: 2 }]);

    expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
  });

  it('stands a piece on a turned block where the block is drawn, not where it lay square', () => {
    // Four cells by one, turned a quarter round about its middle at 100, 25.
    const beam = block({ identifier: 'beam', h: 1, w: 4, d: 1 });
    beam.rotate = 90;
    const directive = mount(block({ identifier: 'dragged', h: 1, x: 500, y: 500 }), [{ object: beam, w: 4, d: 1 }]);

    expect(directive.contactSupportZ(25, 25)).toBe(0);
    expect(directive.contactSupportZ(100, 100)).toBe(1 * GRID);
  });

  function grab(directive: MovableDirective, atLocal: { x: number; y: number }): void {
    TestBed.inject(PointerDeviceService).isDragging = true;
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

  describe('holding a piece off the ground', () => {
    /**
     * A turn of the wheel with the key held down.
     *
     * The WheelEvent here is built on UIEvent rather than MouseEvent, so it carries no
     * modifiers of its own and the key has to be put on by hand. A browser carries it.
     */
    function shiftWheel(directive: MovableDirective, isUp: boolean): void {
      const wheel = new WheelEvent('wheel', { deltaY: isUp ? -1 : 1, cancelable: true });
      Object.defineProperty(wheel, 'shiftKey', { value: true });
      directive['liftByWheel'](wheel);
    }

    it('sends the piece up a cell at a time, however empty the air above it is', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      grab(directive, { x: 50, y: 50 });

      shiftWheel(directive, true);
      shiftWheel(directive, true);

      expect(walker.altitude).toBe(2);
    });

    it('brings it back down the same way, and on below the ground', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      grab(directive, { x: 50, y: 50 });

      shiftWheel(directive, true);
      shiftWheel(directive, false);
      shiftWheel(directive, false);

      expect(walker.altitude).toBe(-1);
    });

    it('goes past what it could stand on rather than settling onto it', () => {
      const rock = block({ identifier: 'rock', h: 1, altitude: 3 });
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: rock, w: 2, d: 2 }]);
      grab(directive, { x: 50, y: 50 });

      shiftWheel(directive, true);

      expect(walker.altitude).toBe(1);
      expect(walker.posZ).toBe(0);
    });

    it('leaves the height alone without the key, which is what walks the surfaces', () => {
      const rock = block({ identifier: 'rock', h: 1, altitude: 3 });
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: rock, w: 2, d: 2 }]);
      grab(directive, { x: 50, y: 50 });

      directive['liftByWheel'](new WheelEvent('wheel', { deltaY: -1, cancelable: true }));

      expect(walker.altitude).toBe(0);
      expect(directive.contactSupportZ(50, 50)).toBe(4 * GRID);
    });

    it('shows how high it is being held, and where it is being held over', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      grab(directive, { x: 50, y: 50 });
      directive.posX = 300;
      directive.posY = 400;

      shiftWheel(directive, true);

      const guide = TestBed.inject(HeldPieceService).held();
      expect(guide?.identifier).toBe(walker.identifier);
      expect(guide?.altitude).toBe(1);
      expect({ x: guide?.x, y: guide?.y }).toEqual({ x: 300, y: 400 });
    });

    it('keeps the guide under the piece as it carries on across the table', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      const guides = TestBed.inject(HeldPieceService);
      grab(directive, { x: 50, y: 50 });
      shiftWheel(directive, true);
      const before = { x: guides.held()?.x, y: guides.held()?.y };

      vi.spyOn(directive['coordinateService'], 'convertToLocal').mockReturnValue({ x: 400, y: 500, z: 0 });
      directive['onInputMoveNow'](new MouseEvent('mousemove'));

      const after = { x: guides.held()?.x, y: guides.held()?.y };
      expect(after).toEqual({ x: directive.posX, y: directive.posY });
      expect(after).not.toEqual(before);
    });

    it('takes the turn from the sideways spin a browser reports with the key held', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      grab(directive, { x: 50, y: 50 });
      const sideways = new WheelEvent('wheel', { deltaY: 0, cancelable: true });
      Object.defineProperty(sideways, 'shiftKey', { value: true });
      Object.defineProperty(sideways, 'deltaX', { value: -100 });

      directive['liftByWheel'](sideways);

      expect(walker.altitude).toBe(1);
    });

    it('shows the guide from the moment a piece off the ground is picked up', () => {
      const walker = GameCharacter.create('walker', 1, '');
      walker.altitude = 2;
      const directive = mount(walker, []);
      const guides = TestBed.inject(HeldPieceService);

      directive.onInputStart(new MouseEvent('mousedown'));

      expect(guides.held()?.identifier).toBe(walker.identifier);
      expect(guides.held()?.altitude).toBe(2);
    });

    it('takes the guide away once the piece is let go of', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      grab(directive, { x: 50, y: 50 });
      shiftWheel(directive, true);

      directive.cancel();

      expect(TestBed.inject(HeldPieceService).held()).toBeNull();
    });

    it('leaves a piece hung on a wall to the surfaces, which is all a wall has', () => {
      const hung = GameCharacter.create('hung', 1, '');
      hung.location.surface = 'north-wall';
      const directive = mount(hung, []);
      grab(directive, { x: 50, y: 50 });

      shiftWheel(directive, true);

      expect(hung.altitude).toBe(0);
      expect(TestBed.inject(HeldPieceService).held()).toBeNull();
    });
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

  describe('terrain too sheer to get up', () => {
    function cliff(at: { x?: number; y?: number; w?: number; d?: number; identifier?: string } = {}): Terrain {
      const sheer = block({ identifier: 'cliff', h: 1, ...at });
      sheer.blocksClimb = true;
      return sheer;
    }

    function asMaster(): void {
      vi.spyOn(TestBed.inject(RolePermissionService), 'isGameMaster').mockReturnValue(true);
    }

    it('leaves a character on the ground beside it rather than up on top', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff(), w: 2, d: 2 }]);

      expect(directive.contactSupportZ(50, 50)).toBe(0);
    });

    it('is still something the master walks over', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff(), w: 2, d: 2 }]);
      asMaster();

      expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
    });

    it('is still something terrain is built on top of', () => {
      const dragged = block({ identifier: 'dragged', h: 1, x: 500, y: 500 });
      const directive = mount(dragged, [{ object: cliff(), w: 2, d: 2 }]);

      expect(directive.contactSupportZ(50, 50)).toBe(1 * GRID);
    });

    it('holds a character at its near face on the way across', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 50);

      // A pixel short of the face at 200, which is what keeps whole pixels on the outside.
      expect(directive.posX).toBe(199);
    });

    it('holds a character at the near face of one drawn in no element of its own', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, []);
      TestBed.inject(TabletopOverlapService).registerWithoutElement(cliff({ x: 200, y: 0 }), () => undefined);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 50);

      expect(directive.posX).toBe(199);
    });

    it('holds it there on the move that carries it across, not only when asked', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      grab(directive, { x: 400, y: 50 });
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;

      directive['onInputMoveNow'](new MouseEvent('mousemove'));

      expect(directive.posX).toBe(199);
    });

    it('holds a character coming at it from the far side, push after push', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 0, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;
      directive.posX = 400;

      for (let push = 0; push < 6; push++) {
        const wasX = directive.posX;
        directive.posX = -200;
        directive['holdAtBlocks'](wasX, 50);
      }

      expect(directive.posX).toBe(101);
    });

    it('holds one coming up from below the same way', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 0, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posX = 50;
      directive.posY = 400;

      for (let push = 0; push < 6; push++) {
        const wasY = directive.posY;
        directive.posY = -200;
        directive['holdAtBlocks'](50, wasY);
      }

      expect(directive.posY).toBe(101);
    });

    it('holds a character at a shut door, and lets one through the moment it is opened', () => {
      const door = cliff({ x: 200, y: 0 });
      door.doorStyle = DoorStyle.SWING;
      const directive = mount(GameCharacter.create('walker', 1, ''), [{ object: door, w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 50);
      expect(directive.posX).toBe(199);

      door.isDoorOpen = true;
      directive['clearContactProbe']();
      directive.posX = 400;
      directive['holdAtBlocks'](199, 50);

      expect(directive.posX).toBe(400);
    });

    it('does not let the snap at the end carry a character into what held it', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 50;
      directive.posX = 199;

      // What a hex snap does from against a face: reach for the middle of the cell behind it.
      vi.spyOn(directive as unknown as { snapToGridNow(size?: number): void }, 'snapToGridNow').mockImplementation(
        () => {
          directive.posX = 250;
        }
      );
      directive.snapToGrid();

      expect(directive.posX).toBe(199);
    });

    it('still lets the snap put a character down where nothing is in the way', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 400;
      directive.posX = 199;

      vi.spyOn(directive as unknown as { snapToGridNow(size?: number): void }, 'snapToGridNow').mockImplementation(
        () => {
          directive.posX = 250;
        }
      );
      directive.snapToGrid();

      expect(directive.posX).toBe(250);
    });

    it('lets a character walk anywhere the block is not in the way', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 400;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 400);

      expect(directive.posX).toBe(400);
    });

    it('holds a character at the face of a turned block, not at the box that holds it', () => {
      // Two cells square, turned an eighth round: a diamond about 250, 50 with corners 70.7 out.
      const diamond = cliff({ x: 200, y: 0 });
      diamond.rotate = 45;
      const directive = mount(GameCharacter.create('walker', 1, ''), [{ object: diamond, w: 2, d: 2 }]);
      directive.width = 0;
      directive.height = 0;
      directive.posY = 110;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 110);

      // 60 below the middle the diamond is 10.7 either side of it, so its face is at 239.3.
      expect(directive.posX).toBe(238);
    });

    it('brings a piece of one cell up to the face, since it owns no more ground than its cell', () => {
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = GRID;
      directive.height = GRID;
      directive.posY = 25;

      directive.posX = 400;
      directive['holdAtBlocks'](0, 25);

      // The middle a pixel short of the face at 200, so the piece stands in the cell beside it.
      expect(directive.posX + directive.width / 2).toBe(199);
    });

    it('keeps a piece wider than a cell out by what it hangs over', () => {
      const walker = GameCharacter.create('walker', 3, '');
      const directive = mount(walker, [{ object: cliff({ x: 200, y: 0 }), w: 2, d: 2 }]);
      directive.width = 3 * GRID;
      directive.height = 3 * GRID;
      directive.posY = -50;

      directive.posX = 400;
      directive['holdAtBlocks'](-75, -50);

      // Two cells of it hang past the middle cell, so its middle stops a cell out from the face.
      expect(directive.posX + directive.width / 2).toBe(149);
    });

    it('walks a piece of one cell through a gap of one cell between two sheer walls', () => {
      const west = cliff({ x: 0, y: 0, w: 1, d: 4, identifier: 'west' });
      const east = cliff({ x: 100, y: 0, w: 1, d: 4, identifier: 'east' });
      const walker = GameCharacter.create('walker', 1, '');
      const directive = mount(walker, [
        { object: west, w: 1, d: 4 },
        { object: east, w: 1, d: 4 },
      ]);
      directive.width = GRID;
      directive.height = GRID;
      directive.posX = 50;

      directive.posY = 150;
      directive['holdAtBlocks'](50, -50);

      expect(directive.posY).toBe(150);
    });

    it('will not squeeze a piece of three cells through that same gap', () => {
      const west = cliff({ x: 0, y: 0, w: 1, d: 4, identifier: 'west' });
      const east = cliff({ x: 100, y: 0, w: 1, d: 4, identifier: 'east' });
      const walker = GameCharacter.create('walker', 3, '');
      const directive = mount(walker, [
        { object: west, w: 1, d: 4 },
        { object: east, w: 1, d: 4 },
      ]);
      directive.width = 3 * GRID;
      directive.height = 3 * GRID;
      directive.posX = -25;

      directive.posY = 150;
      directive['holdAtBlocks'](-25, -200);

      expect(directive.posY).toBeLessThan(0);
    });

    it('holds a character being walked by anyone but the master', () => {
      const directive = mount(GameCharacter.create('walker', 1, ''), []);

      expect(directive['walksTheTable']()).toBe(true);

      asMaster();

      expect(directive['walksTheTable']()).toBe(false);
    });

    it('holds nothing of what is being built', () => {
      const directive = mount(block({ identifier: 'dragged', h: 1 }), []);

      expect(directive['walksTheTable']()).toBe(false);
    });
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

describe('MovableDirective telling the others where a piece was dropped', () => {
  @Component({
    selector: 'drop-host',
    template: `<div appMovable [movable.option]="{}"></div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class DropHostComponent {}

  interface Internals {
    tabletopObject: TabletopObject;
    input: { pointer: { x: number; y: number; z: number }; cancel(): void; destroy(): void } | null;
    tableSurfaces: TableSurfaceService;
    tablePick: TablePickService;
    width: number;
    height: number;
    surfaceUnderPointer(): string | null;
    computeBeamRest(pointer: unknown): { x: number; y: number; z: number } | null;
    maybeSwitchSurfaceOnDrop(): void;
  }

  function mount(piece: GameCharacter): Internals {
    if (!ObjectStore.instance.get(piece.identifier)) ObjectStore.instance.add(piece, false);
    TestBed.configureTestingModule({ imports: [DropHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(DropHostComponent);
    fixture.detectChanges();
    const directive = fixture.debugElement.children[0].injector.get(MovableDirective) as unknown as Internals;
    directive.tabletopObject = piece;
    directive.input = { pointer: { x: 120, y: 120, z: 0 }, cancel: () => undefined, destroy: () => undefined };
    return directive;
  }

  function surfacesSentFor(piece: GameCharacter): (string | undefined)[] {
    const surfaces: (string | undefined)[] = [];
    vi.spyOn(Network.instance, 'send').mockImplementation((message) => {
      const { eventName, data } = message as {
        eventName: string;
        data: { identifier: string; syncData: { attributes?: { location?: { surface?: string } } } };
      };
      if (eventName === 'UPDATE_GAME_OBJECT' && data.identifier === piece.identifier) {
        surfaces.push(data.syncData.attributes?.location?.surface);
      }
    });
    return surfaces;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the board a piece was dropped on, where no snapping follows to send it later', () => {
    const piece = GameCharacter.create('dropped on a board', 1, '');
    const directive = mount(piece);
    vi.spyOn(directive, 'computeBeamRest').mockReturnValue(null);
    vi.spyOn(directive, 'surfaceUnderPointer').mockReturnValue('a-board');
    vi.spyOn(directive.tableSurfaces, 'pointOn').mockReturnValue({
      t: 1,
      point: { x: 0, y: 0, z: 0 },
      localX: 100,
      localY: 100,
    });
    vi.spyOn(directive.tableSurfaces, 'sizeOf').mockReturnValue({ width: 500, height: 500 });
    const surfaces = surfacesSentFor(piece);

    directive.maybeSwitchSurfaceOnDrop();

    expect(surfaces).toEqual(['a-board']);
  });

  it('stays where it was when let go of off the face under the pointer', () => {
    const piece = GameCharacter.create('dropped beside a board', 1, '');
    const directive = mount(piece);
    vi.spyOn(directive, 'computeBeamRest').mockReturnValue(null);
    vi.spyOn(directive, 'surfaceUnderPointer').mockReturnValue('a-board');
    vi.spyOn(directive.tableSurfaces, 'pointOn').mockReturnValue({
      t: 1,
      point: { x: 0, y: 0, z: 0 },
      localX: -10,
      localY: 100,
    });
    vi.spyOn(directive.tableSurfaces, 'sizeOf').mockReturnValue({ width: 500, height: 500 });
    const surfaces = surfacesSentFor(piece);

    directive.maybeSwitchSurfaceOnDrop();

    expect(surfaces).toEqual([]);
    expect(piece.location.surface).toBeUndefined();
  });

  it('sends a piece taken off a wall onto a beam as off the wall', () => {
    const piece = GameCharacter.create('taken off a wall', 1, '');
    piece.location.surface = 'north-wall';
    const directive = mount(piece);
    vi.spyOn(directive, 'computeBeamRest').mockReturnValue({ x: 50, y: 50, z: 100 });
    const surfaces = surfacesSentFor(piece);

    directive.maybeSwitchSurfaceOnDrop();

    expect(surfaces).toEqual([undefined]);
  });

  it('rests a piece on the highest beam the pointer is over, where the pointer meets it', () => {
    const piece = GameCharacter.create('put on a beam', 1, '');
    const directive = mount(piece);
    directive.width = 50;
    directive.height = 50;
    const beam = (id: string, surface: string, top: number) => ({
      target: {
        id,
        layer: TERRAIN_PICK_LAYER,
        order: 0,
        surface,
        shapes: [
          {
            kind: 'prism' as const,
            outline: [
              { x: 0, y: 0 },
              { x: 400, y: 0 },
              { x: 400, y: 50 },
              { x: 0, y: 50 },
            ],
            base: top - 50,
            top,
          },
        ],
      },
      t: 1,
      point: { x: 220, y: 30, z: top },
      shapeIndex: 0,
    });
    vi.spyOn(directive.tablePick, 'allAt').mockReturnValue([
      beam('low', 'north-wall', 100),
      beam('on the floor', 'floor', 400),
      beam('high', 'north-wall', 200),
    ]);

    expect(directive.computeBeamRest({ x: 0, y: 0, z: 0 })).toEqual({ x: 195, y: 5, z: 200 });
  });
});

describe('MovableDirective showing a dragged piece ahead of its object', () => {
  @Component({
    selector: 'transient-host',
    template: `<div appMovable [movable.option]="{}"></div>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MovableDirective],
  })
  class TransientHostComponent {}

  interface Internals {
    tabletopObject: TabletopObject;
    input: {
      isGrabbing: boolean;
      isDragging: boolean;
      pointer: { x: number; y: number; z: number };
      cancel(): void;
      destroy(): void;
    } | null;
    posX: number;
    width: number;
    height: number;
    tableSurfaces: TableSurfaceService;
    commitPosition(): void;
    cancel(): void;
    updateDragPreview(surface: string | null): void;
    clearDragPreview(): void;
  }

  let transient: TransientPlacementService;

  function mount(piece: GameCharacter): Internals {
    if (!ObjectStore.instance.get(piece.identifier)) ObjectStore.instance.add(piece, false);
    TestBed.configureTestingModule({ imports: [TransientHostComponent], providers: [...TEST_PROVIDERS] });
    const fixture = TestBed.createComponent(TransientHostComponent);
    fixture.detectChanges();
    const directive = fixture.debugElement.children[0].injector.get(MovableDirective) as unknown as Internals;
    directive.tabletopObject = piece;
    directive.input = {
      isGrabbing: true,
      isDragging: true,
      pointer: { x: 0, y: 0, z: 0 },
      cancel: () => undefined,
      destroy: () => undefined,
    };
    transient = TestBed.inject(TransientPlacementService);
    return directive;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the piece where it is dragged to before its object is told, for as long as it is held', () => {
    const piece = GameCharacter.create('dragged', 1, '');
    const directive = mount(piece);
    vi.useFakeTimers();

    directive.posX = 120;
    expect(transient.placementOf(piece.identifier)).toMatchObject({ surface: 'floor', x: 120 });
    expect(piece.location.x).not.toBe(120);

    vi.advanceTimersByTime(66);
    expect(piece.location.x).toBe(120);
    expect(transient.placementOf(piece.identifier)).not.toBeNull();
  });

  it('lets go of the piece once it is let go of and its object has caught up', () => {
    const piece = GameCharacter.create('let go of', 1, '');
    const directive = mount(piece);
    vi.useFakeTimers();
    directive.posX = 120;
    directive.input!.isGrabbing = false;

    directive.cancel();
    expect(transient.placementOf(piece.identifier)).not.toBeNull();

    vi.advanceTimersByTime(66);
    expect(transient.placementOf(piece.identifier)).toBeNull();
  });

  it('lets go of the piece at once when its place is written straight away', () => {
    const piece = GameCharacter.create('put down', 1, '');
    const directive = mount(piece);
    directive.posX = 140;
    directive.input!.isGrabbing = false;

    directive.commitPosition();

    expect(transient.placementOf(piece.identifier)).toBeNull();
    expect(piece.location.x).toBe(140);
  });

  it('shows the outline of where the piece would land on another face, and takes it away', () => {
    const piece = GameCharacter.create('over a wall', 1, '');
    const directive = mount(piece);
    directive.width = 40;
    directive.height = 60;
    vi.spyOn(directive.tableSurfaces, 'pointOn').mockReturnValue({
      t: 1,
      point: { x: 0, y: 0, z: 0 },
      localX: 500,
      localY: 100,
    });
    vi.spyOn(directive.tableSurfaces, 'sizeOf').mockReturnValue({ width: 1000, height: 300 });

    directive.updateDragPreview('north-wall');
    expect(transient.dropPreview()).toEqual({ surface: 'north-wall', x: 480, y: 70, width: 40, height: 60 });

    directive.clearDragPreview();
    expect(transient.dropPreview()).toBeNull();
  });
});
