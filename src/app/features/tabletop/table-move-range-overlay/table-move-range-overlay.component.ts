import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlan, MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_MOVE_RANGE_PAINT, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellCenterOf,
  cellCount,
  CellGrid,
  cellGridOf,
  gridExtentPx,
  sameCellGrid,
} from '@axe/domain/tabletop/fog/cell-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { cellPathsFor, wayRunsOn } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { overlayScale } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

export const MOVE_RANGE_FILL = 'rgba(90, 170, 255, 0.28)';
export const MOVE_RANGE_BORDER = 'rgba(120, 200, 255, 0.95)';
/** The ground an enemy holds, shown under the reach so the two read as one picture. */
/** The reach of a move being taken over what stands in the way rather than around it. */
export const MOVE_JUMP_FILL = 'rgba(160, 130, 255, 0.28)';
export const MOVE_JUMP_BORDER = 'rgba(195, 175, 255, 0.95)';

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

interface DrawnMove {
  grid: CellGrid;
  reach: CellBits | null;
  way: number[];
}

/** One height of ground above the table, and the cells of the board that lie at it. */
interface RaisedLayer {
  heightPx: number;
  cells: CellBits;
  transform: string;
}

/** How many raised layers are drawn at once, each of which costs a canvas of its own. */
const RAISED_LAYER_LIMIT = 4;

/** Which layer of the board a painting is for: the ground raised over it, or everything else. */
interface Layer {
  cells: CellBits;
  on: boolean;
}

function sameLayers(a: readonly RaisedLayer[], b: readonly RaisedLayer[]): boolean {
  return a.length === b.length && a.every((one, at) => one.heightPx === b[at].heightPx && one.cells === b[at].cells);
}

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at]);
}

/**
 * Whether the overlay is about to draw anything on a cell.
 *
 * Which heights are worth a layer of their own is answered from this: ground nothing is drawn
 * on is ground nobody would see the difference on.
 */
function drawnCellsOf(painting: Painting): (cell: number) => boolean {
  const onWays = new Set<number>();
  if (painting.plan) {
    for (const cell of [...painting.plan.settled, ...painting.plan.ahead, ...painting.plan.waypoints]) onWays.add(cell);
  }
  for (const other of painting.ways) for (const cell of other.way) onWays.add(cell);
  return (cell) =>
    painting.cells?.get(cell) === true ||
    painting.held?.get(cell) === true ||
    onWays.has(cell) ||
    painting.reaches.some((other) => other.reach?.get(cell) === true);
}

/** Everything one repaint of the overlay draws, before it is split between the layers. */
interface Painting {
  grid: CellGrid;
  cells: CellBits | null;
  held: CellBits | null;
  plan: MovePlan | null;
  reaches: readonly DrawnReach[];
  ways: readonly DrawnWay[];
}

/** Whether a cell belongs on the layer being drawn. Everything does where there is no layer. */
function layerTest(layer: Layer | null): (cell: number) => boolean {
  if (!layer) return () => true;
  return (cell) => layer.cells.get(cell) === layer.on;
}

/** Two grids a cell number and a drawing both come out the same on. */
function sameBoard(a: CellGrid, b: CellGrid): boolean {
  return sameCellGrid(a, b) && a.sizePx === b.sizePx;
}

function sameReaches(a: readonly DrawnReach[], b: readonly DrawnReach[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((one, at) => one.reach === b[at].reach && sameBoard(one.grid, b[at].grid));
}

function sameWays(a: readonly DrawnWay[], b: readonly DrawnWay[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (one, at) =>
      one.way.length === b[at].way.length &&
      one.way.every((cell, step) => cell === b[at].way[step]) &&
      sameBoard(one.grid, b[at].grid)
  );
}

type DrawnReach = { grid: CellGrid; reach: CellBits | null };
type DrawnWay = { grid: CellGrid; way: number[] };

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
  private readonly raisedCanvasRefs = viewChildren<ElementRef<HTMLCanvasElement>>('raisedCanvas');
  /** The parts each set of cells has been cut into for a layer, kept while the set is drawn. */
  private readonly parts = new WeakMap<CellBits, { layer: CellBits; on: boolean; part: CellBits | null }[]>();
  /** The cells of every raised layer as one set, kept against the layers it was gathered from. */
  private lifted: { parts: readonly CellBits[]; union: CellBits } | null = null;

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
  private readonly moving = computed<DrawnMove[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (!table) return [];
    this.objectChange.versionOf(table.identifier)();

    const mine = PeerCursor.myCursor?.identifier;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const drawn: DrawnMove[] = [];
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
      // the dents an unseen enemy leaves in one would say where it stands. Which rule it is
      // worked out under does come over the wire, or a mover who had turned to jumping would
      // be drawn walking a way that leaves the reach drawn around it.
      const shown = this.moveRange.shownReachOf(piece, cursor.movingJumping === 'true');
      const way = cursor.movingWay
        .split(',')
        .map((cell) => Number(cell))
        .filter((cell) => Number.isInteger(cell) && cell >= 0);
      if (shown || way.length > 1) drawn.push({ grid, reach: shown?.cells ?? null, way });
    }
    return drawn;
  });

  /**
   * The reaches to draw under everybody else's moves, held apart from the ways over them.
   *
   * A peer moving their pointer sends a way on every step, and the reach around it stands
   * still: kept apart, the one that has not changed hands the same cells back and is drawn
   * from the paths already traced for them.
   */
  protected readonly othersReach = computed<DrawnReach[]>(
    () => this.moving().map((other) => ({ grid: other.grid, reach: other.reach })),
    { equal: sameReaches }
  );

  /** The ways everybody else is drawing, which do change as they point. */
  protected readonly othersWays = computed<DrawnWay[]>(
    () => this.moving().map((other) => ({ grid: other.grid, way: other.way })),
    { equal: sameWays }
  );

  /**
   * The ground above the table that the picture belongs on, a height at a time.
   *
   * The overlay lies on the table, so a reach worked out on top of a block is drawn under the
   * very block it belongs on and nothing of it is seen. Every height the picture touches is
   * taken as a layer of its own and what lies on it is drawn up there instead.
   *
   * Only the few heights most of the picture is on: a canvas apiece is what this costs, and a
   * board of a hundred ledges would rather draw the odd one under a block than pay that.
   */
  protected readonly raised = computed<RaisedLayer[]>(
    () => {
      const painting = this.painting();
      if (!painting) return [];
      const grid = painting.grid;
      const heights = this.moveRange.groundHeightsOn(grid);
      const drawn = drawnCellsOf(painting);
      const tally = new Map<number, number>();
      const limit = Math.min(heights.length, cellCount(grid));
      for (let cell = 0; cell < limit; cell++) {
        if (!(heights[cell] > 0) || !drawn(cell)) continue;
        tally.set(heights[cell], (tally.get(heights[cell]) ?? 0) + 1);
      }
      return [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, RAISED_LAYER_LIMIT)
        .map(([heightPx]) => ({ heightPx, cells: this.moveRange.groundAtHeight(grid, heightPx) }))
        .filter((layer): layer is { heightPx: number; cells: CellBits } => layer.cells !== null)
        .sort((a, b) => a.heightPx - b.heightPx)
        .map((layer) => ({ ...layer, transform: translateZCss(layer.heightPx + Z_OFFSET_RANGE_PX) }));
    },
    { equal: sameLayers }
  );

  constructor() {
    effect(() => {
      const painting = this.painting();
      const layers = this.raised();
      const canvas = this.canvasRef()?.nativeElement;
      const aloft = this.raisedCanvasRefs();
      if (!painting || !canvas) return;
      const lifted = this.unionOf(layers);
      this.paint(canvas, painting, lifted ? { cells: lifted, on: false } : null);
      layers.forEach((layer, at) => {
        const element = aloft[at]?.nativeElement;
        if (element) this.paint(element, painting, { cells: layer.cells, on: true });
      });
    });
  }

  /**
   * Every cell lifted onto a layer, as one set, which is what the table keeps for itself.
   *
   * Kept against the layers it was gathered from: the paths behind a set of cells are traced
   * once and held against it, and a set built afresh on every step of a pointer would be one
   * the tracing had never seen.
   */
  private unionOf(layers: readonly RaisedLayer[]): CellBits | null {
    if (layers.length < 1) return null;
    const parts = layers.map((layer) => layer.cells);
    if (this.lifted && sameElements(this.lifted.parts, parts)) return this.lifted.union;
    const union = parts[0].copy();
    for (const part of parts.slice(1)) union.or(part);
    this.lifted = { parts, union };
    return union;
  }

  /** What there is to draw this time round, whichever of the three the table is showing. */
  private painting(): Painting | null {
    const plan = this.plan();
    const range = this.view();
    const reaches = this.othersReach();
    const ways = this.othersWays();
    if (plan) return { grid: plan.grid, cells: plan.reach, held: null, plan, reaches, ways };
    if (range) {
      return {
        grid: range.grid,
        cells: range.showsReach ? range.cells : null,
        held: range.held,
        plan: null,
        reaches,
        ways,
      };
    }
    if (reaches.length) return { grid: reaches[0].grid, cells: null, held: null, plan: null, reaches, ways };
    return null;
  }

  private paint(canvas: HTMLCanvasElement, painting: Painting, layer: Layer | null): void {
    perfCounters.bump(PERF_MOVE_RANGE_PAINT);
    const { grid, plan } = painting;
    const cells = this.partOf(painting.cells, layer);
    const held = this.partOf(painting.held, layer);
    const onLayer = layerTest(layer);
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

    for (const other of painting.reaches) {
      const reach = this.partOf(other.reach, layer);
      if (reach) {
        this.paintCells(
          context,
          other.grid,
          reach,
          MOVE_RANGE_OTHERS_FILL,
          MOVE_RANGE_OTHERS_BORDER,
          MOVE_RANGE_OTHERS_DASH
        );
      }
    }
    if (held) this.paintCells(context, grid, held, MOVE_ZOC_FILL, MOVE_ZOC_BORDER);
    if (cells) {
      const jumping = plan?.jumping === true;
      const fill = jumping ? MOVE_JUMP_FILL : MOVE_RANGE_FILL;
      const border = jumping ? MOVE_JUMP_BORDER : MOVE_RANGE_BORDER;
      this.paintCells(context, grid, cells, fill, border);
    }
    for (const other of painting.ways)
      this.paintRoute(context, other.grid, other.way, MOVE_WAY_OTHERS, MOVE_WAY_OTHERS_WIDTH_PX, onLayer);
    if (plan) this.paintWay(context, plan, onLayer);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * The part of a set of cells that belongs on a layer, or nothing where none of it does.
   *
   * The parts are kept against the set they were cut from: the paths behind a set of cells are
   * traced once and held against it, and a part cut afresh on every repaint would be a set the
   * tracing had never seen.
   */
  private partOf(cells: CellBits | null, layer: Layer | null): CellBits | null {
    if (!cells) return null;
    if (!layer) return cells;
    const held = this.parts.get(cells)?.find((cut) => cut.layer === layer.cells && cut.on === layer.on);
    if (held) return held.part;
    const part = cells.copy();
    if (layer.on) part.and(layer.cells);
    else part.without(layer.cells);
    const cut = { layer: layer.cells, on: layer.on, part: part.isEmpty ? null : part };
    this.parts.set(cells, [...(this.parts.get(cells) ?? []), cut]);
    return cut.part;
  }

  private paintCells(
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    cells: CellBits,
    fill: string,
    stroke: string,
    dash: readonly number[] = []
  ): void {
    const { area, border } = cellPathsFor(grid, cells);
    context.fillStyle = fill;
    context.fill(area);

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
  private paintWay(context: CanvasRenderingContext2D, plan: MovePlan, onLayer: (cell: number) => boolean): void {
    const whole = plan.ahead.length > 1 ? [...plan.settled, ...plan.ahead.slice(1)] : plan.settled;
    for (const run of wayRunsOn(whole, onLayer)) {
      this.strokeWay(context, plan.grid, run, MOVE_WAY_SHADOW, MOVE_WAY_WIDTH_PX + 3);
      this.strokeWay(context, plan.grid, run, MOVE_WAY_STROKE, MOVE_WAY_WIDTH_PX);
    }
    for (const run of wayRunsOn(plan.settled, onLayer)) {
      this.strokeWay(context, plan.grid, run, MOVE_WAY_SETTLED, MOVE_WAY_WIDTH_PX);
    }
    if (whole.length > 1 && onLayer(whole[whole.length - 1])) this.paintArrowHead(context, plan.grid, whole);
    for (const waypoint of plan.waypoints) {
      if (onLayer(waypoint)) this.paintWaypoint(context, plan.grid, waypoint);
    }
  }

  /** One way drawn on its own: a shadow under it, the line, and a head to say which end is which. */
  private paintRoute(
    context: CanvasRenderingContext2D,
    grid: CellGrid,
    way: readonly number[],
    stroke: string,
    width: number,
    onLayer: (cell: number) => boolean
  ): void {
    if (way.length < 2) return;
    for (const run of wayRunsOn(way, onLayer)) {
      this.strokeWay(context, grid, run, MOVE_WAY_SHADOW, width + 3);
      this.strokeWay(context, grid, run, stroke, width);
    }
    if (onLayer(way[way.length - 1])) this.paintArrowHead(context, grid, way);
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
