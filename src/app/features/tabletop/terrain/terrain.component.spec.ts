import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_TERRAIN_GRID_RASTER, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { SlopeDirection } from '@axe/domain/tabletop/terrain-slope';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';

/** happy-dom hands back no drawing context, and the grid render writes to one. */
function stubCanvasContext(): void {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as null);
}

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
    stubCanvasContext();
    fixture = TestBed.createComponent(TerrainComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.clear();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('what one block costs to draw', () => {
    it('draws a locked wall out of the elements it takes', () => {
      const wall = Terrain.create('wall', 2, 1, 3, 'wall.png', 'floor.png');
      wall.isLocked = true;
      fixture.componentRef.setInput('terrain', wall);
      fixture.detectChanges();

      const drawn = fixture.nativeElement.querySelectorAll('*').length;

      // The ledger a voxel table is weighed against: a plain wall, standing still.
      // Thirteen, counting the underside a block off the ground would be seen into without.
      expect(drawn).toBe(13);
    });
  });

  describe('a block that reaches past the edge of the table', () => {
    /** Darkness on, fog off, read by a player. */
    function darkTable(): GameTable {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = 50;
      table.darknessEnabled = true;
      table.fogEnabled = false;
      table.initialize();

      const cursor = new PeerCursor();
      cursor.userId = 'p1';
      cursor.role = PeerRole.Player;
      cursor.initialize();
      PeerCursor.myCursor = cursor;
      return table;
    }

    it('is no brighter for being tall', () => {
      const table = darkTable();
      const low = Terrain.create('low', 1, 1, 1, 'floor.png', 'wall.png');
      low.location.x = 5 * 50;
      low.location.y = 5 * 50;
      table.appendChild(low);
      const tall = Terrain.create('tall', 1, 1, 6, 'floor.png', 'wall.png');
      tall.location.x = 8 * 50;
      tall.location.y = 5 * 50;
      table.appendChild(tall);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 2 * 50;
      pc.location.y = 2 * 50;
      table.appendChild(pc);

      fixture.componentRef.setInput('terrain', low);
      fixture.detectChanges();
      const lowAlphas = alphasOfImage((component as unknown as { topShade: () => { image: string } }).topShade().image);

      fixture.componentRef.setInput('terrain', tall);
      fixture.detectChanges();
      const tallAlphas = alphasOfImage(
        (component as unknown as { topShade: () => { image: string } }).topShade().image
      );

      // Height is not a light. A block six cells up is as dark as the one beside it.
      expect(Math.min(...tallAlphas)).toBeGreaterThanOrEqual(Math.min(...lowAlphas) - 0.01);
    });

    it('is no brighter past the edge than it is inside it', () => {
      const table = darkTable();
      // Two cells wide from the last column, so one cell is on the table and one is past it.
      const terrain = Terrain.create('wall', 2, 1, 2, 'floor.png', 'wall.png');
      terrain.location.x = 19 * 50;
      terrain.location.y = 5 * 50;
      table.appendChild(terrain);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 18 * 50;
      pc.location.y = 5 * 50;
      table.appendChild(pc);
      fixture.componentRef.setInput('terrain', terrain);
      fixture.detectChanges();

      const alphas = alphasOfImage((component as unknown as { topShade: () => { image: string } }).topShade().image);

      // Nothing here is lit, so every part of it is held back by the dark. A face left bright
      // is a face the dark never reached.
      expect(alphas.length).toBeGreaterThan(0);
      for (const alpha of alphas) expect(alpha).toBeGreaterThan(0.5);
    });
  });

  /** The dark is laid in whatever colour the table paints it with; what is read here is how much. */
  function alphasOfImage(image: string): number[] {
    return [...image.matchAll(/rgba\(\d+,\d+,\d+,([0-9.]+)\)/g)].map((m) => Number(m[1]));
  }

  describe('the colour a block is darkened with', () => {
    it('wears the colour the table paints its dark with, not a grey of its own', () => {
      vi.spyOn(TestBed.inject(VisionService), 'ambientShade').mockReturnValue({ color: '#204080', alpha: 0.9 });
      vi.spyOn(TestBed.inject(VisionService), 'terrainBrightness').mockReturnValue(0.5);
      vi.spyOn(TestBed.inject(VisionService), 'terrainTopBrightness').mockReturnValue(0.5);
      vi.spyOn(TestBed.inject(VisionService), 'terrainTopCover').mockReturnValue(null);
      fixture.componentRef.setInput('terrain', Terrain.create('block', 1, 1, 1, 'floor.png', 'wall.png'));
      fixture.detectChanges();

      const shade = (component as unknown as { topShade: () => { image: string } }).topShade();

      expect(shade.image).toContain('rgba(32,64,128,');
      expect(shade.image).not.toContain('rgba(0,0,0,');
    });

    it('falls back to black on a table with no dark of its own', () => {
      vi.spyOn(TestBed.inject(VisionService), 'ambientShade').mockReturnValue(null);
      vi.spyOn(TestBed.inject(VisionService), 'terrainBrightness').mockReturnValue(0.5);
      vi.spyOn(TestBed.inject(VisionService), 'terrainTopBrightness').mockReturnValue(0.5);
      vi.spyOn(TestBed.inject(VisionService), 'terrainTopCover').mockReturnValue(null);
      fixture.componentRef.setInput('terrain', Terrain.create('block', 1, 1, 1, 'floor.png', 'wall.png'));
      fixture.detectChanges();

      expect((component as unknown as { topShade: () => { image: string } }).topShade().image).toContain('rgba(0,0,0,');
    });
  });

  describe('the roof of a raised block', () => {
    /** A cover whose cells are all at one brightness, as terrainTopCover would report. */
    function evenCover(brightness: number) {
      return {
        cols: 2,
        rows: 2,
        cleared: [true, true, true, true],
        brightness: [brightness, brightness, brightness, brightness],
      };
    }

    function roofImage(topCover: ReturnType<typeof evenCover> | null): string {
      const vision = TestBed.inject(VisionService);
      vi.spyOn(vision, 'ambientShade').mockReturnValue(null);
      vi.spyOn(vision, 'terrainTopCover').mockReturnValue(topCover);
      vi.spyOn(vision, 'terrainTopBrightness').mockReturnValue(0);
      // A block two cells tall, so its top is a surface raised above the floor.
      fixture.componentRef.setInput('terrain', Terrain.create('building', 2, 2, 2, 'floor.png', 'wall.png'));
      fixture.detectChanges();
      return (component as unknown as { topShade: () => { image: string } }).topShade().image;
    }

    it('renders the roof bright where a lamp standing on it lights it', () => {
      // The whole roof is lit: no shade is laid over the picture at all.
      expect(roofImage(evenCover(1))).not.toContain('rgba(');
    });

    it('renders the roof dark where nothing up there lights it', () => {
      // Barely lit: the picture is nearly blacked out.
      expect(roofImage(evenCover(0.08))).toContain('0.92');
    });

    it('reads the roof cell by cell, so a half-lit roof is half bright and half dark', () => {
      const cover = { cols: 2, rows: 1, cleared: [true, true], brightness: [1, 0.08] };
      const vision = TestBed.inject(VisionService);
      vi.spyOn(vision, 'ambientShade').mockReturnValue(null);
      vi.spyOn(vision, 'terrainTopCover').mockReturnValue(cover);
      vi.spyOn(vision, 'terrainTopBrightness').mockReturnValue(0);
      fixture.componentRef.setInput('terrain', Terrain.create('building', 2, 1, 2, 'floor.png', 'wall.png'));
      fixture.detectChanges();

      const image = (component as unknown as { topShade: () => { image: string } }).topShade().image;

      // A per-cell gradient runs left to right: the lit cell near clear, the dark cell near black.
      expect(image).toContain('linear-gradient(to right');
      expect(image).toContain('0.92');
    });
  });

  describe('viewRotateZ computed signal', () => {
    it('starts at ten', () => {
      expect(component.viewRotateZ()).toBe(10);
    });

    it('turns with the table view', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      uiSignalService.notifyTableViewRotation(50, 20, 45);
      expect(component.viewRotateZ()).toBe(45);
    });
  });

  describe('doors', () => {
    it('runs a sliding door the length of itself, into the wall it was set into', () => {
      const terrain = Terrain.create('sliding door', 0.25, 1, 2, '', '');
      terrain.doorStyle = DoorStyle.SLIDE;
      terrain.isDoorOpen = true;
      fixture.componentRef.setInput('terrain', terrain);

      expect(component.doorTransform()).toBe(` translateY(${component.gridSize}px)`);

      terrain.destroy();
    });

    it('turns the other one of a pair the other way, so the two open apart', async () => {
      const door = Terrain.create('door', 0.25, 1, 2, '', '');
      door.doorStyle = DoorStyle.SWING;
      door.isDoorOpen = true;
      fixture.componentRef.setInput('terrain', door);
      const swing = component.doorTransform();
      const hinge = component.doorOrigin();

      door.doorMirrored = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(component.doorTransform()).not.toBe(swing);
      expect(component.doorOrigin()).not.toBe(hinge);

      door.destroy();
    });
  });

  describe('the underside of a block', () => {
    function blockAt(altitude: number): Terrain {
      const terrain = Terrain.create('block', 1, 1, 1, 'wall-image', 'floor-image');
      terrain.altitude = altitude;
      fixture.componentRef.setInput('terrain', terrain);
      return terrain;
    }

    function underside(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="terrain-bottom"]');
    }

    it('is drawn however high the block stands, since how it got there is no help', async () => {
      // Built at a height, stacked on another block, or standing on the table: the underside
      // is wanted for the first two and hidden by the table itself for the third.
      for (const [altitude, posZ] of [
        [3, 0],
        [0, 150],
        [0, 0],
      ]) {
        const terrain = blockAt(altitude);
        terrain.posZ = posZ;
        fixture.detectChanges();
        await fixture.whenStable();

        expect(underside(), `altitude ${altitude}, posZ ${posZ}`).not.toBeNull();

        terrain.destroy();
      }
    });

    it('is cut to the hex a block stands on, the way its roof is', async () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      const terrain = blockAt(3);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(underside()!.style.clipPath).toBe(component.hexFloorClipPath());
      expect(component.hexFloorClipPath()).toContain('polygon');

      terrain.destroy();
      table.gridType = GridType.SQUARE;
    });

    it('is left off a block that is nothing but a wall, which has no floor to be under', async () => {
      const terrain = blockAt(3);
      terrain.mode = TerrainViewState.WALL;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(underside()).toBeNull();

      terrain.destroy();
    });

    it('blinks with the rest of a block nobody has pinned down', async () => {
      const terrain = blockAt(3);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(underside()!.classList.contains('blinking-animation')).toBe(true);

      terrain.isLocked = true;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(underside()!.classList.contains('blinking-animation')).toBe(false);

      terrain.destroy();
    });
  });

  describe('a terrain nobody gave a picture to', () => {
    function blankWall(): Terrain {
      const terrain = Terrain.create('wall', 1, 1, 2, '', '');
      fixture.componentRef.setInput('terrain', terrain);
      return terrain;
    }

    it('is glass rather than a white block', async () => {
      const terrain = blankWall();
      await fixture.whenStable();

      expect(component.isBlank()).toBe(true);
      expect(component.northFaceImage().url).toBe('');
      expect(component.topFaceImage().url).toBe('');

      terrain.destroy();
    });

    it('stops being glass the moment it is given one', async () => {
      const terrain = blankWall();
      terrain.setFaceImage('north', 'some-image');
      await fixture.whenStable();

      expect(component.isBlank()).toBe(false);

      terrain.destroy();
    });

    it('shows the game master where it stands', async () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const terrain = blankWall();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('[data-testid="terrain-blank-outline"]')).not.toBeNull();

      terrain.destroy();
    });

    it('shows a player nothing of it at all', async () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.Player;
      const terrain = blankWall();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('[data-testid="terrain-blank-outline"]')).toBeNull();

      terrain.destroy();
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
  describe('the slope of a block', () => {
    let terrain: Terrain;
    let wasGridType: GridType;

    beforeEach(() => {
      wasGridType = component.currentTable.gridType;
      terrain = Terrain.create('sloping block', 2, 2, 2, 'W', 'F');
      fixture.componentRef.setInput('terrain', terrain);
    });

    afterEach(() => {
      component.currentTable.gridType = wasGridType;
      terrain.destroy();
    });

    function faceAt(x: number, y: number): number {
      const face = component
        .slopeFaces()
        .map((_, index) => component.slopeRoof()!.faces[index])
        .find((candidate) =>
          candidate.polygon.length > 2 ? candidate.plane.a * x + candidate.plane.b * y + candidate.plane.c >= 0 : false
        );
      return face ? face.plane.a * x + face.plane.b * y + face.plane.c : 0;
    }

    it('draws nothing of a slope while the block is flat', () => {
      expect(component.slopeFaces()).toEqual([]);
      expect(component.slopeRoof()).toBeNull();
      expect(component.northWallCut()).toEqual({ shown: true, clipPath: null });
    });

    it('draws one leaning piece for a block sloping to one side', () => {
      terrain.slopeSides = ['s'];
      fixture.detectChanges();

      const faces = component.slopeFaces();
      expect(faces).toHaveLength(1);
      expect(faces[0].transform).toContain('matrix3d(');
      // The slope stands the block's full height where it is highest, along the north edge.
      expect(faceAt(50, 0)).toBeCloseTo(terrain.height * component.gridSize);
    });

    it('draws a piece for every side of a pyramid', () => {
      terrain.slopeSides = ['n', 'e', 's', 'w'];
      fixture.detectChanges();

      expect(component.slopeFaces()).toHaveLength(4);
      for (const face of component.slopeFaces()) {
        expect(face.clipPath).toMatch(/^polygon\(/);
        expect(face.transform).toMatch(/^matrix3d\(/);
      }
    });

    it('takes away the wall on a side the slope runs down to, and cuts the ones beside it', () => {
      terrain.slopeSides = ['s'];
      fixture.detectChanges();

      expect(component.southWallCut().shown).toBe(false);
      expect(component.northWallCut()).toEqual({ shown: true, clipPath: expect.stringContaining('polygon(') });
      expect(component.westWallCut().clipPath).toContain('0.00%');
    });

    it('leaves no wall at all on a pyramid', () => {
      terrain.slopeSides = ['n', 'e', 's', 'w'];
      fixture.detectChanges();

      for (const cut of [
        component.northWallCut(),
        component.southWallCut(),
        component.westWallCut(),
        component.eastWallCut(),
      ]) {
        expect(cut.shown).toBe(false);
      }
    });

    it('shades each piece by the way it runs down, as a slope has always been shaded', () => {
      terrain.isSurfaceShading = true;
      terrain.slopeSides = ['n', 's'];
      fixture.detectChanges();

      const faces = component.slopeFaces();
      const northward = faces.find((_, index) => component.slopeRoof()!.faces[index].side === 'n')!;
      const southward = faces.find((_, index) => component.slopeRoof()!.faces[index].side === 's')!;
      expect(northward.brightness).toBeLessThan(southward.brightness);
    });

    it('slopes a hex block to its own six sides', () => {
      component.currentTable.gridType = GridType.HEX_VERTICAL;
      terrain.slopeSides = ['n', 'ne', 'se', 's', 'sw', 'nw'];
      fixture.detectChanges();

      expect(component.slopeSides()).toEqual(['n', 'ne', 'se', 's', 'sw', 'nw']);
      expect(component.slopeFaces()).toHaveLength(6);
      // The hexagon of cells is notched, and the slope only reaches the ground at the six
      // sides themselves, so the walls in the notches are all that is left standing.
      expect(component.hexWallCuts().some((cut) => !cut.shown)).toBe(true);
    });

    it('leaves a single hex cell no walls at all when it slopes to every side', () => {
      component.currentTable.gridType = GridType.HEX_VERTICAL;
      const cell = Terrain.create('one cell', 1, 1, 2, 'W', 'F');
      cell.slopeSides = ['n', 'ne', 'se', 's', 'sw', 'nw'];
      fixture.componentRef.setInput('terrain', cell);
      fixture.detectChanges();

      expect(component.slopeFaces()).toHaveLength(6);
      expect(component.hexWallCuts().every((cut) => !cut.shown)).toBe(true);
      cell.destroy();
    });

    it('reads a room saved before a block could slope to more than one side', () => {
      terrain.isSlope = true;
      terrain.slopeDirection = SlopeDirection.LEFT;
      fixture.detectChanges();

      expect(component.slopeSides()).toEqual(['w']);
      expect(component.slopeFaces()).toHaveLength(1);
    });

    it('runs a slope with no direction at all down to the south, as it always has', () => {
      terrain.isSlope = true;
      fixture.detectChanges();

      expect(component.slopeSides()).toEqual(['s']);
    });

    it('reads its sides again once the grid under it changes shape', async () => {
      terrain.slopeSides = ['e'];
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.slopeSides()).toEqual(['e']);

      component.currentTable.gridType = GridType.HEX_VERTICAL;
      fixture.detectChanges();
      await fixture.whenStable();

      // A hex block of flat-topped cells has no side facing due east, so the slope takes the
      // one it points nearest to.
      expect(component.slopeSides()).toEqual(['ne']);
    });
  });

  describe('the grid it carries', () => {
    it('builds no canvas for terrain that was never asked to show a grid', async () => {
      const terrain = Terrain.create('wall', 1, 1, 2, '', '');
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(0);

      terrain.destroy();
    });

    it('builds one the moment the terrain is asked to show a grid', async () => {
      const terrain = Terrain.create('floor', 1, 1, 0, '', '');
      terrain.isGrid = true;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelectorAll('canvas')).toHaveLength(1);

      terrain.destroy();
    });

    it('cuts the grid once for a slope and copies it onto the other pieces of it', async () => {
      let copied = 0;
      const context = new Proxy({} as Record<string | symbol, unknown>, {
        get: (target, key) => {
          if (key === 'drawImage') return () => copied++;
          return key in target ? target[key] : () => undefined;
        },
        set: (target, key, value) => {
          target[key] = value;
          return true;
        },
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as null);
      const cut = vi.spyOn(GridLineRender.prototype, 'renderViewport');
      const table = component.currentTable;
      const wasGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      const terrain = Terrain.create('hex slope terrain', 3, 3, 1, '', '');
      terrain.isGrid = true;
      terrain.slopeSides = ['n', 'ne', 'se', 's', 'sw', 'nw'];
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      const canvases = fixture.nativeElement.querySelectorAll('canvas').length;
      expect(canvases).toBeGreaterThan(1);
      expect(cut).toHaveBeenCalledTimes(1);
      expect(copied).toBe(canvases - 1);

      table.gridType = wasGridType;
      terrain.destroy();
    });

    it('cuts the grid once for a key it has already cut', async () => {
      const terrain = Terrain.create('floor', 1, 1, 0, '', '');
      terrain.isGrid = true;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const table = component.currentTable;
      perfCounters.enabled = true;
      perfCounters.clear();

      objectChanged$.emit({ aliasName: 'game-table', identifier: table.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBeUndefined();

      terrain.destroy();
    });

    it('slides the cut grid across a move within one cell rather than cutting it again', async () => {
      const terrain = Terrain.create('floor', 2, 2, 0, '', '');
      terrain.isGrid = true;
      terrain.location.x = 100;
      terrain.location.y = 100;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const before = component.terrainGridCanvasStyle();
      perfCounters.enabled = true;
      perfCounters.clear();

      terrain.location.x = 107;
      objectChanged$.emit({ aliasName: 'terrain', identifier: terrain.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBeUndefined();
      const after = component.terrainGridCanvasStyle();
      expect(after.width).toBe(before.width);
      expect(Number.parseFloat(after.left) - Number.parseFloat(before.left)).toBe(-7);

      terrain.destroy();
    });

    it('cuts it again once the terrain crosses into the next cell', async () => {
      const terrain = Terrain.create('floor', 2, 2, 0, '', '');
      terrain.isGrid = true;
      terrain.location.x = 100;
      terrain.location.y = 100;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      perfCounters.enabled = true;
      perfCounters.clear();

      terrain.location.x = 100 + component.gridSize;
      objectChanged$.emit({ aliasName: 'terrain', identifier: terrain.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBe(1);

      terrain.destroy();
    });

    it('cuts it afresh for a turned terrain, whose canvas turns about its own centre', async () => {
      const terrain = Terrain.create('floor', 2, 2, 0, '', '');
      terrain.isGrid = true;
      terrain.location.x = 100;
      terrain.location.y = 100;
      terrain.rotate = 90;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const style = component.terrainGridCanvasStyle();
      perfCounters.enabled = true;
      perfCounters.clear();

      terrain.location.x = 107;
      objectChanged$.emit({ aliasName: 'terrain', identifier: terrain.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBe(1);
      expect(component.terrainGridCanvasStyle()).toEqual(style);

      terrain.destroy();
    });

    it('cuts it afresh for a terrain standing off the pixel grid', async () => {
      const terrain = Terrain.create('floor', 2, 2, 0, '', '');
      terrain.isGrid = true;
      terrain.location.x = 100.5;
      terrain.location.y = 100;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const style = component.terrainGridCanvasStyle();
      perfCounters.enabled = true;
      perfCounters.clear();

      terrain.location.x = 107.5;
      objectChanged$.emit({ aliasName: 'terrain', identifier: terrain.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBe(1);
      expect(component.terrainGridCanvasStyle()).toEqual(style);

      terrain.destroy();
    });

    it('cuts it again when the table changes the colour of its lines', async () => {
      const terrain = Terrain.create('floor', 1, 1, 0, '', '');
      terrain.isGrid = true;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const table = component.currentTable;
      const original = table.gridColor;
      perfCounters.enabled = true;
      perfCounters.clear();

      table.gridColor = '#ff0000';
      objectChanged$.emit({ aliasName: 'game-table', identifier: table.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(perfCounters.drain().get(PERF_TERRAIN_GRID_RASTER)).toBe(1);

      table.gridColor = original;
      terrain.destroy();
    });
  });

  describe('the place it hangs for lights', () => {
    async function wallFaceOverlays(darknessEnabled: boolean): Promise<number> {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = 50;
      table.darknessEnabled = darknessEnabled;
      table.initialize();
      ObjectStore.instance.add(table);

      const terrain = Terrain.create('wall', 1, 1, 2, 'wall', 'floor');
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      const count = fixture.nativeElement.querySelectorAll('.inset-0.overflow-hidden').length;
      terrain.destroy();
      ObjectStore.instance.delete(table, false);
      return count;
    }

    it('hangs one on every wall face of a table with dark in it', async () => {
      expect(await wallFaceOverlays(true)).toBe(4);
    });

    it('hangs none on a table with no dark in it', async () => {
      expect(await wallFaceOverlays(false)).toBe(0);
    });
  });

  describe('how it shades its faces', () => {
    it('lays the shade over the texture rather than filtering the face', async () => {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = 50;
      table.initialize();
      ObjectStore.instance.add(table);
      const terrain = Terrain.create('wall', 1, 1, 2, 'wall', 'floor');
      terrain.isSurfaceShading = true;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      const root = fixture.nativeElement as HTMLElement;
      const faces = [...root.querySelectorAll<HTMLElement>('[style*="background-image"]')];

      expect(faces.length).toBeGreaterThan(0);
      expect(faces.every((face) => face.style.filter === '')).toBe(true);
      expect(faces.some((face) => face.style.backgroundImage.includes('linear-gradient'))).toBe(true);

      terrain.destroy();
      ObjectStore.instance.delete(table, false);
    });
  });

  describe('the lights it shows on its walls', () => {
    interface WallLighting {
      northLights: () => unknown[];
      northSilhouettes: () => unknown[];
    }

    it('hands back the same lights however far a piece walks', async () => {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = 50;
      table.darknessEnabled = true;
      table.initialize();
      ObjectStore.instance.add(table);
      const terrain = Terrain.create('wall', 1, 1, 2, 'wall', 'floor');
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();
      const walls = component as unknown as WallLighting;
      const lights = walls.northLights();
      const silhouettes = walls.northSilhouettes();

      objectChanged$.emit({ aliasName: 'character', identifier: 'somebody', isSendFromSelf: true });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await fixture.whenStable();

      expect(walls.northLights()).toBe(lights);
      expect(walls.northSilhouettes()).toBe(silhouettes);

      terrain.destroy();
      ObjectStore.instance.delete(table, false);
    });
  });

  describe('the hex shape it stands on', () => {
    it('hands back the same shape after a change elsewhere on the table', async () => {
      const terrain = Terrain.create('hex terrain', 3, 3, 1, '', '');
      const table = component.currentTable;
      const originalGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      fixture.componentRef.setInput('terrain', terrain);
      const before = component.pedestalHexParams();

      objectChanged$.emit({ aliasName: 'game-table', identifier: table.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(component.pedestalHexParams()).toBe(before);

      table.gridType = originalGridType;
      terrain.destroy();
    });

    it('cuts a new one when the table changes what shape its cells are', async () => {
      const terrain = Terrain.create('hex terrain', 3, 3, 1, '', '');
      const table = component.currentTable;
      const originalGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      fixture.componentRef.setInput('terrain', terrain);
      const before = component.pedestalHexParams();

      table.gridType = GridType.HEX_HORIZONTAL;
      objectChanged$.emit({ aliasName: 'game-table', identifier: table.identifier, isSendFromSelf: true });
      await fixture.whenStable();

      expect(component.pedestalHexParams()).not.toBe(before);

      table.gridType = originalGridType;
      terrain.destroy();
    });
  });

  describe('terrainGridCanvasStyle', () => {
    it('centres the hex grid canvas within its clip', () => {
      const terrain = Terrain.create('hex terrain', 3, 3, 1, '', '');
      const table = component.currentTable;
      const originalGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      fixture.componentRef.setInput('terrain', terrain);

      const clipStyle = component.terrainGridClipStyle();
      const canvasStyle = component.terrainGridCanvasStyle();
      const clipWidth = Number.parseFloat(clipStyle.width);
      const clipHeight = Number.parseFloat(clipStyle.height);
      const canvasWidth = Number.parseFloat(canvasStyle.width);
      const canvasHeight = Number.parseFloat(canvasStyle.height);

      expect(Number.parseFloat(canvasStyle.left)).toBeCloseTo((clipWidth - canvasWidth) / 2);
      expect(Number.parseFloat(canvasStyle.top)).toBeCloseTo((clipHeight - canvasHeight) / 2);

      table.gridType = originalGridType;
      terrain.destroy();
    });

    it('lays the grid on each piece of a hex slope, leaning and cut with the piece', () => {
      const terrain = Terrain.create('hex slope terrain', 3, 3, 1, '', '');
      const table = component.currentTable;
      const originalGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      terrain.slopeSides = ['n', 'ne', 'se', 's', 'sw', 'nw'];
      fixture.componentRef.setInput('terrain', terrain);

      const faces = component.slopeFaces();
      const style = component.terrainGridFaceStyle(faces[0]);

      expect(faces).toHaveLength(6);
      expect(style.transform).toBe(faces[0].transform);
      expect(style['clip-path']).toBe(faces[0].clipPath);
      expect(style['transform-origin']).toBe('0 0');

      table.gridType = originalGridType;
      terrain.destroy();
    });
  });

  describe('the fog taking away the part of it nobody has reached', () => {
    /** Where a cell at (200, 200) falls on the twenty cell board these tests use. */
    const REACHED_CELL = 4 * 20 + 4;

    function foggyTable(): GameTable {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = 50;
      table.darknessEnabled = true;
      table.fogEnabled = true;
      table.fogColor = '#aeb9c4';
      table.initialize();

      const cursor = new PeerCursor();
      cursor.userId = 'p1';
      cursor.role = PeerRole.Player;
      cursor.initialize();
      PeerCursor.myCursor = cursor;

      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      bits.set(REACHED_CELL);
      ensureFogMemoryOn(table).write(grid, bits);
      return table;
    }

    afterEach(() => {
      PeerCursor.myCursor = null!;
      ObjectStore.instance.getObjects().forEach((obj) => ObjectStore.instance.delete(obj, false));
      ObjectStore.instance.clearDeleteHistory();
    });

    it('covers the cells it has not, and leaves the one it has', () => {
      const table = foggyTable();
      const terrain = Terrain.create('wall', 2, 1, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      fixture.componentRef.setInput('terrain', terrain);

      const veil = component['topFogStyle']() as Record<string, string> | null;
      expect(veil).not.toBeNull();
      expect(veil!['mask-image']).toContain('linear-gradient(to right');
      expect(veil!['-webkit-mask-image']).toBe(veil!['mask-image']);
      // Kept over the cell the party reached, taken away over the one it has not.
      expect(alphasOf(veil!['mask-image'])).toEqual([1, 0]);
      expect(component.isHiddenByFog()).toBe(false);
    });

    it('hides a face the party has reached no cell of', () => {
      const table = foggyTable();
      const terrain = Terrain.create('wall', 2, 1, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      fixture.componentRef.setInput('terrain', terrain);

      // The east cap stands on the far cell, which nobody has walked to.
      expect(component['faceFogStyle']('east')).toEqual({ display: 'none' });
      // The west cap stands on the cell they have, and is drawn as it is.
      expect(component['faceFogStyle']('west')).toBeNull();
    });

    it('lights the cell a lamp stands against and not the far end of the same wall', () => {
      const table = foggyTable();
      // Ten cells of wall, cleared at both ends, with a lamp against the near one only.
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      bits.set(4 * 20 + 4);
      bits.set(4 * 20 + 13);
      ensureFogMemoryOn(table).write(grid, bits);

      const terrain = Terrain.create('wall', 10, 1, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = 200;
      lamp.location.y = 250;
      table.appendChild(lamp);
      // Sight belongs to a piece; with nobody at the table there would rightly be no light.
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 150;
      pc.location.y = 300;
      fixture.componentRef.setInput('terrain', terrain);

      const css = component['shadedFace']('a.png', 1, 'south').image;
      expect(css).toContain('linear-gradient(to right');
      const alphas = alphasOf(css);
      // Dark is a high alpha: the near end is let through and the far end is held back.
      expect(alphas[0]).toBeLessThan(0.5);
      expect(alphas[alphas.length - 1]).toBeGreaterThan(0.8);
    });

    /** The dark is laid in whatever colour the table paints it with; what is read here is how much. */
    function alphasOf(image: string): number[] {
      return [...image.matchAll(/rgba\(\d+,\d+,\d+,([0-9.]+)\)/g)].map((m) => Number(m[1]));
    }

    /**
     * Ten cells of wall standing on end from (200, 200), cleared at both ends, with a lamp
     * against the north end and the piece beside it on the side given.
     */
    function standingWall(table: GameTable, pcX: number): Terrain {
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      bits.set(4 * 20 + 4);
      bits.set(13 * 20 + 4);
      ensureFogMemoryOn(table).write(grid, bits);

      const terrain = Terrain.create('wall', 1, 10, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = pcX;
      lamp.location.y = 200;
      table.appendChild(lamp);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = pcX;
      pc.location.y = 150;
      return terrain;
    }

    it('shades the east face from the south end, which is the end it is drawn from', () => {
      const terrain = standingWall(foggyTable(), 250);
      fixture.componentRef.setInput('terrain', terrain);

      const alphas = alphasOf(component['shadedFace']('a.png', 1, 'east').image);
      expect(alphas.length).toBeGreaterThan(1);
      expect(alphas[0]).toBeGreaterThan(0.8);
      expect(alphas[alphas.length - 1]).toBeLessThan(0.5);
    });

    it('shades the west face from the south end as well', () => {
      const terrain = standingWall(foggyTable(), 150);
      fixture.componentRef.setInput('terrain', terrain);

      const alphas = alphasOf(component['shadedFace']('a.png', 1, 'west').image);
      expect(alphas.length).toBeGreaterThan(1);
      expect(alphas[0]).toBeGreaterThan(0.8);
      expect(alphas[alphas.length - 1]).toBeLessThan(0.5);
    });

    it('shades the top of a wall standing on end a cell at a time', () => {
      const terrain = standingWall(foggyTable(), 250);
      fixture.componentRef.setInput('terrain', terrain);

      const top = component['shadedTop']('a.png');
      expect(top.style['background-size'].startsWith('100% 10%, 100% 10%')).toBe(true);
      const alphas = alphasOf(top.image);
      expect(alphas).toHaveLength(10);
      expect(alphas[0]).toBeLessThan(0.5);
      expect(alphas[9]).toBeGreaterThan(0.8);
    });

    it('covers a side face from the south end, which is the end it is drawn from', () => {
      const table = foggyTable();
      const terrain = Terrain.create('wall', 1, 2, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      fixture.componentRef.setInput('terrain', terrain);

      const top = component['topFogStyle']()!;
      expect(top['mask-size']).toBe('100% 50%, 100% 50%');
      expect(alphasOf(top['mask-image'])).toEqual([1, 0]);
      expect(alphasOf(component['faceFogStyle']('east')!['mask-image'])).toEqual([0, 1]);
      expect(alphasOf(component['faceFogStyle']('west')!['mask-image'])).toEqual([0, 1]);
    });

    it('measures a pool and a silhouette on a side face from the south end', () => {
      const terrain = Terrain.create('wall', 1, 10, 2, '', '');
      fixture.componentRef.setInput('terrain', terrain);
      const pool = { localX: 100, localY: 40, radiusX: 80, radiusY: 80, color: '#ffffff', intensity: 1 };
      const silhouette = { localX: 100, width: 40, height: 60, alpha: 0.75, imageUrl: '' };

      expect(component['wallLightStyle'](pool, 'south')['mask-image']).toContain('at 100px');
      expect(component['wallLightStyle'](pool, 'east')['mask-image']).toContain('at 400px');
      expect(component['wallLightStyle'](pool, 'west')['mask-image']).toContain('at 400px');
      expect(component['silhouetteStyle'](silhouette, 'north').left).toBe('80px');
      expect(component['silhouetteStyle'](silhouette, 'east').left).toBe('380px');

      terrain.destroy();
    });

    it('keeps the shade in one piece across a tiled texture', async () => {
      const table = foggyTable();
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const bits = new CellBits(cellCount(grid));
      for (let col = 4; col < 14; col++) bits.set(4 * 20 + col);
      ensureFogMemoryOn(table).write(grid, bits);

      const terrain = Terrain.create('wall', 10, 1, 2, 'wall', 'floor');
      terrain.isTiledTexture = true;
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = 200;
      lamp.location.y = 250;
      table.appendChild(lamp);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 150;
      pc.location.y = 300;
      fixture.componentRef.setInput('terrain', terrain);
      await fixture.whenStable();

      const root = fixture.nativeElement as HTMLElement;
      const shaded = [...root.querySelectorAll<HTMLElement>('[style*="background-image"]')].filter((el) =>
        el.style.backgroundImage.includes('linear-gradient(to right')
      );
      expect(shaded.length).toBeGreaterThan(0);
      for (const face of shaded) expect(face.style.backgroundSize).toBe('100% 100%, 50px 50px');
    });

    it('lays none at all on a table with no fog on it', () => {
      const table = foggyTable();
      table.fogEnabled = false;
      const terrain = Terrain.create('wall', 2, 1, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
      fixture.componentRef.setInput('terrain', terrain);

      expect(component['topFogStyle']()).toBeNull();
      expect(component.isHiddenByFog()).toBe(false);
    });
  });
});
