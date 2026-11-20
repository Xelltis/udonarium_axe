import { TestBed } from '@angular/core/testing';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceRollService', () => {
  let service: DiceRollService;
  let sendSystemMessage: ReturnType<typeof vi.fn>;
  let sendSecret: ReturnType<typeof vi.fn>;
  let sendToThrower: ReturnType<typeof vi.fn>;
  const created: { destroy(): void }[] = [];

  function makeDice(name: string, type = DiceType.D6): DiceSymbol {
    const dice = DiceSymbol.create(name, type, 1);
    dice.location.name = 'table';
    created.push(dice);
    return dice;
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.name = 'わたし';
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(DiceRollService);
    sendSystemMessage = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage')
      .mockReturnValue(null as unknown as ChatMessage) as unknown as ReturnType<typeof vi.fn>;
    sendSecret = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSecretSystemMessageToMainTab')
      .mockReturnValue(null as unknown as ChatMessage) as unknown as ReturnType<typeof vi.fn>;
    sendToThrower = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageOnePlayer')
      .mockReturnValue(null as unknown as ChatMessage) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of created.splice(0)) object.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
  });

  it('leaves the result on the die', () => {
    const dice = makeDice('ダイスA');

    const [rolled] = service.roll([dice]);

    expect(dice.faces).toContain(rolled.face);
    expect(dice.face).toBe(rolled.face);
  });

  it('says what one die showed', () => {
    const dice = makeDice('ダイスA');

    service.roll([dice]);

    expect(sendSystemMessage).toHaveBeenCalledOnce();
    const text = sendSystemMessage.mock.calls[0][0] as string;
    expect(text).toContain('わたし');
    expect(text).toContain('ダイスA');
    expect(text).toContain(dice.face);
  });

  describe('a die that is somebody’s alone', () => {
    /** A die of my own is one only I can read, which is what makes throwing it a secret. */
    function myOwnDie(name: string): DiceSymbol {
      const mine = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: mine, peerContexts: [mine], peerIds: ['me'], peerId: 'me' });
      const dice = makeDice(name);
      dice.owner = 'me';
      return dice;
    }

    it('keeps the name and the face out of the open line', () => {
      const dice = myOwnDie('隠しダイス');

      service.roll([dice]);

      expect(sendSystemMessage).not.toHaveBeenCalled();
      expect(sendSecret).toHaveBeenCalledOnce();
      const text = sendSecret.mock.calls[0][0] as string;
      expect(text).toContain('隠しダイス');
      expect(text).toContain(dice.face);
    });

    it('sends the secret line as the one who threw it, so only they read it', () => {
      const dice = myOwnDie('隠しダイス');

      service.roll([dice]);

      expect(sendSecret.mock.calls[0][1]).toBe('me');
    });

    it('still throws it, and still hands the face back to the table', () => {
      const dice = myOwnDie('隠しダイス');

      const [rolled] = service.roll([dice]);

      expect(dice.faces).toContain(rolled.face);
    });

    it('ties the secret line to the die it was thrown from', () => {
      const dice = myOwnDie('隠しダイス');

      service.roll([dice]);

      expect(sendSecret.mock.calls[0][2]).toEqual([dice.identifier]);
    });

    it('sends a handful thrown in secret as one line for each die', () => {
      const first = myOwnDie('隠しダイスA');
      const second = myOwnDie('隠しダイスB');

      service.roll([first, second]);

      expect(sendSecret).toHaveBeenCalledTimes(2);
      expect(sendSecret.mock.calls[0][2]).toEqual([first.identifier]);
      expect(sendSecret.mock.calls[1][2]).toEqual([second.identifier]);
    });

    it('keeps each of those lines to the face of its own die', () => {
      // Opening one die opens the line it belongs to, so a line holding two faces gives away the other.
      const first = myOwnDie('隠しダイスA');
      const second = myOwnDie('隠しダイスB');

      service.roll([first, second]);

      const lines = sendSecret.mock.calls.map((call) => call[0] as string);
      expect(lines[0]).toContain('隠しダイスA');
      expect(lines[0]).not.toContain('隠しダイスB');
      expect(lines[1]).toContain('隠しダイスB');
      expect(lines[1]).not.toContain('隠しダイスA');
    });

    it('lets one of them be opened without giving away the other', () => {
      const tab = ChatTabList.instance.addChatTab('メインタブ');
      created.push(tab);
      TestBed.inject(ActiveChatTabService).set(tab.identifier);
      const first = myOwnDie('隠しダイスA');
      const second = myOwnDie('隠しダイスB');
      service.roll([first, second]);

      TestBed.inject(ChatLineEditService).discloseDieRolls(first.identifier);

      const stillSecret = tab.chatMessages.filter((message) => message.isSecret);
      expect(stillSecret.map((message) => message.text)).toEqual([
        expect.stringContaining('隠しダイスB') as unknown as string,
      ]);
      const opened = tab.chatMessages.filter((message) => !message.isSecret);
      expect(opened.map((message) => message.text).join('\n')).not.toContain('隠しダイスB');
    });

    it('splits a handful, sending the open ones in the open and the rest in secret', () => {
      const hidden = myOwnDie('隠しダイス');
      const open = makeDice('見えるダイス');

      service.roll([open, hidden]);

      expect(sendSystemMessage).toHaveBeenCalledOnce();
      expect(sendSystemMessage.mock.calls[0][0]).toContain('見えるダイス');
      expect(sendSystemMessage.mock.calls[0][0]).not.toContain('隠しダイス');
      expect(sendSecret).toHaveBeenCalledOnce();
      expect(sendSecret.mock.calls[0][0]).toContain('隠しダイス');
    });
  });

  it('gathers a handful into one line', () => {
    const dice = [makeDice('A'), makeDice('B'), makeDice('C', DiceType.D20)];

    const rolled = service.roll(dice);

    expect(rolled).toHaveLength(3);
    expect(sendSystemMessage).toHaveBeenCalledOnce();
    const text = sendSystemMessage.mock.calls[0][0] as string;
    for (const die of dice) expect(text).toContain(die.face);
  });

  it('adds the faces up in that line', () => {
    const dice = [makeDice('A'), makeDice('B')];

    const rolled = service.roll(dice);

    const total = rolled.reduce((sum, die) => sum + Number(die.face), 0);
    expect(sendSystemMessage.mock.calls[0][0] as string).toContain(String(total));
  });

  it('throws nothing it cannot see', () => {
    // Somebody else's hidden die keeps its face, and says nothing.
    const mine = makeDice('わたしの');
    const theirs = makeDice('ひとの');
    theirs.owner = 'somebody-else';
    const before = theirs.face;

    const rolled = service.roll([mine, theirs]);

    expect(rolled).toHaveLength(1);
    expect(theirs.face).toBe(before);
  });

  describe('the dice left standing', () => {
    function theirDie(name: string): DiceSymbol {
      const dice = makeDice(name);
      dice.owner = 'somebody-else';
      return dice;
    }

    beforeEach(() => {
      created.push(ChatTabList.instance.addChatTab('メインタブ'));
    });

    it('tells the thrower how many were left out of a handful', () => {
      service.roll([makeDice('わたしの'), theirDie('ひとの')]);

      expect(sendToThrower).toHaveBeenCalledOnce();
      expect(sendToThrower.mock.calls[0][1] as string).toContain('1');
      expect(sendToThrower.mock.calls[0][2]).toBe(PeerCursor.myCursor.identifier);
    });

    it('says it in one line when nothing could be thrown at all', () => {
      service.roll([theirDie('ひとの'), theirDie('もうひとつ')]);

      expect(sendToThrower).toHaveBeenCalledOnce();
      expect(sendToThrower.mock.calls[0][1] as string).toContain('2');
    });

    it('keeps the notice out of the script novel mode reads', () => {
      service.roll([theirDie('ひとの')]);

      expect(sendToThrower.mock.calls[0][4]).toBe(true);
    });

    it('says nothing when every die was thrown', () => {
      service.roll([makeDice('わたしの')]);

      expect(sendToThrower).not.toHaveBeenCalled();
    });
  });

  it('says nothing when there is nothing to throw', () => {
    const theirs = makeDice('ひとの');
    theirs.owner = 'somebody-else';

    expect(service.roll([theirs])).toEqual([]);
    expect(sendSystemMessage).not.toHaveBeenCalled();
  });

  describe('where the result goes', () => {
    it('reports into the tab being read', () => {
      // A die on the table is a die like any other, and its result is of no use in a tab nobody is reading.
      const tab = new ChatTab();
      tab.name = '雑談';
      tab.initialize();
      created.push(tab);
      TestBed.inject(ActiveChatTabService).set(tab.identifier);
      const toTab = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToTab')
        .mockReturnValue(null as unknown as ChatMessage);

      service.roll([makeDice('ダイスA')]);

      expect(toTab).toHaveBeenCalledOnce();
      expect(toTab.mock.calls[0][0]).toBe(tab);
      expect(sendSystemMessage).not.toHaveBeenCalled();
    });

    it('falls back to the old destination with no window open', () => {
      service.roll([makeDice('ダイスA')]);

      expect(sendSystemMessage).toHaveBeenCalledOnce();
    });

    it('signs the result with whoever threw it', () => {
      const tab = new ChatTab();
      tab.initialize();
      created.push(tab);
      TestBed.inject(ActiveChatTabService).set(tab.identifier);
      const toTab = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToTab')
        .mockReturnValue(null as unknown as ChatMessage);

      service.roll([makeDice('ダイスA')]);

      expect(toTab.mock.calls[0][3]).toBe('me');
    });
  });

  it('starts the die rolling on the screen of whoever threw it', () => {
    // A network send does not come back, so the one who threw it would otherwise see nothing.
    const rolled: string[] = [];
    TestBed.inject(ObjectChangeService).rollDiceSymbol$.subscribe((event) => rolled.push(event.identifier));
    const dice = makeDice('ダイスA');

    service.roll([dice]);

    expect(rolled).toEqual([dice.identifier]);
  });

  describe('who may read, turn, show and keep a die', () => {
    let notice: ReturnType<typeof vi.fn>;
    let disclosed: ReturnType<typeof vi.fn>;

    function theirDie(name = 'ひとの'): DiceSymbol {
      const dice = makeDice(name);
      dice.owner = 'somebody-else';
      return dice;
    }

    beforeEach(() => {
      const mine = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: mine, peerContexts: [mine], peerIds: ['me'], peerId: 'me' });
      PeerCursor.myCursor.role = PeerRole.Player;
      notice = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice')
        .mockReturnValue(null) as unknown as ReturnType<typeof vi.fn>;
      disclosed = vi
        .spyOn(TestBed.inject(ChatLineEditService), 'discloseDieRolls')
        .mockReturnValue(0) as unknown as ReturnType<typeof vi.fn>;
    });

    it('reads and turns a die nobody keeps or this seat keeps, and not one another seat keeps', () => {
      const open = makeDice('みんなの');
      const mine = makeDice('わたしの');
      mine.owner = 'me';
      const theirs = theirDie();

      expect([open, mine, theirs].map((die) => service.readsFace(die))).toEqual([true, true, false]);
      expect([open, mine, theirs].map((die) => service.canTurn(die))).toEqual([true, true, false]);
      expect(service.showsName(theirs)).toBe(false);
    });

    it('lets the game master read and change a die another seat keeps, but not throw it, so the keeper opens its throws', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const theirs = theirDie();

      expect([service.readsFace(theirs), service.canChange(theirs), service.showsName(theirs)]).toEqual([
        true,
        true,
        true,
      ]);
      expect(service.canTurn(theirs)).toBe(false);
      expect(service.roll([theirs])).toEqual([]);
      expect(sendSecret).not.toHaveBeenCalled();
    });

    it('sets the face only of a die this seat may turn, and hides the name of one it may change', () => {
      const theirs = theirDie();
      theirs.face = '1';

      expect(service.setFace(theirs, '6')).toBe(false);
      expect(service.setNameHidden(theirs, true)).toBe(false);
      expect([theirs.face, theirs.hideName]).toEqual(['1', false]);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(service.setFace(theirs, '6')).toBe(false);
      expect(service.setNameHidden(theirs, true)).toBe(true);
      expect([theirs.face, theirs.hideName]).toEqual(['1', true]);
    });

    it('turns nothing for a guest', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      const open = makeDice('みんなの');

      expect(service.canTurn(open)).toBe(false);
      expect(service.roll([open])).toEqual([]);
      expect(service.setFace(open, '6')).toBe(false);
    });

    it('shows a kept die for its keeper, saying the face where no throw of it is left to open', () => {
      const mine = makeDice('わたしの');
      mine.owner = 'me';
      mine.face = '5';

      expect(service.reveal(theirDie())).toBe(false);
      expect(service.reveal(mine)).toBe(true);

      expect(mine.owner).toBe('');
      expect(disclosed).toHaveBeenCalledWith(mine.identifier);
      expect(notice).toHaveBeenCalledOnce();
      expect(notice.mock.calls[0][0]).toBe('diceReveal');
      expect(notice.mock.calls[0][1] as string).toContain('5');
    });

    it('says nothing more where a throw of it was opened, and lets the game master show any', () => {
      disclosed.mockReturnValue(1);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const theirs = theirDie();

      expect(service.reveal(theirs)).toBe(true);
      expect(theirs.owner).toBe('');
      expect(notice).not.toHaveBeenCalled();
      expect(service.reveal(theirs)).toBe(false);
    });

    it('keeps a die nobody keeps, and takes one another seat keeps for the game master alone', () => {
      const open = makeDice('みんなの');
      const theirs = theirDie();

      expect(service.keep(open)).toBe(true);
      expect(open.owner).toBe('me');
      expect(service.keep(open)).toBe(false);
      expect(service.keep(theirs)).toBe(false);
      expect(theirs.owner).toBe('somebody-else');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(service.keep(theirs)).toBe(true);
      expect(theirs.owner).toBe('me');
    });
  });

  describe('showing a die this seat kept', () => {
    let tab: ChatTab;
    let dice: DiceSymbol;

    beforeEach(() => {
      const mine = { userId: 'me' } as IPeerContext;
      setPeerContextProvider({ peerContext: mine, peerContexts: [mine], peerIds: ['me'], peerId: 'me' });
      tab = ChatTabList.instance.addChatTab('テストタブ');
      created.push(tab);
      dice = makeDice('隠しダイス');
      dice.owner = 'me';
      dice.face = '6';
    });

    it('opens the secret line it was thrown on', () => {
      const chat = TestBed.inject(ChatMessageService);
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, [dice.identifier]);

      service.reveal(dice);

      expect(secret.isSecret).toBe(false);
    });

    it('leaves the throw of another die kept back', () => {
      const chat = TestBed.inject(ChatMessageService);
      const other = chat.sendSecretSystemMessageToTab(tab, 'べつのダイス → 1', 'me', undefined, ['another-die']);

      service.reveal(dice);

      expect(other.isSecret).toBe(true);
    });

    it('says nothing more of its own once the throw it opened carries the face', () => {
      const chat = TestBed.inject(ChatMessageService);
      chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'me', undefined, [dice.identifier]);
      const callOut = vi.spyOn(chat, 'sendSystemNotice');

      service.reveal(dice);

      expect(callOut).not.toHaveBeenCalled();
    });

    it('calls the face out where there is no throw of it to open', () => {
      const callOut = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice');

      service.reveal(dice);

      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][0]).toBe('diceReveal');
      expect(callOut.mock.calls[0][1]).toContain('6');
    });

    it('calls the face out where the throw it found is somebody else to open', () => {
      const chat = TestBed.inject(ChatMessageService);
      const secret = chat.sendSecretSystemMessageToTab(tab, '隠しダイス → 6', 'somebody-else', undefined, [
        dice.identifier,
      ]);
      const callOut = vi.spyOn(chat, 'sendSystemNotice');

      service.reveal(dice);

      expect(secret.isSecret).toBe(true);
      expect(callOut).toHaveBeenCalledOnce();
      expect(callOut.mock.calls[0][1]).toContain('6');
    });
  });
});
