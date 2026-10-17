import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { diceBotUnreachable$, emitDiceRolled, serverRollUnanswered$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { markLoadedWithheld } from '@axe/domain/peer/withheld-table';
import { DiceChatEventHandlerService } from '@axe/features/dice/dice-chat-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceChatEventHandlerService', () => {
  let tab: ChatTab;
  const created: { destroy(): void }[] = [];

  const SELF_USER_ID = 'me';

  /** Whose line it is comes from the user on the peer context, pinned so nothing around it can sway the answer. */
  function fixPeerContext(): void {
    const self = {
      peerId: 'peer-self',
      userId: SELF_USER_ID,
      roomId: '',
      roomName: '',
      password: '',
      digestUserId: '',
      digestRoomName: '',
      digestPassword: '',
      isOpen: true,
      isRoom: false,
      hasPassword: false,
      session: { grade: PeerSessionGrade.UNSPECIFIED, name: '', isVisitor: false },
    } as unknown as IPeerContext;
    setPeerContextProvider({ peerContext: self, peerContexts: [self], peerIds: [self.peerId], peerId: self.peerId });
  }

  function makeCharacter(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.location.name = 'table';
    created.push(character);
    return character;
  }

  function makeDice(owner: GameCharacter | null, type = DiceType.D6): DiceSymbol {
    const dice = DiceSymbol.create('ダイス', type, 1);
    dice.location.name = 'table';
    if (owner) dice.ownerCharacterIdentifier = owner.identifier;
    created.push(dice);
    return dice;
  }

  function roll(
    text: string,
    faces: { sides: number; value: number }[],
    options: { from?: string; sendFrom?: string } = {}
  ): void {
    const from = options.from ?? SELF_USER_ID;
    const source = tab.addMessage({
      from,
      originFrom: from,
      sendFrom: options.sendFrom ?? '',
      text,
      timestamp: 1,
      imageIdentifier: '',
      tag: '',
      name: 'わたし',
    });
    const result = tab.addMessage({
      from: 'System-BCDice',
      originFrom: from,
      text: '→ 8',
      timestamp: 2,
      imageIdentifier: '',
      tag: 'system',
      name: '<BCDice>',
      dicebot: encodeDiceRollDetail({
        system: 'DiceBot',
        outcome: '',
        faces: faces.map((face) => ({ ...face, kind: 'normal' })),
      }),
    });
    emitDiceRolled({ sourceMessageIdentifier: source.identifier, resultMessageIdentifier: result.identifier });
  }

  beforeEach(() => {
    fixPeerContext();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = SELF_USER_ID;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(DiceChatEventHandlerService);

    tab = new ChatTab();
    tab.initialize();
    created.push(tab);
  });

  afterEach(() => {
    resetPeerContextProvider();
    for (const object of created.splice(0)) object.destroy();
    for (const message of ObjectStore.instance.getObjects<ChatMessage>(ChatMessage)) message.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
  });

  it('turns the dice of the piece the line names', () => {
    const goblin = makeCharacter('ゴブリンA');
    const first = makeDice(goblin);
    const second = makeDice(goblin);

    roll('2d6 dice:ゴブリンA', [
      { sides: 6, value: 3 },
      { sides: 6, value: 5 },
    ]);

    expect([first.face, second.face]).toEqual(['3', '5']);
  });

  it('leaves the dice of another piece alone', () => {
    const goblin = makeCharacter('ゴブリンA');
    const slime = makeCharacter('スライム');
    const theirs = makeDice(slime);
    const before = theirs.face;

    roll('2d6 dice:ゴブリンA', [{ sides: 6, value: 3 }]);
    makeDice(goblin);

    expect(theirs.face).toBe(before);
  });

  it('turns the dice of whoever spoke when the line names nobody', () => {
    const goblin = makeCharacter('ゴブリンA');
    const dice = makeDice(goblin);

    roll('2d6 dice:', [{ sides: 6, value: 4 }], { sendFrom: goblin.identifier });

    expect(dice.face).toBe('4');
  });

  it('turns nothing for a line that carries no notation', () => {
    const goblin = makeCharacter('ゴブリンA');
    const dice = makeDice(goblin);
    const before = dice.face;

    roll('2d6', [{ sides: 6, value: 4 }]);

    expect(dice.face).toBe(before);
  });

  it('turns nothing for a piece it does not know', () => {
    const goblin = makeCharacter('ゴブリンA');
    const dice = makeDice(goblin);
    const before = dice.face;

    roll('2d6 dice:だれか', [{ sides: 6, value: 4 }]);

    expect(dice.face).toBe(before);
  });

  it('turns nothing for a guest on a room server, which would take each face back', () => {
    const goblin = makeCharacter('ゴブリンA');
    const dice = makeDice(goblin);
    const before = dice.face;
    PeerCursor.myCursor.role = PeerRole.Guest;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    try {
      roll('2d6 dice:ゴブリンA', [{ sides: 6, value: 4 }]);

      expect(dice.face).toBe(before);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('passes over a die whose face a room server keeps from this user, for the next to take the roll', () => {
    const goblin = makeCharacter('ゴブリンA');
    const hidden = makeDice(goblin);
    hidden.owner = 'someone-else';
    const before = hidden.face;
    const shown = makeDice(goblin);
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    try {
      roll('1d6 dice:ゴブリンA', [{ sides: 6, value: 4 }]);

      expect(hidden.face).toBe(before);
      expect(shown.face).toBe('4');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('turns a die that only lacks its face, which nobody would put back', () => {
    const goblin = makeCharacter('ゴブリンA');
    const faceless = makeDice(goblin);
    faceless.face = '';
    markLoadedWithheld(true, false);
    try {
      roll('1d6 dice:ゴブリンA', [{ sides: 6, value: 4 }]);

      expect(faceless.face).toBe('4');
    } finally {
      markLoadedWithheld(false, false);
    }
  });

  it('turns nothing on a roll from somebody else', () => {
    // The faces are synchronised, so the sender's own end is the one that sets them.
    const goblin = makeCharacter('ゴブリンA');
    const dice = makeDice(goblin);
    const before = dice.face;

    roll('2d6 dice:ゴブリンA', [{ sides: 6, value: 4 }], { from: 'somebody-else' });

    expect(dice.face).toBe(before);
  });

  it('passes over a die that cannot show what was rolled', () => {
    const goblin = makeCharacter('ゴブリンA');
    const twenty = makeDice(goblin, DiceType.D20);
    const before = twenty.face;

    roll('1d6 dice:ゴブリンA', [{ sides: 6, value: 4 }]);

    expect(twenty.face).toBe(before);
  });

  describe('a line whose game system could not be fetched', () => {
    it('is pointed out once, to the sender alone, in the tab it was sent to', () => {
      const tell = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageOnePlayer')
        .mockReturnValue(null as unknown as ChatMessage);
      const line = tab.addMessage({
        from: SELF_USER_ID,
        text: 'CC<=50',
        timestamp: 1,
        imageIdentifier: '',
        tag: 'Cthulhu7th',
        name: 'わたし',
      });

      diceBotUnreachable$.emit({ messageIdentifier: line.identifier, gameType: 'Cthulhu7th' });
      diceBotUnreachable$.emit({ messageIdentifier: line.identifier, gameType: 'Cthulhu7th' });

      expect(tell).toHaveBeenCalledOnce();
      const [where, text, to] = tell.mock.calls[0];
      expect(where).toBe(tab);
      expect(text).toContain('feature.chat.diceBot.unreachable');
      expect(to).toBe(PeerCursor.myCursor.identifier);
      tell.mockRestore();
    });
  });

  describe('a line the room server did not roll', () => {
    it('is pointed out once for all its targets, to the sender alone, with the reason', () => {
      const tell = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageOnePlayer')
        .mockReturnValue(null as unknown as ChatMessage);
      const line = tab.addMessage({ from: SELF_USER_ID, text: '2d6', timestamp: 1, tag: 'DiceBot', name: 'わたし' });

      serverRollUnanswered$.emit({ messageIdentifier: line.identifier, reason: 'busy' });
      serverRollUnanswered$.emit({ messageIdentifier: line.identifier, reason: 'busy' });
      serverRollUnanswered$.emit({ messageIdentifier: line.identifier, reason: 'something-new' });

      expect(tell.mock.calls.map(([where, text, to]) => [where, text, to])).toEqual([
        [
          tab,
          expect.stringContaining('feature.chat.diceBot.serverRollUnanswered.busy'),
          PeerCursor.myCursor.identifier,
        ],
        [
          tab,
          expect.stringContaining('feature.chat.diceBot.serverRollUnanswered.failed'),
          PeerCursor.myCursor.identifier,
        ],
      ]);
      tell.mockRestore();
    });

    it('tells a seat that may not speak in the tab at the bottom of the screen, where nothing is taken back', () => {
      const tell = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageOnePlayer');
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      const line = tab.addMessage({ from: SELF_USER_ID, text: '2d6', timestamp: 1, tag: 'DiceBot', name: 'わたし' });

      serverRollUnanswered$.emit({ messageIdentifier: line.identifier, reason: 'not-allowed' });

      expect(tell).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledOnce();
      tell.mockRestore();
      show.mockRestore();
    });

    it('still tells a seat refused for its tab once the server has taken the asking line back', () => {
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      const line = tab.addMessage({ from: SELF_USER_ID, text: '2d6', timestamp: 1, tag: 'DiceBot', name: 'わたし' });
      const identifier = line.identifier;
      line.destroy();

      serverRollUnanswered$.emit({ messageIdentifier: identifier, reason: 'not-allowed' });
      serverRollUnanswered$.emit({ messageIdentifier: identifier, reason: 'not-allowed' });

      expect(show).toHaveBeenCalledOnce();
      show.mockRestore();
    });
  });
});
