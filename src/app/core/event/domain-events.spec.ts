import {
  alarmPop$,
  alarmTimeUp$,
  callDiceThrow,
  diceThrow$,
  emitAlarmPop,
  emitAlarmTimeUp,
  emitFinishVote,
  emitMessageAdded,
  emitSelectFile,
  emitSelectGameTable,
  emitSendMessage,
  emitStartCutIn,
  emitStopCutInByBgm,
  finishVote$,
  messageAdded$,
  selectFile$,
  selectGameTable$,
  sendMessage$,
  startCutIn$,
  stopCutInByBgm$,
} from '@axe/core/event/domain-events';
import { localDispatch } from '@axe/core/network/network-messaging';

describe('domain-events emit→subscribe wiring', () => {
  it('sends a message onto its channel', () => {
    const received: unknown[] = [];
    const unsub = sendMessage$.subscribe((e) => received.push(e));
    emitSendMessage({ messageIdentifier: 'm1', messageTarget: null });
    unsub();
    expect(received).toEqual([{ messageIdentifier: 'm1', messageTarget: null }]);
  });

  it('sends a table selection onto its channel', () => {
    const received: unknown[] = [];
    const unsub = selectGameTable$.subscribe((e) => received.push(e));
    emitSelectGameTable({ identifier: 'table-1' });
    unsub();
    expect(received).toEqual([{ identifier: 'table-1' }]);
  });

  it('sends an added message onto its channel', () => {
    const received: unknown[] = [];
    const unsub = messageAdded$.subscribe((e) => received.push(e));
    emitMessageAdded({ tabIdentifier: 't1', messageIdentifier: 'm1' });
    unsub();
    expect(received).toHaveLength(1);
  });

  it('sends a cut-in start onto its channel', () => {
    const received: unknown[] = [];
    const unsub = startCutIn$.subscribe((e) => received.push(e));
    emitStartCutIn({ cutIn: { identifier: 'c1' } });
    unsub();
    expect(received).toHaveLength(1);
  });

  it('triggers the music-stopped channel with nothing to carry', () => {
    let count = 0;
    const unsub = stopCutInByBgm$.subscribe(() => count++);
    emitStopCutInByBgm();
    emitStopCutInByBgm();
    unsub();
    expect(count).toBe(2);
  });

  it('sends a finished vote onto its channel', () => {
    const received: unknown[] = [];
    const unsub = finishVote$.subscribe((e) => received.push(e));
    const result = {
      isRollCall: true,
      voteTitle: '点呼',
      voted: 2,
      total: 2,
      abstained: 0,
      unanswered: 0,
      tally: [],
    };
    emitFinishVote(result);
    unsub();
    expect(received).toEqual([result]);
  });

  it('sends each alarm event onto its own channel', () => {
    const timeUp: unknown[] = [];
    const pop: unknown[] = [];
    const u1 = alarmTimeUp$.subscribe((e) => timeUp.push(e));
    const u2 = alarmPop$.subscribe((e) => pop.push(e));
    emitAlarmTimeUp({ text: 'ring' });
    emitAlarmPop({ title: 'pop', time: 1000 });
    u1();
    u2();
    expect(timeUp).toEqual([{ text: 'ring' }]);
    expect(pop).toEqual([{ title: 'pop', time: 1000 }]);
  });

  it('sends a file selection onto its channel', () => {
    const received: unknown[] = [];
    const unsub = selectFile$.subscribe((e) => received.push(e));
    emitSelectFile({ fileIdentifier: 'file-1' });
    unsub();
    expect(received).toEqual([{ fileIdentifier: 'file-1' }]);
  });

  it('delivers nothing once unsubscribed', () => {
    let count = 0;
    const unsub = sendMessage$.subscribe(() => count++);
    emitSendMessage({ messageIdentifier: 'a', messageTarget: null });
    unsub();
    emitSendMessage({ messageIdentifier: 'b', messageTarget: null });
    expect(count).toBe(1);
  });

  it('throws the dice of a roll on this device alone when asked to keep it here', () => {
    const received: unknown[] = [];
    const unsub = diceThrow$.subscribe((e) => received.push(e));
    callDiceThrow({ messageIdentifier: 'answer-1', speakerIdentifier: 'goblin' }, 'here');
    callDiceThrow({ messageIdentifier: 'answer-2' }, 'here');
    unsub();
    expect(received).toEqual([
      { messageIdentifier: 'answer-1', speakerIdentifier: 'goblin' },
      { messageIdentifier: 'answer-2', speakerIdentifier: '' },
    ]);
  });

  it('passes over a dice throw that names no line', () => {
    const received: unknown[] = [];
    const unsub = diceThrow$.subscribe((e) => received.push(e));
    localDispatch('DICE_THROW', { messageIdentifier: 42 });
    localDispatch('DICE_THROW', null);
    unsub();
    expect(received).toEqual([]);
  });
});
