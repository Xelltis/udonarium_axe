import { sheetDragOffset, shouldDismissSheet } from '@axe/ui/bottom-sheet-gesture';

describe('shouldDismissSheet', () => {
  it('closes a tall sheet pulled down far enough', () => {
    expect(shouldDismissSheet({ dy: 170, ms: 900, height: 700 })).toBe(true);
  });

  it('springs a tall sheet back when pulled down only a little, slowly', () => {
    expect(shouldDismissSheet({ dy: 100, ms: 900, height: 700 })).toBe(false);
  });

  it('closes a short sheet pulled down a good share of its height', () => {
    expect(shouldDismissSheet({ dy: 80, ms: 900, height: 200 })).toBe(true);
  });

  it('closes on a quick flick down', () => {
    expect(shouldDismissSheet({ dy: 60, ms: 80, height: 700 })).toBe(true);
  });

  it('stays open after a tap on the grip', () => {
    expect(shouldDismissSheet({ dy: 6, ms: 5, height: 700 })).toBe(false);
  });

  it('stays open when pushed upward', () => {
    expect(shouldDismissSheet({ dy: -200, ms: 50, height: 700 })).toBe(false);
  });
});

describe('sheetDragOffset', () => {
  it('follows the finger all the way down', () => {
    expect(sheetDragOffset(90)).toBe(90);
  });

  it('gives only a little upward', () => {
    expect(sheetDragOffset(-60)).toBe(-10);
  });
});
