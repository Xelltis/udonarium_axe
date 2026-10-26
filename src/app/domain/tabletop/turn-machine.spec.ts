import {
  roundAdvance,
  roundCloseInPassing,
  roundGiveTurn,
  roundHold,
  roundInterrupt,
  roundNext,
  roundReset,
  roundSide,
  TurnEffect,
  TurnOutcome,
  TurnSnapshot,
  TurnTable,
} from '@axe/domain/tabletop/turn-machine';
import { NO_HOLDING } from '@axe/domain/tabletop/turn-state';

const NOW = 1_700_000_000_000;

const IDLE: TurnSnapshot = {
  round: 0,
  phase: 'idle',
  currentIdentifier: '',
  currentSide: '',
  acted: [],
  holding: NO_HOLDING,
  turnStart: '',
};

function table(more: Partial<TurnTable> = {}): TurnTable {
  return {
    mode: 'initiative',
    factionPhaseMode: 'free',
    order: ['a', 'b'],
    sides: [],
    companionsOf: () => [],
    sideOf: () => null,
    now: NOW,
    ...more,
  };
}

/** What a press did besides writing the round down, in order. */
function done(outcome: TurnOutcome | null): string[] {
  return (outcome?.effects ?? [])
    .filter((effect) => effect.kind !== 'write')
    .map((effect) => {
      switch (effect.kind) {
        case 'announce':
          return `${effect.announcement}:${effect.identifier}`;
        case 'roundStart':
        case 'roundEnd':
          return `${effect.kind}:${effect.round}`;
        case 'sidePhaseStart':
          return `side:${effect.side}`;
        case 'buffs':
          return `buffs:${effect.timing}:${effect.identifier}`;
        case 'ground':
          return `ground:${effect.moment}:${effect.identifier}`;
        case 'turnStarted':
          return `started:${effect.identifier}`;
        default:
          return effect.kind;
      }
    });
}

/** Presses the round on from where it stands, as the room would. */
function press(state: TurnSnapshot, times: number, on: TurnTable = table()): TurnSnapshot {
  for (let i = 0; i < times; i++) state = roundNext(state, on).state;
  return state;
}

describe('the round', () => {
  it('begins the first round from before it', () => {
    const outcome = roundNext(IDLE, table());

    expect(outcome.state).toMatchObject({ round: 1, phase: 'roundStart', currentIdentifier: '' });
    expect(done(outcome)).toEqual(['roundStart:1']);
  });

  it('writes the round down before telling the chat about it', () => {
    const kinds = roundNext(IDLE, table()).effects.map((effect: TurnEffect) => effect.kind);

    expect(kinds).toEqual(['write', 'roundStart']);
  });

  it('hands the first turn over, opening it', () => {
    const outcome = roundNext(press(IDLE, 1), table());

    expect(outcome.state).toMatchObject({ phase: 'acting', currentIdentifier: 'a', turnStart: `a@${NOW}` });
    expect(done(outcome)).toEqual(['announce:a', 'buffs:turnStart:a', 'started:a', 'ground:turnStart:a']);
  });

  it('closes whoever was up before handing the turn on', () => {
    const outcome = roundNext(press(IDLE, 2), table());

    expect(outcome.state).toMatchObject({ currentIdentifier: 'b', acted: ['a'] });
    expect(done(outcome)).toEqual([
      'ground:turnEnd:a',
      'buffs:turnEnd:a',
      'turnEnded',
      'announce:b',
      'buffs:turnStart:b',
      'started:b',
      'ground:turnStart:b',
    ]);
  });

  it('ends the round once nobody is left, counting down what waits on its end', () => {
    const outcome = roundNext(press(IDLE, 3), table());

    expect(outcome.state).toMatchObject({ round: 1, phase: 'roundEnd', currentIdentifier: '', acted: ['a', 'b'] });
    expect(done(outcome).slice(-4)).toEqual(['turnEnded', 'roundEnd:1', 'buffs:roundEnd:', 'turnEnded']);
  });

  it('opens and closes the turns of those who take theirs in another’s', () => {
    const riding = table({ order: ['knight'], companionsOf: (id) => (id === 'knight' ? ['horse'] : []) });
    const opened = roundNext(press(IDLE, 1, riding), riding);
    const closed = roundNext(opened.state, riding);

    expect(done(opened)).toContain('started:horse');
    expect(closed.state.acted).toEqual(['knight', 'horse']);
  });

  it('closes the round and begins the next, whoever is still to move', () => {
    const outcome = roundAdvance(press(IDLE, 2), table());

    expect(outcome.state).toMatchObject({ round: 2, phase: 'roundStart', acted: [] });
    expect(done(outcome)).toEqual(['roundEnd:1', 'buffs:roundEnd:', 'turnEnded', 'roundStart:2']);
  });

  it('goes back to before the first round', () => {
    const outcome = roundReset(press(IDLE, 2), table());

    expect(outcome.state).toMatchObject({ round: 0, phase: 'idle', currentIdentifier: '', acted: [] });
    expect(done(outcome)).toEqual(['reset']);
  });

  it('gives the turn to the piece named, without closing whoever was up', () => {
    const outcome = roundGiveTurn(press(IDLE, 2), table(), 'b');

    expect(outcome?.state).toMatchObject({ currentIdentifier: 'b', acted: [] });
    expect(done(outcome)).toEqual(['announce:b']);
  });
});

describe('waiting to step in', () => {
  it('passes the turn on without it counting as had, and does not open it again on coming back', () => {
    const held = roundHold(press(IDLE, 2), table(), 'a')!;

    expect(held.state).toMatchObject({ currentIdentifier: 'b', acted: [] });
    expect(held.state.holding).toEqual({ held: ['a'], begun: ['a'], interrupted: [] });
    expect(done(held)).toEqual([
      'holdAnnounce:a',
      'turnEnded',
      'announce:b',
      'buffs:turnStart:b',
      'started:b',
      'ground:turnStart:b',
    ]);

    const back = roundNext(held.state, table());
    expect(back.state.currentIdentifier).toBe('a');
    expect(done(back)).not.toContain('started:a');
  });

  it('is refused where the round does not allow it', () => {
    expect(roundHold(IDLE, table(), 'a')).toBeNull();
    expect(roundInterrupt(press(IDLE, 2), table(), 'b')).toBeNull();
  });

  it('steps a waiting piece in, and takes the turn it stepped into up again once it is done', () => {
    const waiting = roundHold(press(IDLE, 1), table(), 'b')!.state;
    const aUp = roundNext(waiting, table()).state;

    const stepped = roundInterrupt(aUp, table(), 'b')!;
    expect(stepped.state).toMatchObject({ currentIdentifier: 'b' });
    expect(stepped.state.holding.interrupted).toEqual(['a']);
    expect(done(stepped)[0]).toBe('turnEnded');
    expect(done(stepped)).toContain('interruptAnnounce:b');

    const resumed = roundNext(stepped.state, table());
    expect(resumed.state).toMatchObject({ currentIdentifier: 'a', acted: ['b'] });
    expect(done(resumed)).toContain('resumeAnnounce:a');
    expect(done(resumed)).not.toContain('started:a');
  });
});

describe('the round taken side by side', () => {
  const sides = table({
    mode: 'faction',
    factionPhaseMode: 'initiative',
    order: ['a1', 'a2', 'b1'],
    sides: [
      { side: 'red', members: ['a1', 'a2'] },
      { side: 'blue', members: ['b1'] },
    ],
    sideOf: (id) => (id.startsWith('a') ? 'red' : id.startsWith('b') ? 'blue' : null),
  });

  it('opens the first side’s phase and, by initiative, hands its first piece the turn', () => {
    const outcome = roundNext(press(IDLE, 1, sides), sides);

    expect(outcome.state).toMatchObject({ currentSide: 'red', currentIdentifier: 'a1' });
    expect(done(outcome).slice(0, 2)).toEqual(['side:red', 'announce:a1']);
  });

  it('only leaves a side once nobody on it is waiting', () => {
    const secondOfRed = press(IDLE, 3, sides);
    expect(secondOfRed).toMatchObject({ currentSide: 'red', currentIdentifier: 'a2' });

    const outcome = roundNext(secondOfRed, sides);
    expect(outcome.state).toMatchObject({ currentSide: 'blue', currentIdentifier: 'b1' });
    expect(done(outcome)).toContain('side:blue');
  });

  it('does nothing for the piece already up', () => {
    const up = press(IDLE, 2, sides);

    expect(roundGiveTurn(up, sides, 'a1')).toBeNull();
  });

  it('stands the round on the side of a piece given the turn', () => {
    const outcome = roundGiveTurn(press(IDLE, 2, sides), sides, 'b1');

    expect(outcome?.state).toMatchObject({ currentSide: 'blue', currentIdentifier: 'b1', acted: ['a1'] });
  });

  it('stands on a side still there when the one held has gone', () => {
    expect(roundSide({ currentSide: 'green', acted: ['a1', 'a2'] }, sides)).toBe('blue');
    expect(roundSide({ currentSide: 'red', acted: [] }, sides)).toBe('red');
    expect(roundSide({ currentSide: 'red', acted: [] }, table())).toBe('');
  });
});

describe('closing turns in passing', () => {
  it('closes the turns of those not yet had while one is being taken, and nothing otherwise', () => {
    const up = press(IDLE, 2);

    expect(roundCloseInPassing(up, table(), ['b', 'a']).state.acted).toEqual(['b', 'a']);
    expect(roundCloseInPassing(IDLE, table(), ['b']).effects).toEqual([]);
  });
});
