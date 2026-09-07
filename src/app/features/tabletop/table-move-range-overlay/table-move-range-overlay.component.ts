import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlan, MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellGridOf, gridExtentPx } from '@axe/domain/tabletop/fog/cell-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { moveRangeOutline, moveRangePolygons } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { overlayScale } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

export const MOVE_RANGE_FILL = 'rgba(90, 170, 255, 0.28)';
export const MOVE_RANGE_BORDER = 'rgba(120, 200, 255, 0.95)';
/** The ground an enemy holds, shown under the reach so the two read as one picture. */
export const MOVE_ZOC_FILL = 'rgba(230, 80, 80, 0.22)';
export const MOVE_ZOC_BORDER = 'rgba(240, 120, 120, 0.75)';
const MOVE_RANGE_BORDER_WIDTH_PX = 3;

/** The way a move is being planned along, drawn over the reach it is being planned within. */
export const MOVE_WAY_STROKE = 'rgba(255, 236, 140, 0.95)';
export const MOVE_WAY_SHADOW = 'rgba(0, 0, 0, 0.55)';
export const MOVE_WAY_SETTLED = 'rgba(255, 200, 60, 0.95)';
const MOVE_WAY_WIDTH_PX = 5;
const MOVE_WAY_HEAD_PX = 16;
const MOVE_WAYPOINT_RADIUS_PX = 7;
/** Somebody else's move, drawn cooler and thinner so it is not mistaken for one's own. */
export const MOVE_WAY_OTHERS = 'rgba(150, 205, 255, 0.9)';
const MOVE_WAY_OTHERS_WIDTH_PX = 4;
/** The reach of a piece somebody else has picked, drawn fainter than the reader's own. */
export const MOVE_RANGE_OTHERS_FILL = 'rgba(150, 205, 255, 0.2)';
export const MOVE_RANGE_OTHERS_BORDER = 'rgba(170, 220, 255, 0.95)';
/** Somebody else's reach is outlined in dashes, so whose it is reads without a legend. */
const MOVE_RANGE_OTHERS_DASH = [10, 6];

@Component({
  selector: 'table-move-range-overlay',
  templateUrl: './table-move-range-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableMoveRangeOverlayComponent {
  private readonly moveRange = inject(MoveRangeService);
  private readonly movePlan = inject(MovePlanService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('rangeCanvas');

  protected readonly view = this.moveRange.range;
  protected readonly plan = this.movePlan.plan;
  protected readonly zTransform = translateZCss(Z_OFFSET_RANGE_PX);

  /**
   * The moves everybody else is working out on this table.
   *
   * Under strict play a move is drawn before it is made, and the table waits on it, so the
   * line is drawn on every screen rather than only the mover's. A peer looking at another
   * table is left out: a cell number means nothing away from the grid it was counted in.
   */
  protected readonly others = computed<{ grid: CellGrid; reach: CellBits | null; way: number[] }[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (!table) return [];
    this.objectChange.versionOf(table.identifier)();

    const mine = PeerCursor.myCursor?.identifier;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const drawn: { grid: CellGrid; reach: CellBits | null; way: number[] }[] = [];
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      if (cursor.identifier === mine) continue;
      if (!cursor.movingCharacterIdentifier || cursor.movingTableIdentifier !== table.identifier) continue;
      // Read after the question of whether this peer is moving anything, not before it: a
      // cursor's own place is on the cursor, so listening to every one of them redrew the
      // board and worked every reach out again each time anybody moved a mouse.
      this.objectChange.versionOf(cursor.identifier)();

      const piece = this.objectStore.get<GameCharacter>(cursor.movingCharacterIdentifier);
      if (!(piece instanceof GameCharacter)) continue;
      this.objectChange.versionOf(piece.identifier)();
      // A piece the reader cannot see is not drawn walking either. The piece's own picture is
      // taken off the board by the fog, and a reach and a way laid down from its cells would
      // say where it stands and where it is going just as plainly.
      if (!this.vision.isTokenVisible(piece)) continue;

      // Worked out here rather than sent: a reach is shaped by what its owner can see, and
      // the dents an unseen enemy leaves in one would say where it stands.
      const reach = this.moveRange.termsOf(piece)?.cells ?? null;
      const way = cursor.movingWay
        .split(',')
        .map((cell) => Number(cell))
        .filter((cell) => Number.isInteger(cell) && cell >= 0);
      if (reach || way.length > 1) drawn.push({ grid, reach, way });
    }
    return drawn;
  });

  constructor() {
    effect(() => {
      const plan = this.plan();
      const range = this.view();
      const others = this.others();
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas) return;
      if (plan) {
        this.paint(canvas, plan.grid, plan.reach, null, plan, others);
        return;
      }
      if (range) {
        this.paint(canvas, range.grid, range.showsReach ? range.cells : null, range.held, null, others);
        return;
      }
      if (others.length) this.paint(canvas, others[0].grid, null, null, null, others);
    });
  }

  private paint(
    canvas: HTMLCanvasElement,
    grid: CellGrid,
    cells: CellBits | null,
    held: CellBits | null,
    plan: MovePlan | null,
    others: readonly { grid: CellGrid; reach: CellBits | null; way: number[] }[]
  ): void {
    const extent = gridExtentPx(grid);
    const width = Math.max(1, Math.ceil(extent.maxX - extent.minX));
    const height = Math.max(1, Math.ceil(extent.maxY - extent.minY));
    const scale = overlayScale(width, height);
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.left = extent.minX + 'px';
    canvas.style.top = extent.minY + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, -extent.minX * scale, -extent.minY * scale);
    context.clearRect(extent.minX, extent.minY, width, height);

    for (const other of others) {
      if (other.reach) {
        this.paintCells(
          context,
          other.grid,
          other.reach,
          MOVE_RANGE_OTHERS_FILL,
          MOVE_RANGE_OTHERS_BORDER,
          MOVE_RANGE_OTHERS_DASH
        );
      }
    }
    if (held) this.paintCells(context, grid, held, MOVE_ZOC_FILL, MOVE_ZOC_BORDER);
    if (cells) this.paintCells(context, grid, cells, MOVE_RANGE_FILL, MOVE_RANGE_BORDER);
    for (const other of others)
      this.paintRoute(context, other.grid, other.way, MOVE_WAY_OTHERS, MOVE_WAY_OTHERS_WIDTH_PX);
    if (plan) this.paintWay(context, plan);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private paintCells(
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    cells: CellBits,
    fill: string,
    stroke: string,
    dash: readonly number[] = []
  ): void {
    const area = new Path2D();
    for (const polygon of moveRangePolygons(grid, cells)) {
      area.moveTo(polygon[0].x, polygon[0].y);
      for (let corner = 1; corner < polygon.length; corner++) area.lineTo(polygon[corner].x, polygon[corner].y);
      area.closePath();
    }
    context.fillStyle = fill;
    context.fill(area);

    const border = new Path2D();
    for (const edge of moveRangeOutline(grid, cells)) {
      border.moveTo(edge.x1, edge.y1);
      border.lineTo(edge.x2, edge.y2);
    }
    context.strokeStyle = stroke;
    context.lineWidth = MOVE_RANGE_BORDER_WIDTH_PX;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.setLineDash(dash as number[]);
    context.stroke(border);
    context.setLineDash([]);
  }

  /**
   * The way the move is being planned along: what is settled, then what is drawn ahead.
   *
   * The two are one line rather than two, since a way with a seam in it reads as two moves.
   * What is settled is drawn in a firmer colour, so the part that can still be changed is
   * told apart from the part that cannot.
   */
  private paintWay(context: CanvasRenderingContext2D, plan: MovePlan): void {
    const whole = plan.ahead.length > 1 ? [...plan.settled, ...plan.ahead.slice(1)] : plan.settled;
    if (whole.length > 1) {
      this.strokeWay(context, plan.grid, whole, MOVE_WAY_SHADOW, MOVE_WAY_WIDTH_PX + 3);
      this.strokeWay(context, plan.grid, whole, MOVE_WAY_STROKE, MOVE_WAY_WIDTH_PX);
    }
    if (plan.settled.length > 1) {
      this.strokeWay(context, plan.grid, plan.settled, MOVE_WAY_SETTLED, MOVE_WAY_WIDTH_PX);
    }
    if (whole.length > 1) this.paintArrowHead(context, plan.grid, whole);
    for (const waypoint of plan.waypoints) this.paintWaypoint(context, plan.grid, waypoint);
  }

  /** One way drawn on its own: a shadow under it, the line, and a head to say which end is which. */
  private paintRoute(
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    way: readonly number[],
    stroke: string,
    width: number
  ): void {
    if (way.length < 2) return;
    this.strokeWay(context, grid, way, MOVE_WAY_SHADOW, width + 3);
    this.strokeWay(context, grid, way, stroke, width);
    this.paintArrowHead(context, grid, way);
  }

  private strokeWay(
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    way: readonly number[],
    stroke: string,
    width: number
  ): void {
    const line = new Path2D();
    way.forEach((cell, step) => {
      const centre = cellCenterOf(grid, cell);
      if (step === 0) line.moveTo(centre.x, centre.y);
      else line.lineTo(centre.x, centre.y);
    });
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke(line);
  }

  private paintArrowHead(context: CanvasRenderingContext2D, grid: CellGrid, way: readonly number[]): void {
    const end = cellCenterOf(grid, way[way.length - 1]);
    const before = cellCenterOf(grid, way[way.length - 2]);
    const angle = Math.atan2(end.y - before.y, end.x - before.x);
    const spread = Math.PI / 6;
    const head = new Path2D();
    head.moveTo(end.x, end.y);
    head.lineTo(
      end.x - MOVE_WAY_HEAD_PX * Math.cos(angle - spread),
      end.y - MOVE_WAY_HEAD_PX * Math.sin(angle - spread)
    );
    head.lineTo(
      end.x - MOVE_WAY_HEAD_PX * Math.cos(angle + spread),
      end.y - MOVE_WAY_HEAD_PX * Math.sin(angle + spread)
    );
    head.closePath();
    context.fillStyle = MOVE_WAY_STROKE;
    context.strokeStyle = MOVE_WAY_SHADOW;
    context.lineWidth = 2;
    context.fill(head);
    context.stroke(head);
  }

  private paintWaypoint(context: CanvasRenderingContext2D, grid: CellGrid, cell: number): void {
    const centre = cellCenterOf(grid, cell);
    const ring = new Path2D();
    ring.arc(centre.x, centre.y, MOVE_WAYPOINT_RADIUS_PX, 0, Math.PI * 2);
    context.fillStyle = MOVE_WAY_SETTLED;
    context.strokeStyle = MOVE_WAY_SHADOW;
    context.lineWidth = 2;
    context.fill(ring);
    context.stroke(ring);
  }
}
