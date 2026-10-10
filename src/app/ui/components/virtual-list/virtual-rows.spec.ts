import { VirtualRowHeights, visibleRows } from '@axe/ui/components/virtual-list/virtual-rows';

describe('virtual rows', () => {
  it('lays rows out on the estimate until they are measured', () => {
    const heights = new VirtualRowHeights(20);

    const layout = heights.layout(['a', 'b', 'c']);

    expect([...layout.offsets]).toEqual([0, 20, 40, 60]);
    expect(layout.total).toBe(60);
  });

  it('uses a row’s drawn height once measured, and says how far it moved', () => {
    const heights = new VirtualRowHeights(20);

    expect(heights.measure('b', 50)).toBe(30);
    expect(heights.measure('b', 45)).toBe(-5);
    expect([...heights.layout(['a', 'b', 'c']).offsets]).toEqual([0, 20, 65, 85]);
  });

  it('keeps a row’s height with the row when rows around it move', () => {
    const heights = new VirtualRowHeights(20);
    heights.measure('b', 50);

    expect([...heights.layout(['b', 'a']).offsets]).toEqual([0, 50, 70]);
  });

  describe('visibleRows', () => {
    const layout = new VirtualRowHeights(10).layout(Array.from({ length: 100 }, (_, i) => i));

    it('draws only the rows that reach into the stretch', () => {
      expect(visibleRows(layout, 205, 255)).toEqual({ start: 20, end: 26 });
    });

    it('starts at the first row above the top of the list', () => {
      expect(visibleRows(layout, -50, 30)).toEqual({ start: 0, end: 3 });
    });

    it('draws the last row when scrolled past the end', () => {
      expect(visibleRows(layout, 5000, 5100)).toEqual({ start: 99, end: 100 });
    });

    it('draws nothing for an empty list', () => {
      expect(visibleRows(new VirtualRowHeights(10).layout([]), 0, 100)).toEqual({ start: 0, end: 0 });
    });
  });
});
