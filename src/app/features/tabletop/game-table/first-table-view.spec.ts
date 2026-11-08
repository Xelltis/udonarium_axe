import { makeDefaultTable, makeDefaultTabletopObjects } from '@axe/application/tabletop/tabletop-default-setup';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  type TableLayout,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { PEER_MENU_WIDTH, START_PANEL_LEFT } from '@axe/features/panels/room-panel.service';
import { firstTableView, firstViewPoints } from '@axe/features/tabletop/game-table/first-table-view';

function firstTable(standing = true): GameTable {
  makeDefaultTable(ImageStorage.instance);
  makeDefaultTabletopObjects(ImageStorage.instance, (key) => key, standing);
  return TableSelecter.instance.viewTable!;
}

function layoutOf(table: GameTable, width: number, height: number): TableLayout {
  return {
    left: 0,
    top: 0,
    width,
    height,
    boardWidth: table.width * table.gridSize,
    boardHeight: table.height * table.gridSize,
  };
}

/** How far left any point framed is drawn on the page. */
function leftmost(table: GameTable, layout: TableLayout, panelsBeside: boolean): number {
  const view = firstTableView(DEFAULT_TABLE_CAMERA_VIEW, layout, table, panelsBeside);
  const scene = tableSceneMatrix(view, layout, new Matrix3D());
  return Math.min(...firstViewPoints(table).map((point) => pageOfTablePoint(scene, point.x, point.y, point.z).x));
}

describe('the view a first table opens with', () => {
  it('frames the corners of the table and of the tutorial board standing on its north edge', () => {
    const table = firstTable();
    const width = table.width * table.gridSize;
    const height = table.height * table.gridSize;
    const board = table.whiteBoards[0];

    expect(firstViewPoints(table)).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, z: 0 },
        { x: width, y: height, z: 0 },
        expect.objectContaining({ x: 0, z: board.height * table.gridSize }),
        expect.objectContaining({ x: width, z: board.height * table.gridSize }),
      ])
    );
    expect(firstViewPoints(table)).toHaveLength(8);
  });

  it('frames the board lying north of the table where it is laid flat', () => {
    const table = firstTable(false);
    const board = table.whiteBoards[0];

    expect(firstViewPoints(table)).toEqual(
      expect.arrayContaining([expect.objectContaining({ x: 0, y: -board.height * table.gridSize, z: 0 })])
    );
  });

  it('frames no board other than the tutorial’s', () => {
    const table = firstTable();
    const other = WhiteBoard.create('', 4, 4, 1, 'someoneElsesBoard');
    other.location.x = -2000;
    table.appendChild(other);

    expect(firstViewPoints(table).some((point) => point.x < 0)).toBe(false);
  });

  it('keeps what it frames right of the connection panel, on a screen wide enough to leave it the left', () => {
    const table = firstTable();

    expect(leftmost(table, layoutOf(table, 1280, 720), true)).toBeGreaterThanOrEqual(
      START_PANEL_LEFT + PEER_MENU_WIDTH
    );
  });

  it('frames on the whole screen where the panels do not open beside the table, or the screen is narrow', () => {
    const table = firstTable();

    expect(leftmost(table, layoutOf(table, 1280, 720), false)).toBeLessThan(START_PANEL_LEFT + PEER_MENU_WIDTH);
    expect(leftmost(table, layoutOf(table, 900, 720), true)).toBeLessThan(START_PANEL_LEFT + PEER_MENU_WIDTH);
  });
});
