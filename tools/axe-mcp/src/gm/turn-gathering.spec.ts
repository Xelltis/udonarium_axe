import { type GatheredTurn, TurnGathering } from './turn-gathering';

const LINE = { kind: 'chat', id: 'm1', text: '扉を開けます' };
/** Lets the time given pass on the clock the gathering waits by, which is stood in for: a wait is to the millisecond. */
const pause = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('TurnGathering', () => {
  let takeable: boolean;
  let taken: GatheredTurn[];
  let gathering: TurnGathering;

  beforeEach(() => {
    vi.useFakeTimers();
    takeable = true;
    taken = [];
    gathering = new TurnGathering({
      quietMs: 40,
      longestWaitMs: 150,
      mayTake: () => takeable,
      due: () => {
        const turn = gathering.take();
        if (turn) taken.push(turn);
      },
    });
  });

  afterEach(() => {
    gathering.clear();
    vi.useRealTimers();
  });

  it('is due once the room has been quiet after something that calls for a turn, with all that happened', async () => {
    gathering.heard([{ event: { kind: 'piece_moved' } }]);
    await pause(80);
    expect(taken).toEqual([]);

    gathering.heard([{ event: LINE, wake: 'line' }]);
    expect(gathering.pending).toBe(true);
    await pause(20);
    expect(taken).toEqual([]);
    await pause(60);

    expect(taken).toEqual([{ reasons: ['line'], events: [{ kind: 'piece_moved' }, LINE], direction: '' }]);
    expect(gathering.pending).toBe(false);
  });

  it('waits for quiet again each time the room speaks, but no longer than the longest a turn waits', async () => {
    gathering.heard([{ event: LINE, wake: 'line' }]);
    for (let said = 0; said < 8; said++) {
      await pause(25);
      gathering.heard([{ event: { kind: 'chat', id: `n${said}` } }]);
      if (said < 3) expect(taken).toEqual([]);
    }
    await pause(60);

    expect(taken).toHaveLength(1);
    expect(taken[0].events.length).toBeGreaterThan(4);
  });

  it('is due at once when the person at the seat asks, their words kept together', async () => {
    gathering.nudged('次の場面へ');
    gathering.nudged('  ');
    gathering.nudged('急いで');
    await pause(10);

    expect(taken).toEqual([{ reasons: ['nudge'], events: [], direction: '次の場面へ\n急いで' }]);
  });

  it('keeps a turn that fell due while none may be taken, and tells of it when looked at again', async () => {
    takeable = false;
    gathering.heard([{ event: LINE, wake: 'called' }]);
    await pause(80);
    expect(gathering.isDue).toBe(true);
    expect(gathering.take()).toBeNull();

    takeable = true;
    gathering.lookAgain();
    expect(taken).toEqual([{ reasons: ['called'], events: [LINE], direction: '' }]);
  });

  it('has a turn that was due wait for quiet once more when the room speaks again before it is taken', async () => {
    takeable = false;
    gathering.heard([{ event: LINE, wake: 'line' }]);
    await pause(80);
    expect(gathering.isDue).toBe(true);

    gathering.heard([{ event: { kind: 'chat', id: 'm2' } }]);
    takeable = true;
    gathering.lookAgain();
    expect(gathering.isDue).toBe(false);
    expect(taken).toEqual([]);
    await pause(39);
    expect(taken).toEqual([]);
    await pause(1);
    expect(taken).toHaveLength(1);
    expect(taken[0].events).toEqual([LINE, { kind: 'chat', id: 'm2' }]);
  });

  it('waits on nothing once a turn is taken: what calls for the next is waited on in its turn', async () => {
    gathering.heard([{ event: LINE, wake: 'line' }]);
    await pause(40);
    expect(taken.splice(0)).toHaveLength(1);
    await pause(1000);
    expect(taken).toEqual([]);

    gathering.heard([{ event: { ...LINE, id: 'm3' }, wake: 'line' }]);
    await pause(39);
    expect(taken).toEqual([]);
    await pause(1);
    expect(taken).toEqual([{ reasons: ['line'], events: [{ ...LINE, id: 'm3' }], direction: '' }]);
  });

  it('puts a turn given up back to be taken again, what it carried told once only', async () => {
    gathering.heard([{ event: LINE, wake: 'line' }]);
    await pause(80);
    const [first] = taken.splice(0);
    gathering.heard([{ event: { kind: 'chat', id: 'm2' } }]);

    gathering.putBack(first, false);
    gathering.lookAgain();
    await pause(80);
    expect(taken.splice(0)).toEqual([{ reasons: ['line'], events: [LINE, { kind: 'chat', id: 'm2' }], direction: '' }]);

    gathering.putBack(first, true);
    gathering.lookAgain();
    await pause(80);
    expect(taken).toEqual([{ reasons: ['line'], events: [], direction: '' }]);
  });

  it('keeps the latest two hundred events, and lets go of everything when cleared', async () => {
    takeable = false;
    gathering.heard(Array.from({ length: 230 }, (_, at) => ({ event: { at } })));
    gathering.heard([{ event: LINE, wake: 'line' }]);
    await pause(80);
    takeable = true;
    const turn = gathering.take()!;
    expect(turn.events).toHaveLength(200);
    expect(turn.events.at(-1)).toEqual(LINE);

    gathering.nudged('やめ');
    gathering.clear();
    await pause(20);
    expect(gathering.pending).toBe(false);
    expect(taken).toEqual([]);
  });
});
