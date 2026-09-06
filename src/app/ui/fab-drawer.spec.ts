import {
  FAB_COLUMN_CLASSES,
  fabDrawerPlaceClasses,
  FabDrawerSide,
  fabDrawerSide,
  fabLabelSideClasses,
} from '@axe/ui/fab-drawer';

const VIEW = { width: 1000, height: 800 };

function buttonAt(left: number, top: number) {
  return { left, top, width: 56, height: 48 };
}

describe('fabDrawerSide()', () => {
  it('opens down and to the right from the top left corner', () => {
    expect(fabDrawerSide(buttonAt(12, 12), VIEW)).toEqual({ up: false, left: false });
  });

  it('opens up and to the left from the bottom right corner', () => {
    expect(fabDrawerSide(buttonAt(930, 740), VIEW)).toEqual({ up: true, left: true });
  });

  it('takes each half on its own, so a corner is not needed for either', () => {
    expect(fabDrawerSide(buttonAt(930, 12), VIEW)).toEqual({ up: false, left: true });
    expect(fabDrawerSide(buttonAt(12, 740), VIEW)).toEqual({ up: true, left: false });
  });

  it('goes by the middle of the button rather than its corner', () => {
    // Each edge is still in the near half; each middle has crossed over.
    expect(fabDrawerSide(buttonAt(480, 12), VIEW).left).toBe(true);
    expect(fabDrawerSide(buttonAt(12, 380), VIEW).up).toBe(true);
  });
});

describe('fabDrawerPlaceClasses()', () => {
  const corners: FabDrawerSide[] = [
    { up: false, left: false },
    { up: false, left: true },
    { up: true, left: false },
    { up: true, left: true },
  ];

  it('hangs the drawer under the button when it opens downward', () => {
    expect(fabDrawerPlaceClasses({ up: false, left: false })).toContain('top-[calc(100%+10px)]');
    expect(fabDrawerPlaceClasses({ up: false, left: false })).toContain('left-0');
  });

  it('hangs it over the button, from its right edge, in the far corner', () => {
    const classes = fabDrawerPlaceClasses({ up: true, left: true });
    expect(classes).toContain('bottom-[calc(100%+10px)]');
    expect(classes).toContain('right-0');
    expect(classes).toContain('origin-bottom-right');
  });

  it('grows out of the corner it is anchored to', () => {
    expect(fabDrawerPlaceClasses({ up: false, left: true })).toContain('origin-top-right');
    expect(fabDrawerPlaceClasses({ up: true, left: false })).toContain('origin-bottom-left');
  });

  /**
   * The drawer moves; what is in it does not. Turning the list round to suit the direction
   * it grew in is exactly what this is here to prevent.
   */
  it('never turns the order of what is in it round', () => {
    for (const side of corners) {
      const classes = fabDrawerPlaceClasses(side);
      expect(classes).not.toContain('reverse');
      expect(classes).not.toContain('flex-col-reverse');
      expect(classes).not.toContain('flex-row-reverse');
    }
  });
});

describe('fabLabelSideClasses()', () => {
  it('writes a name outward from a drawer at the right edge', () => {
    expect(fabLabelSideClasses({ up: false, left: true })).toContain('after:right-[calc(100%+10px)]');
    expect(fabLabelSideClasses({ up: false, left: true })).toContain('after:left-auto');
  });

  it('leaves a name where it was for a drawer at the left edge', () => {
    expect(fabLabelSideClasses({ up: true, left: false })).toBe('');
  });
});

describe('FAB_COLUMN_CLASSES', () => {
  it('reads a wide drawer down a column and then the column to its left', () => {
    expect(FAB_COLUMN_CLASSES).toContain('[column-count:2]');
    expect(FAB_COLUMN_CLASSES).toContain('[direction:rtl]');
  });

  it('keeps the writing in each item the right way round', () => {
    expect(FAB_COLUMN_CLASSES).toContain('[&>*]:[direction:ltr]');
  });

  it('does not let an item be split between two columns', () => {
    expect(FAB_COLUMN_CLASSES).toContain('break-inside-avoid');
  });
});
