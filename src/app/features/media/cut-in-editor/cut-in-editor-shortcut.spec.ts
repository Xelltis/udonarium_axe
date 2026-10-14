import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import { cutInEditorKeyDown, NUDGE_FAR_PX, NUDGE_PX } from '@axe/features/media/cut-in-editor/cut-in-editor-shortcut';

const plain = { typing: false, chord: false, shift: false, hasSelection: true };

describe('cutInEditorKeyDown()', () => {
  it('does nothing while something is being typed', () => {
    expect(cutInEditorKeyDown('z', { ...plain, typing: true, chord: true })).toBeNull();
    expect(cutInEditorKeyDown('Delete', { ...plain, typing: true })).toBeNull();
  });

  it('takes the last change back', () => {
    expect(cutInEditorKeyDown('z', { ...plain, chord: true })).toEqual({ command: 'undo', preventDefault: true });
  });

  it('puts it again, whichever way it is asked', () => {
    expect(cutInEditorKeyDown('z', { ...plain, chord: true, shift: true })).toEqual({
      command: 'redo',
      preventDefault: true,
    });
    expect(cutInEditorKeyDown('y', { ...plain, chord: true })).toEqual({ command: 'redo', preventDefault: true });
  });

  it('reads the key whichever case it comes in', () => {
    expect(cutInEditorKeyDown('Z', { ...plain, chord: true })?.command).toBe('undo');
  });

  it('deletes what is selected', () => {
    expect(cutInEditorKeyDown('Delete', plain)?.command).toBe('deleteSelection');
    expect(cutInEditorKeyDown('Backspace', plain)?.command).toBe('deleteSelection');
  });

  it('deletes nothing with nothing selected', () => {
    expect(cutInEditorKeyDown('Delete', { ...plain, hasSelection: false })).toBeNull();
  });

  it('starts and stops on the space bar', () => {
    expect(cutInEditorKeyDown(' ', plain)).toEqual({ command: 'togglePlaying', preventDefault: true });
  });

  it('leaves the rest of the keyboard alone', () => {
    expect(cutInEditorKeyDown('a', plain)).toBeNull();
    expect(cutInEditorKeyDown('s', { ...plain, chord: true })).toBeNull();
  });

  describe('moving along the scene', () => {
    it('steps by one on the arrows', () => {
      expect(cutInEditorKeyDown('ArrowLeft', plain)?.command).toBe('stepBack');
      expect(cutInEditorKeyDown('ArrowRight', plain)?.command).toBe('stepForward');
    });

    it('goes from key to key where shift is held', () => {
      expect(cutInEditorKeyDown('ArrowLeft', { ...plain, shift: true })?.command).toBe('jumpBack');
      expect(cutInEditorKeyDown('ArrowRight', { ...plain, shift: true })?.command).toBe('jumpForward');
    });

    it('goes to either end of the scene', () => {
      expect(cutInEditorKeyDown('Home', plain)?.command).toBe('toStart');
      expect(cutInEditorKeyDown('End', plain)?.command).toBe('toEnd');
    });

    it('leaves the arrows to the field where something is being typed', () => {
      expect(cutInEditorKeyDown('ArrowLeft', { ...plain, typing: true })).toBeNull();
      expect(cutInEditorKeyDown('Home', { ...plain, typing: true })).toBeNull();
    });

    it('leaves them alone where a chord is held, which belongs to the browser', () => {
      expect(cutInEditorKeyDown('ArrowLeft', { ...plain, chord: true })).toBeNull();
    });
  });

  describe('taking a moment and laying it down again', () => {
    it('takes the moment the layer in hand is holding', () => {
      expect(cutInEditorKeyDown('c', { ...plain, chord: true })?.command).toBe('copyPose');
    });

    it('lays it down again', () => {
      expect(cutInEditorKeyDown('v', { ...plain, chord: true })?.command).toBe('pastePose');
    });

    it('does neither with no layer in hand, leaving the keys to the browser', () => {
      expect(cutInEditorKeyDown('c', { ...plain, chord: true, hasSelection: false })).toBeNull();
      expect(cutInEditorKeyDown('v', { ...plain, chord: true, hasSelection: false })).toBeNull();
    });

    it('does neither while something is being typed', () => {
      expect(cutInEditorKeyDown('c', { ...plain, chord: true, typing: true })).toBeNull();
    });
  });

  describe('moving the layer in hand', () => {
    it('moves it up and down by one', () => {
      expect(cutInEditorKeyDown('ArrowUp', plain)).toEqual({
        command: 'nudge',
        preventDefault: true,
        dx: 0,
        dy: -NUDGE_PX,
      });
      expect(cutInEditorKeyDown('ArrowDown', plain)?.dy).toBe(NUDGE_PX);
    });

    it('moves it sideways where alt is held, leaving the plain arrows to the playhead', () => {
      expect(cutInEditorKeyDown('ArrowLeft', { ...plain, alt: true })).toEqual({
        command: 'nudge',
        preventDefault: true,
        dx: -NUDGE_FAR_PX,
        dy: 0,
      });
      expect(cutInEditorKeyDown('ArrowLeft', plain)?.command).toBe('stepBack');
    });

    it('moves it further at a time where alt is held', () => {
      expect(cutInEditorKeyDown('ArrowUp', { ...plain, alt: true })?.dy).toBe(-NUDGE_FAR_PX);
    });

    it('does nothing up or down with no layer in hand', () => {
      expect(cutInEditorKeyDown('ArrowUp', { ...plain, hasSelection: false })).toBeNull();
    });
  });
});

describe('the cut-in editor’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('cutInEditor')) {
    it(`answers ${id} as listed`, () => {
      const context = {
        ...plain,
        hasSelection: false,
        chord: !!probe.ctrl,
        shift: !!probe.shift,
        alt: !!probe.alt,
        ...probe.when,
      };
      expect(cutInEditorKeyDown(probe.key ?? '', context)?.command).toBe(probe.command);
    });
  }
});
