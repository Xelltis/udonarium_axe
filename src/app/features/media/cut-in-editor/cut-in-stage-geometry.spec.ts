import {
  angleFromCentre,
  applyResize,
  clampStageZoom,
  drawnScale,
  fromLayerLocal,
  isInsideLayer,
  isOnRotateHandle,
  type LayerTransform,
  MAX_STAGE_ZOOM,
  MIN_LAYER_SIZE,
  MIN_STAGE_ZOOM,
  normaliseAngle,
  pivotOf,
  resizeHandleAt,
  ROTATE_HANDLE_REACH_PX,
  rotateGripAt,
  stageDeltaToScene,
  stageFit,
  stageToScene,
  toLayerLocal,
  toLayerLocalDelta,
  UNTURNED,
} from '@axe/features/media/cut-in-editor/cut-in-stage-geometry';

describe('stageFit()', () => {
  it('leaves a scene that already fits at its own size', () => {
    expect(stageFit({ width: 640, height: 360 }, { width: 800, height: 600 })).toEqual({
      scale: 1,
      offsetX: 80,
      offsetY: 120,
    });
  });

  it('shrinks a scene too wide for the room, and letterboxes it', () => {
    const fit = stageFit({ width: 1000, height: 500 }, { width: 500, height: 500 });

    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(125);
  });

  it('shrinks by whichever side runs out first', () => {
    expect(stageFit({ width: 400, height: 800 }, { width: 400, height: 400 }).scale).toBe(0.5);
  });

  it('gives up on a room or a scene with no size', () => {
    expect(stageFit({ width: 0, height: 0 }, { width: 400, height: 400 }).scale).toBe(1);
    expect(stageFit({ width: 400, height: 400 }, { width: 0, height: 0 }).scale).toBe(1);
  });
});

describe('stageToScene()', () => {
  const fit = stageFit({ width: 1000, height: 500 }, { width: 500, height: 500 });

  it('reads a point of the screen at the scale the scene is drawn at', () => {
    expect(stageToScene(150, 185, fit)).toEqual({ x: 300, y: 120 });
  });

  it('puts the scene origin where the letterbox starts', () => {
    expect(stageToScene(0, 125, fit)).toEqual({ x: 0, y: 0 });
  });

  it('carries a drag across at the same scale', () => {
    expect(stageDeltaToScene(50, 10, fit)).toEqual({ x: 100, y: 20 });
  });
});

describe('resizeHandleAt()', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('finds each corner', () => {
    expect(resizeHandleAt({ x: 100, y: 100 }, box, fit)).toBe('nw');
    expect(resizeHandleAt({ x: 300, y: 100 }, box, fit)).toBe('ne');
    expect(resizeHandleAt({ x: 100, y: 200 }, box, fit)).toBe('sw');
    expect(resizeHandleAt({ x: 300, y: 200 }, box, fit)).toBe('se');
  });

  it('finds a corner from near enough to it', () => {
    expect(resizeHandleAt({ x: 105, y: 104 }, box, fit)).toBe('nw');
  });

  it('finds none in the middle', () => {
    expect(resizeHandleAt({ x: 200, y: 150 }, box, fit)).toBeNull();
  });

  it('reaches further on a shrunken stage, so the grip is the same on screen', () => {
    const shrunk = { scale: 0.5, offsetX: 0, offsetY: 0 };

    expect(resizeHandleAt({ x: 112, y: 112 }, box, shrunk)).toBe('nw');
    expect(resizeHandleAt({ x: 112, y: 112 }, box, fit)).toBeNull();
  });
});

describe('isInsideLayer()', () => {
  const box = { x: 10, y: 10, width: 100, height: 50 };

  it('knows a point on the layer', () => {
    expect(isInsideLayer({ x: 50, y: 30 }, box)).toBe(true);
    expect(isInsideLayer({ x: 10, y: 10 }, box)).toBe(true);
  });

  it('knows a point off it', () => {
    expect(isInsideLayer({ x: 9, y: 30 }, box)).toBe(false);
    expect(isInsideLayer({ x: 50, y: 61 }, box)).toBe(false);
  });
});

describe('applyResize()', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('pulls the south-east corner and leaves the north-west where it was', () => {
    expect(applyResize(box, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 250, height: 120 });
  });

  it('pulls the north-west corner and leaves the south-east where it was', () => {
    const resized = applyResize(box, 'nw', 50, 20);

    expect(resized).toEqual({ x: 150, y: 120, width: 150, height: 80 });
    expect(resized.x + resized.width).toBe(box.x + box.width);
    expect(resized.y + resized.height).toBe(box.y + box.height);
  });

  it('never shrinks past what can still be grabbed', () => {
    const resized = applyResize(box, 'se', -1000, -1000);

    expect(resized.width).toBe(MIN_LAYER_SIZE);
    expect(resized.height).toBe(MIN_LAYER_SIZE);
  });

  it('keeps the shape when asked, following whichever side was pulled further', () => {
    const resized = applyResize(box, 'se', 200, 0, true);

    expect(resized.width / resized.height).toBeCloseTo(box.width / box.height, 5);
    expect(resized.width).toBe(400);
  });

  it('keeps the far corner in place while keeping the shape', () => {
    const resized = applyResize(box, 'nw', 100, 0, true);

    expect(resized.x + resized.width).toBe(box.x + box.width);
    expect(resized.y + resized.height).toBe(box.y + box.height);
  });
});

describe('isOnRotateHandle()', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('finds the grip above the middle of the box', () => {
    expect(isOnRotateHandle({ x: 200, y: 100 - ROTATE_HANDLE_REACH_PX }, box, fit)).toBe(true);
  });

  it('finds nothing on the box itself', () => {
    expect(isOnRotateHandle({ x: 200, y: 150 }, box, fit)).toBe(false);
  });

  it('finds nothing off to the side of it', () => {
    expect(isOnRotateHandle({ x: 300, y: 100 - ROTATE_HANDLE_REACH_PX }, box, fit)).toBe(false);
  });

  it('keeps the grip the same distance away on screen, whatever the scale', () => {
    const shrunk = { scale: 0.5, offsetX: 0, offsetY: 0 };

    expect(isOnRotateHandle({ x: 200, y: 100 - ROTATE_HANDLE_REACH_PX * 2 }, box, shrunk)).toBe(true);
  });
});

describe('angleFromCentre()', () => {
  const box = { x: 0, y: 0, width: 200, height: 200 };

  it('reads straight up as nothing', () => {
    expect(angleFromCentre({ x: 100, y: -50 }, box)).toBeCloseTo(0, 5);
  });

  it('reads a quarter turn to the right', () => {
    expect(angleFromCentre({ x: 250, y: 100 }, box)).toBeCloseTo(90, 5);
  });

  it('reads a quarter turn to the left', () => {
    expect(angleFromCentre({ x: -50, y: 100 }, box)).toBeCloseTo(-90, 5);
  });
});

describe('normaliseAngle()', () => {
  it('brings an angle round into one turn', () => {
    expect(normaliseAngle(370)).toBe(10);
    expect(normaliseAngle(-90)).toBe(270);
  });

  it('snaps to the step it is given', () => {
    expect(normaliseAngle(43, 45)).toBe(45);
    expect(normaliseAngle(20, 45)).toBe(0);
    expect(normaliseAngle(350, 45)).toBe(0);
  });
});

describe("reading the pointer in a layer's own frame", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  const turned: LayerTransform = { ...UNTURNED, rotationDeg: 90 };
  const grown: LayerTransform = { ...UNTURNED, scaleX: 2, scaleY: 2 };

  it('leaves a layer that is neither turned nor grown where it is', () => {
    expect(toLayerLocal({ x: 150, y: 120 }, box, UNTURNED)).toEqual({ x: 150, y: 120 });
  });

  it('finds what a layer turns around', () => {
    expect(pivotOf(box, UNTURNED)).toEqual({ x: 200, y: 150 });
    expect(pivotOf(box, { ...UNTURNED, anchorX: 0, anchorY: 0 })).toEqual({ x: 100, y: 100 });
  });

  it('turns the point back the way the layer was turned', () => {
    // A quarter turn puts the top-left corner where the bottom-left was drawn.
    const local = toLayerLocal({ x: 250, y: 50 }, box, turned);

    expect(local.x).toBeCloseTo(100, 5);
    expect(local.y).toBeCloseTo(100, 5);
  });

  it('shrinks the point back the way the layer was grown', () => {
    const local = toLayerLocal({ x: 400, y: 250 }, box, grown);

    expect(local.x).toBeCloseTo(300, 5);
    expect(local.y).toBeCloseTo(200, 5);
  });

  it("reads a drag along the layer's own edges", () => {
    const along = toLayerLocalDelta({ x: 0, y: 10 }, turned);

    expect(along.x).toBeCloseTo(10, 5);
    expect(along.y).toBeCloseTo(0, 5);
  });

  it('leaves a drag alone on a layer that is neither turned nor grown', () => {
    expect(toLayerLocalDelta({ x: 5, y: -3 }, UNTURNED)).toEqual({ x: 5, y: -3 });
  });

  it('refuses to divide a drag by nothing', () => {
    const flat = toLayerLocalDelta({ x: 5, y: 5 }, { ...UNTURNED, scaleX: 0, scaleY: 0 });

    expect(Number.isFinite(flat.x)).toBe(true);
    expect(Number.isFinite(flat.y)).toBe(true);
  });

  it('measures how much bigger the layer is drawn than its box', () => {
    expect(drawnScale({ scale: 0.5, offsetX: 0, offsetY: 0 }, grown)).toBeCloseTo(1, 5);
    expect(drawnScale({ scale: 1, offsetX: 0, offsetY: 0 }, UNTURNED)).toBe(1);
  });
});

describe('grabbing a layer that has been turned', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };
  const box = { x: 100, y: 100, width: 200, height: 100 };
  const turned: LayerTransform = { ...UNTURNED, rotationDeg: 90 };

  it('finds the grip where it is drawn, not where it started', () => {
    // A quarter turn swings the grip from above the box round to the right of it.
    const drawn = { x: 200 + ROTATE_HANDLE_REACH_PX + 50, y: 150 };

    expect(isOnRotateHandle(toLayerLocal(drawn, box, turned), box, fit, undefined, turned)).toBe(true);
  });

  it('no longer finds it above a turned layer', () => {
    const before = { x: 200, y: 100 - ROTATE_HANDLE_REACH_PX };

    expect(isOnRotateHandle(toLayerLocal(before, box, turned), box, fit, undefined, turned)).toBe(false);
  });

  it('reads the angle round the point the layer turns on', () => {
    const offCentre: LayerTransform = { ...UNTURNED, anchorX: 0, anchorY: 0 };

    expect(angleFromCentre({ x: 100, y: 0 }, box, offCentre)).toBeCloseTo(0, 5);
    expect(angleFromCentre({ x: 200, y: 100 }, box, offCentre)).toBeCloseTo(90, 5);
  });

  it('keeps the grip the same size on screen however the layer is grown', () => {
    const grown: LayerTransform = { ...UNTURNED, scaleX: 4, scaleY: 4 };
    const justOff = { x: 200 + 2, y: 100 - ROTATE_HANDLE_REACH_PX / 4 };

    expect(isOnRotateHandle(justOff, box, fit, undefined, grown)).toBe(true);
    expect(isOnRotateHandle({ x: 200 + 20, y: justOff.y }, box, fit, undefined, grown)).toBe(false);
  });
});

describe('putting a point back where it is drawn', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it("undoes reading it in the layer's frame, whatever the layer is doing", () => {
    const transforms: LayerTransform[] = [
      UNTURNED,
      { ...UNTURNED, rotationDeg: 37 },
      { ...UNTURNED, rotationDeg: -120, scaleX: 2, scaleY: 0.5, anchorX: 0, anchorY: 1 },
      { ...UNTURNED, rotationDeg: 20, skewXDeg: -18, skewYDeg: 6 },
    ];

    for (const transform of transforms) {
      const drawn = fromLayerLocal({ x: 150, y: 120 }, box, transform);
      const read = toLayerLocal(drawn, box, transform);

      expect(read.x).toBeCloseTo(150, 5);
      expect(read.y).toBeCloseTo(120, 5);
    }
  });
});

describe('rotateGripAt()', () => {
  const fit = { scale: 1, offsetX: 0, offsetY: 0 };
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('sits above the middle of the top edge', () => {
    const grip = rotateGripAt(box, fit, UNTURNED);

    expect(grip.x).toBe(200);
    expect(grip.y).toBe(100 - ROTATE_HANDLE_REACH_PX);
  });

  it('is exactly where the pointer is looked for', () => {
    const turned: LayerTransform = { ...UNTURNED, rotationDeg: 55, scaleX: 1.5, scaleY: 1.5 };
    const grip = rotateGripAt(box, fit, turned);

    expect(isOnRotateHandle(grip, box, fit, undefined, turned)).toBe(true);
  });

  it('stays the same distance away on screen however the layer is grown', () => {
    const grown: LayerTransform = { ...UNTURNED, scaleX: 3, scaleY: 3 };
    const grip = fromLayerLocal(rotateGripAt(box, fit, grown), box, grown);
    // Measured from the top edge as it is drawn, which a grown layer moves.
    const drawnTop = fromLayerLocal({ x: box.x + box.width / 2, y: box.y }, box, grown);

    expect(drawnTop.y - grip.y).toBeCloseTo(ROTATE_HANDLE_REACH_PX, 5);
  });
});

describe('a layer that has been leaned over', () => {
  const box = { x: 0, y: 0, width: 200, height: 200 };
  const leaned: LayerTransform = { ...UNTURNED, skewXDeg: 30 };

  it('reads the pointer straight again', () => {
    // Leaning pushes a point across by the height it sits at; reading it back undoes that.
    const drawn = fromLayerLocal({ x: 100, y: 150 }, box, leaned);

    expect(drawn.x).toBeGreaterThan(100);
    expect(toLayerLocal(drawn, box, leaned).x).toBeCloseTo(100, 5);
  });

  it('leaves a point on the line it leans around where it was', () => {
    expect(fromLayerLocal({ x: 100, y: 100 }, box, leaned)).toEqual({ x: 100, y: 100 });
  });

  it('reads nothing out of a lean that means nothing', () => {
    const nonsense: LayerTransform = { ...UNTURNED, skewXDeg: Number.NaN, skewYDeg: Number.NaN };

    expect(toLayerLocal({ x: 40, y: 60 }, box, nonsense)).toEqual({ x: 40, y: 60 });
  });

  it('refuses a lean steep enough to flatten the layer', () => {
    const steep: LayerTransform = { ...UNTURNED, skewXDeg: 89.99 };
    const read = toLayerLocal({ x: 40, y: 60 }, box, steep);

    expect(Number.isFinite(read.x)).toBe(true);
    expect(Number.isFinite(read.y)).toBe(true);
  });
});

describe('leaning into the stage', () => {
  const scene = { width: 1200, height: 600 };
  const room = { width: 600, height: 400 };

  it('fits the cut-in into the room it has at rest', () => {
    expect(stageFit(scene, room).scale).toBeCloseTo(0.5, 5);
  });

  it('leans in past that, which is what lets a layer be put down where it is meant to go', () => {
    expect(stageFit(scene, room, 2).scale).toBeCloseTo(1, 5);
  });

  it('will not lean out below fitting, which would only waste the room', () => {
    expect(stageFit(scene, room, 0.2).scale).toBeCloseTo(0.5, 5);
    expect(clampStageZoom(0.2)).toBe(MIN_STAGE_ZOOM);
  });

  it('stops where nothing more is gained by leaning further', () => {
    expect(clampStageZoom(100)).toBe(MAX_STAGE_ZOOM);
  });

  it('takes a scale that means nothing as no scale at all', () => {
    expect(clampStageZoom(Number.NaN)).toBe(MIN_STAGE_ZOOM);
  });

  it('keeps the cut-in in the middle of the room, however far in', () => {
    const leaned = stageFit(scene, room, 2);

    expect(leaned.offsetX).toBeCloseTo((600 - 1200) / 2, 5);
    expect(leaned.offsetY).toBeCloseTo((400 - 600) / 2, 5);
  });
});
