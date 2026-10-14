import { shortcutProbesOf } from '@axe/domain/ui/keyboard-shortcuts';
import { TabletopKeyContext, tabletopKeyDown } from '@axe/features/keyboard/tabletop-shortcut';

describe('tabletopKeyDown', () => {
  const idle: TabletopKeyContext = { typing: false, composing: false, chord: false, shift: false };

  it('aims at the picked pieces on T', () => {
    expect(tabletopKeyDown('t', idle)).toBe('target');
    expect(tabletopKeyDown('T', idle)).toBe('target');
  });

  it('takes every aim away on Shift+T', () => {
    expect(tabletopKeyDown('T', { ...idle, shift: true })).toBe('clearTargets');
  });

  it('switches who the picked pieces are disclosed to on G', () => {
    expect(tabletopKeyDown('g', idle)).toBe('toggleDisclosure');
    expect(tabletopKeyDown('G', { ...idle, shift: true })).toBeNull();
  });

  it('reads the full-width letters a board left in Japanese input sends', () => {
    expect(tabletopKeyDown('ｔ', idle)).toBe('target');
    expect(tabletopKeyDown('Ｇ', idle)).toBe('toggleDisclosure');
  });

  it('leaves the key alone while typing, composing or holding another modifier', () => {
    expect(tabletopKeyDown('t', { ...idle, typing: true })).toBeNull();
    expect(tabletopKeyDown('t', { ...idle, composing: true })).toBeNull();
    expect(tabletopKeyDown('t', { ...idle, chord: true })).toBeNull();
  });

  it('answers no other key', () => {
    expect(tabletopKeyDown('r', idle)).toBeNull();
    expect(tabletopKeyDown('Enter', idle)).toBeNull();
  });
});

describe('the table’s lines on the list of keys', () => {
  for (const { id, probe } of shortcutProbesOf('tabletop')) {
    it(`answers ${id} as listed`, () => {
      const context = { typing: false, composing: false, chord: !!(probe.ctrl || probe.alt), shift: !!probe.shift };
      expect(tabletopKeyDown(probe.key ?? '', context)).toBe(probe.command);
    });
  }
});
