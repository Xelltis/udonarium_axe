import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { computeVisibleCellsFor, VisibleCellsOptions } from '@axe/domain/tabletop/fog/visible-cells';
import { GridType } from '@axe/domain/tabletop/game-table';
import { SegmentIndexes } from '@axe/domain/tabletop/los/segment-index';
import { rectangleSegments, TallSegment } from '@axe/domain/tabletop/los/segments';
import { isLit, SceneLight, SceneVisionSource, VisionScene } from '@axe/domain/tabletop/vision-scene';
import { DOME_LOBES, VisionLobe, visionLobesOf, VisionShape } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { describe, expect, it } from 'vitest';

const GRID: CellGrid = cellGridOf(20, 20, 50, GridType.SQUARE);
const WALL_HEIGHT = 500;

function roomWalls(withDoorway = false): TallSegment[] {
  const edges = rectangleSegments(200, 200, 200, 200, 0);
  const walls = edges.map((edge) => ({ ...edge, heightPx: WALL_HEIGHT }));
  if (!withDoorway) return walls;
  const solid = walls.filter((wall) => !(wall.y1 === 400 && wall.y2 === 400));
  return [
    ...solid,
    { x1: 200, y1: 400, x2: 280, y2: 400, heightPx: WALL_HEIGHT },
    { x1: 320, y1: 400, x2: 400, y2: 400, heightPx: WALL_HEIGHT },
  ];
}

function torch(): SceneLight {
  return {
    x: 300,
    y: 300,
    z: 25,
    brightPx: 100,
    dimPx: 200,
    color: '#ffffff',
    angle: 360,
    direction: 0,
    pitch: 0,
    revealToAll: false,
    castShadows: false,
    ignoreOcclusion: false,
    animation: 'none',
    sourceId: 'torch',
    surface: 'floor',
  };
}

function scene(partial: Partial<VisionScene> = {}): VisionScene {
  const walls = roomWalls();
  return {
    darknessEnabled: true,
    fogEnabled: true,
    darknessLevel: 0.9,
    ambientColor: '#05060a',
    globalIllumination: 0,
    gridSize: 50,
    gridType: GridType.SQUARE,
    widthPx: 1000,
    heightPx: 1000,
    lights: [torch()],
    visionSources: [],
    sightSegments: walls,
    lightSegments: walls,
    shadowCasters: [],
    ...partial,
  };
}

function eyes(partial: Partial<SceneVisionSource> = {}): SceneVisionSource {
  return {
    x: 700,
    y: 700,
    z: 25,
    type: VisionType.NORMAL,
    rangePx: 0,
    owner: 'p1',
    sourceId: 'eye',
    direction: 0,
    lobes: DOME_LOBES,
    ...partial,
  };
}

function optionsFor(built: VisionScene, blocking?: CellBits): VisibleCellsOptions {
  return { scene: built, grid: GRID, indexes: new SegmentIndexes(built.sightSegments, 100), blocking };
}

const INSIDE = cellIndexOf(GRID, 6, 6);

/** Which columns of row five are cleared, which is the wall these tests lay. */
function litCols(cells: CellBits): number[] {
  const cols: number[] = [];
  for (let col = 0; col < 12; col++) {
    if (cells.get(cellIndexOf(GRID, col, 5))) cols.push(col);
  }
  return cols;
}

describe('computeVisibleCellsFor', () => {
  it('keeps a torch shut in a room from showing that room to eyes outside it', () => {
    const built = scene();
    // The cell really is lit; what it is not is seen.
    expect(isLit(built, 325, 325, true, 0)).toBe(true);
    expect(computeVisibleCellsFor(eyes({ x: 700, y: 300 }), optionsFor(built)).get(INSIDE)).toBe(false);
  });

  it('shows the room once the eyes are in it', () => {
    const built = scene();
    expect(computeVisibleCellsFor(eyes({ x: 250, y: 250 }), optionsFor(built)).get(INSIDE)).toBe(true);
  });

  it('lets what is through a doorway be seen and no more', () => {
    const built = scene({ sightSegments: roomWalls(true), lightSegments: roomWalls(true) });
    const cells = computeVisibleCellsFor(eyes({ x: 300, y: 500 }), optionsFor(built));
    expect(cells.get(INSIDE)).toBe(true);
    expect(cells.get(cellIndexOf(GRID, 4, 4))).toBe(false);
  });

  it('leaves the ground behind a piece dark when it only looks one way', () => {
    const facingEast = visionLobesOf({
      shape: VisionShape.CONE,
      coneAngle: 90,
      coneCount: 1,
      backAngle: 90,
      backScale: 0.4,
      peripheralScale: 0.3,
      direction: 0,
      lobes: '',
    }) as readonly VisionLobe[];
    const built = scene({ lights: [{ ...torch(), x: 500, y: 500, dimPx: 400 }], sightSegments: [], lightSegments: [] });
    const options = optionsFor(built);
    const ahead = computeVisibleCellsFor(eyes({ x: 500, y: 500, direction: 0, lobes: facingEast }), options);
    expect(ahead.get(cellIndexOf(GRID, 12, 10))).toBe(true);
    expect(ahead.get(cellIndexOf(GRID, 7, 10))).toBe(false);
  });

  it('turns what a piece sees along with the piece', () => {
    const lobes = visionLobesOf({
      shape: VisionShape.CONE,
      coneAngle: 90,
      coneCount: 1,
      backAngle: 90,
      backScale: 0.4,
      peripheralScale: 0.3,
      direction: 0,
      lobes: '',
    });
    const built = scene({ lights: [{ ...torch(), x: 500, y: 500, dimPx: 400 }], sightSegments: [], lightSegments: [] });
    const options = optionsFor(built);
    const west = computeVisibleCellsFor(eyes({ x: 500, y: 500, direction: 180, lobes }), options);
    expect(west.get(cellIndexOf(GRID, 7, 10))).toBe(true);
    expect(west.get(cellIndexOf(GRID, 12, 10))).toBe(false);
  });

  it('follows a lamp past the range, which is what a piece sees without one', () => {
    const built = scene({ lights: [{ ...torch(), x: 500, y: 500, dimPx: 600 }], sightSegments: [], lightSegments: [] });
    const options = optionsFor(built);
    const far = cellIndexOf(GRID, 17, 10);
    expect(computeVisibleCellsFor(eyes({ x: 500, y: 500, rangePx: 150 }), options).get(far)).toBe(true);
  });

  it('clears no more than the range on a table with no dark to see by', () => {
    const built = scene({ darknessEnabled: false, lights: [], sightSegments: [], lightSegments: [] });
    const options = optionsFor(built);
    const near = cellIndexOf(GRID, 12, 10);
    const far = cellIndexOf(GRID, 17, 10);
    const short = computeVisibleCellsFor(eyes({ x: 500, y: 500, rangePx: 150 }), options);
    expect(short.get(near)).toBe(true);
    expect(short.get(far)).toBe(false);
  });

  describe('an eye standing on the roof of a block', () => {
    /** Four cells square and a cell high, with the lamp up on the roof beside the eye. */
    function roof(): VisibleCellsOptions {
      const edges = rectangleSegments(200, 200, 200, 200, 0).map((edge) => ({ ...edge, heightPx: 50 }));
      const built = scene({ sightSegments: edges, lightSegments: edges, lights: [{ ...torch(), z: 75 }] });
      const blocking = new CellBits(cellCount(GRID));
      const tops = new Float32Array(cellCount(GRID));
      for (let col = 4; col < 8; col++) {
        for (let row = 4; row < 8; row++) {
          const cell = cellIndexOf(GRID, col, row);
          blocking.set(cell);
          tops[cell] = 50;
        }
      }
      return { ...optionsFor(built, blocking), blockingTops: tops };
    }

    it('reaches the roof under its own feet', () => {
      const cells = computeVisibleCellsFor(eyes({ x: 300, y: 300, z: 75 }), roof());

      expect(cells.get(INSIDE)).toBe(true);
    });

    it('still reads a block it is standing beside at the open sides of it', () => {
      const cells = computeVisibleCellsFor(eyes({ x: 300, y: 300, z: 25 }), roof());

      expect(cells.get(INSIDE)).toBe(false);
    });
  });

  describe('a block of wall standing between the eye and the rest of the board', () => {
    /** Three cells by three, from (250, 250) to (400, 400). */
    const PILLAR = rectangleSegments(250, 250, 150, 150, 0).map((edge) => ({ ...edge, heightPx: WALL_HEIGHT }));

    function pillarCells(): CellBits {
      const bits = new CellBits(cellCount(GRID));
      for (let col = 5; col <= 7; col++) {
        for (let row = 5; row <= 7; row++) bits.set(cellIndexOf(GRID, col, row));
      }
      return bits;
    }

    function lookingWest(rangePx = 0): SceneVisionSource {
      return eyes({ x: 700, y: 325, rangePx });
    }

    const lit = scene({
      lights: [{ ...torch(), x: 600, y: 325, dimPx: 500 }],
      sightSegments: PILLAR,
      lightSegments: [],
    });

    /** Open ground just east of the block, the near face of it, and the far side. */
    const OPEN = cellIndexOf(GRID, 8, 6);
    const FACE = cellIndexOf(GRID, 7, 6);
    const BEHIND = cellIndexOf(GRID, 5, 6);

    it('cannot see the face of it on the sight lines alone', () => {
      const cells = computeVisibleCellsFor(lookingWest(), optionsFor(lit));
      expect(cells.get(OPEN)).toBe(true);
      expect(cells.get(FACE)).toBe(false);
    });

    it('shows the face once it is known to be a wall', () => {
      expect(computeVisibleCellsFor(lookingWest(), optionsFor(lit, pillarCells())).get(FACE)).toBe(true);
    });

    it('shows no more of it than the face', () => {
      expect(computeVisibleCellsFor(lookingWest(), optionsFor(lit, pillarCells())).get(BEHIND)).toBe(false);
    });

    it('leaves a face out of reach alone where the range is all a piece has', () => {
      const daylight = scene({
        darknessEnabled: false,
        lights: [],
        sightSegments: PILLAR,
        lightSegments: [],
      });
      const cells = computeVisibleCellsFor(lookingWest(290), optionsFor(daylight, pillarCells()));
      expect(cells.get(OPEN)).toBe(true);
      expect(cells.get(FACE)).toBe(false);
    });
  });

  it('clears exactly the stretch of a long wall the lamp reaches, where the lamp stands', () => {
    // Twelve cells of wall across row 5, with a small lamp against the middle of it and the
    // eye on the near side. What matters is which cells clear, not how many: the cleared
    // stretch has to sit symmetrically against the lamp, its corners caught by the light.
    const wall = rectangleSegments(0, 250, 600, 50, 0).map((edge) => ({ ...edge, heightPx: WALL_HEIGHT }));
    const blocking = new CellBits(cellCount(GRID));
    for (let col = 0; col < 12; col++) blocking.set(cellIndexOf(GRID, col, 5));

    const built = scene({
      lights: [{ ...torch(), x: 300, y: 400, dimPx: 150 }],
      sightSegments: wall,
      lightSegments: wall,
    });
    const cells = computeVisibleCellsFor(eyes({ x: 300, y: 450 }), optionsFor(built, blocking));

    expect(litCols(cells)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('clears that same stretch with the eye off to one end of the wall', () => {
    // Looking along the wall rather than at it: the way to the eye is the way the wall runs,
    // so a face read towards the eye lands in the next stone along, and the lit stretch used
    // to shrink to a cell or two. It must stay against the lamp, not against the eye.
    const wall = rectangleSegments(0, 250, 600, 50, 0).map((edge) => ({ ...edge, heightPx: WALL_HEIGHT }));
    const blocking = new CellBits(cellCount(GRID));
    for (let col = 0; col < 12; col++) blocking.set(cellIndexOf(GRID, col, 5));

    const built = scene({
      lights: [{ ...torch(), x: 300, y: 400, dimPx: 150 }],
      sightSegments: wall,
      lightSegments: wall,
    });
    const cells = computeVisibleCellsFor(eyes({ x: 25, y: 425 }), optionsFor(built, blocking));

    expect(litCols(cells)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('sees nothing at all when it is blind', () => {
    const built = scene();
    expect(computeVisibleCellsFor(eyes({ x: 250, y: 250, type: VisionType.BLIND }), optionsFor(built)).isEmpty).toBe(
      true
    );
  });

  describe('two corridors with a wall between them', () => {
    /** A wall right across row 5, from edge to edge, so nothing can be seen past it. */
    const DIVIDER = rectangleSegments(0, 250, 1000, 50, 0).map((edge) => ({ ...edge, heightPx: WALL_HEIGHT }));

    function dividerCells(): CellBits {
      const bits = new CellBits(cellCount(GRID));
      for (let col = 0; col < 20; col++) bits.set(cellIndexOf(GRID, col, 5));
      return bits;
    }

    /** A lamp in the far corridor, and the eye in the near one. */
    const built = scene({
      lights: [{ ...torch(), x: 500, y: 150, dimPx: 500 }],
      sightSegments: DIVIDER,
      lightSegments: DIVIDER,
    });

    it('keeps the ground beyond the wall out of sight, however brightly it is lit', () => {
      const cells = computeVisibleCellsFor(eyes({ x: 500, y: 450 }), optionsFor(built, dividerCells()));
      expect(isLit(built, 525, 175, true, 0)).toBe(true);
      expect(cells.get(cellIndexOf(GRID, 10, 3))).toBe(false);
      expect(cells.get(cellIndexOf(GRID, 10, 1))).toBe(false);
      expect(cells.get(cellIndexOf(GRID, 4, 2))).toBe(false);
    });

    it('shows the wall itself once a lamp on the near side reaches it', () => {
      const bothLit = scene({
        lights: [
          { ...torch(), x: 500, y: 150, dimPx: 500 },
          { ...torch(), x: 500, y: 450, dimPx: 300 },
        ],
        sightSegments: DIVIDER,
        lightSegments: DIVIDER,
      });
      const cells = computeVisibleCellsFor(eyes({ x: 500, y: 450 }), optionsFor(bothLit, dividerCells()));
      expect(cells.get(cellIndexOf(GRID, 10, 5))).toBe(true);
      // Beyond it, nothing: neither the ground nor the far side of the wall.
      expect(cells.get(cellIndexOf(GRID, 10, 4))).toBe(false);
    });
  });
});
