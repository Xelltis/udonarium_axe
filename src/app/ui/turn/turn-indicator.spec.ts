import { buildTurnIndicator } from '@axe/ui/turn/turn-indicator';
import { describe, expect, it } from 'vitest';

describe('buildTurnIndicator', () => {
  it('shows nothing before a fight has begun', () => {
    expect(buildTurnIndicator('idle', 0, '')).toBeNull();
  });

  it('names the state rather than a character at the start and end of a round', () => {
    expect(buildTurnIndicator('roundStart', 3, '')).toEqual({
      round: 3,
      statusKey: 'feature.turnOrder.beforeRound',
      name: '',
      sideName: '',
    });
    expect(buildTurnIndicator('roundEnd', 3, '')).toEqual({
      round: 3,
      statusKey: 'feature.turnOrder.afterRound',
      name: '',
      sideName: '',
    });
  });

  it('names the character whose turn it is', () => {
    expect(buildTurnIndicator('acting', 2, 'エクィテス')).toEqual({
      round: 2,
      statusKey: null,
      name: 'エクィテス',
      sideName: '',
    });
  });

  it('falls back to the state when the acting character cannot be found', () => {
    expect(buildTurnIndicator('acting', 2, '')).toEqual({
      round: 2,
      statusKey: 'feature.turnOrder.noTurn',
      name: '',
      sideName: '',
    });
  });

  it('names the side whose phase it is alongside the character', () => {
    expect(buildTurnIndicator('acting', 2, 'エクィテス', '味方')).toEqual({
      round: 2,
      statusKey: null,
      name: 'エクィテス',
      sideName: '味方',
    });
  });

  it("reads a side with nobody up yet as that side's turn rather than nobody's", () => {
    expect(buildTurnIndicator('acting', 2, '', '味方')).toEqual({
      round: 2,
      statusKey: null,
      name: '',
      sideName: '味方',
    });
  });

  it('carries the side through the start and end of a round', () => {
    expect(buildTurnIndicator('roundStart', 1, '', '味方')?.sideName).toBe('味方');
  });
});
