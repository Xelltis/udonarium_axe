import { isTutorialPart } from '@axe/application/tabletop/tutorial-board';
import { type TableCameraView, type TableLayout, type TablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { type FrameInset, framingView } from '@axe/domain/tabletop/camera/table-framing';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';
import { PEER_MENU_WIDTH, START_PANEL_LEFT } from '@axe/features/panels/room-panel.service';
import { zoomOutLimitZ } from '@axe/features/tabletop/game-table/game-table-gesture.service';

/** How far in from the edges of the table's screen the first view keeps what it frames, in pixels. */
const EDGE_PX = 24;

/**
 * How much of the screen's width the first view needs right of the connection panel to frame things
 * there. With less, as in a narrow window, it frames them on the whole screen, the panel over them.
 */
const LEAST_SHARE_BESIDE_PANELS = 0.5;

/**
 * How far in from the screen's edges the first view keeps what it frames: clear of the connection
 * panel the room opens with in the top left corner, where the panels open beside the table and the
 * screen is wide enough to leave it the left, so the board's first part is not opened under it.
 */
function firstViewInset(layout: TableLayout, panelsBeside: boolean): FrameInset {
  const clear = START_PANEL_LEFT + PEER_MENU_WIDTH + EDGE_PX - layout.left;
  const roomBeside = layout.width - clear - EDGE_PX;
  const left = panelsBeside && roomBeside >= layout.width * LEAST_SHARE_BESIDE_PANELS ? clear : EDGE_PX;
  return { top: EDGE_PX, right: EDGE_PX, bottom: EDGE_PX, left };
}

/** The corners of the table's board and of the tutorial board standing on its edge, where it has one. */
export function firstViewPoints(table: GameTable): TablePoint[] {
  const width = table.width * table.gridSize;
  const height = table.height * table.gridSize;
  const points: TablePoint[] = [
    { x: 0, y: 0, z: 0 },
    { x: width, y: 0, z: 0 },
    { x: 0, y: height, z: 0 },
    { x: width, y: height, z: 0 },
  ];
  for (const board of table.whiteBoards) {
    if (!isTutorialPart(board.identifier)) continue;
    const frame = whiteBoardFrame(board, table.gridSize);
    const across = board.width * table.gridSize;
    const down = board.height * table.gridSize;
    for (const [u, v] of [
      [0, 0],
      [across, 0],
      [0, down],
      [across, down],
    ]) {
      points.push({
        x: frame.origin.x + frame.u.x * u + frame.v.x * v,
        y: frame.origin.y + frame.u.y * u + frame.v.y * v,
        z: frame.origin.z + frame.u.z * u + frame.v.z * v,
      });
    }
  }
  return points;
}

/**
 * The view a first table opens with: facing as the view given does, brought back, as far as the
 * table's zoom allows, until the whole table and the tutorial board standing on its edge are drawn on
 * the screen, and never nearer than the view given. A large screen sees them as the view given does;
 * a small one, as a phone's, from further back. Where the panels open beside the table, as on a
 * desktop, they are framed right of the connection panel; see {@link firstViewInset}.
 */
export function firstTableView(
  view: TableCameraView,
  layout: TableLayout,
  table: GameTable,
  panelsBeside: boolean
): TableCameraView {
  return framingView(view, layout, firstViewPoints(table), firstViewInset(layout, panelsBeside), {
    furthest: zoomOutLimitZ(table.gridSize),
    nearest: view.positionZ,
  });
}
