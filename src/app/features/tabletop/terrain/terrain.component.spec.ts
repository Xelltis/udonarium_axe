import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
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
import { DoorStyle, SlopeDirection, Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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

    it('splits the grid along the floor steps of a hex slope, mask and all', () => {
      const terrain = Terrain.create('hex slope terrain', 3, 3, 1, '', '');
      const table = component.currentTable;
      const originalGridType = table.gridType;
      table.gridType = GridType.HEX_VERTICAL;
      terrain.isSlope = true;
      terrain.slopeDirection = SlopeDirection.BOTTOM;
      fixture.componentRef.setInput('terrain', terrain);

      const step = component.hexSlopeSteps().floors[0];
      const style = component.terrainGridClipStepStyle(step);

      expect(component.hexSlopeSteps().floors.length).toBeGreaterThan(1);
      expect(style.transform).toBe(`translateZ(${step.heightPx}px)`);
      expect(style.mask).toBe(step.mask);
      expect(style['-webkit-mask']).toBe(step.mask);
      expect(style['clip-path']).toBeUndefined();

      table.gridType = originalGridType;
      terrain.destroy();
    });
  });

  describe('the fog laid over the part of it nobody has reached', () => {
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
      expect(veil!['clip-path']).toBe('path("M 50 0 H 100 V 50 H 50 Z")');
      expect(veil!['background-color']).toBe('#aeb9c4');
      expect(component.isHiddenByFog()).toBe(false);
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

    function alphasOf(image: string): number[] {
      return [...image.matchAll(/rgba\(0,0,0,([0-9.]+)\)/g)].map((m) => Number(m[1]));
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

      expect(component['topFogStyle']()!['clip-path']).toBe('path("M 0 50 H 50 V 100 H 0 Z")');
      expect(component['faceFogStyle']('east')!['clip-path']).toBe('path("M 0 0 H 50 V 100 H 0 Z")');
      expect(component['faceFogStyle']('west')!['clip-path']).toBe('path("M 0 0 H 50 V 100 H 0 Z")');
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
