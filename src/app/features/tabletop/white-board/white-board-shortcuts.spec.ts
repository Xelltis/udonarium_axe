import { keyboardShortcutsOf, shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import { BoardKeyContext, boardKeyDown, TOOL_KEYS } from '@axe/features/tabletop/white-board/white-board-shortcuts';

const plain: BoardKeyContext = { chord: false, shift: false, laying: false };
const chord: BoardKeyContext = { ...plain, chord: true };

describe('boardKeyDown', () => {
  it('picks a tool by its letter, whatever the case', () => {
    expect(boardKeyDown('p', plain)).toEqual({ command: 'pickTool', tool: 'pen' });
    expect(boardKeyDown('V', plain)).toEqual({ command: 'pickTool', tool: 'select' });
    expect(boardKeyDown('x', plain)).toBeNull();
  });

  it('hands the sheet to the hand while the space bar is down', () => {
    expect(boardKeyDown(' ', plain)).toEqual({ command: 'panStart' });
    expect(boardKeyDown(' ', chord)).toEqual({ command: 'panStart' });
  });

  it('undoes and redoes on the usual chords', () => {
    expect(boardKeyDown('z', chord)).toEqual({ command: 'undo' });
    expect(boardKeyDown('Z', { ...chord, shift: true })).toEqual({ command: 'redo' });
    expect(boardKeyDown('y', chord)).toEqual({ command: 'redo' });
    expect(boardKeyDown('z', plain)).toBeNull();
  });

  it('finishes or drops a path being laid, and otherwise leaves enter and escape alone', () => {
    const laying = { ...plain, laying: true };
    expect(boardKeyDown('Enter', laying)).toEqual({ command: 'finishPath' });
    expect(boardKeyDown('Escape', laying)).toEqual({ command: 'dropPath' });
    expect(boardKeyDown('Enter', plain)).toBeNull();
    expect(boardKeyDown('Escape', plain)).toBeNull();
  });

  it('deletes what is held on either deleting key', () => {
    expect(boardKeyDown('Delete', plain)).toEqual({ command: 'deleteSelection' });
    expect(boardKeyDown('Backspace', chord)).toEqual({ command: 'deleteSelection' });
  });

  it('reads the editing and zoom chords, and takes no other chord for a tool', () => {
    expect(boardKeyDown('0', chord)).toEqual({ command: 'zoomReset' });
    expect(boardKeyDown('+', chord)).toEqual({ command: 'zoomIn' });
    expect(boardKeyDown('=', chord)).toEqual({ command: 'zoomIn' });
    expect(boardKeyDown('-', chord)).toEqual({ command: 'zoomOut' });
    expect(boardKeyDown('9', chord)).toEqual({ command: 'zoomFit' });
    expect(boardKeyDown('a', chord)).toEqual({ command: 'selectAll' });
    expect(boardKeyDown('d', chord)).toEqual({ command: 'duplicate' });
    expect(boardKeyDown('c', chord)).toEqual({ command: 'copy' });
    expect(boardKeyDown('v', chord)).toEqual({ command: 'paste' });
    expect(boardKeyDown(']', chord)).toEqual({ command: 'bringForward' });
    expect(boardKeyDown('[', chord)).toEqual({ command: 'sendBackward' });
    expect(boardKeyDown('p', chord)).toBeNull();
  });
});

describe('the white board’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('whiteBoard')) {
    it(`answers ${id} as listed`, () => {
      const context = { ...plain, chord: !!probe.ctrl, shift: !!probe.shift, ...probe.when };
      expect(boardKeyDown(probe.key ?? '', context)?.command).toBe(probe.command);
    });
  }

  it('lists every letter that picks a tool', () => {
    const tools = keyboardShortcutsOf('whiteBoard').find((shortcut) => shortcut.id === 'tools');
    expect(tools?.keys.map(([letter]) => letter.toLowerCase()).sort()).toEqual(Object.keys(TOOL_KEYS).sort());
  });
});
