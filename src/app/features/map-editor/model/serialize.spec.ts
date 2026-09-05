import { GridType } from '@axe/domain/tabletop/game-table';
import { DEFAULT_FUNCTION_SPEC } from '@axe/features/map-editor/model/function-layer';
import {
  CellLayer,
  createScene,
  FunctionLayer,
  ImageLayer,
  MAP_SCENE_VERSION,
  MapScene,
  ShapeLayer,
} from '@axe/features/map-editor/model/scene';
import { deserializeScene, isMapScene, serializeScene } from '@axe/features/map-editor/model/serialize';

function makeScene(): MapScene {
  return createScene(10, 8, 64);
}

describe('serializeScene', () => {
  it('produces valid JSON with correct version', () => {
    const scene = makeScene();
    const json = serializeScene(scene);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['version']).toBe(MAP_SCENE_VERSION);
    expect(parsed['cols']).toBe(10);
    expect(parsed['rows']).toBe(8);
  });

  it('forces version to MAP_SCENE_VERSION even if scene has different version', () => {
    const scene = makeScene();
    (scene as unknown as Record<string, unknown>)['version'] = 999;
    const json = serializeScene(scene);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['version']).toBe(MAP_SCENE_VERSION);
  });
});

describe('isMapScene', () => {
  it('returns true for valid scene', () => {
    expect(isMapScene(makeScene())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isMapScene(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isMapScene('string')).toBe(false);
    expect(isMapScene(42)).toBe(false);
  });

  it('returns false when cols is zero', () => {
    const s = { ...makeScene(), cols: 0 };
    expect(isMapScene(s)).toBe(false);
  });

  it('returns false when rows is negative', () => {
    const s = { ...makeScene(), rows: -1 };
    expect(isMapScene(s)).toBe(false);
  });

  it('returns false when cellPx is missing', () => {
    const s = { ...makeScene() } as Record<string, unknown>;
    delete s['cellPx'];
    expect(isMapScene(s)).toBe(false);
  });

  it('returns false when layers is not an array', () => {
    const s = { ...makeScene(), layers: 'bad' };
    expect(isMapScene(s)).toBe(false);
  });

  it('returns false when a layer has an unknown kind', () => {
    const scene = makeScene() as unknown as Record<string, unknown>;
    scene['layers'] = [{ id: 'x', kind: 'unknown', name: 'test' }];
    expect(isMapScene(scene)).toBe(false);
  });

  it('returns false when version is Infinity', () => {
    const s = { ...makeScene(), version: Infinity };
    expect(isMapScene(s)).toBe(false);
  });
});

describe('deserializeScene round-trip', () => {
  it('deserializes a serialized scene correctly', () => {
    const scene = makeScene();
    const json = serializeScene(scene);
    const result = deserializeScene(json);
    expect(result).not.toBeNull();
    expect(result!.cols).toBe(scene.cols);
    expect(result!.rows).toBe(scene.rows);
    expect(result!.cellPx).toBe(scene.cellPx);
    expect(result!.version).toBe(MAP_SCENE_VERSION);
    expect(result!.layers).toHaveLength(0);
  });

  it('returns null for malformed JSON', () => {
    expect(deserializeScene('not json')).toBeNull();
    expect(deserializeScene('{bad}')).toBeNull();
  });

  it('returns null for valid JSON that fails isMapScene', () => {
    expect(deserializeScene(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(deserializeScene(JSON.stringify({ version: 1, cols: 0, rows: 5, cellPx: 64, layers: [] }))).toBeNull();
  });

  it('sanitizes opacity clamping', () => {
    const scene = makeScene();
    scene.layers = [
      {
        id: 'l1',
        kind: 'cell',
        name: 'test',
        visible: true,
        locked: false,
        opacity: 1.5,
        cells: {},
      },
    ];
    const json = JSON.stringify(scene);
    const result = deserializeScene(json);
    expect(result!.layers[0].opacity).toBe(1);

    scene.layers[0].opacity = -0.5;
    const json2 = JSON.stringify(scene);
    const result2 = deserializeScene(json2);
    expect(result2!.layers[0].opacity).toBe(0);
  });

  it('coerces visible/locked booleans', () => {
    const scene = makeScene();
    scene.layers = [
      {
        id: 'l1',
        kind: 'cell',
        name: 'test',
        visible: false,
        locked: false,
        opacity: 1,
        cells: {},
      },
    ];
    const raw = JSON.parse(JSON.stringify(scene)) as Record<string, unknown>;
    const layers = raw['layers'] as Array<Record<string, unknown>>;
    layers[0]['visible'] = false;
    layers[0]['locked'] = true;
    const result = deserializeScene(JSON.stringify(raw));
    expect(result!.layers[0].visible).toBe(false);
    expect(result!.layers[0].locked).toBe(true);
  });

  it('ensures missing arrays default to empty', () => {
    const raw = {
      version: MAP_SCENE_VERSION,
      cols: 5,
      rows: 5,
      cellPx: 64,
      background: '#fff',
      gridColor: '#000',
      gridVisible: true,
      layers: [{ id: 'l1', kind: 'shape', name: 'shapes', visible: true, locked: false, opacity: 1 }],
    };
    const result = deserializeScene(JSON.stringify(raw));
    expect(result).not.toBeNull();
    if (result!.layers[0].kind === 'shape') {
      expect(result!.layers[0].items).toEqual([]);
    }
  });

  it('round-trips gridType', () => {
    for (const gridType of [GridType.NONE, GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const scene = createScene(5, 5, 64, gridType);
      const result = deserializeScene(serializeScene(scene));
      expect(result!.gridType).toBe(gridType);
    }
  });

  it('falls back to SQUARE for invalid or missing gridType', () => {
    const base = createScene(5, 5, 64);
    const missing = JSON.parse(serializeScene(base)) as Record<string, unknown>;
    delete missing['gridType'];
    expect(deserializeScene(JSON.stringify(missing))!.gridType).toBe(GridType.SQUARE);

    const bad = { ...missing, gridType: 99 };
    expect(deserializeScene(JSON.stringify(bad))!.gridType).toBe(GridType.SQUARE);

    const wrongType = { ...missing, gridType: 'hex' };
    expect(deserializeScene(JSON.stringify(wrongType))!.gridType).toBe(GridType.SQUARE);
  });

  it('round-trips an image layer', () => {
    const scene = createScene(5, 5, 64);
    const layer: ImageLayer = {
      id: 'img',
      kind: 'image',
      name: 'images',
      visible: true,
      locked: false,
      opacity: 1,
      items: [{ id: 'i1', imageIdentifier: 'abc', x: 1, y: 2, w: 30, h: 40, rotation: 15, opacity: 0.5 }],
    };
    scene.layers = [layer];
    const result = deserializeScene(serializeScene(scene));
    expect(result!.layers).toHaveLength(1);
    const out = result!.layers[0];
    expect(out.kind).toBe('image');
    if (out.kind === 'image') {
      expect(out.items).toHaveLength(1);
      expect(out.items[0]).toMatchObject({ imageIdentifier: 'abc', w: 30, h: 40, rotation: 15, opacity: 0.5 });
    }
  });

  it('defaults missing image items array to empty', () => {
    const raw = {
      version: MAP_SCENE_VERSION,
      cols: 5,
      rows: 5,
      cellPx: 64,
      gridType: GridType.SQUARE,
      background: '#fff',
      gridColor: '#000',
      gridVisible: true,
      layers: [{ id: 'l1', kind: 'image', name: 'images', visible: true, locked: false, opacity: 1 }],
    };
    const result = deserializeScene(JSON.stringify(raw));
    expect(result).not.toBeNull();
    if (result!.layers[0].kind === 'image') {
      expect(result!.layers[0].items).toEqual([]);
    }
  });

  it('round-trips stroke dash, shadow, and polyline shapes', () => {
    const scene = createScene(5, 5, 64);
    scene.layers = [
      {
        id: 'sh',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            shape: 'polyline',
            points: [0, 0, 5, 5, 10, 0],
            fill: { type: 'solid', color: '#f00' },
            stroke: { color: '#000', width: 2, dash: 'dashdot' },
            rotation: 0,
            shadow: { color: '#123', blur: 4, offsetX: 1, offsetY: 2 },
          },
        ],
      },
    ];
    const result = deserializeScene(serializeScene(scene));
    const out = result!.layers[0];
    expect(out.kind).toBe('shape');
    if (out.kind === 'shape') {
      expect(out.items[0].shape).toBe('polyline');
      expect(out.items[0].stroke?.dash).toBe('dashdot');
      expect(out.items[0].shadow).toEqual({ color: '#123', blur: 4, offsetX: 1, offsetY: 2 });
    }
  });

  it('round-trips curve and closedCurve shapes keeping fill on the closed one', () => {
    const scene = createScene(5, 5, 64);
    scene.layers = [
      {
        id: 'sh',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            shape: 'curve',
            points: [0, 0, 5, 5, 10, 0, 15, 5],
            fill: null,
            stroke: { color: '#000', width: 2 },
            rotation: 0,
          },
          {
            id: 's2',
            shape: 'closedCurve',
            points: [0, 0, 10, 0, 10, 10],
            fill: { type: 'solid', color: '#0f0' },
            stroke: { color: '#000', width: 2 },
            rotation: 0,
          },
        ],
      },
    ];
    const result = deserializeScene(serializeScene(scene));
    const out = result!.layers[0];
    expect(out.kind).toBe('shape');
    if (out.kind === 'shape') {
      expect(out.items[0].shape).toBe('curve');
      expect(out.items[1].shape).toBe('closedCurve');
      expect(out.items[1].fill).toEqual({ type: 'solid', color: '#0f0' });
    }
  });

  it('drops an invalid dash to undefined', () => {
    const scene = createScene(5, 5, 64);
    const raw = JSON.parse(serializeScene(scene)) as Record<string, unknown>;
    raw['layers'] = [
      {
        id: 'sh',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            shape: 'rect',
            points: [0, 0, 5, 5],
            fill: null,
            stroke: { color: '#000', width: 2, dash: 'zigzag' },
            rotation: 0,
          },
        ],
      },
    ];
    const result = deserializeScene(JSON.stringify(raw));
    const out = result!.layers[0];
    if (out.kind === 'shape') {
      expect(out.items[0].stroke?.dash).toBeUndefined();
    }
  });

  it('coerces a non-object shadow to null', () => {
    const scene = createScene(5, 5, 64);
    const raw = JSON.parse(serializeScene(scene)) as Record<string, unknown>;
    raw['layers'] = [
      {
        id: 'sh',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          { id: 's1', shape: 'ellipse', points: [0, 0, 5, 5], fill: null, stroke: null, rotation: 0, shadow: 'bad' },
        ],
      },
    ];
    const result = deserializeScene(JSON.stringify(raw));
    const out = result!.layers[0];
    if (out.kind === 'shape') {
      expect(out.items[0].shadow).toBeNull();
    }
  });

  it('drops shape items with an invalid shape kind', () => {
    const scene = createScene(5, 5, 64);
    const raw = JSON.parse(serializeScene(scene)) as Record<string, unknown>;
    raw['layers'] = [
      {
        id: 'sh',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          { id: 'bad', shape: 'spiral', points: [0, 0], fill: null, stroke: null, rotation: 0 },
          { id: 'ok', shape: 'rect', points: [0, 0, 5, 5], fill: null, stroke: null, rotation: 0 },
        ],
      },
    ];
    const result = deserializeScene(JSON.stringify(raw));
    const out = result!.layers[0];
    if (out.kind === 'shape') {
      expect(out.items).toHaveLength(1);
      expect(out.items[0].id).toBe('ok');
    }
  });

  it('coerces clipToCells to a boolean on image items', () => {
    const scene = createScene(5, 5, 64);
    const raw = JSON.parse(serializeScene(scene)) as Record<string, unknown>;
    raw['layers'] = [
      {
        id: 'img',
        kind: 'image',
        name: 'images',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          { id: 'i1', imageIdentifier: 'a', x: 0, y: 0, w: 4, h: 4, rotation: 0, opacity: 1, clipToCells: 'yes' },
          { id: 'i2', imageIdentifier: 'b', x: 0, y: 0, w: 4, h: 4, rotation: 0, opacity: 1, clipToCells: true },
        ],
      },
    ];
    const result = deserializeScene(JSON.stringify(raw));
    const out = result!.layers[0];
    if (out.kind === 'image') {
      expect(out.items[0].clipToCells).toBe(false);
      expect(out.items[1].clipToCells).toBe(true);
    }
  });

  it('round-trips image: texture ids on cell and shape fills without stripping the prefix', () => {
    const scene = createScene(5, 5, 64);
    const cellLayer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: true,
      locked: false,
      opacity: 1,
      cells: { '0,0': { type: 'texture', textureId: 'image:storage-id-1', scale: 2, rotation: 30 } },
    };
    const shapeLayer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: 's1',
          shape: 'rect',
          points: [0, 0, 5, 5],
          fill: { type: 'texture', textureId: 'image:storage-id-2', scale: 1, rotation: 0 },
          stroke: null,
          rotation: 0,
        },
      ],
    };
    scene.layers = [cellLayer, shapeLayer];
    const result = deserializeScene(serializeScene(scene));
    const cells = result!.layers[0];
    const shapes = result!.layers[1];
    if (cells.kind === 'cell') {
      expect(cells.cells['0,0']).toEqual({ type: 'texture', textureId: 'image:storage-id-1', scale: 2, rotation: 30 });
    }
    if (shapes.kind === 'shape') {
      expect(shapes.items[0].fill).toEqual({ type: 'texture', textureId: 'image:storage-id-2', scale: 1, rotation: 0 });
    }
  });

  it('round-trips a textured shape stroke fill including image: ids', () => {
    const scene = createScene(5, 5, 64);
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: 's1',
          shape: 'line',
          points: [0, 0, 10, 10],
          fill: null,
          stroke: {
            color: '#000',
            width: 3,
            fill: { type: 'texture', textureId: 'image:stroke-tex', scale: 2, rotation: 45 },
          },
          rotation: 0,
        },
      ],
    };
    scene.layers = [layer];
    const out = deserializeScene(serializeScene(scene))!.layers[0];
    if (out.kind === 'shape') {
      expect(out.items[0].stroke?.fill).toEqual({
        type: 'texture',
        textureId: 'image:stroke-tex',
        scale: 2,
        rotation: 45,
      });
    }
  });

  it('coerces an invalid shape stroke fill to null', () => {
    const scene = createScene(5, 5, 64);
    const raw = JSON.parse(serializeScene(scene)) as Record<string, unknown>;
    raw['layers'] = [
      {
        id: 's',
        kind: 'shape',
        name: 'shapes',
        visible: true,
        locked: false,
        opacity: 1,
        items: [
          {
            id: 's1',
            shape: 'line',
            points: [0, 0, 5, 5],
            fill: null,
            stroke: { color: '#000', width: 2, fill: 'bad' },
            rotation: 0,
          },
        ],
      },
    ];
    const out = deserializeScene(JSON.stringify(raw))!.layers[0];
    if (out.kind === 'shape') {
      expect(out.items[0].stroke?.fill).toBeNull();
    }
  });

  it('drops unknown layer kinds', () => {
    const raw = {
      version: MAP_SCENE_VERSION,
      cols: 5,
      rows: 5,
      cellPx: 64,
      background: '#fff',
      gridColor: '#000',
      gridVisible: true,
      layers: [
        { id: 'l1', kind: 'unknown_type', name: 'bad', visible: true, locked: false, opacity: 1 },
        { id: 'l2', kind: 'cell', name: 'good', visible: true, locked: false, opacity: 1, cells: {} },
      ],
    };
    const result = deserializeScene(JSON.stringify(raw));
    expect(result).not.toBeNull();
    expect(result!.layers).toHaveLength(1);
    expect(result!.layers[0].id).toBe('l2');
  });

  it('keeps the guides laid on a scene', () => {
    const scene = createScene(5, 5, 64);
    scene.guides = [
      { id: 'g1', axis: 'x', at: 120 },
      { id: 'g2', axis: 'y', at: 40 },
    ];

    const back = deserializeScene(serializeScene(scene));

    expect(back!.guides).toEqual(scene.guides);
  });

  it('drops guides that name no axis or land nowhere', () => {
    const raw = {
      version: MAP_SCENE_VERSION,
      cols: 5,
      rows: 5,
      cellPx: 64,
      background: '#fff',
      gridColor: '#000',
      gridVisible: true,
      layers: [],
      guides: [
        { id: 'g1', axis: 'z', at: 10 },
        { id: 'g2', axis: 'x', at: 'over there' },
        { id: 'g3', axis: 'y', at: 30 },
      ],
    };

    expect(deserializeScene(JSON.stringify(raw))!.guides).toEqual([{ id: 'g3', axis: 'y', at: 30 }]);
  });

  it('leaves a scene that was never given guides without any', () => {
    expect(deserializeScene(serializeScene(createScene(5, 5, 64)))!.guides).toBeUndefined();
  });
});

describe('the cells painted for what they do', () => {
  function sceneWithFunction(): MapScene {
    const layer: FunctionLayer = {
      id: 'f',
      kind: 'function',
      name: '立入禁止',
      visible: true,
      locked: false,
      opacity: 1,
      role: 'terrain',
      cells: { '2,3': true, '4,5': true },
      spec: { ...DEFAULT_FUNCTION_SPEC, terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, height: 3 } },
    };
    return { ...makeScene(), layers: [layer] };
  }

  it('carries the role, the cells and the settings through a round trip', () => {
    const restored = deserializeScene(serializeScene(sceneWithFunction()));

    const layer = restored?.layers[0] as FunctionLayer;
    expect(layer.kind).toBe('function');
    expect(layer.role).toBe('terrain');
    expect(Object.keys(layer.cells).sort()).toEqual(['2,3', '4,5']);
    expect(layer.spec.terrain.height).toBe(3);
  });

  it('reads a role it does not know as the one a new layer starts on', () => {
    const json = serializeScene(sceneWithFunction()).replace('"role":"terrain"', '"role":"damage"');

    const layer = deserializeScene(json)?.layers[0] as FunctionLayer;

    expect(layer.role).toBe('moveBlock');
  });

  it('keeps only the cells that were written down as painted', () => {
    const json = serializeScene(sceneWithFunction()).replace('"2,3":true', '"2,3":false');

    const layer = deserializeScene(json)?.layers[0] as FunctionLayer;

    expect(Object.keys(layer.cells)).toEqual(['4,5']);
  });
});
