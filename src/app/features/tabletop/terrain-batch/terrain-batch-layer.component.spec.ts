import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TerrainBatchLayerComponent } from '@axe/features/tabletop/terrain-batch/terrain-batch-layer.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;

describe('TerrainBatchLayerComponent', () => {
  let fixture: ComponentFixture<TerrainBatchLayerComponent>;
  let table: GameTable;

  function setUp(type: GridType): void {
    TestBed.configureTestingModule({ imports: [TerrainBatchLayerComponent], providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.gridType = type;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
  }

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function wall(x: number, y: number): Terrain {
    const terrain = Terrain.create('壁', 1, 1, 2, 'wall.png', 'floor.png');
    terrain.location = { name: 'table', x, y };
    terrain.isLocked = true;
    terrain.isTiledTexture = true;
    table.appendChild(terrain);
    return terrain;
  }

  /** Lets the change announcements of the last edits arrive, and the layer catch up with them. */
  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await fixture?.whenStable();
  }

  async function render(): Promise<HTMLElement> {
    await settled();
    fixture = TestBed.createComponent(TerrainBatchLayerComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  describe('on a square board', () => {
    beforeEach(() => setUp(GridType.SQUARE));

    it('draws two walls side by side as one top and the six sides left showing', async () => {
      wall(100, 100);
      wall(150, 100);
      const host = await render();

      expect(host.querySelectorAll('[data-terrain-cap]')).toHaveLength(1);
      expect(host.querySelectorAll('[data-terrain]')).toHaveLength(6);
      expect(host.querySelector<HTMLElement>('[data-terrain-cap]')!.style.clipPath).toContain('path(');
    });

    it('opens the menu of the wall under the pointer on a top it shares with another', async () => {
      const west = wall(100, 100);
      const east = wall(150, 100);
      const host = await render();
      const open = vi.spyOn(TestBed.inject(TerrainMenuService), 'open').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(CoordinateService), 'convertToLocal').mockReturnValue({ x: 76, y: 20, z: 0 });
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

      host.querySelector('[data-terrain-cap]')!.dispatchEvent(event);

      expect(open).toHaveBeenCalledWith(east);
      expect(open).not.toHaveBeenCalledWith(west);
      expect(event.defaultPrevented).toBe(true);
    });

    it('selects a wall pressed with Ctrl held, and keeps the press from the table', async () => {
      const block = wall(100, 100);
      const host = await render();
      const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });

      host.querySelector(`[data-terrain="${block.identifier}"]`)!.dispatchEvent(event);

      expect(TestBed.inject(SelectionSignalService).isSelected(block.identifier)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    });

    it('holds the walls it draws in the overlap registry, and lets go of one drawn alone again', async () => {
      const block = wall(100, 100);
      await render();
      const overlap = TestBed.inject(TabletopOverlapService);
      expect(overlap.get(block.identifier)?.element).toBeNull();

      block.isLocked = false;
      await settled();

      expect(overlap.get(block.identifier)).toBeUndefined();
    });

    it('leaves the entry of a wall already drawn alone where it is', async () => {
      const block = wall(100, 100);
      await render();
      const overlap = TestBed.inject(TabletopOverlapService);
      const element = document.createElement('div');
      block.isLocked = false;
      overlap.register(block, element);
      await settled();

      expect(overlap.get(block.identifier)?.element).toBe(element);
    });
  });

  describe('on a hex board', () => {
    beforeEach(() => setUp(GridType.HEX_VERTICAL));

    function hexWall(col: number, row: number): Terrain {
      const origin = blockOrigin({ x: col, y: row, w: 1, h: 1 }, { sizePx: GRID, type: GridType.HEX_VERTICAL });
      return wall(origin.x, origin.y);
    }

    it('puts neighbouring tops on one sheet, and draws only the walls left showing', async () => {
      const [dx, dy] = hexSideStepsAt(true, 4, 4)[1];
      hexWall(4, 4);
      hexWall(4 + dx, 4 + dy);
      const host = await render();

      expect(host.querySelectorAll('svg')).toHaveLength(1);
      expect(host.querySelectorAll('svg path[data-terrain]')).toHaveLength(2);
      expect(host.querySelectorAll('div[data-terrain]')).toHaveLength(10);
    });

    it('lets only the blocks on a sheet take the pointer, not the rectangle round them', async () => {
      hexWall(4, 4);
      const host = await render();
      const sheet = host.querySelector('svg')!.parentElement!;
      const open = vi.spyOn(TestBed.inject(TerrainMenuService), 'open').mockImplementation(() => undefined);

      expect(sheet.classList).toContain('pointer-events-none');
      sheet.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      expect(open).not.toHaveBeenCalled();

      host.querySelector('svg path[data-terrain]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(open).toHaveBeenCalledTimes(1);
    });
  });
});
