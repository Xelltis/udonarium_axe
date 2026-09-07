import { GridType } from '@axe/domain/tabletop/game-table';
import {
  cellKey,
  CellLayer,
  createLayer,
  createScene,
  FreehandLayer,
  FunctionLayer,
  ImageLayer,
  MapScene,
  ShapeLayer,
  StampLayer,
  TextLayer,
} from '@axe/features/map-editor/model/scene';
import {
  addImage,
  addLayer,
  addShape,
  addStamp,
  addStroke,
  addText,
  eraseCell,
  findLayer,
  floodFill,
  getCell,
  inBounds,
  moveLayer,
  removeImage,
  removeLayer,
  removeShape,
  removeStamp,
  removeStroke,
  removeText,
  reorderLayer,
  resizeScene,
  setCell,
  updateImage,
  updateShape,
  updateStamp,
  updateText,
} from '@axe/features/map-editor/model/scene-ops';

const solidRed = { type: 'solid' as const, color: '#ff0000' };
const solidBlue = { type: 'solid' as const, color: '#0000ff' };

function makeCellLayer(): CellLayer {
  return createLayer('cell', 'cells') as CellLayer;
}

function makeScene(cols = 5, rows = 5): MapScene {
  return createScene(cols, rows, 64);
}

describe('inBounds', () => {
  const scene = makeScene(5, 5);
  it('returns true for valid coords', () => {
    expect(inBounds(scene, 0, 0)).toBe(true);
    expect(inBounds(scene, 4, 4)).toBe(true);
  });
  it('returns false for out-of-bounds coords', () => {
    expect(inBounds(scene, -1, 0)).toBe(false);
    expect(inBounds(scene, 5, 0)).toBe(false);
    expect(inBounds(scene, 0, 5)).toBe(false);
  });
});

describe('setCell / eraseCell / getCell', () => {
  it('sets and retrieves a cell', () => {
    const layer = makeCellLayer();
    setCell(layer, 1, 2, solidRed);
    expect(getCell(layer, 1, 2)).toEqual(solidRed);
  });

  it('returns null for absent cell', () => {
    const layer = makeCellLayer();
    expect(getCell(layer, 0, 0)).toBeNull();
  });

  it('erases a cell', () => {
    const layer = makeCellLayer();
    setCell(layer, 1, 1, solidRed);
    eraseCell(layer, 1, 1);
    expect(getCell(layer, 1, 1)).toBeNull();
    expect(Object.keys(layer.cells)).not.toContain(cellKey(1, 1));
  });
});

describe('floodFill', () => {
  it('fills a contiguous empty region', () => {
    const scene = makeScene(3, 3);
    const layer = makeCellLayer();
    floodFill(scene, layer, 1, 1, solidRed);
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        expect(getCell(layer, c, r)).toEqual(solidRed);
      }
    }
  });

  it('stops at boundary of different fill', () => {
    const scene = makeScene(3, 3);
    const layer = makeCellLayer();
    setCell(layer, 0, 0, solidBlue);
    setCell(layer, 1, 0, solidBlue);
    setCell(layer, 2, 0, solidBlue);
    floodFill(scene, layer, 1, 1, solidRed);
    expect(getCell(layer, 0, 0)).toEqual(solidBlue);
    expect(getCell(layer, 1, 1)).toEqual(solidRed);
  });

  it('is a no-op when target fill equals start fill', () => {
    const scene = makeScene(3, 3);
    const layer = makeCellLayer();
    setCell(layer, 1, 1, solidRed);
    floodFill(scene, layer, 1, 1, solidRed);
    expect(getCell(layer, 0, 0)).toBeNull();
  });

  it('floods only contiguous region of same fill', () => {
    const scene = makeScene(5, 1);
    const layer = makeCellLayer();
    setCell(layer, 2, 0, solidBlue);
    floodFill(scene, layer, 0, 0, solidRed);
    expect(getCell(layer, 0, 0)).toEqual(solidRed);
    expect(getCell(layer, 1, 0)).toEqual(solidRed);
    expect(getCell(layer, 2, 0)).toEqual(solidBlue);
    expect(getCell(layer, 3, 0)).toBeNull();
  });

  it('treats empty cells as distinct from filled cells', () => {
    const scene = makeScene(3, 1);
    const layer = makeCellLayer();
    setCell(layer, 0, 0, solidRed);
    setCell(layer, 2, 0, solidRed);
    floodFill(scene, layer, 1, 0, solidBlue);
    expect(getCell(layer, 1, 0)).toEqual(solidBlue);
    expect(getCell(layer, 0, 0)).toEqual(solidRed);
    expect(getCell(layer, 2, 0)).toEqual(solidRed);
  });

  it('does nothing when out of bounds', () => {
    const scene = makeScene(3, 3);
    const layer = makeCellLayer();
    floodFill(scene, layer, -1, 0, solidRed);
    expect(Object.keys(layer.cells)).toHaveLength(0);
  });
});

describe('layer management', () => {
  it('addLayer appends to the end', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    addLayer(scene, l1);
    addLayer(scene, l2);
    expect(scene.layers).toHaveLength(2);
    expect(scene.layers[1].id).toBe(l2.id);
  });

  it('removeLayer removes the correct layer', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    addLayer(scene, l1);
    addLayer(scene, l2);
    removeLayer(scene, l1.id);
    expect(scene.layers).toHaveLength(1);
    expect(scene.layers[0].id).toBe(l2.id);
  });

  it('removeLayer is a no-op for unknown id', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    addLayer(scene, l1);
    removeLayer(scene, 'nonexistent');
    expect(scene.layers).toHaveLength(1);
  });

  it('findLayer returns the matching layer', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    addLayer(scene, l1);
    expect(findLayer(scene, l1.id)?.id).toBe(l1.id);
  });

  it('findLayer returns undefined for unknown id', () => {
    const scene = makeScene();
    expect(findLayer(scene, 'x')).toBeUndefined();
  });

  it('moveLayer shifts down by 1', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    const l3 = createLayer('text', 'c');
    addLayer(scene, l1);
    addLayer(scene, l2);
    addLayer(scene, l3);
    moveLayer(scene, l3.id, -1);
    expect(scene.layers.map((l) => l.id)).toEqual([l1.id, l3.id, l2.id]);
  });

  it('moveLayer shifts up by 1', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    addLayer(scene, l1);
    addLayer(scene, l2);
    moveLayer(scene, l1.id, 1);
    expect(scene.layers.map((l) => l.id)).toEqual([l2.id, l1.id]);
  });

  it('moveLayer clamps at boundaries', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    addLayer(scene, l1);
    moveLayer(scene, l1.id, -5);
    expect(scene.layers[0].id).toBe(l1.id);
    moveLayer(scene, l1.id, 5);
    expect(scene.layers[0].id).toBe(l1.id);
  });

  it('reorderLayer moves to specific index', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    const l3 = createLayer('text', 'c');
    addLayer(scene, l1);
    addLayer(scene, l2);
    addLayer(scene, l3);
    reorderLayer(scene, l1.id, 2);
    expect(scene.layers.map((l) => l.id)).toEqual([l2.id, l3.id, l1.id]);
  });

  it('reorderLayer clamps to valid range', () => {
    const scene = makeScene();
    const l1 = createLayer('cell', 'a');
    const l2 = createLayer('shape', 'b');
    addLayer(scene, l1);
    addLayer(scene, l2);
    reorderLayer(scene, l1.id, 100);
    expect(scene.layers[scene.layers.length - 1].id).toBe(l1.id);
  });
});

describe('shape item ops', () => {
  function makeShapeLayer(): ShapeLayer {
    return createLayer('shape', 'shapes') as ShapeLayer;
  }

  it('addShape appends item', () => {
    const layer = makeShapeLayer();
    addShape(layer, { id: 'a', shape: 'rect', points: [0, 0, 10, 10], fill: solidRed, stroke: null, rotation: 0 });
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0].id).toBe('a');
  });

  it('addShape generates id if missing', () => {
    const layer = makeShapeLayer();
    addShape(layer, { id: '', shape: 'rect', points: [], fill: null, stroke: null, rotation: 0 });
    expect(layer.items[0].id).toBeTruthy();
  });

  it('updateShape patches item', () => {
    const layer = makeShapeLayer();
    addShape(layer, { id: 'x', shape: 'rect', points: [0, 0], fill: null, stroke: null, rotation: 0 });
    updateShape(layer, 'x', { rotation: 45 });
    expect(layer.items[0].rotation).toBe(45);
    expect(layer.items[0].id).toBe('x');
  });

  it('removeShape removes by id', () => {
    const layer = makeShapeLayer();
    addShape(layer, { id: 'x', shape: 'rect', points: [], fill: null, stroke: null, rotation: 0 });
    removeShape(layer, 'x');
    expect(layer.items).toHaveLength(0);
  });
});

describe('stamp item ops', () => {
  function makeStampLayer(): StampLayer {
    return createLayer('stamp', 'stamps') as StampLayer;
  }

  it('addStamp appends item', () => {
    const layer = makeStampLayer();
    addStamp(layer, {
      id: 's1',
      stampId: 'sword',
      x: 10,
      y: 20,
      size: 32,
      rotation: 0,
      flipX: false,
      flipY: false,
      color: null,
    });
    expect(layer.items).toHaveLength(1);
  });

  it('updateStamp patches item', () => {
    const layer = makeStampLayer();
    addStamp(layer, {
      id: 's1',
      stampId: 'sword',
      x: 10,
      y: 20,
      size: 32,
      rotation: 0,
      flipX: false,
      flipY: false,
      color: null,
    });
    updateStamp(layer, 's1', { x: 50 });
    expect(layer.items[0].x).toBe(50);
  });

  it('removeStamp removes by id', () => {
    const layer = makeStampLayer();
    addStamp(layer, {
      id: 's1',
      stampId: 'sword',
      x: 0,
      y: 0,
      size: 32,
      rotation: 0,
      flipX: false,
      flipY: false,
      color: null,
    });
    removeStamp(layer, 's1');
    expect(layer.items).toHaveLength(0);
  });
});

describe('image item ops', () => {
  function makeImageLayer(): ImageLayer {
    return createLayer('image', 'images') as ImageLayer;
  }

  function makeItem(id: string) {
    return { id, imageIdentifier: 'pic', x: 5, y: 5, w: 20, h: 20, rotation: 0, opacity: 1 };
  }

  it('addImage appends item', () => {
    const layer = makeImageLayer();
    addImage(layer, makeItem('i1'));
    expect(layer.items).toHaveLength(1);
  });

  it('addImage assigns an id when missing', () => {
    const layer = makeImageLayer();
    addImage(layer, { ...makeItem(''), id: '' });
    expect(layer.items[0].id).toBeTruthy();
  });

  it('updateImage patches item and preserves id', () => {
    const layer = makeImageLayer();
    addImage(layer, makeItem('i1'));
    updateImage(layer, 'i1', { rotation: 90, opacity: 0.3 });
    expect(layer.items[0]).toMatchObject({ id: 'i1', rotation: 90, opacity: 0.3 });
  });

  it('removeImage removes by id', () => {
    const layer = makeImageLayer();
    addImage(layer, makeItem('i1'));
    removeImage(layer, 'i1');
    expect(layer.items).toHaveLength(0);
  });
});

describe('floodFill hex grids', () => {
  it('fills connected cells through 6 hex neighbors', () => {
    const scene = createScene(5, 5, 64, GridType.HEX_VERTICAL);
    const layer = makeCellLayer();
    floodFill(scene, layer, 2, 2, solidRed);
    expect(Object.keys(layer.cells)).toHaveLength(25);
    for (const fill of Object.values(layer.cells)) {
      expect(fill).toEqual(solidRed);
    }
  });

  it('respects barriers defined on hex neighbor adjacency', () => {
    const scene = createScene(4, 4, 64, GridType.HEX_HORIZONTAL);
    const layer = makeCellLayer();
    setCell(layer, 0, 0, solidBlue);
    floodFill(scene, layer, 0, 0, solidRed);
    expect(getCell(layer, 0, 0)).toEqual(solidRed);
    expect(Object.keys(layer.cells)).toHaveLength(1);
  });
});

describe('freehand stroke ops', () => {
  function makeFreehandLayer(): FreehandLayer {
    return createLayer('freehand', 'freehand') as FreehandLayer;
  }

  it('addStroke appends stroke', () => {
    const layer = makeFreehandLayer();
    addStroke(layer, { id: 'f1', points: [0, 0, 10, 10], color: '#f00', width: 2 });
    expect(layer.strokes).toHaveLength(1);
  });

  it('removeStroke removes by id', () => {
    const layer = makeFreehandLayer();
    addStroke(layer, { id: 'f1', points: [0, 0, 10, 10], color: '#f00', width: 2 });
    removeStroke(layer, 'f1');
    expect(layer.strokes).toHaveLength(0);
  });
});

describe('text item ops', () => {
  function makeTextLayer(): TextLayer {
    return createLayer('text', 'text') as TextLayer;
  }

  it('addText appends item', () => {
    const layer = makeTextLayer();
    addText(layer, {
      id: 't1',
      x: 0,
      y: 0,
      text: 'hello',
      fontSize: 14,
      color: '#fff',
      bold: false,
      italic: false,
      align: 'left',
    });
    expect(layer.items).toHaveLength(1);
  });

  it('updateText patches item', () => {
    const layer = makeTextLayer();
    addText(layer, {
      id: 't1',
      x: 0,
      y: 0,
      text: 'hello',
      fontSize: 14,
      color: '#fff',
      bold: false,
      italic: false,
      align: 'left',
    });
    updateText(layer, 't1', { text: 'world', bold: true });
    expect(layer.items[0].text).toBe('world');
    expect(layer.items[0].bold).toBe(true);
  });

  it('removeText removes by id', () => {
    const layer = makeTextLayer();
    addText(layer, {
      id: 't1',
      x: 0,
      y: 0,
      text: 'hello',
      fontSize: 14,
      color: '#fff',
      bold: false,
      italic: false,
      align: 'left',
    });
    removeText(layer, 't1');
    expect(layer.items).toHaveLength(0);
  });
});

describe('resizeScene', () => {
  it('updates cols and rows', () => {
    const scene = makeScene(10, 10);
    resizeScene(scene, 5, 3);
    expect(scene.cols).toBe(5);
    expect(scene.rows).toBe(3);
  });

  it('drops out-of-bounds cells from cell layers', () => {
    const scene = makeScene(5, 5);
    const layer = makeCellLayer();
    addLayer(scene, layer);
    setCell(layer, 4, 4, solidRed);
    setCell(layer, 1, 1, solidBlue);
    resizeScene(scene, 3, 3);
    expect(getCell(layer, 4, 4)).toBeNull();
    expect(getCell(layer, 1, 1)).toEqual(solidBlue);
  });

  it('drops out-of-bounds cells from function layers too, since those are built on', () => {
    const scene = makeScene(5, 5);
    const layer = createLayer('function', 'walls') as FunctionLayer;
    addLayer(scene, layer);
    layer.cells['4,4'] = true;
    layer.cells['1,1'] = true;

    resizeScene(scene, 3, 3);

    expect(Object.keys(layer.cells)).toEqual(['1,1']);
  });

  it('leaves px-based items on other layers untouched', () => {
    const scene = makeScene(5, 5);
    const shapeLayer = createLayer('shape', 'shapes') as ShapeLayer;
    addLayer(scene, shapeLayer);
    addShape(shapeLayer, { id: 'x', shape: 'rect', points: [0, 0, 1000, 1000], fill: null, stroke: null, rotation: 0 });
    resizeScene(scene, 2, 2);
    expect(shapeLayer.items).toHaveLength(1);
  });
});
