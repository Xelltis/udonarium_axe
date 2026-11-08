import { handleInputMove, handleInputStart, MovableInteractionContext } from '@axe/ui/directives/movable-interaction';

describe('movable interaction', () => {
  /** An element laid out at a size. */
  function elementOf(width: number, height: number): HTMLElement {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { value: width });
    Object.defineProperty(element, 'clientHeight', { value: height });
    return element;
  }
  /** A piece held on the floor, whose camera draws it at `scale` wherever it is. */
  function heldPiece(scale: (y: number) => number | null, startDrawnScale: number | null) {
    const emit = () => undefined;
    return {
      isGridSnap: false,
      isDisable: () => false,
      isReadOnly: () => false,
      isScratcOwner: () => false,
      input: { isGrabbing: true, isDragging: true, pointer: { x: 400, y: 300, z: 0 }, cancel: () => undefined },
      pointerDeviceService: { isDragging: true },
      coordinateService: {
        convertToFace: (pointer: { x: number; y: number }) => ({ x: pointer.x, y: pointer.y, z: 0 }),
        drawnScaleOnFace: (point: { y: number }) => scale(point.y),
        convertFromFace: (point: { x: number; y: number; z: number }) => point,
      },
      nativeElement: elementOf(80, 37),
      currentSurface: () => 'floor',
      footprintNow: () => null,
      contactSupportZ: () => 0,
      posX: 100,
      posY: 100,
      posZ: 0,
      width: 50,
      height: 50,
      ratio: 1,
      pointerOffset2d: { x: 20, y: 20, z: 0 },
      pointerStart3d: { x: 0, y: 0, z: 0 },
      startDrawnScale,
      onstart: { emit },
      ondragstart: { emit },
      ondrag: { emit },
      ondragend: { emit },
      onend: { emit },
      setPointerEvents: () => undefined,
      setCollidableLayer: () => undefined,
      cancel: () => undefined,
      cancelTableGesture: () => undefined,
      snapToGrid: () => undefined,
    } as unknown as MovableInteractionContext;
  }

  it('closes in the hold on a piece drawn smaller than where it was taken up, a little each move', () => {
    const piece = heldPiece(() => 0.5, 1);

    handleInputMove(piece, new MouseEvent('mousemove'));

    expect(piece.ratio).toBeCloseTo(0.95, 9);
  });

  it('keeps the hold as it was for a piece drawn no smaller', () => {
    const piece = heldPiece(() => 1.2, 1);

    handleInputMove(piece, new MouseEvent('mousemove'));

    expect(piece.ratio).toBe(1);
  });

  it('keeps the hold as it was before the table has a camera', () => {
    const piece = heldPiece(() => null, null);

    handleInputMove(piece, new MouseEvent('mousemove'));

    expect(piece.ratio).toBe(1);
    expect(piece.posX).toBe(395);
  });

  it('takes the size of a piece from its element when it is pressed', () => {
    const piece = heldPiece(() => 1, 1);

    handleInputStart(piece, new MouseEvent('mousedown'));

    expect([piece.width, piece.height]).toEqual([80, 37]);
  });

  it('takes the size of a piece from its footprint where it has one, as a box of the screen says nothing of it', () => {
    const piece = { ...heldPiece(() => 1, 1), footprintNow: () => ({ width: 50, height: 50 }) };

    handleInputStart(piece, new MouseEvent('mousedown'));

    expect([piece.width, piece.height]).toEqual([50, 50]);
    expect(piece.pointerStart3d).toEqual({ x: 125, y: 125, z: 0 });
  });
});
