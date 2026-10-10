import { TestBed } from '@angular/core/testing';
import { diceThrow$, DiceThrowEvent, emitDiceRolled } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { Config } from '@axe/domain/peer/config';
import { DiceThrowEventHandlerService } from '@axe/features/dice/dice-throw-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const ME = 'me';

describe('DiceThrowEventHandlerService', () => {
  let tab: ChatTab;
  let stageBefore: DiceStage;
  let sent: { eventName: string; data: unknown }[];
  let here: DiceThrowEvent[];
  let stopListening: () => void;

  function fixPeerContext(): void {
    const self = {
      peerId: 'peer-self',
      userId: ME,
      session: { grade: PeerSessionGrade.UNSPECIFIED, name: '', isVisitor: false },
    } as unknown as IPeerContext;
    setPeerContextProvider({ peerContext: self, peerContexts: [self], peerIds: [self.peerId], peerId: self.peerId });
  }

  function roll(options: { from?: string; secret?: boolean; sides?: number; speaker?: string } = {}): ChatMessage {
    const from = options.from ?? ME;
    const source = tab.addMessage({
      from,
      sendFrom: options.speaker ?? '',
      text: '1d20',
      timestamp: Date.now(),
      imageIdentifier: '',
      tag: '',
      name: 'わたし',
    });
    const answer = tab.addMessage({
      from: 'System-BCDice',
      originFrom: from,
      text: '→ 8',
      timestamp: Date.now(),
      imageIdentifier: '',
      tag: options.secret ? 'system secret' : 'system',
      name: '<BCDice>',
      dicebot: encodeDiceRollDetail({
        system: 'DiceBot',
        outcome: '',
        faces: [{ sides: options.sides ?? 20, value: 8, kind: 'normal' }],
      }),
    });
    emitDiceRolled({ sourceMessageIdentifier: source.identifier, resultMessageIdentifier: answer.identifier });
    return answer;
  }

  beforeEach(() => {
    fixPeerContext();
    stageBefore = Config.instance.diceStage;
    Config.instance.diceStage = 'frame';
    sent = [];
    here = [];
    vi.spyOn(Network.instance, 'send').mockImplementation((context) => {
      const { eventName, data } = context as { eventName: string; data: unknown };
      // Objects made here go out on the same line; only the call to throw is looked at.
      if (eventName === 'DICE_THROW') sent.push({ eventName, data });
    });
    stopListening = diceThrow$.subscribe((event) => here.push(event));
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(DiceThrowEventHandlerService);
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    stopListening();
    vi.restoreAllMocks();
    Config.instance.diceStage = stageBefore;
    resetPeerContextProvider();
    tab.destroy();
    for (const message of ObjectStore.instance.getObjects<ChatMessage>(ChatMessage)) message.destroy();
  });

  it('tells the room to throw the dice of a roll made here', () => {
    const answer = roll();

    expect(sent).toEqual([
      { eventName: 'DICE_THROW', data: { messageIdentifier: answer.identifier, speakerIdentifier: '' } },
    ]);
    expect(here).toEqual([]);
  });

  it('throws a secret roll here alone, telling nobody', () => {
    const answer = roll({ secret: true });

    expect(sent).toEqual([]);
    expect(here).toEqual([{ messageIdentifier: answer.identifier, speakerIdentifier: '' }]);
  });

  it('names the piece that spoke the roll, so the dice can be thrown before it', () => {
    const answer = roll({ speaker: 'goblin-piece' });

    expect(sent).toEqual([
      { eventName: 'DICE_THROW', data: { messageIdentifier: answer.identifier, speakerIdentifier: 'goblin-piece' } },
    ]);
  });

  it('says nothing while the room shows no dice', () => {
    Config.instance.diceStage = 'off';

    roll();

    expect(sent).toEqual([]);
    expect(here).toEqual([]);
  });

  it('says nothing for a roll with no dice to throw', () => {
    roll({ sides: 7 });

    expect(sent).toEqual([]);
  });

  it('leaves a roll made by somebody else to them', () => {
    roll({ from: 'someone-else' });

    expect(sent).toEqual([]);
    expect(here).toEqual([]);
  });
});
