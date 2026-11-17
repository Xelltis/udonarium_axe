import type { AgentEvent } from '@axe/application/agent/agent-event-log.service';
import { type AiGmWakeContext, aiGmWakeOf } from '@axe/features/ai-gm/ai-gm-wake';

function line(set: Partial<Extract<AgentEvent, { kind: 'chat' }>> = {}): AgentEvent {
  return {
    kind: 'chat',
    id: 'm1',
    tab: 'main',
    time: 1,
    speaker: 'アリス',
    seat: 'プレイヤー1',
    text: '扉を開けます',
    by_ai: false,
    ...set,
  };
}

describe('aiGmWakeOf', () => {
  // Lines are told apart by who sent them and to whom, not by seat names, which two seats may share.
  const answering: AiGmWakeContext = {
    mode: 'respond',
    callName: 'GM',
    saidHere: (id) => id === 'mine',
    whisperedHere: (id) => id === 'to-me',
    tabs: [],
    runsPiece: (id) => id === 'goblin',
  };
  const called: AiGmWakeContext = { ...answering, mode: 'called' };

  it('answers a person’s line in a tab it listens to, when it answers every line', () => {
    expect(aiGmWakeOf(line(), answering)).toBe('line');
    expect(aiGmWakeOf(line(), { ...answering, tabs: ['main'] })).toBe('line');
    expect(aiGmWakeOf(line({ tab: 'chatter' }), { ...answering, tabs: ['main'] })).toBeUndefined();
    expect(aiGmWakeOf(line(), called)).toBeUndefined();
  });

  it('is called by its name in any case, or by a whisper to its seat, whichever way it answers', () => {
    for (const context of [answering, called]) {
      expect(aiGmWakeOf(line({ text: 'gm、質問です' }), context)).toBe('called');
      expect(aiGmWakeOf(line({ id: 'to-me', to: ['プレイヤー'] }), context)).toBe('called');
      expect(aiGmWakeOf(line({ text: 'gm、質問です', tab: 'chatter' }), { ...context, tabs: ['main'] })).toBe('called');
    }
    expect(aiGmWakeOf(line({ text: 'GMさん' }), { ...called, callName: ' ' })).toBeUndefined();
  });

  it('takes the turn of a piece it runs, and of no other', () => {
    const turn = (id: string | null): AgentEvent => ({
      kind: 'turn',
      round: 1,
      phase: 'acting',
      current: id ? { id, name: id } : null,
    });
    expect(aiGmWakeOf(turn('goblin'), called)).toBe('turn');
    expect(aiGmWakeOf(turn('alice'), answering)).toBeUndefined();
    expect(aiGmWakeOf(turn(null), answering)).toBeUndefined();
  });

  it('is called by nothing it said itself, the table put out, or the person at its own seat said', () => {
    expect(aiGmWakeOf(line({ by_ai: true, text: 'GMです' }), answering)).toBeUndefined();
    expect(aiGmWakeOf(line({ system: true, seat: undefined }), answering)).toBeUndefined();
    expect(aiGmWakeOf(line({ seat: undefined }), answering)).toBeUndefined();
    expect(aiGmWakeOf(line({ id: 'mine', text: 'GM補足' }), answering)).toBeUndefined();
    // Another seat of the same name as the game master's is a player all the same.
    expect(aiGmWakeOf(line({ seat: 'プレイヤー' }), answering)).toBe('line');
    expect(aiGmWakeOf({ kind: 'seat_joined', seat: 'ボブ' }, answering)).toBeUndefined();
  });
});
