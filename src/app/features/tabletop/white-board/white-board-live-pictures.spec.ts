import { createLayer, FreehandLayer, ImageItem, ImageLayer, MapScene } from '@axe/domain/map-editor/scene';
import { hangablePictureIds, livePicturesOf } from '@axe/features/tabletop/white-board/white-board-live-pictures';
import { createBoardScene } from '@axe/features/tabletop/white-board/white-board-scene';

function sceneWith(...items: Partial<ImageItem>[]): MapScene {
  const scene = createBoardScene(4, 3, 50);
  const layer: ImageLayer = {
    id: 'pictures',
    kind: 'image',
    name: '絵',
    visible: true,
    locked: false,
    opacity: 1,
    items: items.map((item, index) => ({
      id: `item-${index}`,
      imageIdentifier: 'moving',
      x: 100,
      y: 75,
      w: 60,
      h: 40,
      rotation: 0,
      opacity: 1,
      ...item,
    })),
  };
  scene.layers = [layer];
  return scene;
}

const moves = (identifier: string) => identifier === 'moving';

describe('livePicturesOf()', () => {
  it('hangs a moving picture where the paint would have put it', () => {
    const hung = livePicturesOf(sceneWith({}), 200, 150, moves);

    expect(hung).toEqual([
      {
        id: 'item-0',
        imageIdentifier: 'moving',
        left: 70,
        top: 55,
        width: 60,
        height: 40,
        transform: '',
        opacity: 1,
      },
    ]);
  });

  it('scales and centres the way the board wears its picture', () => {
    const hung = livePicturesOf(sceneWith({}), 400, 400, moves);

    // The sheet is 200x150; at 400 wide it is doubled and sits 50 down from the top.
    expect(hung[0]).toMatchObject({ left: 140, top: 160, width: 120, height: 80 });
  });

  it('leaves a still picture to the paint', () => {
    expect(livePicturesOf(sceneWith({ imageIdentifier: 'still' }), 200, 150, moves)).toEqual([]);
  });

  it('leaves a cropped or cell-clipped picture to the paint, which can do those', () => {
    expect(livePicturesOf(sceneWith({ crop: { x: 0, y: 0, w: 10, h: 10 } }), 200, 150, moves)).toEqual([]);
    expect(livePicturesOf(sceneWith({ clipToCells: true }), 200, 150, moves)).toEqual([]);
  });

  it('leaves out a layer nobody can see', () => {
    const scene = sceneWith({});
    scene.layers[0].visible = false;

    expect(livePicturesOf(scene, 200, 150, moves)).toEqual([]);
  });

  it('carries the turn, the flip and the fade over with it', () => {
    const hung = livePicturesOf(sceneWith({ rotation: 30, flipX: true, opacity: 0.5 }), 200, 150, moves);

    expect(hung[0].transform).toBe('rotate(30deg) scale(-1, 1)');
    expect(hung[0].opacity).toBe(0.5);
  });

  it('fades with the layer as well as with the picture', () => {
    const scene = sceneWith({ opacity: 0.5 });
    scene.layers[0].opacity = 0.5;

    expect(livePicturesOf(scene, 200, 150, moves)[0].opacity).toBe(0.25);
  });

  it('hangs nothing at all without a drawing or without a board', () => {
    expect(livePicturesOf(null, 200, 150, moves)).toEqual([]);
    expect(livePicturesOf(sceneWith({}), 0, 0, moves)).toEqual([]);
  });
});

describe('hangablePictureIds()', () => {
  it('names the moving pictures the board will hang', () => {
    expect([...hangablePictureIds(sceneWith({}, { imageIdentifier: 'still' }), moves)]).toEqual(['item-0']);
  });

  function notesOver(scene: MapScene, drawn: boolean): void {
    const layer = createLayer('freehand', '書き込み') as FreehandLayer;
    if (drawn) layer.strokes.push({ id: 'stroke-0', points: [0, 0, 10, 10], color: '#000000', width: 2 });
    scene.layers.push(layer);
  }

  it('leaves a picture with anything drawn over it in the paint, so nothing is covered', () => {
    const scene = sceneWith({});
    notesOver(scene, true);

    expect(hangablePictureIds(scene, moves).size).toBe(0);
    expect(livePicturesOf(scene, 200, 150, moves)).toEqual([]);
  });

  it('hangs it again where the layer over it is empty', () => {
    const scene = sceneWith({});
    notesOver(scene, false);

    expect(hangablePictureIds(scene, moves).size).toBe(1);
  });

  it('names nothing without a drawing', () => {
    expect(hangablePictureIds(null, moves).size).toBe(0);
  });
});
