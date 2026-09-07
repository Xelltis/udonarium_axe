import {
  asFactionPhaseMode,
  asTurnOrderMode,
  DEFAULT_FACTION_PHASE_MODE,
  DEFAULT_TURN_ORDER_MODE,
} from '@axe/domain/tabletop/turn-order-mode';

describe('asTurnOrderMode()', () => {
  it('reads the modes it knows', () => {
    expect(asTurnOrderMode('initiative')).toBe('initiative');
    expect(asTurnOrderMode('faction')).toBe('faction');
  });

  it('leaves a room saying nothing taking the round one piece at a time', () => {
    expect(asTurnOrderMode('')).toBe('initiative');
    expect(asTurnOrderMode(undefined)).toBe(DEFAULT_TURN_ORDER_MODE);
    expect(asTurnOrderMode('sides')).toBe(DEFAULT_TURN_ORDER_MODE);
  });
});

describe('asFactionPhaseMode()', () => {
  it('reads the modes it knows', () => {
    expect(asFactionPhaseMode('free')).toBe('free');
    expect(asFactionPhaseMode('initiative')).toBe('initiative');
  });

  it('lets a side move in whatever order it likes where the room says nothing', () => {
    expect(asFactionPhaseMode('')).toBe('free');
    expect(asFactionPhaseMode('anything')).toBe(DEFAULT_FACTION_PHASE_MODE);
  });
});
