import { TableMouseGesture } from '@axe/features/tabletop/game-table/table-mouse-gesture';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('TableMouseGesture', () => {
  afterEach(() => vi.restoreAllMocks());

  it('listens for the wheel as an event it may cancel, as turning it zooms the table and not the page', () => {
    const element = document.createElement('div');
    const added = vi.spyOn(element, 'addEventListener');

    const gesture = new TableMouseGesture(element);

    expect(added).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    gesture.destroy();
  });
});
