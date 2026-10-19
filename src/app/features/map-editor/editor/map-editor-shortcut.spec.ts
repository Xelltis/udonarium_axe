import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import {
  type MapEditorKeyContext,
  mapEditorKeyDown,
  mapEditorKeyUp,
} from '@axe/features/map-editor/editor/map-editor-shortcut';

const TOOL_KEYS = new Set(['V', 'B', 'E']);

function context(overrides: Partial<MapEditorKeyContext> = {}): MapEditorKeyContext {
  return {
    typing: false,
    chord: false,
    shift: false,
    alt: false,
    hasSelection: false,
    toolKeys: TOOL_KEYS,
    ...overrides,
  };
}

describe('mapEditorKeyDown()', () => {
  it('drags the view while the space bar is held', () => {
    expect(mapEditorKeyDown(' ', 'Space', context())).toEqual({ command: 'panStart', preventDefault: true });
  });

  it('does nothing while something is being typed', () => {
    expect(mapEditorKeyDown(' ', 'Space', context({ typing: true }))).toBeNull();
    expect(mapEditorKeyDown('b', 'KeyB', context({ typing: true }))).toBeNull();
  });

  it('takes a step back', () => {
    expect(mapEditorKeyDown('z', 'KeyZ', context({ chord: true }))).toEqual({
      command: 'undo',
      preventDefault: true,
    });
  });

  it('takes it forward again from either shortcut', () => {
    const redo = { command: 'redo', preventDefault: true };

    expect(mapEditorKeyDown('y', 'KeyY', context({ chord: true }))).toEqual(redo);
    expect(mapEditorKeyDown('z', 'KeyZ', context({ chord: true, shift: true }))).toEqual(redo);
  });

  it('reads an upper-case letter the same way', () => {
    expect(mapEditorKeyDown('Z', 'KeyZ', context({ chord: true }))).toEqual({
      command: 'undo',
      preventDefault: true,
    });
  });

  it('deletes what is selected', () => {
    const remove = { command: 'deleteSelection', preventDefault: true };

    expect(mapEditorKeyDown('Delete', 'Delete', context({ hasSelection: true }))).toEqual(remove);
    expect(mapEditorKeyDown('Backspace', 'Backspace', context({ hasSelection: true }))).toEqual(remove);
  });

  it('leaves the key to the browser with nothing selected', () => {
    // Taking it anyway would swallow the key that walks back through the history.
    expect(mapEditorKeyDown('Backspace', 'Backspace', context())).toBeNull();
  });

  it('throws the draft away', () => {
    expect(mapEditorKeyDown('Escape', 'Escape', context())).toEqual({
      command: 'cancelDraft',
      preventDefault: false,
    });
  });

  it('finishes it', () => {
    expect(mapEditorKeyDown('Enter', 'Enter', context())).toEqual({
      command: 'commitDraft',
      preventDefault: false,
    });
  });

  it('picks a tool by its letter', () => {
    expect(mapEditorKeyDown('b', 'KeyB', context())).toEqual({
      command: 'pickTool',
      shortcut: 'B',
      preventDefault: true,
    });
  });

  it('picks none for a letter no tool has', () => {
    expect(mapEditorKeyDown('q', 'KeyQ', context())).toBeNull();
  });

  it('picks none while a modifier is held', () => {
    expect(mapEditorKeyDown('b', 'KeyB', context({ chord: true }))).toBeNull();
    expect(mapEditorKeyDown('b', 'KeyB', context({ alt: true }))).toBeNull();
  });
});

describe('mapEditorKeyUp()', () => {
  it('lets the view go on the space bar', () => {
    expect(mapEditorKeyUp('Space')).toEqual({ command: 'panEnd', preventDefault: false });
  });

  it('returns nothing for any other key', () => {
    expect(mapEditorKeyUp('KeyB')).toBeNull();
  });
});

describe('the map editor’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('mapEditor')) {
    it(`answers ${id} as listed`, () => {
      const pressed = context({ chord: !!probe.ctrl, shift: !!probe.shift, alt: !!probe.alt, ...probe.when });
      expect(mapEditorKeyDown(probe.key ?? '', probe.code ?? '', pressed)?.command).toBe(probe.command);
    });
  }
});
