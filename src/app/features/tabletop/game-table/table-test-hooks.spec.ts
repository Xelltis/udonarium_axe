import { TestBed } from '@angular/core/testing';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HudFrameService } from '@axe/application/tabletop/hud-frame.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { installTableTestHooks, TableTestHooks } from '@axe/features/tabletop/game-table/table-test-hooks';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type Hooked = Window & { __axeTable?: TableTestHooks };

describe('table test hooks', () => {
  function install(webdriver: boolean): { win: Hooked; remove: () => void } {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const win = { navigator: { webdriver } } as unknown as Hooked;
    const remove = installTableTestHooks(
      win,
      TestBed.inject(TablePickService),
      TestBed.inject(TableCameraService),
      TestBed.inject(TabletopOverlapService),
      TestBed.inject(TableSurfaceService),
      TestBed.inject(Table3dService),
      TestBed.inject(HudFrameService),
      TestBed.inject(PieceMotionsService),
      TestBed.inject(GroundService)
    );
    return { win, remove };
  }

  it('are put on a window that automation drives, and taken off again', () => {
    const { win, remove } = install(true);
    expect(win.__axeTable?.camera()).toBeNull();
    expect(win.__axeTable?.pickAt(10, 10)).toBeNull();
    expect(win.__axeTable?.renderer()).toBeNull();
    remove();
    expect(win.__axeTable).toBeUndefined();
  });

  it('are left off a window a person is using', () => {
    const { win } = install(false);
    expect(win.__axeTable).toBeUndefined();
  });
});
