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
    state.functionSpec.set({ ...DEFAULT_FUNCTION_SPEC, terrainHeight: 4 });

    state.paintFunctionCell(2, 2);

    expect(layersOfRole('terrain')[0].spec.terrainHeight).toBe(4);
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
