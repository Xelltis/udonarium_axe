import {
  BUTTON_GUIDE_BUBBLE_PX,
  BUTTON_GUIDE_GAP_PX,
  BUTTON_GUIDE_ROW_PX,
  ButtonGuideBubble,
  ButtonGuideDirection,
  buttonGuideLayout,
  ButtonGuideTarget,
} from '@axe/ui/button-guide-layout';

describe('buttonGuideLayout', () => {
  const bar = { width: 400, height: 44 };

  /** A row of buttons 32 wide with 4 between them, the way the toolbars lay theirs out. */
  function buttons(...labels: string[]): ButtonGuideTarget[] {
    return labels.map((label, index) => ({
      label,
      left: 8 + index * 36,
      right: 8 + index * 36 + 32,
      top: 6,
      bottom: 38,
    }));
  }

  /** Where a name spans across the bar's frame, taking every name to be far wider than the bar. */
  function spanOf(hung: ButtonGuideBubble, width = 1000): { left: number; right: number } {
    const left = hung.bubble.left ?? bar.width - hung.bubble.right! - width;
    return { left, right: left + width };
  }

  /** Whether one name's line down crosses another's line along, or runs through its name. */
  function crosses(down: ButtonGuideBubble, along: ButtonGuideBubble): boolean {
    const x = down.drop.left;
    const [from, to] = [down.drop.top, down.drop.top + down.drop.height].sort((a, b) => a - b);
    const y = along.run.top;
    const reachesRow = from < y && y < to;
    const run = { left: along.run.left, right: along.run.left + along.run.width };
    const name = spanOf(along);
    return reachesRow && ((run.left < x && x < run.right) || (name.left <= x && x <= name.right));
  }

  function expectNoCrossings(direction: ButtonGuideDirection): void {
    const hung = buttonGuideLayout(buttons('a', 'b', 'c', 'd', 'e'), bar, direction);
    for (const down of hung) {
      for (const along of hung) {
        if (down !== along) expect(crosses(down, along), `${down.label} across ${along.label}`).toBe(false);
      }
    }
  }

  it('hangs one row for each button, the nearest one the gap away from the bar', () => {
    const hung = buttonGuideLayout(buttons('a', 'b', 'c'), bar, { up: false, left: false });

    const tops = hung.map((each) => each.bubble.top!).sort((a, b) => a - b);
    expect(tops).toEqual([0, 1, 2].map((row) => bar.height + BUTTON_GUIDE_GAP_PX + row * BUTTON_GUIDE_ROW_PX));
  });

  it('stands every name in one column beyond the right end of the bar', () => {
    const hung = buttonGuideLayout(buttons('a', 'b', 'c'), bar, { up: false, left: false });

    for (const each of hung) {
      expect(each.bubble.left).toBe(bar.width + BUTTON_GUIDE_GAP_PX);
      expect(each.run.left + each.run.width).toBe(bar.width + BUTTON_GUIDE_GAP_PX);
    }
  });

  it('gives the row nearest the bar to the button nearest the column', () => {
    const [first, , last] = buttonGuideLayout(buttons('a', 'b', 'c'), bar, { up: false, left: false });

    expect(last.bubble.top).toBe(bar.height + BUTTON_GUIDE_GAP_PX);
    expect(first.bubble.top).toBe(bar.height + BUTTON_GUIDE_GAP_PX + 2 * BUTTON_GUIDE_ROW_PX);
  });

  it('never crosses two lines or runs a line through a name, below the bar and off either end', () => {
    expectNoCrossings({ up: false, left: false });
    expectNoCrossings({ up: false, left: true });
  });

  it('never crosses them above the bar either', () => {
    expectNoCrossings({ up: true, left: false });
    expectNoCrossings({ up: true, left: true });
  });

  it('drops each line from the middle of its button and turns it halfway up its name', () => {
    const [only] = buttonGuideLayout(buttons('a'), bar, { up: false, left: false });

    expect(only.drop.left).toBe(24);
    expect(only.drop.top).toBe(38);
    expect(only.drop.top + only.drop.height).toBe(only.run.top);
    expect(only.run.top).toBe(only.bubble.top! + BUTTON_GUIDE_BUBBLE_PX / 2);
    expect(only.run.left).toBe(24);
  });

  it('hangs the names above the bar when asked to, lines rising from the top of each button', () => {
    const [only] = buttonGuideLayout(buttons('a'), bar, { up: true, left: false });

    expect(only.bubble.top).toBeNull();
    expect(only.bubble.bottom).toBe(bar.height + BUTTON_GUIDE_GAP_PX);
    expect(only.drop.top).toBe(-(BUTTON_GUIDE_GAP_PX + BUTTON_GUIDE_BUBBLE_PX / 2));
    expect(only.drop.top + only.drop.height).toBe(6);
  });

  it('stands the column off the left end, pinned by its right edge, when asked to', () => {
    const [first, second] = buttonGuideLayout(buttons('a', 'b'), bar, { up: false, left: true });

    expect(first.bubble.left).toBeNull();
    expect(first.bubble.right).toBe(bar.width + BUTTON_GUIDE_GAP_PX);
    expect(first.run.left).toBe(-BUTTON_GUIDE_GAP_PX);
    expect(first.run.left + first.run.width).toBe(24);
    expect(first.bubble.top).toBeLessThan(second.bubble.top!);
  });

  it('names the buttons from left to right whatever order they were found in', () => {
    const [a, b] = buttons('a', 'b');
    const hung = buttonGuideLayout([b, a], bar, { up: false, left: true });

    expect(hung.map((each) => each.label)).toEqual(['a', 'b']);
  });

  it('leaves out a button with nothing to call it', () => {
    const hung = buttonGuideLayout(buttons('a', '', 'c'), bar, { up: false, left: false });

    expect(hung.map((each) => each.label)).toEqual(['a', 'c']);
  });
});
