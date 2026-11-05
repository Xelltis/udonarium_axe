import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService as ObjectChangeServiceForSpec } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { defaultSwitchDefinition, newSwitchAction } from '@axe/domain/tabletop/board-switch/switch-definition';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { SwitchPressService } from '@axe/features/tabletop/board-switch/switch-press.service';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';

describe('TerrainComponent', () => {
  let component: TerrainComponent;
  let fixture: ComponentFixture<TerrainComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TerrainComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TerrainComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.restoreAllMocks());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('doors', () => {
    it('opens and shuts for a seat that may change the table, and not for a guest', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Guest;
      const door = Terrain.create('door', 0.25, 1, 2, '', '');
      door.doorStyle = DoorStyle.SWING;
      fixture.componentRef.setInput('terrain', door);

      component['onDoorClick']();
      expect(door.isDoorOpen).toBe(false);

      PeerCursor.myCursor.role = PeerRole.Player;
      TestBed.inject(ObjectChangeServiceForSpec).notifyChanged(PeerCursor.myCursor.identifier);
      component['onDoorClick']();
      expect(door.isDoorOpen).toBe(true);

      door.destroy();
    });

    it('says on its element whether it is a door and whether it stands open', () => {
      const door = Terrain.create('door', 0.25, 1, 2, '', '');
      fixture.componentRef.setInput('terrain', door);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.hasAttribute('data-door')).toBe(false);
      expect(host.getAttribute('data-object-id')).toBe(door.identifier);

      door.doorStyle = DoorStyle.SWING;
      TestBed.inject(ObjectChangeServiceForSpec).notifyChanged(door.identifier);
      fixture.detectChanges();
      expect(host.getAttribute('data-door')).toBe('closed');

      door.isDoorOpen = true;
      TestBed.inject(ObjectChangeServiceForSpec).notifyChanged(door.identifier);
      fixture.detectChanges();
      expect(host.getAttribute('data-door')).toBe('open');

      door.destroy();
    });
  });

  describe('the guide to how high it floats', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.initialize();
      TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    });

    afterEach(() => table.destroy());

    type Guide = { lifted: { x: number; y: number; height: number }; altitude: number } | null;
    const guide = () => (component as unknown as { altitudeGuide(): Guide }).altitudeGuide();

    function floating(wall: string, altitude: number): Terrain {
      const terrain = Terrain.create('浮く箱', 2, 4, 1, wall, 'floor.png');
      terrain.location = { name: 'table', x: 100, y: 200 };
      terrain.altitude = altitude;
      terrain.isAltitudeIndicate = true;
      table.appendChild(terrain);
      fixture.componentRef.setInput('terrain', terrain);
      return terrain;
    }

    it('runs from the middle of a raised block’s foot down to the face, and is drawn', async () => {
      vi.spyOn(TestBed.inject(ImageService), 'getSkeletonOr').mockReturnValue({ url: 'blob:wall' } as never);
      floating('wall.png', 2);
      fixture.detectChanges();
      await fixture.whenStable();

      const grid = component.gridSize;
      expect(guide()).toMatchObject({ lifted: { x: 100 + grid, y: 200 + 2 * grid, height: 2 * grid }, altitude: 2 });
      expect((fixture.nativeElement as HTMLElement).querySelector('altitude-guide')).not.toBeNull();
    });

    it('reaches the top of a raised block with no wall to stand on', () => {
      floating('wall.png', 2).mode = TerrainViewState.FLOOR;

      expect(guide()?.altitude).toBe(3);
    });

    it('is left out for a block standing through the face, on a wall, or set not to show it', () => {
      vi.spyOn(TestBed.inject(ImageService), 'getSkeletonOr').mockReturnValue({ url: 'blob:wall' } as never);
      const through = floating('wall.png', -0.5);
      expect(guide()).toBeNull();

      through.altitude = 2;
      through.location = { name: 'table', x: 100, y: 200, surface: 'north-wall' };
      expect(guide()).toBeNull();

      through.location = { name: 'table', x: 100, y: 200 };
      through.isAltitudeIndicate = false;
      expect(guide()).toBeNull();
    });
  });

  describe('the turn handle', () => {
    function rotationDisabledFor2dTerrain(locked: boolean, sharedMode2d = true, seatFlat = false): boolean {
      const terrain = Terrain.create('2D terrain', 2, 3, 1, '', '');
      terrain.isLocked = locked;
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = sharedMode2d;
      TestBed.inject(ViewModePreferenceService).choose(seatFlat ? 'flat' : 'auto');
      fixture.componentRef.setInput('terrain', terrain);
      fixture.detectChanges();

      const rotable = fixture.debugElement.query(By.directive(RotableDirective)).injector.get(RotableDirective);
      const disabled = rotable.isDisable();
      terrain.destroy();
      return disabled;
    }

    it('hands the handle back on a table seen from above, the way it does on one seen along', () => {
      expect(rotationDisabledFor2dTerrain(false)).toBe(false);
      expect(rotationDisabledFor2dTerrain(false, false)).toBe(false);
      expect(rotationDisabledFor2dTerrain(false, false, true)).toBe(false);
      expect(fixture.nativeElement.querySelector('.rotate-grab')).toBeTruthy();
    });

    it('keeps it from a terrain that has been fixed in place', () => {
      expect(rotationDisabledFor2dTerrain(true)).toBe(true);
    });
  });

  describe('its right-click menu', () => {
    it('hands a right-click to the terrain menu, and keeps it from the browser and the table', () => {
      const terrain = Terrain.create('地形メニュー', 2, 3, 1, '', '');
      fixture.componentRef.setInput('terrain', terrain);
      fixture.detectChanges();
      const open = vi.spyOn(TestBed.inject(TerrainMenuService), 'open').mockImplementation(() => undefined);
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const stop = vi.spyOn(event, 'stopPropagation');

      fixture.nativeElement.dispatchEvent(event);

      expect(open).toHaveBeenCalledWith(terrain);
      expect(event.defaultPrevented).toBe(true);
      expect(stop).toHaveBeenCalled();
      terrain.destroy();
    });
  });
  describe('a block made into a switch', () => {
    let press: ReturnType<typeof vi.spyOn>;

    function lever(locked = true): Terrain {
      const terrain = Terrain.create('宝箱', 1, 1, 1, 'wall.png', 'floor.png');
      terrain.isLocked = locked;
      return terrain;
    }

    function makeSwitch(terrain: Terrain): BoardSwitch {
      const made = new BoardSwitch();
      made.initialize();
      made.write({
        ...defaultSwitchDefinition(),
        label: '開ける',
        actions: [{ ...newSwitchAction('say'), text: 'hi' }],
      });
      terrain.appendChild(made);
      return made;
    }

    function show(terrain: Terrain): void {
      fixture.componentRef.setInput('terrain', terrain);
      fixture.detectChanges();
    }

    function block(): HTMLElement {
      return fixture.nativeElement.querySelector('[data-part="top"]');
    }

    function box(): HTMLElement {
      return fixture.nativeElement.querySelector('[data-hud-box]');
    }

    function click(from: { x: number; y: number }, to: { x: number; y: number }): void {
      block().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from.x, clientY: from.y }));
      block().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: to.x, clientY: to.y }));
    }

    function label(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="terrain-switch-label"] span');
    }

    beforeEach(() => {
      PeerCursor.createMyCursor().role = PeerRole.Player;
      press = vi.spyOn(TestBed.inject(SwitchPressService), 'press').mockResolvedValue('pressed');
    });

    afterEach(() => {
      TestBed.inject(ButtonGuideService).hide();
      PeerCursor.myCursor = null!;
    });

    it('presses the switch when the locked block is clicked where it was pressed', () => {
      const terrain = lever();
      const made = makeSwitch(terrain);
      show(terrain);

      click({ x: 10, y: 10 }, { x: 12, y: 11 });

      expect(press).toHaveBeenCalledWith(made);
      expect(box().hasAttribute('data-switch-host')).toBe(true);
    });

    it('takes a click that ends away from where it began for the end of turning the table', () => {
      const terrain = lever();
      makeSwitch(terrain);
      show(terrain);

      click({ x: 10, y: 10 }, { x: 60, y: 10 });

      expect(press).not.toHaveBeenCalled();
    });

    it('leaves a block that is not locked to be picked up rather than pressed', () => {
      const terrain = lever(false);
      makeSwitch(terrain);
      show(terrain);

      click({ x: 10, y: 10 }, { x: 10, y: 10 });

      expect(press).not.toHaveBeenCalled();
      expect(box().hasAttribute('data-switch-host')).toBe(false);
    });

    it('writes its name over the block for a player once it can be pressed, and for the master while it is set up', () => {
      const terrain = lever(false);
      makeSwitch(terrain);
      show(terrain);
      expect(label()).toBeNull();

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeServiceForSpec).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();
      expect(label()?.textContent?.trim()).toBe('開ける');

      PeerCursor.myCursor.role = PeerRole.Player;
      terrain.isLocked = true;
      TestBed.inject(ObjectChangeServiceForSpec).notifyChanged(PeerCursor.myCursor.identifier);
      objectChanged$.emit({ aliasName: 'terrain', identifier: terrain.identifier, isSendFromSelf: true });
      fixture.detectChanges();
      expect(label()?.textContent?.trim()).toBe('開ける');
    });

    it('shows its name at rest only while the guide to the buttons is out', () => {
      const terrain = lever();
      makeSwitch(terrain);
      show(terrain);
      expect(label()?.classList).toContain('opacity-0');

      TestBed.inject(ButtonGuideService).show();
      fixture.detectChanges();

      expect(label()?.classList).not.toContain('opacity-0');
    });

    it('picks up a switch hung under the block after it was drawn', () => {
      const terrain = lever();
      show(terrain);
      expect(label()).toBeNull();

      makeSwitch(terrain);
      fixture.detectChanges();

      expect(label()?.textContent?.trim()).toBe('開ける');
    });

    it('follows the name the master writes after the block was drawn', () => {
      const terrain = lever();
      const made = makeSwitch(terrain);
      show(terrain);

      made.write({ ...made.def, label: '宝箱を開ける' });
      objectChanged$.emit({ aliasName: 'board-switch', identifier: made.identifier, isSendFromSelf: true });
      fixture.detectChanges();

      expect(label()?.textContent?.trim()).toBe('宝箱を開ける');
    });

    it('says over the block why a press came to nothing', async () => {
      press.mockResolvedValue('watching');
      const terrain = lever();
      makeSwitch(terrain);
      show(terrain);

      click({ x: 10, y: 10 }, { x: 10, y: 10 });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(label()?.textContent?.trim()).toBe('見学中は押せません');
      expect(label()?.classList).not.toContain('opacity-0');
    });
  });
});
