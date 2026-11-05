import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_TABLE_CAMERA_VIEW, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableAmbienceComponent } from '@axe/features/tabletop/table-ambience/table-ambience.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';

describe('TableAmbienceComponent', () => {
  let fixture: ComponentFixture<TableAmbienceComponent>;
  let ambience: TableAmbience;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableAmbienceComponent],
      providers: [...TEST_PROVIDERS],
    });

    // What the particles look like is settled by the domain specs. This watches only the
    // placement, so it never takes hold of a 2D context, which differs between runtimes.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);

    ambience = TableAmbience.create('毒沼', 'swamp', 4, 4);
    fixture = TestBed.createComponent(TableAmbienceComponent);
    fixture.componentRef.setInput('ambience', ambience);
    const table = TestBed.inject(TabletopService).currentTable;
    table.mode2d = false;
    table.tabletopMenuStyle = 'four-way';
  });

  afterEach(() => {
    ObjectStore.instance.remove(ambience);
    vi.restoreAllMocks();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('sizes itself by the cells it covers', () => {
    const gridSize = TestBed.inject(TabletopService).gridSize();
    fixture.detectChanges();

    const root = element().querySelector<HTMLElement>('div')!;
    expect(root.style.width).toBe(`${4 * gridSize}px`);
    expect(root.style.height).toBe(`${4 * gridSize}px`);
  });

  it('lays the surface down', () => {
    fixture.detectChanges();

    const surface = element().querySelectorAll<HTMLElement>('div')[1];
    expect(surface.style.background.length).toBeGreaterThan(0);
  });

  it('draws the flat surface and the upright part on separate canvases', () => {
    fixture.detectChanges();

    const canvases = Array.from(element().querySelectorAll<HTMLElement>('effect-canvas'));
    expect(canvases.length).toBeGreaterThanOrEqual(2);

    const [surface, ...vapors] = canvases;
    // The surface stays flat on the board while only the upright part faces the camera.
    expect(surface.style.transform).toBe('');
    expect(vapors.length).toBeGreaterThan(0);
    for (const vapor of vapors) expect(vapor.style.transform).toContain('rotateX(');
  });

  it('layers the upright part deeper over a wider area', async () => {
    // A single sheet puts the far and the near at the same depth, which reads as a band.
    fixture.detectChanges();
    const narrow = fixture.componentInstance.vaporSheets().length;

    ambience.width = 16;
    ambience.height = 16;
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    expect(fixture.componentInstance.vaporSheets().length).toBeGreaterThan(narrow);
  });

  it('raises the far sheets above the near ones', async () => {
    ambience.height = 16;
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    const grounds = fixture.componentInstance.vaporSheets().map((sheet) => sheet.groundY);
    expect(grounds.length).toBeGreaterThan(1);
    for (let index = 1; index < grounds.length; index++) {
      expect(grounds[index]).toBeGreaterThan(grounds[index - 1]);
    }
  });

  it('stands the sheets one behind another along the line of sight as the table is turned side on', async () => {
    ambience.width = 16;
    await new Promise((resolve) => setTimeout(resolve, 20));
    TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 90);
    fixture.detectChanges();

    const sheets = fixture.componentInstance.vaporSheets();
    expect(sheets.length).toBeGreaterThan(1);
    const gridSize = TestBed.inject(TabletopService).gridSize();
    for (const sheet of sheets) expect(sheet.groundY).toBeCloseTo(2 * gridSize);
    const canvas = element().querySelectorAll<HTMLElement>('effect-canvas')[1];
    expect(canvas.style.transform).toContain(`translate3d(${sheets[0].groundX}px`);
  });

  it('lets the board take the pointer while it is locked', () => {
    ambience.isLock = true;
    fixture.detectChanges();

    const surface = element().querySelectorAll<HTMLElement>('div')[1];
    expect(surface.hasAttribute('data-table-passthrough')).toBe(true);
  });

  describe('context menu display', () => {
    function openMenu(mode2d: boolean, menuStyle: 'four-way' | 'radial' | 'standard'): void {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = mode2d;
      table.tabletopMenuStyle = menuStyle;
      table.radialMenuRotationSpeed = 9;
      fixture.detectChanges();
      vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
      TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);

      element().dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
    }

    it.each(['radial', 'four-way'] as const)('opens the four-way menu when the style is %s', (style) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      openMenu(true, style);

      expect(openRadial).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        expect.any(Array),
        '毒沼',
        style === 'radial',
        9,
        1
      );
      expect(openRadial.mock.calls[0]?.[2].map((group) => group.name)).toEqual(['見た目', 'オブジェクト操作']);
      expect(openOrdinary).not.toHaveBeenCalled();
    });

    it('keeps the ordinary menu outside 2D mode', () => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      openMenu(false, 'radial');

      expect(openOrdinary).toHaveBeenCalledWith(expect.objectContaining({ x: 240, y: 180 }), expect.any(Array), '毒沼');
      expect(openRadial).not.toHaveBeenCalled();
    });
  });

  describe('changing it after it is placed', () => {
    /**
     * A computed that reads the version and returns the object hands back the same reference,
     * so nothing downstream hears the change and neither the lock nor the size takes effect.
     */
    async function applyChange(change: () => void): Promise<void> {
      fixture.detectChanges();
      change();
      await new Promise((resolve) => setTimeout(resolve, 20));
      fixture.detectChanges();
    }

    it('cannot be moved once locked', async () => {
      fixture.detectChanges();
      const movable = fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
      expect(movable.isDisable()).toBe(false);

      await applyChange(() => (ambience.isLock = true));

      expect(movable.isDisable()).toBe(true);
    });

    it('takes a change of size at once', async () => {
      const gridSize = TestBed.inject(TabletopService).gridSize();

      await applyChange(() => {
        ambience.width = 12;
        ambience.height = 20;
      });

      expect(fixture.componentInstance.pixelWidth()).toBe(12 * gridSize);
      expect(fixture.componentInstance.pixelHeight()).toBe(20 * gridSize);
    });

    it('takes a change of kind at once', async () => {
      const before = fixture.componentInstance.surfaceWash();

      await applyChange(() => (ambience.ambienceKind = 'lava'));

      expect(fixture.componentInstance.surfaceWash()).not.toBe(before);
    });
  });

  describe('over a table drawn on a canvas', () => {
    const layout: TableLayout = { left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 750 };
    /** How far apart where the area is laid and where the canvas draws it may be, as the matrix is written rounded. */
    const SCREEN_SLACK_PX = 0.25;

    function laidOverCanvas(withCamera = true): void {
      if (withCamera) {
        const camera = TestBed.inject(TableCameraService);
        camera.setLayout(layout);
        camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
      }
      ambience.location = { name: 'table', x: 200, y: 150 };
      fixture.componentRef.setInput('overCanvas', true);
      fixture.detectChanges();
    }

    /** Where a point of the area is drawn on the screen, as the matrix it is laid with carries it. */
    function onScreenOf(laid: HTMLElement, x: number, y: number): { x: number; y: number } {
      const m = /matrix3d\((.*)\)/.exec(laid.style.transform)![1].split(',').map(Number);
      const w = m[3] * x + m[7] * y + m[15];
      return { x: (m[0] * x + m[4] * y + m[12]) / w, y: (m[1] * x + m[5] * y + m[13]) / w };
    }

    function laidArea(): HTMLElement {
      return element().querySelector<HTMLElement>('[data-part="area"]')!.parentElement!;
    }

    it('lays the area on the screen where the canvas draws the corners of the ground it covers', () => {
      laidOverCanvas();
      const screen = TestBed.inject(TableCameraService).screenOf()!;
      const size = 4 * TestBed.inject(TabletopService).gridSize();

      for (const [x, y] of [
        [0, 0],
        [size, 0],
        [size, size],
        [0, size],
      ]) {
        const drawn = screen(200 + x, 150 + y, 0);
        const laid = onScreenOf(laidArea(), x, y);
        expect(Math.hypot(laid.x - drawn.x, laid.y - drawn.y)).toBeLessThan(SCREEN_SLACK_PX);
      }
    });

    it('lays the area where it is held while it is dragged', () => {
      laidOverCanvas();
      const transient = TestBed.inject(TransientPlacementService);
      transient.place(ambience.identifier, { surface: 'floor', x: 300, y: 150, z: 0 });
      fixture.detectChanges();

      const drawn = TestBed.inject(TableCameraService).screenOf()!(300, 150, 0);
      const laid = onScreenOf(laidArea(), 0, 0);
      expect(Math.hypot(laid.x - drawn.x, laid.y - drawn.y)).toBeLessThan(SCREEN_SLACK_PX);
      transient.release(ambience.identifier);
    });

    it('stands what rises from it on the screen, facing it, where the canvas draws the ground it rises from', () => {
      laidOverCanvas();
      const sheets = fixture.componentInstance.vaporSheets();
      expect(sheets.length).toBeGreaterThan(0);

      const canvases = Array.from(element().querySelectorAll<HTMLElement>('effect-canvas')).filter(
        (canvas) => !laidArea().contains(canvas)
      );
      expect(canvases.length).toBe(sheets.length);
      const at = TestBed.inject(TableCameraService).screenOf()!(200 + sheets[0].groundX, 150 + sheets[0].groundY, 0, 8);
      expect(canvases[0].style.transform).toContain(`translate(${at.x}px, ${at.y}px) scale(${at.scale})`);
      for (const canvas of canvases) expect(canvas.style.transform).not.toContain('rotateX(');
    });

    it('is pressed where it lies, and says which look it is', () => {
      laidOverCanvas();

      expect(element().getAttribute('data-object-id')).toBe(ambience.identifier);
      const area = element().querySelector<HTMLElement>('[data-part="area"]')!;
      expect(area.classList).toContain('pointer-events-auto');
      expect(area.style.background.length).toBeGreaterThan(0);
    });

    it('moves by the cells it covers, not by the box it is drawn in', () => {
      laidOverCanvas();
      const movable = fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
      const size = 4 * TestBed.inject(TabletopService).gridSize();

      expect(movable.footprintNow()).toEqual({ width: size, height: size });
    });

    it('lays nothing before the camera is set', () => {
      laidOverCanvas(false);

      expect(element().querySelector('[data-part="area"]')).toBeNull();
      expect(element().querySelectorAll('effect-canvas').length).toBe(0);
    });
  });
});
