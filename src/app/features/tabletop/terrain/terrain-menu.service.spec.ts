import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TerrainMenuService', () => {
  let service: TerrainMenuService;
  let terrain: Terrain;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(TerrainMenuService);
    terrain = Terrain.create('地形メニュー', 2, 3, 1, '', '');
    vi.spyOn(TestBed.inject(TabletopOverlapService), 'findAt').mockReturnValue([]);
    TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);
  });

  afterEach(() => {
    terrain.destroy();
    vi.restoreAllMocks();
  });

  function openOn(mode2d: boolean, menuStyle: 'four-way' | 'radial' | 'standard'): void {
    const table = TestBed.inject(TabletopService).currentTable;
    table.mode2d = mode2d;
    table.tabletopMenuStyle = menuStyle;
    table.radialMenuRotationSpeed = 9;
    vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
    service.open(terrain);
  }

  it.each(['four-way', 'radial'] as const)('opens the four-way menu when the style is %s', (style) => {
    const menus = TestBed.inject(ContextMenuService);
    const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
    const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
    openOn(true, style);

    expect(openRadial).toHaveBeenCalledWith(
      expect.objectContaining({ x: 240, y: 180 }),
      expect.any(Array),
      expect.any(Array),
      '地形メニュー',
      style === 'radial',
      9,
      1
    );
    expect(openRadial.mock.calls[0]?.[2].map((group) => group.name)).toEqual([
      '地形・扉',
      '見た目・照明',
      '移動・作成',
      'オブジェクト操作',
    ]);
    expect(openOrdinary).not.toHaveBeenCalled();
  });

  it('keeps the ordinary menu outside 2D mode', () => {
    const menus = TestBed.inject(ContextMenuService);
    const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
    const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
    openOn(false, 'radial');

    expect(openOrdinary).toHaveBeenCalledWith(
      expect.objectContaining({ x: 240, y: 180 }),
      expect.any(Array),
      '地形メニュー'
    );
    expect(openRadial).not.toHaveBeenCalled();
  });

  it('leaves a terrain in a selection to the menu for the whole selection', () => {
    vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(true);
    const openOrdinary = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

    service.open(terrain);

    expect(openOrdinary).not.toHaveBeenCalled();
  });

  it('opens nothing where the pointer allows no menu', () => {
    const pointer = TestBed.inject(PointerDeviceService);
    vi.spyOn(pointer, 'isAllowedToOpenContextMenu', 'get').mockReturnValue(false);
    const forSelection = vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection');
    const openOrdinary = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

    service.open(terrain);

    expect(forSelection).not.toHaveBeenCalled();
    expect(openOrdinary).not.toHaveBeenCalled();
  });
});
