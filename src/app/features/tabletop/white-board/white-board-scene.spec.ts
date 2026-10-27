import {
  createLayer,
  FreehandLayer,
  ImageItem,
  ImageLayer,
  MapScene,
  sceneHeightPx,
  sceneWidthPx,
  ShapeItem,
  TextLayer,
} from '@axe/domain/map-editor/scene';
import { addImage, addShape, addStroke, addText } from '@axe/domain/map-editor/scene-ops';
import { generateShapePoints } from '@axe/domain/map-editor/shape-points';
import {
  addJoint,
  alignMarks,
  anchorFor,
  angleFrom,
  arrowBetween,
  boxAround,
  boxOf,
  centreOnSheet,
  clearSheet,
  copyMark,
  createBoardScene,
  cropMark,
  dropJoint,
  fadeMark,
  fileUnder,
  flipMark,
  freehandLayer,
  GRAPH_SPACINGS,
  groupLayers,
  groupNames,
  guessLineWidth,
  guidesFor,
  guideUnder,
  handleAt,
  handleUnder,
  highlighterStyle,
  imageBox,
  imageLayer,
  isTypingKey,
  jointedShape,
  jointUnder,
  layerFor,
  lineWidth,
  MARK_SHADOW,
  MarkRef,
  marksWithin,
  markUnder,
  moveJoint,
  moveMark,
  newGuide,
  noteAt,
  outlineFor,
  overlaysWanted,
  pathThrough,
  penStroke,
  pictureOf,
  removeMark,
  renameGroup,
  restack,
  restyleMark,
  rubOutStrokes,
  ruleBoard,
  scaleMark,
  shapeBetween,
  shapeLayer,
  sheetGuides,
  sheetHolding,
  showGroup,
  smoothStroke,
  snapPoint,
  snapTo,
  spreadMarks,
  squareOff,
  stickerAt,
  stickerSize,
  straightLine,
  stretchBy,
  textBox,
  textLayer,
  TURN_GRIP_REACH,
  turnMark,
  uncropMark,
  useTextMeasurer,
  wordsAt,
  wordsOf,
} from '@axe/features/tabletop/white-board/white-board-scene';

const style = { color: '#112233', width: 5, fontSize: 20 };

describe('createBoardScene()', () => {
  it('is a surface to write on rather than a map: no grid and nothing painted under it', () => {
    const scene = createBoardScene(4, 3, 50);

    expect(scene.cols).toBe(4);
    expect(scene.rows).toBe(3);
    expect(scene.gridVisible).toBe(false);
    expect(scene.background).toBe('transparent');
    expect(scene.layers).toEqual([]);
  });
});

describe('layerFor()', () => {
  it('makes each kind the first time it is wanted, and hands back the same one after', () => {
    const scene = createBoardScene(4, 3, 50);

    expect(freehandLayer(scene)).toBe(freehandLayer(scene));
    expect(scene.layers.length).toBe(1);

    shapeLayer(scene);
    textLayer(scene);
    imageLayer(scene);

    expect(scene.layers.map((layer) => layer.kind).sort()).toEqual(['freehand', 'image', 'shape', 'text']);
  });

  it('does not muddle one kind with another', () => {
    const scene = createBoardScene(4, 3, 50);

    expect(layerFor(scene, 'text').kind).toBe('text');
    expect(layerFor(scene, 'image').kind).toBe('image');
  });
});

describe('layerFor()', () => {
  it('puts a mark on the sheet the reader is working on', () => {
    const scene = createBoardScene(4, 3, 50);
    const first = freehandLayer(scene);
    const second = layerFor(scene, 'freehand');
    second.id = 'second';
    scene.layers.push(second);

    expect(layerFor(scene, 'freehand', 'second')).toBe(second);
    expect(layerFor(scene, 'freehand', first.id)).toBe(first);
  });

  it('passes over a locked sheet, and over one that takes another sort of mark', () => {
    const scene = createBoardScene(4, 3, 50);
    const locked = freehandLayer(scene);
    locked.locked = true;

    const chosen = layerFor(scene, 'freehand', locked.id);

    expect(chosen).not.toBe(locked);
    expect(chosen.kind).toBe('freehand');
    expect(layerFor(scene, 'text', locked.id).kind).toBe('text');
  });

  it('takes the topmost that will have it where the reader has chosen none', () => {
    const scene = createBoardScene(4, 3, 50);
    freehandLayer(scene);
    const upper = layerFor(scene, 'freehand');
    upper.id = 'upper';
    scene.layers.push(upper);

    expect(layerFor(scene, 'freehand', null)).toBe(upper);
  });
});

describe('ruleBoard()', () => {
  it('rules the sheet more finely without shrinking it', () => {
    const scene = createBoardScene(8, 6, 50);
    const wide = 8 * 50;
    const deep = 6 * 50;

    ruleBoard(scene, wide, deep, 25);

    expect(scene.cellPx).toBe(25);
    expect(scene.cols * scene.cellPx).toBe(wide);
    expect(scene.rows * scene.cellPx).toBe(deep);
  });

  it('is offered at spacings that divide a square evenly', () => {
    for (const step of GRAPH_SPACINGS) expect(50 % step).toBe(0);
  });
});

describe('marks', () => {
  it('draws a box corner to corner, whichever way round it was dragged', () => {
    const drawn = shapeBetween('rect', { x: 90, y: 80 }, { x: 10, y: 20 }, style);

    expect(drawn.shape).toBe('rect');
    expect(drawn.points).toEqual([10, 20, 80, 60]);
    expect(drawn.fill).toBeNull();
    expect(drawn.stroke?.color).toBe('#112233');
  });

  it('draws an ellipse from the same drag', () => {
    expect(shapeBetween('ellipse', { x: 0, y: 0 }, { x: 40, y: 30 }, style).shape).toBe('ellipse');
  });

  it('draws the many sided ones as polygons, from the same drag', () => {
    for (const kind of ['triangle', 'pentagon', 'hexagon', 'star5', 'star6'] as const) {
      const drawn = shapeBetween(kind, { x: 0, y: 0 }, { x: 40, y: 30 }, style);

      expect(drawn.shape).toBe('polygon');
      expect(drawn.points.length).toBeGreaterThan(4);
    }
  });

  it('fills a shape only when the reader asked for it filled', () => {
    expect(shapeBetween('rect', { x: 0, y: 0 }, { x: 4, y: 4 }, style).fill).toBeNull();
    expect(shapeBetween('rect', { x: 0, y: 0 }, { x: 4, y: 4 }, style, true).fill).toEqual({
      type: 'solid',
      color: style.color,
    });
  });

  it('runs a line from where it started to where it ended', () => {
    expect(straightLine({ x: 1, y: 2 }, { x: 3, y: 4 }, style).points).toEqual([1, 2, 3, 4]);
  });

  it('puts a sticker down around the spot it was stuck, not off one corner of it', () => {
    const stuck = stickerAt({ x: 100, y: 100 }, 'some-image', 40);

    expect(imageBox(stuck)).toEqual({ x: 80, y: 80, w: 40, h: 40 });
    expect(stuck.imageIdentifier).toBe('some-image');
  });

  it('hangs a picture by its middle, which is where the paint hangs it', () => {
    const stuck = stickerAt({ x: 100, y: 100 }, 'some-image', 40);

    expect(stuck.x).toBe(100);
    expect(stuck.y).toBe(100);
  });

  it('sticks a picture up at the size it actually is', () => {
    const wide = stickerAt({ x: 0, y: 0 }, 'wide', 120, { x: 300, y: 100 });

    expect(wide.w).toBe(300);
    expect(wide.h).toBe(100);
  });

  it('falls back to a size of its own only when the picture will not say how big it is', () => {
    const blind = stickerAt({ x: 0, y: 0 }, 'unknown', 120);

    expect(blind.w).toBe(120);
    expect(blind.h).toBe(120);
  });

  it('gives way only where the picture will not fit on the sheet at all', () => {
    const room = { w: 300, h: 200 };

    expect(stickerSize(120, { x: 150, y: 100 }, room)).toEqual({ w: 150, h: 100 });
    expect(stickerSize(120, { x: 600, y: 200 }, room)).toEqual({ w: 300, h: 100 });
  });

  it('keeps the shape of a picture it has had to shrink', () => {
    const shrunk = stickerSize(120, { x: 800, y: 600 }, { w: 400, h: 400 });

    expect(shrunk.w / shrunk.h).toBeCloseTo(800 / 600, 6);
  });

  it('centres a picture of any shape on the spot it was stuck', () => {
    const stuck = stickerAt({ x: 100, y: 100 }, 'wide', 120, { x: 300, y: 100 });
    const box = imageBox(stuck);

    expect(box.x + box.w / 2).toBe(100);
    expect(box.y + box.h / 2).toBe(100);
  });

  it('takes the ink and the size from the pen that wrote it', () => {
    expect(penStroke([0, 0, 1, 1], style).width).toBe(5);
    expect(wordsAt({ x: 0, y: 0 }, 'hello', style).fontSize).toBe(20);
  });
});

describe('rubOutStrokes()', () => {
  function scribbled(): { scene: MapScene; layer: FreehandLayer } {
    const scene = createBoardScene(4, 3, 50);
    const layer = freehandLayer(scene);
    layer.strokes.push(penStroke([0, 0, 10, 0, 20, 0, 30, 0, 40, 0], style));
    return { scene, layer };
  }

  it('leaves a line rubbed through the middle as two lines, not none', () => {
    const { layer } = scribbled();

    expect(rubOutStrokes(layer, 20, 0, 4)).toBe(true);
    expect(layer.strokes.length).toBe(2);
    expect(layer.strokes.every((stroke) => stroke.id.length > 0)).toBe(true);
  });

  it('leaves alone what the eraser never passed over', () => {
    const { layer } = scribbled();

    expect(rubOutStrokes(layer, 400, 400, 4)).toBe(false);
    expect(layer.strokes.length).toBe(1);
  });
});

describe('markUnder()', () => {
  it('takes the topmost sticker under the pointer', () => {
    const scene = createBoardScene(8, 6, 50);
    const images = imageLayer(scene) as ImageLayer;
    images.items.push(stickerAt({ x: 100, y: 100 }, 'under', 80));
    images.items.push(stickerAt({ x: 100, y: 100 }, 'over', 80));

    const found = markUnder(scene, { x: 100, y: 100 });

    expect(found?.kind).toBe('image');
    expect(found?.id).toBe(images.items[1].id);
  });

  it('finds words where they were written', () => {
    const scene = createBoardScene(8, 6, 50);
    const texts = textLayer(scene) as TextLayer;
    texts.items.push(wordsAt({ x: 50, y: 60 }, 'hello', style));

    expect(markUnder(scene, { x: 55, y: 65 })?.kind).toBe('text');
    expect(markUnder(scene, { x: 500, y: 500 })).toBeNull();
  });
});

describe('layer groups', () => {
  function sheets(): { scene: ReturnType<typeof createBoardScene> } {
    const scene = createBoardScene(4, 3, 50);
    for (let i = 0; i < 3; i++) {
      const layer = createLayer('freehand', `sheet ${i}`);
      layer.id = `sheet-${i}`;
      scene.layers.push(layer);
    }
    return { scene };
  }

  it('shows a loose sheet on its own and a bundle as one', () => {
    const { scene } = sheets();
    fileUnder(scene.layers[0], 'plan');
    fileUnder(scene.layers[1], 'plan');

    const groups = groupLayers(scene);

    expect(groups.length).toBe(2);
    expect(groups.find((group) => group.name === 'plan')?.layers.length).toBe(2);
    expect(groups.find((group) => group.name === '')?.layers.length).toBe(1);
  });

  it('stacks the bundles topmost first, the way the sheets are stacked', () => {
    const { scene } = sheets();
    fileUnder(scene.layers[0], 'under');

    expect(groupLayers(scene)[0].layers[0]).toBe(scene.layers[scene.layers.length - 1]);
  });

  it('hides a whole bundle at once, and shows it again', () => {
    const { scene } = sheets();
    fileUnder(scene.layers[0], 'plan');
    fileUnder(scene.layers[2], 'plan');

    showGroup(scene, 'plan', false);

    expect(scene.layers[0].visible).toBe(false);
    expect(scene.layers[2].visible).toBe(false);
    expect(scene.layers[1].visible).toBe(true);
  });

  it('renames a bundle, taking every sheet in it with the name', () => {
    const { scene } = sheets();
    fileUnder(scene.layers[0], 'plan');
    fileUnder(scene.layers[1], 'plan');

    renameGroup(scene, 'plan', 'the ground floor');

    expect(groupNames(scene)).toEqual(['the ground floor']);
  });

  it('takes a sheet out of its bundle when it is filed under nothing', () => {
    const { scene } = sheets();
    fileUnder(scene.layers[0], 'plan');

    fileUnder(scene.layers[0], '');

    expect(scene.layers[0].group).toBeUndefined();
    expect(groupNames(scene)).toEqual([]);
  });
});

describe('taking hold of a mark', () => {
  function drawnOn(): MapScene {
    const scene = createBoardScene(8, 6, 50);
    addStroke(freehandLayer(scene), penStroke([10, 10, 60, 10, 60, 60], style));
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, style));
    addText(textLayer(scene), wordsAt({ x: 250, y: 250 }, 'hello', style));
    addImage(imageLayer(scene), stickerAt({ x: 350, y: 120 }, 'pic', 80));
    return scene;
  }

  it('takes hold of a line drawn in the wrong place, not only of what was stuck on', () => {
    const scene = drawnOn();

    expect(markUnder(scene, { x: 30, y: 12 })?.kind).toBe('stroke');
    expect(markUnder(scene, { x: 150, y: 130 })?.kind).toBe('shape');
    expect(markUnder(scene, { x: 260, y: 260 })?.kind).toBe('text');
    expect(markUnder(scene, { x: 350, y: 120 })?.kind).toBe('image');
  });

  it('passes over a sheet that is hidden or locked', () => {
    const scene = drawnOn();
    for (const layer of scene.layers) layer.visible = false;

    expect(markUnder(scene, { x: 150, y: 130 })).toBeNull();
  });

  it('measures a mark so a hold can be drawn round it', () => {
    const scene = drawnOn();
    const shape = markUnder(scene, { x: 150, y: 130 })!;

    expect(boxOf(scene, shape)).toEqual({ x: 100, y: 100, w: 100, h: 60 });
  });

  it('boxes a rectangle dragged out backwards the right way round', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = { ...shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style), points: [100, 80, -60, -30] };
    addShape(shapeLayer(scene), drawn);

    expect(boxOf(scene, { kind: 'shape', id: drawn.id })).toEqual({ x: 40, y: 50, w: 60, h: 30 });
  });

  it('moves whatever was taken hold of, whichever sort of mark it is', () => {
    const scene = drawnOn();
    // Taken hold of first and moved after, since moving one changes what is under a point.
    const marks = [
      { x: 30, y: 12 },
      { x: 150, y: 130 },
      { x: 260, y: 260 },
      { x: 350, y: 120 },
    ].map((at) => markUnder(scene, at)!);

    expect(marks.every((mark) => mark)).toBe(true);
    for (const mark of marks) {
      const before = boxOf(scene, mark)!;

      moveMark(scene, mark, 25, -15);
      const after = boxOf(scene, mark)!;

      expect(after.x - before.x).toBeCloseTo(25, 5);
      expect(after.y - before.y).toBeCloseTo(-15, 5);
    }
  });

  it('stretches what is held from the corner opposite the one being pulled', () => {
    const scene = drawnOn();
    const shape = markUnder(scene, { x: 150, y: 130 })!;
    const box = boxOf(scene, shape)!;

    scaleMark(scene, shape, box, 2, 1);
    const after = boxOf(scene, shape)!;

    expect(after.x).toBeCloseTo(box.x, 5);
    expect(after.w).toBeCloseTo(box.w * 2, 5);
    expect(after.h).toBeCloseTo(box.h, 5);
  });

  it('takes a mark off the board, whichever sort it is', () => {
    const scene = drawnOn();
    const mark = markUnder(scene, { x: 350, y: 120 })!;

    removeMark(scene, mark);

    expect(markUnder(scene, { x: 350, y: 120 })).toBeNull();
  });
});

describe('handleUnder()', () => {
  const box = { x: 100, y: 100, w: 80, h: 40 };

  it('names the corner the pointer landed on', () => {
    expect(handleUnder({ x: 100, y: 100 }, box, 6)).toBe('nw');
    expect(handleUnder({ x: 180, y: 140 }, box, 6)).toBe('se');
    expect(handleUnder({ x: 180, y: 100 }, box, 6)).toBe('ne');
  });

  it('says nothing where the pointer landed on no corner', () => {
    expect(handleUnder({ x: 140, y: 120 }, box, 6)).toBeNull();
  });

  it('puts each corner where the corner is', () => {
    expect(handleAt(box, 'sw')).toEqual({ x: 100, y: 140 });
  });

  it('names the side the pointer landed on, halfway along it', () => {
    expect(handleUnder({ x: 140, y: 100 }, box, 6)).toBe('n');
    expect(handleUnder({ x: 100, y: 120 }, box, 6)).toBe('w');
    expect(handleAt(box, 'e')).toEqual({ x: 180, y: 120 });
  });

  it('hangs the grip for turning above the hold, clear of the corners', () => {
    expect(handleAt(box, 'turn')).toEqual({ x: 140, y: 100 - TURN_GRIP_REACH });
    expect(handleUnder({ x: 140, y: 100 - TURN_GRIP_REACH }, box, 6)).toBe('turn');
  });

  it('anchors a pulled side against the side facing it', () => {
    expect(anchorFor(box, 'e')).toEqual({ x: 100, y: 100 });
    expect(anchorFor(box, 'nw')).toEqual({ x: 180, y: 140 });
  });

  it('leaves the other way alone when a side is pulled, and moves both when a corner is', () => {
    expect(stretchBy(box, 'e', { x: 260, y: 999 })).toEqual({ kx: 2, ky: 1 });
    expect(stretchBy(box, 's', { x: 999, y: 180 })).toEqual({ kx: 1, ky: 2 });
    expect(stretchBy(box, 'se', { x: 260, y: 180 })).toEqual({ kx: 2, ky: 2 });
  });

  it('never squashes a hold flat, or there would be no grip left to pull it back out', () => {
    expect(stretchBy(box, 'e', { x: 100, y: 100 }).kx).toBeGreaterThan(0);
  });

  it('reads the angle out to the pointer from the middle of the hold, up being nought', () => {
    expect(angleFrom(box, { x: 140, y: 0 })).toBeCloseTo(0, 6);
    expect(angleFrom(box, { x: 999, y: 120 })).toBeCloseTo(90, 6);
  });
});

describe('the rest of the marks', () => {
  it('gives an arrow a shaft and two barbs drawn back from its point', () => {
    const drawn = arrowBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, style);

    expect(drawn.shape).toBe('polyline');
    // Shaft, then back to the point twice for the barbs.
    expect(drawn.points.length).toBe(10);
    expect(drawn.points[2]).toBe(100);
    expect(drawn.points[6]).toBe(100);
  });

  it('puts a card behind a note, which is what makes it a note', () => {
    const note = noteAt({ x: 10, y: 20 }, 'remember', style, '#fff59d');
    const plain = wordsAt({ x: 10, y: 20 }, 'remember', style);

    expect(note.background).toBe('#fff59d');
    expect(plain.background).toBeUndefined();
    expect(textBox(note).w).toBeGreaterThan(textBox(plain).w);
  });

  it('lets what is under a marker show through, and lays it on thick', () => {
    const marked = highlighterStyle(style);

    expect(marked.color).toMatch(/^rgba\(/);
    expect(marked.width).toBeGreaterThan(style.width);
  });

  it('rounds onto the ruling only where there is a ruling to round onto', () => {
    expect(snapTo({ x: 63, y: 38 }, 25)).toEqual({ x: 75, y: 50 });
    expect(snapTo({ x: 63, y: 38 }, 1)).toEqual({ x: 63, y: 38 });
  });
});

describe('copyMark(), restack() and turnMark()', () => {
  function drawnOn(): MapScene {
    const scene = createBoardScene(8, 6, 50);
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, style));
    addImage(imageLayer(scene), stickerAt({ x: 350, y: 120 }, 'pic', 80));
    return scene;
  }

  it('sets a copy down a little off the first, so both can be seen', () => {
    const scene = drawnOn();
    const first = markUnder(scene, { x: 150, y: 130 })!;
    const before = boxOf(scene, first)!;

    const made = copyMark(scene, first, 16)!;
    const after = boxOf(scene, made)!;

    expect(made.id).not.toBe(first.id);
    expect(after.x - before.x).toBeCloseTo(16, 5);
  });

  it('brings a mark forward within the sheet it is on', () => {
    const scene = drawnOn();
    const shapes = scene.layers.find((layer) => layer.kind === 'shape')!;
    addShape(shapes as never, shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style));
    const first = (shapes as { items: { id: string }[] }).items[0].id;

    restack(scene, { kind: 'shape', id: first }, 1);

    expect((shapes as { items: { id: string }[] }).items[1].id).toBe(first);
  });

  it('turns a mark about its own middle, leaving it where it was', () => {
    const scene = drawnOn();
    const picture = markUnder(scene, { x: 350, y: 120 })!;
    const before = boxOf(scene, picture)!;

    turnMark(scene, picture, 90);
    const after = boxOf(scene, picture)!;

    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 5);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 5);
  });
});

describe('measuring words', () => {
  it('gives a full square to a full width character and less to the alphabet', () => {
    // Counting characters alike is wrong by nearly half for Japanese, whose characters are
    // a full square each, and a line measured short cannot be taken hold of by its right half.
    expect(guessLineWidth('ああああ', 20)).toBeCloseTo(80, 5);
    expect(guessLineWidth('aaaa', 20)).toBeCloseTo(48, 5);
  });

  it('measures with the canvas where there is one to ask', () => {
    useTextMeasurer(() => 123);

    expect(lineWidth('anything', wordsAt({ x: 0, y: 0 }, 'anything', style))).toBe(123);

    useTextMeasurer(null);
  });

  it('draws a box round the words from their top, and round the card of a note', () => {
    useTextMeasurer(null);
    const plain = wordsAt({ x: 10, y: 20 }, 'ab', style);
    const box = textBox(plain);

    expect(box.x).toBe(10);
    expect(box.y).toBe(20);
    expect(box.h).toBeCloseTo(style.fontSize * 1.2, 5);
  });
});

describe('restyleMark()', () => {
  function drawn(): MapScene {
    const scene = createBoardScene(8, 6, 50);
    addStroke(freehandLayer(scene), penStroke([0, 0, 10, 10], style));
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 40 }, style));
    addText(textLayer(scene), wordsAt({ x: 100, y: 100 }, 'hi', style));
    return scene;
  }

  it('recolours a line already drawn rather than making it be drawn again', () => {
    const scene = drawn();
    const stroke = scene.layers.find((l) => l.kind === 'freehand')! as {
      strokes: { id: string; color: string; width: number }[];
    };

    restyleMark(scene, { kind: 'stroke', id: stroke.strokes[0].id }, { color: '#ff0000', width: 9 });

    expect(stroke.strokes[0].color).toBe('#ff0000');
    expect(stroke.strokes[0].width).toBe(9);
  });

  it('keeps a marker see through when its colour is changed', () => {
    const scene = drawn();
    const layer = scene.layers.find((l) => l.kind === 'freehand')! as { strokes: { id: string; color: string }[] };
    layer.strokes[0].color = 'rgba(0,0,0,0.38)';

    restyleMark(scene, { kind: 'stroke', id: layer.strokes[0].id }, { color: '#00ff00' });

    expect(layer.strokes[0].color).toMatch(/^rgba\(/);
  });

  it('fills and unfills a shape already drawn', () => {
    const scene = drawn();
    const shapes = scene.layers.find((l) => l.kind === 'shape')! as { items: { id: string; fill: unknown }[] };
    const ref = { kind: 'shape' as const, id: shapes.items[0].id };

    restyleMark(scene, ref, { filled: true, color: '#123456' });
    expect(shapes.items[0].fill).toEqual({ type: 'solid', color: '#123456' });

    restyleMark(scene, ref, { filled: false });
    expect(shapes.items[0].fill).toBeNull();
  });

  it('sets the weight and the side words are set to', () => {
    const scene = drawn();
    const texts = scene.layers.find((l) => l.kind === 'text')! as {
      items: { id: string; bold: boolean; align: string }[];
    };

    restyleMark(scene, { kind: 'text', id: texts.items[0].id }, { bold: true, align: 'center' });

    expect(texts.items[0].bold).toBe(true);
    expect(texts.items[0].align).toBe('center');
  });

  it('hands back the words already written, so they can be typed over', () => {
    const scene = drawn();
    const texts = scene.layers.find((l) => l.kind === 'text')! as { items: { id: string }[] };

    expect(wordsOf(scene, { kind: 'text', id: texts.items[0].id })?.text).toBe('hi');
    expect(wordsOf(scene, { kind: 'shape', id: 'whatever' })).toBeNull();
  });
});

describe('holding several marks at once', () => {
  function scattered(): MapScene {
    const scene = createBoardScene(12, 10, 50);
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 20, y: 30 }, { x: 60, y: 90 }, style));
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 100, y: 10 }, { x: 180, y: 50 }, style));
    addImage(imageLayer(scene), stickerAt({ x: 300, y: 300 }, 'pic', 40));
    return scene;
  }

  it('takes everything the dragged out box holds, and leaves what hangs out of it', () => {
    const caught = marksWithin(scattered(), { x: 0, y: 0, w: 200, h: 120 });

    expect(caught).toHaveLength(2);
    expect(caught.every((mark) => mark.kind === 'shape')).toBe(true);
  });

  it('half inside is not inside', () => {
    expect(marksWithin(scattered(), { x: 0, y: 0, w: 120, h: 120 })).toHaveLength(1);
  });

  it('draws one box round everything held', () => {
    const scene = scattered();
    const held = marksWithin(scene, { x: 0, y: 0, w: 200, h: 120 });

    expect(boxAround(scene, held)).toEqual({ x: 20, y: 10, w: 160, h: 80 });
  });

  it('has no box to draw when nothing is held', () => {
    expect(boxAround(scattered(), [])).toBeNull();
  });

  it('lines marks up on their left edges without moving them up or down', () => {
    const scene = scattered();
    const held = marksWithin(scene, { x: 0, y: 0, w: 200, h: 120 });

    alignMarks(scene, held, 'left');

    expect(held.map((mark) => boxOf(scene, mark)?.x)).toEqual([20, 20]);
    expect(held.map((mark) => boxOf(scene, mark)?.y)).toEqual([30, 10]);
  });

  it('lines them up on their far edges and on their middles', () => {
    const scene = scattered();
    const held = marksWithin(scene, { x: 0, y: 0, w: 200, h: 120 });

    alignMarks(scene, held, 'bottom');
    expect(held.map((mark) => (boxOf(scene, mark)?.y ?? 0) + (boxOf(scene, mark)?.h ?? 0))).toEqual([90, 90]);

    alignMarks(scene, held, 'centre');
    const middles = held.map((mark) => (boxOf(scene, mark)?.x ?? 0) + (boxOf(scene, mark)?.w ?? 0) / 2);
    expect(middles[0]).toBeCloseTo(middles[1], 6);
  });

  it('leaves a single mark where it stands, having nothing to line it up against', () => {
    const scene = scattered();
    const one = marksWithin(scene, { x: 0, y: 0, w: 120, h: 120 });

    alignMarks(scene, one, 'right');

    expect(boxOf(scene, one[0])).toEqual({ x: 20, y: 30, w: 40, h: 60 });
  });

  it('sets even gaps between three, keeping the outer two where they were', () => {
    const scene = createBoardScene(12, 10, 50);
    const layer = shapeLayer(scene);
    addShape(layer, shapeBetween('rect', { x: 0, y: 0 }, { x: 20, y: 20 }, style));
    addShape(layer, shapeBetween('rect', { x: 30, y: 0 }, { x: 50, y: 20 }, style));
    addShape(layer, shapeBetween('rect', { x: 200, y: 0 }, { x: 220, y: 20 }, style));
    const held = marksWithin(scene, { x: -10, y: -10, w: 400, h: 100 });

    spreadMarks(scene, held, 'x');

    const lefts = held.map((mark) => boxOf(scene, mark)?.x ?? 0).sort((a, b) => a - b);
    expect(lefts[0]).toBe(0);
    expect(lefts[2]).toBe(200);
    expect(lefts[1] - lefts[0]).toBeCloseTo(lefts[2] - lefts[1], 6);
  });

  it('has no gaps to even out when only two are held', () => {
    const scene = scattered();
    const held = marksWithin(scene, { x: 0, y: 0, w: 200, h: 120 });

    spreadMarks(scene, held, 'x');

    expect(boxOf(scene, held[0])?.x).toBe(20);
    expect(boxOf(scene, held[1])?.x).toBe(100);
  });

  it('passes over a layer that is put away or held shut', () => {
    const scene = scattered();
    shapeLayer(scene).visible = false;

    expect(marksWithin(scene, { x: 0, y: 0, w: 900, h: 900 })).toEqual([{ kind: 'image', id: expect.any(String) }]);
  });
});

describe('sheetHolding()', () => {
  it('names the sheet a mark lives on, whichever one is being worked on', () => {
    const scene = createBoardScene(8, 6, 50);
    const second = createLayer('text', 'notes') as TextLayer;
    scene.layers.push(second);
    addText(second, wordsAt({ x: 20, y: 20 }, 'over here', style));

    const held = markUnder(scene, { x: 24, y: 24 });

    expect(held).not.toBeNull();
    expect(sheetHolding(scene, held!)).toBe(second);
  });

  it('names no sheet for a mark that has been rubbed out', () => {
    const scene = createBoardScene(8, 6, 50);
    expect(sheetHolding(scene, { kind: 'text', id: 'gone' })).toBeNull();
  });
});

describe('fill and shadow', () => {
  const painted = { color: '#112233', width: 3, fontSize: 16, fillColor: '#ffcc00', dash: 'dashed' as const };

  it('fills a shape with its own colour, not with the colour of its outline', () => {
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, painted, true);

    expect(drawn.fill).toEqual({ type: 'solid', color: '#ffcc00' });
    expect(drawn.stroke?.color).toBe('#112233');
  });

  it('draws a shape with the dash chosen for it, rather than always solid', () => {
    expect(shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, painted).stroke?.dash).toBe('dashed');
  });

  it('casts no shadow unless one is asked for', () => {
    expect(shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, painted).shadow).toBeNull();
    expect(shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, { ...painted, shadow: true }).shadow).toEqual(
      MARK_SHADOW
    );
  });

  it('repaints the inside of a shape already drawn, leaving its outline alone', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, painted, true);
    addShape(shapeLayer(scene), drawn);

    restyleMark(scene, { kind: 'shape', id: drawn.id }, { fillColor: '#00ff00' });

    expect(drawn.fill).toEqual({ type: 'solid', color: '#00ff00' });
    expect(drawn.stroke?.color).toBe('#112233');
  });

  it('gives a shadow to a shape already drawn, and takes it away again', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, painted);
    addShape(shapeLayer(scene), drawn);

    restyleMark(scene, { kind: 'shape', id: drawn.id }, { shadow: true });
    expect(drawn.shadow).toEqual(MARK_SHADOW);

    restyleMark(scene, { kind: 'shape', id: drawn.id }, { shadow: false });
    expect(drawn.shadow).toBeNull();
  });
});

describe('smoothStroke()', () => {
  it('leaves a short stroke alone, there being nothing in it to thin out', () => {
    expect(smoothStroke([0, 0, 5, 5])).toEqual([0, 0, 5, 5]);
  });

  it('drops the points a straight line does not need', () => {
    const straight = [];
    for (let x = 0; x <= 100; x += 5) straight.push(x, 0);

    const thinned = smoothStroke(straight);

    expect(thinned.length).toBeLessThan(straight.length);
    expect(thinned.slice(0, 2)).toEqual([0, 0]);
    expect(thinned.slice(-2)).toEqual([100, 0]);
  });

  it('keeps the corner of a stroke that turns, rather than cutting it off', () => {
    const bent = [];
    for (let x = 0; x <= 60; x += 4) bent.push(x, 0);
    for (let y = 4; y <= 60; y += 4) bent.push(60, y);

    const thinned = smoothStroke(bent);
    const nearCorner = [];
    for (let i = 0; i < thinned.length; i += 2) {
      if (Math.hypot(thinned[i] - 60, thinned[i + 1]) < 10) nearCorner.push(i);
    }

    expect(nearCorner.length).toBeGreaterThan(0);
  });

  it('does not wander off the line it was given', () => {
    const wobbly = [];
    for (let x = 0; x <= 200; x += 4) wobbly.push(x, Math.sin(x / 8) * 0.6);

    const thinned = smoothStroke(wobbly);

    for (let i = 1; i < thinned.length; i += 2) expect(Math.abs(thinned[i])).toBeLessThan(3);
  });
});

describe('clearing, flipping and fading', () => {
  it('sweeps one sheet and leaves the sheets under it', () => {
    const scene = createBoardScene(8, 6, 50);
    addStroke(freehandLayer(scene), penStroke([0, 0, 10, 10], style));
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style));

    clearSheet(freehandLayer(scene));

    expect(freehandLayer(scene).strokes).toHaveLength(0);
    expect(shapeLayer(scene).items).toHaveLength(1);
  });

  it('turns a picture over and back again', () => {
    const scene = createBoardScene(8, 6, 50);
    const stuck = stickerAt({ x: 50, y: 50 }, 'pic', 40);
    addImage(imageLayer(scene), stuck);
    const ref = { kind: 'image' as const, id: stuck.id };

    flipMark(scene, ref, 'across');
    expect(stuck.flipX).toBe(true);
    expect(stuck.flipY).toBeFalsy();

    flipMark(scene, ref, 'across');
    expect(stuck.flipX).toBe(false);
  });

  it('fades a picture, and will not fade one past nothing or past solid', () => {
    const scene = createBoardScene(8, 6, 50);
    const stuck = stickerAt({ x: 50, y: 50 }, 'pic', 40);
    addImage(imageLayer(scene), stuck);
    const ref = { kind: 'image' as const, id: stuck.id };

    fadeMark(scene, ref, 0.4);
    expect(stuck.opacity).toBe(0.4);

    fadeMark(scene, ref, 5);
    expect(stuck.opacity).toBe(1);

    fadeMark(scene, ref, -1);
    expect(stuck.opacity).toBe(0);
  });

  it('leaves marks that are not pictures alone', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style);
    addShape(shapeLayer(scene), drawn);

    expect(() => flipMark(scene, { kind: 'shape', id: drawn.id }, 'down')).not.toThrow();
  });
});

describe('pathThrough()', () => {
  const along = [
    { x: 0, y: 0 },
    { x: 20, y: 40 },
    { x: 60, y: 10 },
  ];

  it('runs a line through every point set down, not only through the first and last', () => {
    expect(pathThrough(along, style, false)?.points).toEqual([0, 0, 20, 40, 60, 10]);
  });

  it('bends the line through them when it is asked to', () => {
    expect(pathThrough(along, style, false)?.shape).toBe('polyline');
    expect(pathThrough(along, style, true)?.shape).toBe('curve');
  });

  it('has no line to draw through one point, or through none', () => {
    expect(pathThrough([along[0]], style, false)).toBeNull();
    expect(pathThrough([], style, false)).toBeNull();
  });

  it('leaves the inside of a path unpainted, a line having no inside', () => {
    expect(pathThrough(along, { ...style, fillColor: '#ff0000' }, false)?.fill).toBeNull();
  });

  it('can be taken hold of where it runs, once it is down', () => {
    const scene = createBoardScene(8, 6, 50);
    const laid = pathThrough(along, style, false)!;
    addShape(shapeLayer(scene), laid);

    expect(markUnder(scene, { x: 20, y: 40 })).toEqual({ kind: 'shape', id: laid.id });
  });
});

describe('trimming a picture', () => {
  const whole = { w: 800, h: 600 };

  function stuckOn(): { scene: MapScene; ref: MarkRef; item: ImageItem } {
    const scene = createBoardScene(12, 10, 50);
    const item = stickerAt({ x: 100, y: 100 }, 'pic', 400, { x: 800, y: 600 });
    addImage(imageLayer(scene), item);
    return { scene, ref: { kind: 'image', id: item.id }, item };
  }

  it('takes the frame off, leaving the picture the size of what is left', () => {
    const { scene, ref, item } = stuckOn();
    const wide = item.w;
    const tall = item.h;

    cropMark(scene, ref, { x: 10, y: 20, w: wide - 40, h: tall - 30 }, whole);

    expect(item.w).toBe(wide - 40);
    expect(item.h).toBe(tall - 30);
  });

  it('keeps what is left where it already was, rather than sliding it', () => {
    const { scene, ref, item } = stuckOn();
    const left = item.x - item.w / 2;
    const top = item.y - item.h / 2;

    cropMark(scene, ref, { x: 12, y: 8, w: 60, h: 40 }, whole);

    expect(item.x - item.w / 2).toBeCloseTo(left + 12, 6);
    expect(item.y - item.h / 2).toBeCloseTo(top + 8, 6);
  });

  it('remembers the window in the picture own pixels, not in the drawn ones', () => {
    const { scene, ref, item } = stuckOn();
    const acrossPer = whole.w / item.w;

    cropMark(scene, ref, { x: 10, y: 0, w: item.w - 10, h: item.h }, whole);

    expect(item.crop?.x).toBeCloseTo(10 * acrossPer, 6);
    expect(item.crop?.w).toBeCloseTo(whole.w - 10 * acrossPer, 6);
  });

  it('trims a picture already trimmed without losing the first trim', () => {
    const { scene, ref, item } = stuckOn();

    cropMark(scene, ref, { x: 0, y: 0, w: item.w / 2, h: item.h }, whole);
    const once = item.crop?.w ?? 0;
    cropMark(scene, ref, { x: 0, y: 0, w: item.w / 2, h: item.h }, whole);

    expect(item.crop?.w).toBeCloseTo(once / 2, 6);
  });

  it('refuses a window that would leave nothing, and one outside the picture', () => {
    const { scene, ref, item } = stuckOn();

    cropMark(scene, ref, { x: 0, y: 0, w: 0, h: 0 }, whole);
    expect(item.crop).toBeUndefined();

    cropMark(scene, ref, { x: 9999, y: 9999, w: 50, h: 50 }, whole);
    expect(item.crop).toBeUndefined();
  });

  it('puts back what was trimmed off, at the size it was being shown', () => {
    const { scene, ref, item } = stuckOn();
    const wide = item.w;

    cropMark(scene, ref, { x: 0, y: 0, w: wide / 2, h: item.h }, whole);
    uncropMark(scene, ref, whole);

    expect(item.crop).toBeUndefined();
    expect(item.w).toBeCloseTo(wide, 6);
  });

  it('has nothing to put back for a picture that was never trimmed', () => {
    const { scene, ref, item } = stuckOn();
    const wide = item.w;

    uncropMark(scene, ref, whole);

    expect(item.w).toBe(wide);
  });

  it('trims nothing that is not a picture', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style);
    addShape(shapeLayer(scene), drawn);

    expect(pictureOf(scene, { kind: 'shape', id: drawn.id })).toBeNull();
  });
});

describe('guides', () => {
  function twoBoxes(): { scene: MapScene; still: ShapeItem } {
    const scene = createBoardScene(12, 10, 50);
    const still = shapeBetween('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, style);
    addShape(shapeLayer(scene), still);
    return { scene, still };
  }

  it('lines a moving box up with the left edge of one standing still', () => {
    const { scene } = twoBoxes();

    const snap = guidesFor(scene, { x: 103, y: 400, w: 40, h: 20 }, []);

    expect(snap.dx).toBe(-3);
    expect(snap.guides.some((guide) => guide.axis === 'x' && guide.at === 100)).toBe(true);
  });

  it('lines it up with a middle as readily as with an edge', () => {
    const { scene } = twoBoxes();

    const snap = guidesFor(scene, { x: 400, y: 126, w: 40, h: 20 }, []);

    expect(snap.dy).toBeCloseTo(4, 6);
  });

  it('leaves a box that is nowhere near a line alone', () => {
    const { scene } = twoBoxes();

    const snap = guidesFor(scene, { x: 400, y: 400, w: 40, h: 20 }, []);

    expect(snap).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('does not line a mark up against itself', () => {
    const { scene, still } = twoBoxes();

    const snap = guidesFor(scene, { x: 103, y: 400, w: 40, h: 20 }, [{ kind: 'shape', id: still.id }]);

    expect(snap.dx).toBe(0);
  });

  it('offers the middle of the sheet, there being nothing else to line up against', () => {
    const scene = createBoardScene(12, 10, 50);

    const snap = guidesFor(scene, { x: sceneWidthPx(scene) / 2 - 2, y: 0, w: 20, h: 20 }, []);

    expect(snap.dx).toBeCloseTo(2, 6);
  });

  it('draws the line only as far as the things it joins', () => {
    const { scene } = twoBoxes();

    const line = guidesFor(scene, { x: 100, y: 400, w: 40, h: 20 }, []).guides.find((one) => one.axis === 'x');

    expect(line?.from).toBe(100);
    expect(line?.to).toBe(420);
  });

  it('lines up against a guide left on the sheet', () => {
    const scene = createBoardScene(12, 10, 50);
    const laid = newGuide('x', 300);

    const snap = guidesFor(scene, { x: 296, y: 0, w: 20, h: 20 }, [], [laid]);

    expect(snap.dx).toBe(4);
  });

  it('passes over a sheet that has been put away', () => {
    const { scene } = twoBoxes();
    shapeLayer(scene).visible = false;

    expect(guidesFor(scene, { x: 103, y: 400, w: 40, h: 20 }, []).dx).toBe(0);
  });

  it('names a guide the pointer landed on, and none where it landed on nothing', () => {
    const laid = [newGuide('x', 300), newGuide('y', 80)];

    expect(guideUnder(laid, { x: 302, y: 500 })).toBe(laid[0]);
    expect(guideUnder(laid, { x: 500, y: 79 })).toBe(laid[1]);
    expect(guideUnder(laid, { x: 500, y: 500 })).toBeNull();
  });

  it('gives the middle of the sheet both ways, whether or not the paper is ruled', () => {
    const scene = createBoardScene(12, 10, 50);
    scene.gridVisible = false;

    const middles = sheetGuides(scene);

    expect(middles.map((guide) => guide.axis)).toEqual(['x', 'y']);
    expect(middles[0].at).toBe(sceneWidthPx(scene) / 2);
  });
});

describe('squareOff()', () => {
  const from = { x: 100, y: 100 };

  it('stands a line that was nearly upright fully upright', () => {
    const squared = squareOff(from, { x: 103, y: 200 });

    expect(squared.x).toBeCloseTo(100, 6);
    expect(squared.y).toBeGreaterThan(100);
  });

  it('keeps the line the length it was drawn', () => {
    const squared = squareOff(from, { x: 160, y: 155 });

    expect(Math.hypot(squared.x - from.x, squared.y - from.y)).toBeCloseTo(Math.hypot(60, 55), 6);
  });

  it('lets a line lie on the diagonal, that being one of the eighths', () => {
    const squared = squareOff(from, { x: 170, y: 172 });

    expect(squared.x - from.x).toBeCloseTo(squared.y - from.y, 6);
  });

  it('leaves a line that goes nowhere where it is', () => {
    expect(squareOff(from, from)).toEqual(from);
  });
});

describe('overlaysWanted()', () => {
  it('keeps the guides, the hold and the line being laid down when the paper is plain', () => {
    expect(overlaysWanted(false, false)).toEqual({ grid: false, helpers: true });
  });

  it('draws the ruling only when the reader asked for it', () => {
    expect(overlaysWanted(false, true).grid).toBe(true);
    expect(overlaysWanted(false, false).grid).toBe(false);
  });

  it('takes everything off for the picture the board wears, ruled paper or not', () => {
    expect(overlaysWanted(true, true)).toEqual({ grid: false, helpers: false });
    expect(overlaysWanted(true, false)).toEqual({ grid: false, helpers: false });
  });
});

describe('isTypingKey()', () => {
  it('lets a key pressed on the sheet itself reach the board', () => {
    expect(isTypingKey(document.createElement('canvas'), false)).toBe(false);
    expect(isTypingKey(null, false)).toBe(false);
  });

  it('leaves a key pressed into a box to the box, whichever kind of box it is', () => {
    expect(isTypingKey(document.createElement('input'), false)).toBe(true);
    expect(isTypingKey(document.createElement('textarea'), false)).toBe(true);
    expect(isTypingKey(document.createElement('select'), false)).toBe(true);
  });

  it('holds every key back while an input method is still composing', () => {
    expect(isTypingKey(document.createElement('canvas'), true)).toBe(true);
  });
});

describe('a picture and the hold drawn round it', () => {
  it('draws the hold over the picture, not off its corner', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);

    expect(boxOf(scene, { kind: 'image', id: stuck.id })).toEqual({ x: 160, y: 110, w: 80, h: 80 });
  });

  it('takes hold of a picture where the picture is drawn', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);

    expect(markUnder(scene, { x: 165, y: 115 })).toEqual({ kind: 'image', id: stuck.id });
    expect(markUnder(scene, { x: 235, y: 185 })).toEqual({ kind: 'image', id: stuck.id });
    expect(markUnder(scene, { x: 245, y: 195 })).toBeNull();
  });

  it('catches a picture in a dragged out box that covers where it is drawn', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);

    expect(marksWithin(scene, { x: 150, y: 100, w: 100, h: 100 })).toHaveLength(1);
    expect(marksWithin(scene, { x: 200, y: 150, w: 100, h: 100 })).toHaveLength(0);
  });

  it('lines a picture up by the edges it is drawn with', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);

    const snap = guidesFor(scene, { x: 163, y: 400, w: 20, h: 20 }, []);

    expect(snap.dx).toBe(-3);
  });
});

describe('snapPoint()', () => {
  function withBox(): MapScene {
    const scene = createBoardScene(12, 10, 50);
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, style));
    return scene;
  }

  it('brings a grip pulled near an edge onto it', () => {
    expect(snapPoint(withBox(), { x: 197, y: 400 }, []).at.x).toBe(200);
  });

  it('leaves a grip that is nowhere near a line where it was pulled', () => {
    expect(snapPoint(withBox(), { x: 400, y: 400 }, []).at).toEqual({ x: 400, y: 400 });
  });

  it('names the line it gave in to, so it can be shown', () => {
    const shown = snapPoint(withBox(), { x: 197, y: 400 }, []).guides;

    expect(shown.some((guide) => guide.axis === 'x' && guide.at === 200)).toBe(true);
  });

  it('does not line a grip up against the mark it belongs to', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);

    const held = [{ kind: 'image' as const, id: stuck.id }];

    expect(snapPoint(scene, { x: 242, y: 400 }, held).at.x).toBe(242);
  });

  it('brings a picture pulled bigger onto the edge of what stands beside it', () => {
    const scene = createBoardScene(12, 10, 50);
    addShape(shapeLayer(scene), shapeBetween('rect', { x: 300, y: 0 }, { x: 360, y: 60 }, style));
    const stuck = stickerAt({ x: 200, y: 150 }, 'pic', 80);
    addImage(imageLayer(scene), stuck);
    const ref = { kind: 'image' as const, id: stuck.id };

    const box = boxOf(scene, ref)!;
    const pulled = snapPoint(scene, { x: 297, y: box.y + box.h }, [ref]).at;
    const { kx, ky } = stretchBy(box, 'se', pulled);
    scaleMark(scene, ref, { ...anchorFor(box, 'se'), w: box.w, h: box.h }, kx, ky);

    const after = boxOf(scene, ref)!;
    expect(after.x + after.w).toBeCloseTo(300, 6);
  });
});

describe('bending a path after it is down', () => {
  function laid(): { scene: MapScene; ref: MarkRef; item: ShapeItem } {
    const scene = createBoardScene(12, 10, 50);
    const item = pathThrough(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      style,
      false
    )!;
    addShape(shapeLayer(scene), item);
    return { scene, ref: { kind: 'shape', id: item.id }, item };
  }

  it('offers its corners, a box shape offering none', () => {
    const { scene, ref } = laid();
    const boxy = shapeBetween('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, style);
    addShape(shapeLayer(scene), boxy);

    expect(jointedShape(scene, ref)).not.toBeNull();
    expect(jointedShape(scene, { kind: 'shape', id: boxy.id })).toBeNull();
  });

  it('names the corner the pointer landed on, and none between them', () => {
    const { scene, ref } = laid();

    expect(jointUnder(scene, ref, { x: 98, y: 2 }, 6)).toBe(1);
    expect(jointUnder(scene, ref, { x: 50, y: 0 }, 6)).toBeNull();
  });

  it('moves one corner and leaves the others where they were', () => {
    const { scene, ref, item } = laid();

    moveJoint(scene, ref, 1, { x: 140, y: 20 });

    expect(item.points).toEqual([0, 0, 140, 20, 100, 100]);
  });

  it('puts a new corner into the stretch the pointer landed on', () => {
    const { scene, ref, item } = laid();

    const made = addJoint(scene, ref, { x: 50, y: 2 }, 6);

    expect(made).toBe(1);
    expect(item.points).toEqual([0, 0, 50, 2, 100, 0, 100, 100]);
  });

  it('puts no corner in where the pointer landed on no stretch', () => {
    const { scene, ref, item } = laid();

    expect(addJoint(scene, ref, { x: 400, y: 400 }, 6)).toBeNull();
    expect(item.points).toHaveLength(6);
  });

  it('takes a corner out', () => {
    const { scene, ref, item } = laid();

    expect(dropJoint(scene, ref, 1)).toBe(true);
    expect(item.points).toEqual([0, 0, 100, 100]);
  });

  it('will not take the last corner out, a path of one point being nothing at all', () => {
    const { scene, ref, item } = laid();
    dropJoint(scene, ref, 1);

    expect(dropJoint(scene, ref, 0)).toBe(false);
    expect(item.points).toHaveLength(4);
  });
});

describe('the balloon', () => {
  it('hangs its tail below the body rather than inside it', () => {
    const outline = generateShapePoints('balloon', 0, 0, 100, 100);
    const lowest = Math.max(...outline.filter((_, at) => at % 2 === 1));

    expect(lowest).toBeCloseTo(100, 6);
  });

  it('keeps the body clear of the bottom, which is where the tail goes', () => {
    const outline = generateShapePoints('balloon', 0, 0, 100, 100);
    const downs = outline.filter((_, at) => at % 2 === 1).filter((y) => y < 100);

    expect(Math.max(...downs)).toBeLessThan(100);
  });

  it('stays inside the box it was drawn in', () => {
    const outline = generateShapePoints('balloon', 10, 20, 80, 60);
    for (let at = 0; at + 1 < outline.length; at += 2) {
      expect(outline[at]).toBeGreaterThanOrEqual(10);
      expect(outline[at]).toBeLessThanOrEqual(90);
      expect(outline[at + 1]).toBeGreaterThanOrEqual(20);
      expect(outline[at + 1]).toBeLessThanOrEqual(80);
    }
  });

  it('is drawn as one closed outline, so it can be filled', () => {
    const drawn = shapeBetween('balloon', { x: 0, y: 0 }, { x: 100, y: 100 }, style, true);

    expect(drawn.shape).toBe('polygon');
    expect(drawn.fill).not.toBeNull();
  });
});

describe('decorating words', () => {
  const dressed = {
    color: '#ffffff',
    width: 2,
    fontSize: 40,
    outline: '#000000',
    outlineWidth: 10,
    underline: true,
    strike: false,
    shadow: true,
  };

  it('measures the line round the letters against the letters, not in bare pixels', () => {
    expect(outlineFor(dressed)).toEqual({ color: '#000000', width: 4 });
    expect(outlineFor({ ...dressed, fontSize: 20 })).toEqual({ color: '#000000', width: 2 });
  });

  it('strikes no line at all when none was asked for', () => {
    expect(outlineFor({ ...dressed, outlineWidth: 0 })).toBeNull();
    expect(outlineFor({ color: '#000', width: 1, fontSize: 20 })).toBeNull();
  });

  it('writes new words wearing whatever the pen was set to', () => {
    const written = wordsAt({ x: 0, y: 0 }, 'hello', dressed);

    expect(written.outline).toEqual({ color: '#000000', width: 4 });
    expect(written.underline).toBe(true);
    expect(written.strike).toBe(false);
    expect(written.shadow).toEqual(MARK_SHADOW);
  });

  it('leaves plain words plain', () => {
    const written = wordsAt({ x: 0, y: 0 }, 'hello', style);

    expect(written.outline).toBeNull();
    expect(written.shadow).toBeNull();
    expect(written.underline).toBe(false);
  });

  it('redresses words already written', () => {
    const scene = createBoardScene(8, 6, 50);
    const written = wordsAt({ x: 0, y: 0 }, 'hello', { ...style, fontSize: 40 });
    addText(textLayer(scene), written);
    const ref = { kind: 'text' as const, id: written.id };

    restyleMark(scene, ref, { outline: '#ff0000', outlineWidth: 5, underline: true });

    expect(written.outline).toEqual({ color: '#ff0000', width: 2 });
    expect(written.underline).toBe(true);
  });

  it('keeps the colour of a line when only its thickness is changed, and the other way round', () => {
    const scene = createBoardScene(8, 6, 50);
    const written = wordsAt({ x: 0, y: 0 }, 'hello', { ...style, fontSize: 40 });
    addText(textLayer(scene), written);
    const ref = { kind: 'text' as const, id: written.id };

    restyleMark(scene, ref, { outline: '#00ff00', outlineWidth: 10 });
    restyleMark(scene, ref, { outlineWidth: 20 });
    expect(written.outline).toEqual({ color: '#00ff00', width: 8 });

    restyleMark(scene, ref, { outline: '#0000ff' });
    expect(written.outline).toEqual({ color: '#0000ff', width: 8 });
  });

  it('takes the line off again', () => {
    const scene = createBoardScene(8, 6, 50);
    const written = wordsAt({ x: 0, y: 0 }, 'hello', dressed);
    addText(textLayer(scene), written);

    restyleMark(scene, { kind: 'text', id: written.id }, { outlineWidth: 0 });

    expect(written.outline).toBeNull();
  });

  it('reaches the hold past the line struck round the letters', () => {
    const plain = wordsAt({ x: 100, y: 100 }, 'hello', { ...style, fontSize: 40 });
    const lined = wordsAt({ x: 100, y: 100 }, 'hello', dressed);

    expect(textBox(lined).w).toBeGreaterThan(textBox(plain).w);
    expect(textBox(lined).x).toBeLessThan(textBox(plain).x);
  });
});

describe('centreOnSheet()', () => {
  function twoOffToOneSide(): { scene: MapScene; refs: MarkRef[] } {
    const scene = createBoardScene(12, 10, 50);
    const layer = shapeLayer(scene);
    addShape(layer, shapeBetween('rect', { x: 10, y: 10 }, { x: 60, y: 40 }, style));
    addShape(layer, shapeBetween('rect', { x: 70, y: 10 }, { x: 110, y: 40 }, style));
    return { scene, refs: marksWithin(scene, { x: 0, y: 0, w: 200, h: 100 }) };
  }

  it('puts what is held in the middle of the sheet both ways', () => {
    const { scene, refs } = twoOffToOneSide();

    centreOnSheet(scene, refs, 'both');

    const bounds = boxAround(scene, refs)!;
    expect(bounds.x + bounds.w / 2).toBeCloseTo(sceneWidthPx(scene) / 2, 6);
    expect(bounds.y + bounds.h / 2).toBeCloseTo(sceneHeightPx(scene) / 2, 6);
  });

  it('centres across the sheet without moving anything up or down', () => {
    const { scene, refs } = twoOffToOneSide();
    const was = boxAround(scene, refs)!.y;

    centreOnSheet(scene, refs, 'across');

    const bounds = boxAround(scene, refs)!;
    expect(bounds.x + bounds.w / 2).toBeCloseTo(sceneWidthPx(scene) / 2, 6);
    expect(bounds.y).toBe(was);
  });

  it('keeps the marks where they are to one another', () => {
    const { scene, refs } = twoOffToOneSide();
    const before = refs.map((ref) => boxOf(scene, ref)!);
    const gap = before[1].x - before[0].x;

    centreOnSheet(scene, refs, 'both');

    const after = refs.map((ref) => boxOf(scene, ref)!);
    expect(after[1].x - after[0].x).toBeCloseTo(gap, 6);
    expect(after[0].y).toBe(after[1].y);
  });

  it('centres one mark on its own, there being nothing to line it up against', () => {
    const scene = createBoardScene(12, 10, 50);
    const stuck = stickerAt({ x: 20, y: 20 }, 'pic', 40);
    addImage(imageLayer(scene), stuck);
    const ref = { kind: 'image' as const, id: stuck.id };

    centreOnSheet(scene, [ref], 'both');

    expect(stuck.x).toBeCloseTo(sceneWidthPx(scene) / 2, 6);
    expect(stuck.y).toBeCloseTo(sceneHeightPx(scene) / 2, 6);
  });

  it('has nothing to centre when nothing is held', () => {
    const scene = createBoardScene(12, 10, 50);

    expect(() => centreOnSheet(scene, [], 'both')).not.toThrow();
  });
});

describe('a copy stands on its own', () => {
  it('takes its own outline, so recolouring the copy leaves the first alone', () => {
    const scene = createBoardScene(8, 6, 50);
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, { ...style, color: '#112233' });
    addShape(shapeLayer(scene), drawn);

    const made = copyMark(scene, { kind: 'shape', id: drawn.id }, 10)!;
    restyleMark(scene, made, { color: '#ff0000' });

    expect(drawn.stroke?.color).toBe('#112233');
  });

  it('takes its own filling and its own shadow', () => {
    const scene = createBoardScene(8, 6, 50);
    const dressed = { ...style, fillColor: '#00ff00', shadow: true };
    const drawn = shapeBetween('rect', { x: 0, y: 0 }, { x: 40, y: 20 }, dressed, true);
    addShape(shapeLayer(scene), drawn);

    const made = copyMark(scene, { kind: 'shape', id: drawn.id }, 10)!;
    restyleMark(scene, made, { fillColor: '#0000ff', shadow: false });

    expect(drawn.fill).toEqual({ type: 'solid', color: '#00ff00' });
    expect(drawn.shadow).not.toBeNull();
  });

  it('takes its own dressing when words are copied', () => {
    const scene = createBoardScene(8, 6, 50);
    const written = wordsAt({ x: 0, y: 0 }, 'hello', { ...style, fontSize: 40, outline: '#000000', outlineWidth: 10 });
    addText(textLayer(scene), written);

    const made = copyMark(scene, { kind: 'text', id: written.id }, 10)!;
    restyleMark(scene, made, { outline: '#ff0000' });

    expect(written.outline?.color).toBe('#000000');
  });
});

describe('a hold on words that are not set from the left', () => {
  it('reaches back the way centred words run', () => {
    const centred = wordsAt({ x: 100, y: 0 }, 'hello', style);
    centred.align = 'center';
    const box = textBox(centred);

    expect(box.x + box.w / 2).toBeCloseTo(100, 6);
  });

  it('reaches back the way right-hand words run', () => {
    const right = wordsAt({ x: 100, y: 0 }, 'hello', style);
    right.align = 'right';
    const box = textBox(right);

    expect(box.x + box.w).toBeCloseTo(100, 6);
  });

  it('still reaches forward from words set from the left', () => {
    expect(textBox(wordsAt({ x: 100, y: 0 }, 'hello', style)).x).toBe(100);
  });
});
