import { TestBed } from '@angular/core/testing';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableWaterFloorComponent } from '@axe/features/tabletop/table-water-layer/table-water-floor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableWaterFloorComponent', () => {
  let table: GameTable;

  beforeEach(() => {
    localStorage.setItem('ui-render-lite', 'off');
    TestBed.configureTestingModule({ imports: [TableWaterFloorComponent], providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    // The net is drawn on a canvas, which the test runtime cannot draw on; a stand-in lets it be counted.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => undefined,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    localStorage.removeItem('ui-render-lite');
    document.documentElement.classList.remove('render-lite');
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(TableWaterFloorComponent);
    fixture.componentRef.setInput('surfaceStyle', { width: '1000px', height: '1000px', left: '0px', top: '0px' });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lays nothing on the floor under other weather, or none', () => {
    expect(render().querySelector('[data-water-weather-floor]')).toBeNull();
    table.weatherKind = 'rain';
    expect(render().querySelector('[data-water-weather-floor]')).toBeNull();
  });

  it('lays the net of light over the whole board when the map is under water', () => {
    table.weatherKind = 'underwater';
    const floor = render().querySelector<HTMLElement>('[data-water-weather-floor]');

    expect(floor).not.toBeNull();
    expect(floor!.style.width).toBe('1000px');
    expect(floor!.querySelectorAll('.water-net')).toHaveLength(2);
  });

  it('keeps one net for a table drawn the lighter way', () => {
    table.weatherKind = 'underwater';
    TestBed.inject(RenderLiteService).setting.set('on');
    expect(render().querySelectorAll('.water-net')).toHaveLength(1);
  });
});
