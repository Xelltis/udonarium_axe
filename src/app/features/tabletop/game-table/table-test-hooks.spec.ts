import { TestBed } from '@angular/core/testing';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HudFrameService } from '@axe/application/tabletop/hud-frame.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  type TableCameraView,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { installTableTestHooks, TableTestHooks } from '@axe/features/tabletop/game-table/table-test-hooks';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type Hooked = Window & { __axeTable?: TableTestHooks };

describe('table test hooks', () => {
  function install(webdriver: boolean, moveCamera = vi.fn(), refresh = vi.fn()): { win: Hooked; remove: () => void } {
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
      TestBed.inject(GroundService),
      TestBed.inject(PiecePicturesService),
      TestBed.inject(DiceRenderService),
      TestBed.inject(TabletopService),
      moveCamera,
      refresh
    );
    return { win, remove };
  }

  it('bring the page up to date before drawing what is due, for a change its held clock would never refresh', () => {
    const refresh = vi.fn();
    const { win, remove } = install(true, vi.fn(), refresh);
    const drawn = vi.spyOn(TestBed.inject(Table3dService), 'drawDueNow');

    win.__axeTable?.drawDueNow();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(drawn.mock.invocationCallOrder[0]);
    remove();
  });

  it('are put on a window that automation drives, and taken off again', () => {
    const { win, remove } = install(true);
    expect(win.__axeTable?.camera()).toBeNull();
    expect(win.__axeTable?.pickAt(10, 10)).toBeNull();
    expect(win.__axeTable?.renderer()).toBeNull();
    remove();
    expect(win.__axeTable).toBeUndefined();
  });

  it('put the camera near the board, at the default depth and angle, over the middle of the table', () => {
    const moveCamera = vi.fn();
    const { win, remove } = install(true, moveCamera);
    TestBed.inject(TableCameraService).setLayout({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      boardWidth: 1600,
      boardHeight: 1000,
    });

    win.__axeTable?.lookFromNear();

    expect(moveCamera).toHaveBeenCalledTimes(1);
    const view = moveCamera.mock.calls[0][0] as TableCameraView;
    expect([view.positionZ, view.rotateX, view.rotateZ]).toEqual([
      DEFAULT_TABLE_CAMERA_VIEW.positionZ,
      DEFAULT_TABLE_CAMERA_VIEW.rotateX,
      DEFAULT_TABLE_CAMERA_VIEW.rotateZ,
    ]);
    const scene = tableSceneMatrix(view, TestBed.inject(TableCameraService).layout!, new Matrix3D());
    const middle = pageOfTablePoint(scene, 800, 500, 0);
    expect(Math.abs(middle.x - 640)).toBeLessThan(100);
    expect(Math.abs(middle.y - 360)).toBeLessThan(100);
    remove();
  });

  it('are left off a window a person is using', () => {
    const { win } = install(false);
    expect(win.__axeTable).toBeUndefined();
  });
});
