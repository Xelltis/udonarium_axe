/** Where a block's floor lies within the block, in the block's own pixels. */
export interface TerrainGridBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The floor with the canvas the grid is drawn on, which a turned block makes larger to cover it. */
export interface TerrainGridViewport extends TerrainGridBounds {
  canvasLeft: number;
  canvasTop: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Where the canvas's corner stands on the table, which the grid lines are drawn from. */
  offsetLeft: number;
  offsetTop: number;
}

/** Where the grid is cut from, and how far the canvas is slid so the cut lands true. */
export interface TerrainGridSlide {
  readonly viewport: TerrainGridViewport;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly slideX: number;
  readonly slideY: number;
  /** How much larger than the floor the canvas is cut, which is a cell for a slid one and nothing otherwise. */
  readonly grow: number;
}

/**
 * Where the floor of a block lies within it: the whole of it for a square block, and the box round
 * the hexes for a hex one, given as the hexes' bounds about the block's centre.
 */
export function floorBoundsOf(
  widthPx: number,
  depthPx: number,
  hexBox: { minX: number; minY: number; maxX: number; maxY: number } | null
): TerrainGridBounds {
  if (!hexBox) return { left: 0, top: 0, width: widthPx, height: depthPx };
  return {
    left: widthPx / 2 + hexBox.minX,
    top: depthPx / 2 + hexBox.minY,
    width: hexBox.maxX - hexBox.minX,
    height: hexBox.maxY - hexBox.minY,
  };
}

/**
 * The canvas the grid over a floor is drawn on, for a block turned by `rotateDeg` and standing at
 * `origin` on the table. A turned block's canvas is the box round the floor turned back, so the
 * lines drawn square to the table still cover it.
 */
export function gridViewportOf(
  bounds: TerrainGridBounds,
  rotateDeg: number,
  origin: { x: number; y: number }
): TerrainGridViewport {
  const radians = (rotateDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const canvasWidth = Math.max(1, bounds.width * cos + bounds.height * sin);
  const canvasHeight = Math.max(1, bounds.width * sin + bounds.height * cos);
  const canvasLeft = (bounds.width - canvasWidth) / 2;
  const canvasTop = (bounds.height - canvasHeight) / 2;

  return {
    ...bounds,
    canvasLeft,
    canvasTop,
    canvasWidth,
    canvasHeight,
    offsetLeft: origin.x + bounds.left + canvasLeft,
    offsetTop: origin.y + bounds.top + canvasTop,
  };
}

/**
 * Where the grid is cut from, and how far the canvas is slid so the cut lands true.
 *
 * A terrain dragged across the floor moves the grid under it a pixel at a time, and cutting the
 * lines again for every pixel is most of what a drag costs. The lines only look different once the
 * terrain crosses into another cell, so the cut is taken from the corner of the cell it stands in,
 * one cell wider than it needs, and the canvas is slid back by the part of a cell it has travelled.
 * Slid a whole number of pixels the cut draws the same picture; slid a fraction it would not, so a
 * terrain standing off the pixel grid, which a hex table or a turned terrain can be, is cut afresh.
 */
export function gridSlideOf(viewport: TerrainGridViewport, gridSize: number, rotateDeg: number): TerrainGridSlide {
  const restX = viewport.offsetLeft - Math.floor(viewport.offsetLeft / gridSize) * gridSize;
  const restY = viewport.offsetTop - Math.floor(viewport.offsetTop / gridSize) * gridSize;
  // A turned terrain rotates its canvas about the canvas centre, and growing the canvas moves that
  // centre, so a turned one is cut afresh however whole the remainder looks.
  if (gridSize <= 0 || rotateDeg !== 0 || !Number.isInteger(restX) || !Number.isInteger(restY)) {
    return {
      viewport,
      offsetLeft: viewport.offsetLeft,
      offsetTop: viewport.offsetTop,
      slideX: 0,
      slideY: 0,
      grow: 0,
    };
  }
  return {
    viewport,
    offsetLeft: viewport.offsetLeft - restX,
    offsetTop: viewport.offsetTop - restY,
    slideX: -restX,
    slideY: -restY,
    grow: gridSize,
  };
}
