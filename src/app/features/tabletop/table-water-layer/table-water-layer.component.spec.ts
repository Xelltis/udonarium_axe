import { TestBed } from '@angular/core/testing';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TableWaterLayerComponent } from '@axe/features/tabletop/table-water-layer/table-water-layer.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableWaterLayerComponent', () => {
  const gridSize = 50;
  let table: GameTable;

  beforeEach(() => {
    localStorage.setItem('ui-render-lite', 'off');
    TestBed.configureTestingModule({ imports: [TableWaterLayerComponent], providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = gridSize;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    localStorage.removeItem('ui-render-lite');
    document.documentElement.classList.remove('render-lite');
  });

  async function lay(kind: 'water' | 'swamp', cols: number, rows: number, surface = 1): Promise<TableAmbience> {
    const area = TableAmbience.create(kind, kind, cols, rows);
    area.location = { name: 'table', x: gridSize, y: gridSize };
    area.surfaceHeight = surface;
    table.appendChild(area);
    await Promise.resolve();
    await Promise.resolve();
    return area;
  }

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(TableWaterLayerComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a pond as a floor, a surface and the sides round it', async () => {
    await lay('water', 3, 2);
    const element = render();

    expect(element.querySelectorAll('[data-water-floor]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-surface]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-side]')).toHaveLength(10);
  });

  it('stands the surface at the height of the water', async () => {
    await lay('water', 1, 1, 2);
    const surface = render().querySelector<HTMLElement>('[data-water-surface]')!;
    expect(surface.style.transform).toContain(`${2 * gridSize}px)`);
  });

  it('stands no sides round water that only wets the floor', async () => {
    await lay('water', 2, 2, 0);
    const element = render();

    expect(element.querySelectorAll('[data-water-surface]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-side]')).toHaveLength(0);
  });

  it('breaks waves on land rising to the surface, and lays the net of light only on the level floor', async () => {
    // Three cells of sea running east up onto a beach as high as the surface in the last.
    const sea = await lay('water', 3, 1, 1);
    const beach = Terrain.create('浜', 1, 1, 1, '', '');
    beach.location = { name: 'table', x: 3 * gridSize, y: gridSize };
    const shelf = Terrain.create('浜', 1, 1, 0.5, '', '');
    shelf.location = { name: 'table', x: 2 * gridSize, y: gridSize };
    table.appendChild(beach);
    table.appendChild(shelf);
    await Promise.resolve();
    await Promise.resolve();
    expect(sea.surface).toBe(1);

    const element = render();

    expect(element.querySelectorAll('[data-water-shore]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-surface]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-floor]')).toHaveLength(1);
  });

  it('clouds murky water with silt and floats scum on dirty water, and lays neither on clear water', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => undefined,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const pond = await lay('water', 2, 2);
    expect(render().querySelectorAll('[data-water-layer]')).toHaveLength(0);

    pond.turbidity = 1;
    pond.dirtiness = 1;
    await Promise.resolve();
    await Promise.resolve();
    const element = render();

    expect(element.querySelectorAll('[data-water-layer="silt"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-layer="scum"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-water-layer="scum-rim"]')).toHaveLength(1);
  });

  it('streaks flowing water and carries what lies on it downstream, turned the way it flows', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => undefined,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const river = await lay('water', 4, 2);
    river.turbidity = 1;
    await Promise.resolve();
    await Promise.resolve();
    const still = render();
    expect(still.querySelector('[data-water-layer="flow"]')).toBeNull();
    expect(still.querySelector('[data-water-layer="silt"]')!.classList).toContain('water-silt');

    river.flowSpeed = 0.5;
    river.flowDirection = 180;
    await Promise.resolve();
    await Promise.resolve();
    const element = render();
    const streaks = element.querySelector<HTMLElement>('[data-water-layer="flow"]')!;
    const silt = element.querySelector<HTMLElement>('[data-water-layer="silt"]')!;

    for (const layer of [streaks, silt]) {
      expect(layer.classList).toContain('water-flow');
      expect(layer.style.getPropertyValue('--flow-angle')).toBe('90deg');
      expect(parseFloat(layer.style.getPropertyValue('--flow-seconds'))).toBeGreaterThan(0);
    }
    expect(silt.classList).not.toContain('water-silt');
  });

  it('floats leaves on water given them, and none on bare water', async () => {
    // The leaves are drawn on a canvas the test runtime cannot draw on; a stand-in that takes every call lets them be laid.
    const anything: () => unknown = () => ({ addColorStop: () => undefined });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new Proxy({}, { get: () => anything, set: () => true }) as never
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const pond = await lay('water', 3, 3);
    expect(render().querySelector('[data-water-layer="leaves"]')).toBeNull();

    pond.floatingLeaves = 0.6;
    await Promise.resolve();
    await Promise.resolve();

    expect(render().querySelector('[data-water-layer="leaves"]')).not.toBeNull();
  });

  it('draws nothing for a look on the ground that is not water', async () => {
    await lay('swamp', 3, 3);
    expect(render().querySelectorAll('[data-water-floor], [data-water-side]')).toHaveLength(0);
  });

  it('leaves the second net and the glints out of a table drawn the lighter way', async () => {
    // The net is drawn on a canvas, which the test runtime cannot draw on; a stand-in lets the nets be counted.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => undefined,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    await lay('water', 2, 2);

    const nets = '.water-net-a, .water-net-b, .water-net-glint';
    expect(render().querySelectorAll(nets)).toHaveLength(3);

    TestBed.inject(RenderLiteService).setting.set('on');
    const lite = render();
    expect(lite.querySelectorAll(nets)).toHaveLength(1);
    expect(lite.querySelectorAll('.water-net-b, .water-net-glint')).toHaveLength(0);
  });
});
