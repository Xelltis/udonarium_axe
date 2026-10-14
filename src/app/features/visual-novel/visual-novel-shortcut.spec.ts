import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import {
  isTypingTarget,
  type VisualNovelKeyContext,
  visualNovelKeyDown,
  visualNovelKeyUp,
} from '@axe/features/visual-novel/visual-novel-shortcut';

const IDLE: VisualNovelKeyContext = { composing: false, typing: false, popoverOpen: false, chord: false };

describe('visualNovelKeyDown()', () => {
  it('goes forward on the forward key', () => {
    for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowDown']) {
      expect(visualNovelKeyDown(key, IDLE)).toEqual({ command: 'advance', preventDefault: true });
    }
  });

  it('goes back on the back key', () => {
    for (const key of ['ArrowLeft', 'ArrowUp']) {
      expect(visualNovelKeyDown(key, IDLE)?.command).toBe('back');
    }
  });

  it('jumps to either end', () => {
    expect(visualNovelKeyDown('Home', IDLE)?.command).toBe('toStart');
    expect(visualNovelKeyDown('End', IDLE)?.command).toBe('toLatest');
  });

  it('reads an upper-case key the same way', () => {
    expect(visualNovelKeyDown('l', IDLE)?.command).toBe('toggleBacklog');
    expect(visualNovelKeyDown('L', IDLE)?.command).toBe('toggleBacklog');
    expect(visualNovelKeyDown('A', IDLE)?.command).toBe('toggleAutoPlay');
    expect(visualNovelKeyDown('S', IDLE)?.command).toBe('toggleSlotGuide');
  });

  it('does nothing while something is being typed', () => {
    expect(visualNovelKeyDown('Enter', { ...IDLE, typing: true })).toBeNull();
    expect(visualNovelKeyDown('a', { ...IDLE, typing: true })).toBeNull();
  });

  it('does not read a confirming key mid-composition as a forward', () => {
    expect(visualNovelKeyDown('Enter', { ...IDLE, composing: true })).toBeNull();
  });

  it('closes whatever is open before anything else', () => {
    expect(visualNovelKeyDown('Escape', { ...IDLE, popoverOpen: true })?.command).toBe('closePopovers');
    expect(visualNovelKeyDown('Escape', IDLE)?.command).toBe('exit');
  });

  it('fast-forwards while the key is held and stops nothing else', () => {
    expect(visualNovelKeyDown('Control', IDLE)).toEqual({ command: 'startSkip', preventDefault: false });
    expect(visualNovelKeyUp('Control')?.command).toBe('stopSkip');
    expect(visualNovelKeyUp('Shift')).toBeNull();
  });

  it('does not steal a key held with a modifier', () => {
    // One selects everything and another saves; taking them breaks what works everywhere else.
    for (const key of ['a', 's', 'l', 'Enter', 'Escape']) {
      expect(visualNovelKeyDown(key, { ...IDLE, chord: true })).toBeNull();
    }
  });

  it('reads the modifier alone as a fast-forward', () => {
    expect(visualNovelKeyDown('Control', { ...IDLE, chord: true })?.command).toBe('startSkip');
  });

  it('returns nothing for a key it has no use for', () => {
    expect(visualNovelKeyDown('z', IDLE)).toBeNull();
  });
});

describe('isTypingTarget()', () => {
  it('counts a field as somewhere text is typed', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('counts an editable area as one too', () => {
    const element = document.createElement('div');
    element.contentEditable = 'true';
    Object.defineProperty(element, 'isContentEditable', { value: true });

    expect(isTypingTarget(element)).toBe(true);
  });

  it('counts anywhere else as not', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('novel mode’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('visualNovel')) {
    it(`answers ${id} as listed`, () => {
      const context = { ...IDLE, chord: !!(probe.ctrl || probe.alt), ...probe.when };
      expect(visualNovelKeyDown(probe.key ?? '', context)?.command).toBe(probe.command);
    });
  }
});
