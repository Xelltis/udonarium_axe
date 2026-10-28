import {
  BATTLE_STAGE_CANVAS,
  battleStageWindowBox,
  battleStageWindowPlace,
  DEFAULT_BATTLE_STAGE_WINDOW,
  nextBattleStageSize,
  readBattleStageWindow,
} from '@axe/domain/battle/battle-stage-window';

describe('the window the battle stage plays in', () => {
  const screen = { width: 1600, height: 900 };

  it('steps from the full screen down through the windows and round again', () => {
    expect(nextBattleStageSize('full')).toBe('large');
    expect(nextBattleStageSize('large')).toBe('medium');
    expect(nextBattleStageSize('medium')).toBe('small');
    expect(nextBattleStageSize('small')).toBe('full');
  });

  it('draws the full screen as it always was, with no window', () => {
    expect(battleStageWindowBox(DEFAULT_BATTLE_STAGE_WINDOW, screen, false)).toBeNull();
  });

  it('gives each window the canvas shape, and the share of the canvas it is shrunk to', () => {
    const small = battleStageWindowBox({ size: 'small', x: 0, y: 0 }, screen, false)!;
    const large = battleStageWindowBox({ size: 'large', x: 0, y: 0 }, screen, false)!;

    expect(small.width).toBeLessThan(large.width);
    expect(small.height / small.width).toBeCloseTo(BATTLE_STAGE_CANVAS.height / BATTLE_STAGE_CANVAS.width);
    expect(small.scale).toBeCloseTo(small.width / BATTLE_STAGE_CANVAS.width);
  });

  it('puts the window where its shares say, against the edges at 0 and 1', () => {
    const topLeft = battleStageWindowBox({ size: 'medium', x: 0, y: 0 }, screen, false)!;
    const bottomRight = battleStageWindowBox({ size: 'medium', x: 1, y: 1 }, screen, false)!;

    expect(topLeft.left).toBe(8);
    expect(topLeft.top).toBe(8);
    expect(bottomRight.left + bottomRight.width).toBe(screen.width - 8);
    expect(bottomRight.top + bottomRight.height).toBe(screen.height - 8);
  });

  it('keeps a window no wider than a narrow screen, along its top and in the middle', () => {
    const box = battleStageWindowBox({ size: 'large', x: 1, y: 1 }, { width: 390, height: 844 }, true)!;

    expect(box.width).toBe(390 - 16);
    expect(box.left).toBe(8);
    expect(box.top).toBe(8);
  });

  it('turns a window dragged to a corner back into the shares it is kept at', () => {
    const box = battleStageWindowBox({ size: 'small', x: 0.25, y: 0.5 }, screen, false)!;

    const place = battleStageWindowPlace(box.left, box.top, box, screen);

    expect(place.x).toBeCloseTo(0.25);
    expect(place.y).toBeCloseTo(0.5);
    expect(battleStageWindowPlace(-500, 5000, box, screen)).toEqual({ x: 0, y: 1 });
  });

  it('reads back what was kept, and how it always was from anything it cannot read', () => {
    expect(readBattleStageWindow('{"size":"small","x":0.2,"y":0.7}')).toEqual({ size: 'small', x: 0.2, y: 0.7 });
    expect(readBattleStageWindow('{"size":"small","x":3,"y":-1}')).toEqual({ size: 'small', x: 1, y: 0 });
    for (const kept of [null, '', 'nonsense', '{"size":"huge"}', '{"size":"small","x":""}', 42]) {
      const read = readBattleStageWindow(kept);
      expect(read.x, String(kept)).not.toBe(0);
      if (kept !== '{"size":"small","x":""}') expect(read.size, String(kept)).toBe('full');
    }
  });
});
