import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, forEachNeighbourCell } from '@axe/domain/tabletop/fog/cell-grid';
import { darknessAlphaFor, objectBrightnessFor, SceneViewer, VisionScene } from '@axe/domain/tabletop/vision-scene';

/** How far towards an open neighbour a wall's face is read, as a share of the way to it. */
const FACE_READ_STEP = 0.6;

/** The cells a terrain covers, told apart into the ones the party has walked to and the rest. */
export interface TerrainFogCover {
  cols: number;
  rows: number;
  cleared: boolean[];
  /** How brightly each cell is lit, read at its open sides. */
  brightness: number[];
}

/** What the light on a terrain's cells is read from, for one reader at one moment. */
export interface CoverLighting {
  readonly scene: VisionScene | null;
  /**
   * The scene with only the lights this reader can see, for a roof the fog cannot answer for. Asked
   * only for a roof, as finding out which lights a reader sees takes a look along every one.
   */
  readonly seenScene: () => VisionScene | null;
  readonly viewer: SceneViewer;
  /** The cells walls stand on, whose light is read at their open sides. */
  readonly blocking: CellBits | null;
  /** The cells the fog has in sight just now; null where everything is, as for the game master. */
  readonly visible: CellBits | null;
  /** The ground the party has taken, where the table keeps it lit; null where it does not. */
  readonly litExplored: CellBits | null;
}

/** Where a terrain stands, as its cells are laid out: its corner, its turn and how many cells across and deep. */
export interface TerrainFootprint {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly cols: number;
  readonly rows: number;
}

/**
 * The cover of a terrain's cells: which the party has reached, and how bright each is.
 *
 * `explored` is the ground the party has reached, or null where all of it counts as reached.
 */
export function terrainCoverOf(
  lighting: CoverLighting,
  grid: CellGrid,
  explored: CellBits | null,
  footprint: TerrainFootprint,
  planeZ = 0
): TerrainFogCover {
  const { cols, rows } = footprint;
  const size = grid.sizePx;
  const centreX = footprint.x + (cols * size) / 2;
  const centreY = footprint.y + (rows * size) / 2;
  const turn = (footprint.rotate * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const { scene, viewer } = lighting;
  const dark = scene ? 1 - darknessAlphaFor(scene, viewer) : 1;

  const cleared: boolean[] = [];
  const brightness: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const localX = (col + 0.5 - cols / 2) * size;
      const localY = (row + 0.5 - rows / 2) * size;
      const x = centreX + localX * cos - localY * sin;
      const y = centreY + localX * sin + localY * cos;
      const cell = cellIndexAt(grid, x, y);
      // The fog is the table's record of its own ground and has nothing to say about what
      // lies over the edge of it. Held as unwalked, the part of a block that overhangs the
      // table would wear the fog's colour across itself and take its texture with it.
      const offTable = cell < 0;
      const shown = offTable || (explored?.get(cell) ?? true);
      cleared.push(shown);
      brightness.push(shown && scene && !offTable ? cellBrightnessOf(lighting, scene, grid, cell, x, y, planeZ) : dark);
    }
  }
  return { cols, rows, cleared, brightness };
}

/**
 * The brightest of the cells a terrain has been reached at.
 *
 * A wall's cell is read at its open sides, never at its middle: the middle of a wall is
 * inside the wall, where its own edge stops the look and the light alike, and reading it
 * there would leave the one cell beside a torch as black as the ten behind it.
 */
export function brightestCleared(cover: TerrainFogCover): number {
  let best = 0;
  for (let i = 0; i < cover.cleared.length; i++) {
    if (cover.cleared[i] && cover.brightness[i] > best) best = cover.brightness[i];
  }
  return best;
}

/**
 * How brightly one cell of a terrain is lit.
 *
 * A wall's cell is read at its open sides, never at its middle: the middle of a wall is
 * inside the wall, where its own edge stops the look and the light alike.
 */
function cellBrightnessOf(
  lighting: CoverLighting,
  scene: VisionScene,
  grid: CellGrid,
  cell: number,
  x: number,
  y: number,
  planeZ: number
): number {
  const { viewer, blocking, visible } = lighting;
  const dark = 1 - darknessAlphaFor(scene, viewer);
  // Ground the party has taken is held at full light, which is what the easy fog promises:
  // cleared once, and bright from then on however the lamps stand.
  if (lighting.litExplored?.get(cell)) return 1;
  // Bright exactly where the fog counts the cell as in sight right now. The fog's own
  // answer already holds the whole rule - lamplit and in a line of sight, read at a wall's
  // open sides - and it falls back to the party's shared sight for a reader with no piece
  // of their own. Asking the sight lines again here would answer that reader with 'anything
  // a lamp touches', lighting the walls of rooms nobody can see into.
  // The fog is worked out along the floor and has nothing to say about a roof above it: the
  // building itself stops the look, so its own roof is never among the cells in sight. A lamp
  // standing up there lights the roof it stands on, and reading that roof against cells lying
  // in the building's own shadow would leave it dark under the lamp's feet. Ground nobody has
  // reached is still held back, by the cleared list this fills in beside the brightness.
  if (planeZ <= 0 && visible && !visible.get(cell)) return dark;
  // A roof is ground, walked on at the height it stands at, so it is read where it lies. The
  // detour below is for a wall met from the floor, whose middle is inside the wall itself;
  // taken on a roof it would read the middle of a wide one from the open ground beyond its
  // edges, leaving the middle of a crate a torch stands on as dark as the yard outside.
  //
  // Only by the lamps this reader can see. The fog cannot answer for a roof — the building
  // itself stops the look, so its own top is never among the cells in sight — and dropping
  // the question altogether would light the roof of every lamplit room on the map for
  // somebody standing outside all of them.
  if (planeZ > 0) {
    return objectBrightnessFor(lighting.seenScene() ?? scene, viewer, x, y, grid.sizePx / 2, true, planeZ);
  }
  if (!blocking?.get(cell)) {
    return objectBrightnessFor(scene, viewer, x, y, grid.sizePx / 2, true, planeZ);
  }
  let best = dark;
  forEachNeighbourCell(grid, cell, (neighbour) => {
    if (blocking.get(neighbour)) return;
    const open = cellCenterOf(grid, neighbour);
    const brightness = objectBrightnessFor(
      scene,
      viewer,
      x + (open.x - x) * FACE_READ_STEP,
      y + (open.y - y) * FACE_READ_STEP,
      0,
      true,
      planeZ
    );
    if (brightness > best) best = brightness;
  });
  return best;
}
