import { TestBed } from '@angular/core/testing';
import { DEFAULT_FUNCTION_SPEC } from '@axe/domain/tabletop/function-paint';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { FunctionLayer } from '@axe/features/map-editor/model/scene';

describe('painting what a cell does', () => {
  let state: MapEditorState;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MapEditorState] });
    state = TestBed.inject(MapEditorState);
    state.newScene(10, 8, 50, 'transparent');
  });

  function layersOfRole(role: string): FunctionLayer[] {
    return state.current.layers.filter((held): held is FunctionLayer => held.kind === 'function' && held.role === role);
  }

  function layerWith(terrain: Partial<(typeof DEFAULT_FUNCTION_SPEC)['terrain']>): FunctionLayer {
    state.setFunctionSpec({ ...DEFAULT_FUNCTION_SPEC, terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, ...terrain } });
    state.paintFunctionCell(0, 1);
    const made = layersOfRole('terrain').at(-1)!;
    state.setActiveLayer(null);
    state.setFunctionSpec({ ...DEFAULT_FUNCTION_SPEC });
    return made;
  }

  it('starts a layer for the role the first time it is painted', () => {
    state.functionRole.set('moveBlock');

    state.paintFunctionCell(1, 2);

    const layers = layersOfRole('moveBlock');
    expect(layers).toHaveLength(1);
    expect(Object.keys(layers[0].cells)).toEqual(['1,2']);
  });

  it('keeps each role on a layer of its own', () => {
    state.functionRole.set('moveBlock');
    state.paintFunctionCell(0, 0);
    state.functionRole.set('terrain');
    state.paintFunctionCell(1, 1);

    expect(layersOfRole('moveBlock')).toHaveLength(1);
    expect(layersOfRole('terrain')).toHaveLength(1);
  });

  it('paints into the layer it already made rather than starting another', () => {
    state.functionRole.set('mask');
    state.paintFunctionCell(0, 0);
    state.paintFunctionCell(1, 0);

    expect(layersOfRole('mask')).toHaveLength(1);
    expect(Object.keys(layersOfRole('mask')[0].cells).sort()).toEqual(['0,0', '1,0']);
  });

  it('carries the settings that were chosen onto the layer', () => {
    state.functionRole.set('terrain');
    state.functionSpec.set({
      ...DEFAULT_FUNCTION_SPEC,
      terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, height: 4 },
    });

    state.paintFunctionCell(2, 2);

    expect(layersOfRole('terrain')[0].spec.terrain.height).toBe(4);
  });

  it('leaves the look of a layer alone when painting with the same brush', () => {
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' } });

    state.setActiveLayer(stone.id);
    state.paintFunctionCell(4, 4);

    expect(stone.spec.terrain.images.wall).toBe('stone');
    expect(Object.keys(stone.cells)).toContain('4,4');
  });

  it('starts a layer of its own rather than retexturing what is already there', () => {
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' } });

    state.setActiveLayer(null);
    state.paintFunctionCell(4, 4);

    expect(stone.spec.terrain.images.wall).toBe('stone');
    expect(layersOfRole('terrain')).toHaveLength(2);
  });

  it('paints with the brush in hand, not the one the layer beneath was made with', () => {
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' } });
    state.setActiveLayer(stone.id);
    state.functionRole.set('mask');
    state.setFunctionSpec({
      ...state.functionSpec(),
      terrain: { ...state.functionSpec().terrain, images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'wood' } },
    });
    state.functionRole.set('terrain');

    state.paintFunctionCell(6, 6);

    expect(stone.spec.terrain.images.wall).toBe('stone');
    expect(Object.keys(stone.cells)).not.toContain('6,6');
    const wood = layersOfRole('terrain').find((held) => held.spec.terrain.images.wall === 'wood');
    expect(Object.keys(wood!.cells)).toContain('6,6');
  });

  it('picks up the brush a layer was painted with when that layer is chosen', () => {
    state.functionRole.set('mask');
    state.paintFunctionCell(0, 0);
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' }, height: 3 });
    state.functionRole.set('moveBlock');

    state.setActiveLayer(stone.id);

    expect(state.functionRole()).toBe('terrain');
    expect(state.functionSpec().terrain.images.wall).toBe('stone');
    expect(state.functionSpec().terrain.height).toBe(3);
  });

  it('retextures the layer in hand rather than the one beside it', () => {
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' } });
    state.setActiveLayer(null);
    state.paintFunctionCell(9, 9);
    const plain = layersOfRole('terrain').find((held) => held.id !== stone.id)!;

    state.setActiveLayer(stone.id);
    state.setFunctionSpec({ ...state.functionSpec(), terrain: { ...state.functionSpec().terrain, height: 5 } });

    expect(stone.spec.terrain.height).toBe(5);
    expect(plain.spec.terrain.height).toBe(DEFAULT_FUNCTION_SPEC.terrain.height);
  });

  it('rubs a cell out of every look it was painted in', () => {
    state.functionRole.set('terrain');
    const stone = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone' } });
    const wood = layerWith({ images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'wood' } });
    state.setActiveLayer(stone.id);
    state.paintFunctionCell(7, 7);
    state.setActiveLayer(wood.id);
    state.paintFunctionCell(7, 7);

    state.eraseFunctionCellAt(7, 7);

    expect(Object.keys(stone.cells)).not.toContain('7,7');
    expect(Object.keys(wood.cells)).not.toContain('7,7');
  });

  it('rubs out only the role that is being erased', () => {
    state.functionRole.set('moveBlock');
    state.paintFunctionCell(3, 3);
    state.functionRole.set('terrain');
    state.paintFunctionCell(3, 3);

    state.eraseFunctionCellAt(3, 3);

    expect(Object.keys(layersOfRole('terrain')[0].cells)).toEqual([]);
    expect(Object.keys(layersOfRole('moveBlock')[0].cells)).toEqual(['3,3']);
  });

  it('rubs nothing out where the role has never been painted', () => {
    state.functionRole.set('mask');

    expect(() => state.eraseFunctionCellAt(0, 0)).not.toThrow();
    expect(layersOfRole('mask')).toHaveLength(0);
  });
});

describe('being handed the brush as the editor opens', () => {
  let state: MapEditorState;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MapEditorState] });
    state = TestBed.inject(MapEditorState);
    state.newScene(10, 8, 50, 'transparent');
  });

  it('counts a scene with nothing drawn on it as having nothing to lose', () => {
    expect(state.isUntouched).toBe(true);
  });

  it('counts a scene that has been painted on as worth keeping', () => {
    state.functionRole.set('moveBlock');
    state.paintFunctionCell(0, 0);

    expect(state.isUntouched).toBe(false);
  });
});
