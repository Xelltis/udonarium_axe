import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import { ButtonGuideKeyContext, buttonGuideKeyDown } from '@axe/features/button-guide/button-guide-shortcut';

describe('the keys the guide to the buttons answers', () => {
  const context: ButtonGuideKeyContext = { typing: false, composing: false, chord: false, shown: false };

  it('brings the guide out and puts it away with the question mark, full width or not', () => {
    expect(buttonGuideKeyDown('?', context)).toEqual({ command: 'toggle', preventDefault: true });
    expect(buttonGuideKeyDown('？', { ...context, shown: true })).toEqual({ command: 'toggle', preventDefault: true });
  });

  it('puts the guide away with escape, and lets escape go on to whatever else answers it', () => {
    expect(buttonGuideKeyDown('Escape', { ...context, shown: true })).toEqual({
      command: 'hide',
      preventDefault: false,
    });
  });

  it('leaves escape alone while there is no guide out', () => {
    expect(buttonGuideKeyDown('Escape', context)).toBeNull();
  });

  it('stays out of the way of typing, composing and the browser shortcuts', () => {
    expect(buttonGuideKeyDown('?', { ...context, typing: true })).toBeNull();
    expect(buttonGuideKeyDown('?', { ...context, composing: true })).toBeNull();
    expect(buttonGuideKeyDown('?', { ...context, chord: true })).toBeNull();
    expect(buttonGuideKeyDown('Escape', { ...context, shown: true, typing: true })).toBeNull();
  });

  it('answers no other key', () => {
    expect(buttonGuideKeyDown('/', context)).toBeNull();
    expect(buttonGuideKeyDown('h', context)).toBeNull();
  });
});

describe('the guide’s line on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('global')) {
    it(`answers ${id} as listed`, () => {
      const context = { typing: false, composing: false, chord: !!(probe.ctrl || probe.alt), shown: false };
      expect(buttonGuideKeyDown(probe.key ?? '', context)?.command).toBe(probe.command);
    });
  }
});
