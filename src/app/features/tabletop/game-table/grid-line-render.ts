import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  strokeHexPath,
} from '@axe/domain/tabletop/hex-geometry';

export class GridLineRender {
  /**
   * @param canvasElement the canvas the grid is drawn onto
   * @param scale how many canvas pixels one table pixel comes to. Below one the canvas holds fewer
   * pixels than the board covers and the browser lets it back up to size, which a grid of thin
   * lines takes without much showing for it.
   */
  constructor(
    readonly canvasElement: HTMLCanvasElement,
    private readonly scale: number = 1
  ) {}

  /** The canvas pixels a stretch of the table comes to at the scale this render draws at. */
  private canvasPx(tablePx: number): number {
    return this.scale === 1 ? tablePx : Math.max(1, Math.ceil(tablePx * this.scale));
  }

  private makeBrush(
    context: CanvasRenderingContext2D,
    gridSize: number,
    gridColor: string,
    gridFontColor: string
  ): void {
    context.strokeStyle = gridColor;
    context.fillStyle = gridFontColor;
    context.lineWidth = 1;

    const fontSize: number = Math.floor(gridSize / 5);
    context.font = `bold ${fontSize}px sans-serif`;
    context.textBaseline = 'top';
    context.textAlign = 'center';
  }

  /**
   * Draws the grid over a whole table onto the canvas, its width and height counted in squares,
   * with each cell labelled column-row.
   *
   * The canvas is sized even for a negative grid type, which draws no grid.
   */
  render(
    width: number,
    height: number,
    gridSize: number = 50,
    gridType: GridType = GridType.SQUARE,
    gridColor: string = '#000000e6',
    gridFontColor: string = gridColor,
    overTerrain = false,
    offsetTop: number = 0,
    offsetLeft: number = 0
  ) {
    this.canvasElement.width = this.canvasPx(width * gridSize);
    this.canvasElement.height = this.canvasPx(height * gridSize);
    // A canvas with nothing to draw on cannot be drawn on.
    const context = this.canvasElement.getContext('2d');
    if (!context) return;
    if (this.scale !== 1) context.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    if (gridType < 0) return;

    this.makeBrush(context, gridSize, gridColor, gridFontColor);

    switch (gridType) {
      case GridType.SQUARE:
        this.renderSquareGrid(context, width, height, gridSize, overTerrain, offsetTop, offsetLeft);
        break;
      case GridType.HEX_VERTICAL:
      case GridType.HEX_HORIZONTAL:
        this.renderHexGrid(context, width, height, gridSize, gridType, overTerrain, offsetTop, offsetLeft);
        break;
    }
  }

  /**
   * Draws only the stretch of grid a surface shows, sized in pixels and offset into the table, with
   * labels that can be left off or prefixed with a wall's letter.
   *
   * False only when the canvas cannot be drawn on; a negative grid type draws nothing and still
   * counts as drawn.
   */
  renderViewport(
    widthPx: number,
    heightPx: number,
    gridSize: number = 50,
    gridType: GridType = GridType.SQUARE,
    gridColor: string = '#000000e6',
    gridFontColor: string = gridColor,
    offsetTopPx: number = 0,
    offsetLeftPx: number = 0,
    drawLabels: boolean = true,
    labelPrefix: string = '',
    labelMatrix: readonly [number, number, number, number] | null = null
  ): boolean {
    this.canvasElement.width = Math.max(1, Math.ceil(widthPx * this.scale));
    this.canvasElement.height = Math.max(1, Math.ceil(heightPx * this.scale));
    // A canvas with nothing to draw on cannot be drawn on.
    const context = this.canvasElement.getContext('2d');
    if (!context) return false;
    if (this.scale !== 1) context.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    if (gridType < 0) return true;

    this.makeBrush(context, gridSize, gridColor, gridFontColor);

    switch (gridType) {
      case GridType.SQUARE:
        this.renderSquareGridViewport(
          context,
          widthPx,
          heightPx,
          gridSize,
          offsetTopPx,
          offsetLeftPx,
          drawLabels,
          labelPrefix,
          labelMatrix
        );
        break;
      case GridType.HEX_VERTICAL:
      case GridType.HEX_HORIZONTAL:
        this.renderHexGridViewport(
          context,
          widthPx,
          heightPx,
          gridSize,
          gridType,
          offsetTopPx,
          offsetLeftPx,
          drawLabels,
          labelPrefix,
          labelMatrix
        );
        break;
    }
    return true;
  }

  private drawCellLabel(
    context: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    labelMatrix: readonly [number, number, number, number] | null
  ): void {
    if (!labelMatrix) {
      context.fillText(text, cx, cy);
      return;
    }
    context.save();
    context.translate(cx, cy);
    context.transform(labelMatrix[0], labelMatrix[1], labelMatrix[2], labelMatrix[3], 0, 0);
    context.fillText(text, 0, 0);
    context.restore();
  }

  private renderSquareGrid(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    gridSize: number,
    overTerrain: boolean,
    offsetTop: number,
    offsetLeft: number
  ) {
    const offTop = overTerrain ? Math.floor(offsetTop / gridSize) + 1 : 0;
    const offLeft = overTerrain ? Math.floor(offsetLeft / gridSize) + 1 : 0;

    for (let h = 0; h <= height; h++) {
      for (let w = 0; w <= width; w++) {
        const gx = w * gridSize;
        const gy = h * gridSize;
        context.beginPath();
        context.strokeRect(gx, gy, gridSize, gridSize);
        context.fillText(w + 1 + offLeft + '-' + (h + 1 + offTop), gx + gridSize / 2, gy + gridSize / 2);
      }
    }
  }

  private renderHexGrid(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    gridSize: number,
    gridType: GridType,
    overTerrain: boolean,
    offsetTop: number,
    offsetLeft: number
  ) {
    const s = hexCircumradius(gridSize);
    const canvasW = width * gridSize;
    const canvasH = height * gridSize;

    const isFlatTop = gridType === GridType.HEX_VERTICAL;
    const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
    const startAngle = hexStartAngle(isFlatTop);

    const numCols = Math.ceil(canvasW / colSpacing) + 2;
    const numRows = Math.ceil(canvasH / rowSpacing) + 2;

    const offCol = overTerrain ? Math.floor(offsetLeft / colSpacing) + 1 : 0;
    const offRow = overTerrain ? Math.floor(offsetTop / rowSpacing) + 1 : 0;

    context.textBaseline = 'middle';

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);

        if (cx < -gridSize || cx > canvasW + gridSize || cy < -gridSize || cy > canvasH + gridSize) continue;

        strokeHexPath(context, cx, cy, s, startAngle);
        context.fillText(col + 1 + offCol + '-' + (row + 1 + offRow), cx, cy);
      }
    }
  }

  private renderSquareGridViewport(
    context: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    gridSize: number,
    offsetTopPx: number,
    offsetLeftPx: number,
    drawLabels: boolean = true,
    labelPrefix: string = '',
    labelMatrix: readonly [number, number, number, number] | null = null
  ) {
    const firstCol = Math.floor(offsetLeftPx / gridSize);
    const lastCol = Math.ceil((offsetLeftPx + widthPx) / gridSize);
    const firstRow = Math.floor(offsetTopPx / gridSize);
    const lastRow = Math.ceil((offsetTopPx + heightPx) / gridSize);
    const prefix = labelPrefix ? `${labelPrefix}-` : '';

    for (let row = firstRow; row < lastRow; row++) {
      for (let col = firstCol; col < lastCol; col++) {
        const gx = col * gridSize - offsetLeftPx;
        const gy = row * gridSize - offsetTopPx;
        context.beginPath();
        context.strokeRect(gx, gy, gridSize, gridSize);
        if (drawLabels) {
          this.drawCellLabel(
            context,
            `${prefix}${col + 1}-${row + 1}`,
            gx + gridSize / 2,
            gy + gridSize / 2,
            labelMatrix
          );
        }
      }
    }
  }

  private renderHexGridViewport(
    context: CanvasRenderingContext2D,
    widthPx: number,
    heightPx: number,
    gridSize: number,
    gridType: GridType,
    offsetTopPx: number,
    offsetLeftPx: number,
    drawLabels: boolean = true,
    labelPrefix: string = '',
    labelMatrix: readonly [number, number, number, number] | null = null
  ) {
    const s = hexCircumradius(gridSize);
    const isFlatTop = gridType === GridType.HEX_VERTICAL;
    const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
    const startAngle = hexStartAngle(isFlatTop);

    const colExtra = Math.ceil(gridSize / colSpacing) + 2;
    const rowExtra = Math.ceil(gridSize / rowSpacing) + 2;
    const firstCol = Math.floor(offsetLeftPx / colSpacing) - colExtra;
    const lastCol = Math.ceil((offsetLeftPx + widthPx) / colSpacing) + colExtra;
    const firstRow = Math.floor(offsetTopPx / rowSpacing) - rowExtra;
    const lastRow = Math.ceil((offsetTopPx + heightPx) / rowSpacing) + rowExtra;

    context.textBaseline = 'middle';
    const prefix = labelPrefix ? `${labelPrefix}-` : '';

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
        const cx = x - offsetLeftPx;
        const cy = y - offsetTopPx;

        if (cx < -gridSize || cx > widthPx + gridSize || cy < -gridSize || cy > heightPx + gridSize) continue;

        strokeHexPath(context, cx, cy, s, startAngle);
        if (drawLabels) this.drawCellLabel(context, `${prefix}${col + 1}-${row + 1}`, cx, cy, labelMatrix);
      }
    }
  }
}
