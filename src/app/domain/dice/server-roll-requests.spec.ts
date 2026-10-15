import { MAX_ROLLS_PER_WINDOW } from '@axe/core/network/server/server-protocol';
import {
  ROLL_PACE_WINDOW_MS,
  SERVER_ROLL_WAIT_MS,
  ServerRollHooks,
  ServerRollRequests,
} from '@axe/domain/dice/server-roll-requests';

describe('ServerRollRequests', () => {
  let sent: string[];
  let answered: [string, string][];
  let unanswered: [string, string][];
  let requests: ServerRollRequests;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    sent = [];
    answered = [];
    unanswered = [];
    const hooks: ServerRollHooks = {
      send: (request) => sent.push(request['id'] as string),
      answered: (answer, source) => answered.push([answer, source]),
      unanswered: (source, reason) => unanswered.push([source, reason]),
    };
    requests = new ServerRollRequests(hooks);
  });

  afterEach(() => {
    requests.clear();
    vi.useRealTimers();
  });

  const ask = (answer: string, source = 'line') => requests.ask(answer, source, { id: answer });

  it('sends a roll at once and takes its answer as a roll made here', () => {
    ask('answer-1');
    requests.arrived('answer-1');
    requests.arrived('somebody-else');

    expect(sent).toEqual(['answer-1']);
    expect(answered).toEqual([['answer-1', 'line']]);
    expect(requests.size).toBe(0);
  });

  it('sends no more rolls in a window than the server takes, and the rest once there is room', () => {
    const many = Array.from({ length: MAX_ROLLS_PER_WINDOW + 5 }, (_, i) => `answer-${i}`);
    for (const answer of many) ask(answer);

    expect(sent).toEqual(many.slice(0, MAX_ROLLS_PER_WINDOW));

    vi.advanceTimersByTime(ROLL_PACE_WINDOW_MS - 1);
    expect(sent).toHaveLength(MAX_ROLLS_PER_WINDOW);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(many);
  });

  it('tells of a roll the server would not make, but not of a line that is no command', () => {
    ask('answer-1', 'line-1');
    ask('answer-2', 'line-2');

    requests.rejected('answer-1', 'not-allowed');
    requests.rejected('answer-2', 'not-a-command');
    requests.arrived('answer-1');

    expect(unanswered).toEqual([['line-1', 'not-allowed']]);
    expect(answered).toEqual([]);
    expect(requests.size).toBe(0);
  });

  it('tells of a roll no answer came to in time, once', () => {
    ask('answer-1');

    vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS);
    requests.arrived('answer-1');

    expect(unanswered).toEqual([['line', 'timeout']]);
    expect(answered).toEqual([]);
  });

  it('asks again for what is unanswered on getting back in, waiting afresh', () => {
    ask('answer-1');
    ask('answer-2');
    requests.arrived('answer-1');
    vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS - 1000);

    requests.askAgain();
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual(['answer-1', 'answer-2', 'answer-2']);
    expect(unanswered).toEqual([]);
    requests.arrived('answer-2');
    expect(answered.map(([answer]) => answer)).toEqual(['answer-1', 'answer-2']);
  });

  it('asks again over a connection counted afresh, still no faster than the server takes them', () => {
    const many = Array.from({ length: MAX_ROLLS_PER_WINDOW + 1 }, (_, i) => `answer-${i}`);
    for (const answer of many) ask(answer);
    sent = [];

    requests.askAgain();

    expect(sent).toEqual(many.slice(0, MAX_ROLLS_PER_WINDOW));
    vi.advanceTimersByTime(ROLL_PACE_WINDOW_MS);
    expect(sent).toEqual(many);
  });

  it('forgets everything without a word on leaving the room', () => {
    ask('answer-1');
    for (let i = 2; i < MAX_ROLLS_PER_WINDOW + 3; i++) ask(`answer-${i}`);

    requests.clear();
    vi.advanceTimersByTime(SERVER_ROLL_WAIT_MS);
    requests.arrived('answer-1');

    expect(sent).toHaveLength(MAX_ROLLS_PER_WINDOW);
    expect(answered).toEqual([]);
    expect(unanswered).toEqual([]);
  });
});
