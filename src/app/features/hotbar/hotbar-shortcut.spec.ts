import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import { HotbarKeyContext, hotbarKeyDown, pressEmptiesSlot } from '@axe/features/hotbar/hotbar-shortcut';

describe('the keys a hotbar answers', () => {
  const context: HotbarKeyContext = {
    typing: false,
    composing: false,
    chord: false,
    shift: false,
    slotCount: 10,
    pageCount: 5,
  };

  it('fires the slot the number sits over, with zero at the end', () => {
    expect(hotbarKeyDown('Digit1', context)).toEqual({ command: 'fireSlot', index: 0, preventDefault: true });
    expect(hotbarKeyDown('Digit9', context)).toEqual({ command: 'fireSlot', index: 8, preventDefault: true });
    expect(hotbarKeyDown('Digit0', context)).toEqual({ command: 'fireSlot', index: 9, preventDefault: true });
  });

  it('answers the number pad the same way', () => {
    expect(hotbarKeyDown('Numpad3', context)).toEqual({ command: 'fireSlot', index: 2, preventDefault: true });
  });

  it('turns the page when shift is held', () => {
    expect(hotbarKeyDown('Digit2', { ...context, shift: true })).toEqual({
      command: 'gotoPage',
      index: 1,
      preventDefault: true,
    });
  });

  it('lets a key through when there is no page or slot that far along', () => {
    expect(hotbarKeyDown('Digit7', { ...context, shift: true })).toBeNull();
    expect(hotbarKeyDown('Digit9', { ...context, slotCount: 4 })).toBeNull();
  });

  it('turns a page either way with the brackets', () => {
    expect(hotbarKeyDown('BracketRight', context)).toEqual({ command: 'turnPage', index: 1, preventDefault: true });
    expect(hotbarKeyDown('BracketLeft', context)).toEqual({ command: 'turnPage', index: -1, preventDefault: true });
  });

  it('keeps out of the way of someone typing', () => {
    expect(hotbarKeyDown('Digit1', { ...context, typing: true })).toBeNull();
  });

  it('keeps out of the way of a word being composed', () => {
    expect(hotbarKeyDown('Digit1', { ...context, composing: true })).toBeNull();
  });

  it('leaves a chord to the browser', () => {
    expect(hotbarKeyDown('Digit1', { ...context, chord: true })).toBeNull();
  });

  it('answers nothing else at all', () => {
    expect(hotbarKeyDown('KeyA', context)).toBeNull();
    expect(hotbarKeyDown('Backslash', context)).toBeNull();
    expect(hotbarKeyDown('Escape', context)).toBeNull();
    expect(hotbarKeyDown('ArrowLeft', context)).toBeNull();
  });
});

describe('turning the page with the brackets', () => {
  const context: HotbarKeyContext = {
    typing: false,
    composing: false,
    chord: false,
    shift: false,
    slotCount: 10,
    pageCount: 5,
  };

  it('reads the keycap, so a Japanese board turns the page the way it is marked', () => {
    expect(hotbarKeyDown('BracketRight', context, '[')).toEqual({
      command: 'turnPage',
      index: -1,
      preventDefault: true,
    });
    expect(hotbarKeyDown('Backslash', context, ']')).toEqual({ command: 'turnPage', index: 1, preventDefault: true });
  });

  it('reads the place where nothing was printed', () => {
    expect(hotbarKeyDown('BracketLeft', context)).toEqual({ command: 'turnPage', index: -1, preventDefault: true });
    expect(hotbarKeyDown('BracketRight', context)).toEqual({ command: 'turnPage', index: 1, preventDefault: true });
  });

  it('leaves alone a key that prints something else', () => {
    expect(hotbarKeyDown('Backslash', context, '\\')).toBeNull();
    expect(hotbarKeyDown('BracketLeft', context, '@')).toBeNull();
  });
});

describe('emptying a slot with a held press', () => {
  it('takes ctrl anywhere but on an Apple keyboard', () => {
    expect(pressEmptiesSlot({ ctrlKey: true, metaKey: false }, false)).toBe(true);
    expect(pressEmptiesSlot({ ctrlKey: true, metaKey: false }, true)).toBe(false);
  });

  it('takes command on an Apple keyboard, where ctrl opens a menu', () => {
    expect(pressEmptiesSlot({ ctrlKey: false, metaKey: true }, true)).toBe(true);
  });

  it('leaves a plain press alone', () => {
    expect(pressEmptiesSlot({ ctrlKey: false, metaKey: false }, false)).toBe(false);
    expect(pressEmptiesSlot({ ctrlKey: false, metaKey: false }, true)).toBe(false);
  });
});

describe('the hotbar’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('hotbar')) {
    it(`answers ${id} as listed`, () => {
      const context: HotbarKeyContext = {
        typing: false,
        composing: false,
        chord: !!(probe.ctrl || probe.alt),
        shift: !!probe.shift,
        slotCount: 10,
        pageCount: 5,
      };
      expect(hotbarKeyDown(probe.code ?? '', context, probe.key)?.command).toBe(probe.command);
    });
  }
});
