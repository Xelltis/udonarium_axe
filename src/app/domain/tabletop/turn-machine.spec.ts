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
        case 'giveBack':
          return `${effect.kind}:${effect.identifier}`;
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
    expect(held.state.holding).toEqual({ held: ['a'], begun: ['a'], interrupted: [], givenBack: [] });
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

  it('gives back what the opening counted down, where every seat counts it down again, and counts it again on coming back', () => {
    const giving = table({ givesBackOnHold: true });
    const opened = roundNext(press(IDLE, 1, giving), giving);
    expect(done(opened)).toEqual(['announce:a', 'buffs:turnStart:a', 'started:a', 'ground:turnStart:a']);
    expect(opened.state.opening).toBe('a');

    const held = roundHold(opened.state, giving, 'a')!;
    expect(held.state.holding).toEqual({ held: ['a'], begun: ['a'], interrupted: [], givenBack: ['a'] });
    expect(done(held).slice(0, 3)).toEqual(['holdAnnounce:a', 'giveBack:a', 'turnEnded']);

    const back = roundNext(held.state, giving);
    expect(back.state.currentIdentifier).toBe('a');
    expect(back.state.holding.givenBack).toEqual([]);
    expect(back.state.opening).toBe('a');
    const reopened = done(back);
    expect(reopened).toContain('buffs:turnStart:a');
    expect(reopened).not.toContain('started:a');
    expect(reopened).not.toContain('ground:turnStart:a');
  });

  it('gives nothing back for a turn taken up again after one stepped into it, whose opening is not on record', () => {
    const giving = table({ givesBackOnHold: true, order: ['a', 'b', 'c'] });
    const opened = roundNext(press(IDLE, 1, giving), giving);
    const waiting = roundHold(opened.state, giving, 'c')!;
    expect(waiting.state.opening).toBe('a');
    const steppedIn = roundInterrupt(waiting.state, giving, 'c')!;
    expect(steppedIn.state.opening).toBe('c');
    const resumed = roundNext(steppedIn.state, giving);
    expect(resumed.state.currentIdentifier).toBe('a');
    expect(resumed.state.opening).toBe('');

    const held = roundHold(resumed.state, giving, 'a')!;

    expect(done(held)).not.toContain('giveBack:a');
    expect(held.state.holding.givenBack).toEqual([]);
  });

  it('forgets whose opening is on record once the round turns over, or a turn is handed over without one', () => {
    const giving = table({ givesBackOnHold: true });
    const opened = roundNext(press(IDLE, 1, giving), giving);
    expect(opened.state.opening).toBe('a');

    expect(roundNext(roundNext(opened.state, giving).state, giving).state.opening).toBe('');
    const handed = roundGiveTurn(opened.state, giving, 'b')!;
    expect(handed.state.opening).toBe('');
    expect(done(roundHold(handed.state, giving, 'b'))).not.toContain('giveBack:b');
  });

  it('counts a given back opening down again when the turn is handed back, or closed in passing', () => {
    const giving = table({ givesBackOnHold: true });
    const held = roundHold(roundNext(press(IDLE, 1, giving), giving).state, giving, 'a')!;
    expect(held.state.holding.givenBack).toEqual(['a']);

    const handedBack = roundGiveTurn(held.state, giving, 'a')!;
    expect(done(handedBack)).toContain('buffs:turnStart:a');
    expect(done(handedBack)).not.toContain('started:a');
    expect(handedBack.state.holding.givenBack).toEqual([]);

    const closed = roundCloseInPassing(held.state, giving, ['a']);
    expect(done(closed)).toEqual(expect.arrayContaining(['buffs:turnStart:a']));
    expect(closed.state.holding.givenBack).toEqual([]);
  });

  it('gives nothing back for a piece that waits before its turn comes, nor where a seat would not count it again', () => {
    const giving = table({ givesBackOnHold: true });
    const early = roundHold(press(IDLE, 2, giving), giving, 'b')!;
    expect(done(early)).not.toContain('giveBack:b');
    expect(early.state.holding.givenBack).toEqual([]);

    const plain = roundHold(press(IDLE, 2), table(), 'a')!;
    expect(done(plain)).not.toContain('giveBack:a');
    expect(done(roundNext(plain.state, table()))).not.toContain('buffs:turnStart:a');
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

describe('a press carried out as it is worked out', () => {
  /** The round as a room holds it, with the ground able to move it while a press is under way. */
  function room(start: TurnSnapshot, onGround: (effect: TurnEffect, round: TurnSnapshot) => TurnSnapshot) {
    let round = start;
    const performed: TurnEffect[] = [];
    return {
      performed,
      round: () => round,
      live: {
        perform: (effect: TurnEffect) => {
          performed.push(effect);
          if (effect.kind === 'write') round = { ...round, ...effect.fields };
          if (effect.kind === 'ground') round = onGround(effect, round);
        },
        read: () => round,
      },
    };
  }

  it('does each thing as it goes, and works on from where the round really stands', () => {
    const on = table({ order: ['a', 'm', 'b'], companionsOf: (id) => (id === 'a' ? ['m'] : []) });
    const up = press(IDLE, 2, on);
    const held = room(up, (effect, round) =>
      effect.kind === 'ground' && effect.identifier === 'a' && effect.moment === 'turnEnd'
        ? { ...round, acted: [...round.acted, 'm'] }
        : round
    );

    const outcome = roundNext(up, on, held.live);

    expect(held.round().acted).toEqual(['m', 'a']);
    expect(held.round().currentIdentifier).toBe('b');
    expect(done(outcome)).not.toContain('ground:turnEnd:m');
    const besidesWrites = (effects: readonly TurnEffect[]) => effects.filter((effect) => effect.kind !== 'write');
    expect(besidesWrites(held.performed)).toEqual(besidesWrites(outcome.effects));
  });

  it('closes a piece’s companions with it where nothing closed them on the way', () => {
    const on = table({ order: ['a', 'm', 'b'], companionsOf: (id) => (id === 'a' ? ['m'] : []) });
    const up = press(IDLE, 2, on);
    const held = room(up, (_, round) => round);

    const outcome = roundNext(up, on, held.live);

    expect(held.round().acted).toEqual(['a', 'm']);
    expect(done(outcome)).toContain('ground:turnEnd:m');
  });
});
