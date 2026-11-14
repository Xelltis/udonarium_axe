import { panelOptionAt, sheetPanelBox, sheetPanelTitle } from '@axe/application/ui/sheet-panel';

describe('sheetPanelTitle()', () => {
  it('adds the name to the title when there is one', () => {
    expect(sheetPanelTitle('キャラクターシート', 'アリス')).toBe('キャラクターシート - アリス');
  });

  it('leaves the title alone when there is no name', () => {
    expect(sheetPanelTitle('キャラクターシート', '')).toBe('キャラクターシート');
  });
});

describe('sheetPanelBox()', () => {
  it('opens centred on the point that was grabbed', () => {
    expect(sheetPanelBox({ x: 500, y: 400 }, 600, 300)).toEqual({ left: 200, top: 250, width: 600, height: 300 });
  });

  it('stays centred when the size changes', () => {
    // Changing the width and height while forgetting the offsets opens the window away from what it belongs to.
    const small = sheetPanelBox({ x: 0, y: 0 }, 400, 380);
    expect(small.left + small.width / 2).toBe(0);
    expect(small.top + small.height / 2).toBe(0);
  });
});

describe('panelOptionAt()', () => {
  it('sets the corner the given reach up and to the left of the pointer', () => {
    expect(panelOptionAt({ x: 500, y: 400 }, { width: 360, height: 420, reachLeft: 200, reachUp: 150 })).toEqual({
      left: 300,
      top: 250,
      width: 360,
      height: 420,
    });
  });
});
