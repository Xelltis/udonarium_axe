import { TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TurnChatCommandService } from '@axe/application/turn/turn-chat-command.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { emitDiceTableMessage, emitResourceEditMessage, emitSendMessage } from '@axe/core/event/domain-events';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { parseTurnHistory } from '@axe/domain/tabletop/turn-history';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TurnChatCommandService', () => {
  const MY_USER = 'user-me';

  let service: TurnChatCommandService;
  let turns: TurnOrderService;
  let turnState: TurnState;
  let tab: ChatTab;
  let heroes: Party;
  let monsters: Party;
  let hero: GameCharacter;
  let squire: GameCharacter;
  let monster: GameCharacter;
  let ask: ReturnType<typeof vi.spyOn>;

  const beSeat = (role: PeerRole) => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    PeerCursor.myCursor.userId = MY_USER;
  };

  /** Says a line as the chat does, and answers what was said, in order, with whose turn it was as each went out. */
  const say = (line: string, sendFrom: string): { text: string; last: boolean; up: string; round: number }[] => {
    const said: { text: string; last: boolean; up: string; round: number }[] = [];
    service.say(line, sendFrom, tab, (text, last) => {
      said.push({ text, last, up: turnState.currentIdentifier, round: turnState.round });
    });
    return said;
  };

  const lines = (): readonly ChatMessage[] => tab.chatMessages;
  const noticesToMe = (): ChatMessage[] => lines().filter((line) => line.tags.includes('to-pl-system-message'));
  const standing = () => ({
    round: turnState.round,
    phase: turnState.phase,
    current: turnState.currentIdentifier,
    side: turnState.currentSide,
    acted: [...turnState.actedIdentifiers],
    holding: turnState.holding,
    history: turnState.history,
  });

  /** A round taken side by side with the first side's phase open and nobody up, as a free phase opens. */
  const openFreePhase = () => {
    Config.instance.turnOrderMode = 'faction';
    Config.instance.factionPhaseMode = 'free';
    Config.instance.factionOrder = `${heroes.identifier},${monsters.identifier}`;
    turns.next();
    turns.next();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });

    Config.forget();
    const config = Config.instance;
    config.turnOrderMode = 'initiative';
    config.factionPhaseMode = 'free';
    config.factionOrder = '';
    config.factionSkipUnassigned = false;

    turnState = TurnState.instance;
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.round = 0;
    turnState.phase = 'idle';
    turnState.buffDecay = true;
    turnState.actedIdentifiers = [];
    turnState.history = '[]';
    turnState.holding = '';
    turnState.turnOpening = '';

    tab = new ChatTab('tab-for-turn-commands');
    tab.name = 'メイン';
    tab.initialize();
    ChatTabList.instance.addChatTab(tab);

    heroes = new Party();
    heroes.name = '味方';
    heroes.initialize();
    monsters = new Party();
    monsters.name = '敵';
    monsters.initialize();

    [hero, squire, monster] = [new GameCharacter(), new GameCharacter(), new GameCharacter()];
    [hero, squire, monster].forEach((piece) => piece.initialize());
    hero.name = '勇者';
    squire.name = '従者';
    monster.name = '魔物';
    hero.partyIdentifier = heroes.identifier;
    squire.partyIdentifier = heroes.identifier;
    monster.partyIdentifier = monsters.identifier;
    hero.owner = MY_USER;
    squire.owner = 'user-somebody-else';
    monster.owner = 'user-master';
    vi.spyOn(TestBed.inject(GameObjectInventoryService).tableInventory, 'tabletopObjects', 'get').mockReturnValue([
      hero,
      squire,
      monster,
    ]);

    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    beSeat(PeerRole.GameMaster);
    turns = TestBed.inject(TurnOrderService);
    service = TestBed.inject(TurnChatCommandService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ChatTabList.forget();
    Config.forget();
    PeerCursor.forget();
  });

  describe('a line with no round command', () => {
    it('is said whole and moves nothing', () => {
      const before = standing();

      expect(say('2d6 攻撃 &T', hero.identifier)).toEqual([{ text: '2d6 攻撃 &T', last: true, up: '', round: 0 }]);
      expect(standing()).toEqual(before);
    });

    it('leaves a buff named as a command is to be laid, with its field or its removal mark', () => {
      const next = vi.spyOn(turns, 'next');

      expect(say('&RS/効果/3', hero.identifier).map((line) => line.text)).toEqual(['&RS/効果/3']);
      expect(say('&T-', hero.identifier).map((line) => line.text)).toEqual(['&T-']);
      expect(say('&TEAM', hero.identifier).map((line) => line.text)).toEqual(['&TEAM']);
      expect(next).not.toHaveBeenCalled();
      expect(turnState.round).toBe(0);
    });
  });

  describe('the game master', () => {
    it('starts the round with &RS through the press of the round', () => {
      const next = vi.spyOn(turns, 'next');

      say('&RS', PeerCursor.myCursor.identifier);

      expect(next).toHaveBeenCalledOnce();
      expect(turnState.round).toBe(1);
      expect(turnState.phase).toBe('roundStart');
      expect(lines().map((line) => line.text)).toEqual([expect.stringContaining('feature.turnOrder.roundStart')]);
      expect(parseTurnHistory(turnState.history)).toHaveLength(1);
    });

    it('reads the word as it reads the short name', () => {
      say('&ラウンド開始', PeerCursor.myCursor.identifier);

      expect(turnState.round).toBe(1);
    });

    it('does not start a round over one under way, and is told so alone', () => {
      turns.next();
      const before = standing();

      say('&RS', PeerCursor.myCursor.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()).toHaveLength(1);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.underWay');
    });

    it('hands the turn on with &TE as the next button does, buffs counting down with it', () => {
      applyBuffEdit({ command: '&加護/守り/1/turnEnd', object: hero, targeted: false }, hero);
      turns.next();
      turns.next();
      expect(turnState.currentIdentifier).toBe(hero.identifier);
      const endTurn = vi.spyOn(turns, 'endTurn');

      say('&TE', PeerCursor.myCursor.identifier);

      expect(endTurn).toHaveBeenCalledOnce();
      expect(turnState.currentIdentifier).toBe(squire.identifier);
      expect(turnState.actedIdentifiers).toEqual([hero.identifier]);
      expect(hero.buffs.find('加護')).toBeNull();
    });

    it('has the piece whose turn it is wait with &TW and steps a waiting piece in with &TI', () => {
      turns.next();
      turns.next();
      const hold = vi.spyOn(turns, 'hold');
      const interrupt = vi.spyOn(turns, 'interrupt');

      say('&TW', PeerCursor.myCursor.identifier);

      expect(hold).toHaveBeenCalledWith(hero.identifier);
      expect(turns.isHeld(hero.identifier)).toBe(true);
      expect(turnState.currentIdentifier).toBe(squire.identifier);

      say('&TI', hero.identifier);

      expect(interrupt).toHaveBeenCalledWith(hero.identifier);
      expect(turnState.currentIdentifier).toBe(hero.identifier);
    });

    it('steps nobody in who is not waiting', () => {
      turns.next();
      turns.next();
      const before = standing();

      say('&TI', squire.identifier);
      say('&TI', PeerCursor.myCursor.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe().map((line) => line.text)).toEqual([
        expect.stringContaining('feature.chat.lint.turn.no.notWaiting'),
        expect.stringContaining('feature.chat.lint.turn.no.noPiece'),
      ]);
    });

    it('takes a step back with &TB and a round back with &RB, from the record', () => {
      turns.next();
      turns.next();
      turns.next();
      expect(turnState.currentIdentifier).toBe(squire.identifier);
      const prev = vi.spyOn(turns, 'prev');
      const retreat = vi.spyOn(turns, 'retreatRound');

      say('&TB', PeerCursor.myCursor.identifier);

      expect(prev).toHaveBeenCalledOnce();
      expect(turnState.currentIdentifier).toBe(hero.identifier);

      say('&RB', PeerCursor.myCursor.identifier);

      expect(retreat).toHaveBeenCalledOnce();
      expect(turnState.round).toBe(0);
    });

    it('takes nothing back where nothing has been done', () => {
      say('&TB', PeerCursor.myCursor.identifier);
      say('&RB', PeerCursor.myCursor.identifier);

      expect(noticesToMe().map((line) => line.text)).toEqual([
        expect.stringContaining('feature.chat.lint.turn.no.nothingToUndo'),
        expect.stringContaining('feature.chat.lint.turn.no.nothingToUndo'),
      ]);
    });

    it('resets the round with &RR, and has nothing to reset before the first', () => {
      const reset = vi.spyOn(turns, 'reset');

      say('&RR', PeerCursor.myCursor.identifier);

      expect(reset).not.toHaveBeenCalled();
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.notStarted');

      turns.next();
      say('&RR', PeerCursor.myCursor.identifier);

      expect(reset).toHaveBeenCalledOnce();
      expect(turnState.round).toBe(0);
      expect(turnState.phase).toBe('idle');
    });

    it('moves to the next round with &RN, asking about the pieces still to move as the button does', async () => {
      turns.next();
      turns.next();
      const advance = vi.spyOn(turns, 'advanceRound');

      say('&RN', PeerCursor.myCursor.identifier);
      await advance.mock.results[0].value;

      expect(ask).toHaveBeenCalledOnce();
      expect(turnState.round).toBe(2);
      expect(turnState.phase).toBe('roundStart');
    });

    it('stays in the round where the question is answered no, and says the rest all the same', async () => {
      ask.mockResolvedValue(false);
      turns.next();
      turns.next();
      const advance = vi.spyOn(turns, 'advanceRound');

      const said = say('&RN 次へ行きます', PeerCursor.myCursor.identifier);
      await advance.mock.results[0].value;
      await Promise.resolve();

      expect(turnState.round).toBe(1);
      expect(said.map((line) => line.text)).toEqual(['&RN', '次へ行きます']);
    });
  });

  describe('the rest of the line', () => {
    it('is said as a line of its own after the round has been moved', () => {
      turns.next();
      turns.next();

      const said = say('&TE 2d6+5 命中判定', PeerCursor.myCursor.identifier);

      expect(said).toEqual([
        { text: '&TE', last: false, up: hero.identifier, round: 1 },
        { text: '2d6+5 命中判定', last: true, up: squire.identifier, round: 1 },
      ]);
    });

    it('waits for the next round to be answered for before it is said', async () => {
      let answer: (proceed: boolean) => void = () => {};
      ask.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
      turns.next();
      turns.next();
      const advance = vi.spyOn(turns, 'advanceRound');

      const said = say('&RN 2d6', PeerCursor.myCursor.identifier);
      await Promise.resolve();
      expect(said.map((line) => line.text)).toEqual(['&RN']);

      answer(true);
      await advance.mock.results[0].value;
      await Promise.resolve();

      expect(said).toEqual([
        { text: '&RN', last: false, up: hero.identifier, round: 1 },
        { text: '2d6', last: true, up: '', round: 2 },
      ]);
    });

    it('is said after a command that moved nothing, too', () => {
      const said = say('&TB 戻します', PeerCursor.myCursor.identifier);

      expect(said.map((line) => line.text)).toEqual(['&TB', '戻します']);
      expect(noticesToMe()).toHaveLength(1);
    });

    it('carries what goes with the whole line on the command where nothing follows it', () => {
      expect(say('&RS', PeerCursor.myCursor.identifier)).toEqual([{ text: '&RS', last: true, up: '', round: 0 }]);
    });
  });

  describe('a player taking a turn in a free phase', () => {
    beforeEach(() => {
      openFreePhase();
      beSeat(PeerRole.Player);
    });

    it('takes the turn for the piece speaking, as a click on the piece does', () => {
      const setCurrent = vi.spyOn(turns, 'setCurrent');
      const recorded = parseTurnHistory(turnState.history).length;

      const said = say('&T 2d6+5 命中判定', hero.identifier);

      expect(setCurrent).toHaveBeenCalledWith(hero.identifier);
      expect(turnState.currentIdentifier).toBe(hero.identifier);
      expect(turnState.phase).toBe('acting');
      expect(parseTurnHistory(turnState.history)).toHaveLength(recorded + 1);
      expect(said.map((line) => [line.text, line.up])).toEqual([
        ['&T', ''],
        ['2d6+5 命中判定', hero.identifier],
      ]);
      expect(lines().some((line) => line.text.includes('feature.turnOrder.announce'))).toBe(true);
      expect(noticesToMe()).toEqual([]);
    });

    it('ends the turn with &TE without handing it on, the side choosing who goes next', () => {
      say('&T', hero.identifier);
      const recorded = parseTurnHistory(turnState.history).length;

      say('&手番終了', hero.identifier);

      expect(turnState.currentIdentifier).toBe('');
      expect(turnState.phase).toBe('acting');
      expect(turnState.actedIdentifiers).toEqual([hero.identifier]);
      expect(parseTurnHistory(turnState.history)).toHaveLength(recorded + 1);
      expect(noticesToMe()).toEqual([]);

      say('&T', squire.identifier);
      say('&TE', squire.identifier);
      expect(turnState.currentSide).toBe(monsters.identifier);
      expect(turnState.currentIdentifier).toBe('');
    });

    it('ends no turn with &TE while nobody is up, and tells the speaker alone', () => {
      const before = standing();

      say('&TE', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.nobodyUp');
    });

    it('reads &手番 the same', () => {
      say('&手番', hero.identifier);

      expect(turnState.currentIdentifier).toBe(hero.identifier);
    });

    it('counts down the buffs that wait on the start of the turn, as the click does', () => {
      applyBuffEdit({ command: '&集中/狙い/1/turnStart', object: hero, targeted: false }, hero);

      say('&T', hero.identifier);

      expect(hero.buffs.find('集中')).toBeNull();
    });

    it('closes the turn of the piece that was up on the same side', () => {
      turns.setCurrent(squire.identifier);

      say('&T', hero.identifier);

      expect(turnState.currentIdentifier).toBe(hero.identifier);
      expect(turnState.actedIdentifiers).toEqual([squire.identifier]);
    });

    it('moves nothing for a speaker that is no piece, and tells the speaker alone', () => {
      const before = standing();

      say('&T', PeerCursor.myCursor.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()).toHaveLength(1);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.noPiece');
      expect(noticesToMe()[0].text).toContain('feature.turnOrder.commandRefused');
      expect(noticesToMe()[0].to).toBe(MY_USER);
    });

    it('takes the turn for a piece that is somebody else’s, as a press of its face in the turn order does', () => {
      say('&T', squire.identifier);

      expect(turnState.currentIdentifier).toBe(squire.identifier);
      expect(noticesToMe()).toEqual([]);
    });

    it('steps a waiting piece that is somebody else’s in, as a press of its face does', () => {
      turns.setCurrent(squire.identifier);
      turns.hold(squire.identifier);

      say('&TI', squire.identifier);

      expect(turnState.currentIdentifier).toBe(squire.identifier);
      expect(noticesToMe()).toEqual([]);
    });

    it('takes no turn in the other side’s phase', () => {
      monster.owner = MY_USER;
      const before = standing();

      say('&T', monster.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.otherSide');
    });

    it('takes no second turn in a round, nor the one it has', () => {
      say('&T', hero.identifier);
      say('&T', hero.identifier);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.alreadyUp');

      turns.next();
      expect(turnState.actedIdentifiers).toContain(hero.identifier);
      const before = standing();
      say('&T', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[1].text).toContain('feature.chat.lint.turn.no.acted');
    });

    it('takes no turn for a piece that is waiting, which steps in with &TI', () => {
      turns.hold(hero.identifier);
      const before = standing();

      say('&T', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.waiting');

      say('&TI', hero.identifier);

      expect(turnState.currentIdentifier).toBe(hero.identifier);
    });

    it('takes no turn for a piece the round does not reach', () => {
      hero.noTurn = true;
      const before = standing();

      say('&T', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.notInOrder');
    });

    it('takes a turn for a piece nobody has claimed', () => {
      squire.owner = '';

      say('&T', squire.identifier);

      expect(turnState.currentIdentifier).toBe(squire.identifier);
    });

    it('has whoever is up wait and ends their turn, whoever’s piece it is, as the buttons do', () => {
      turns.setCurrent(squire.identifier);

      say('&TW', hero.identifier);

      expect(turns.isHeld(squire.identifier)).toBe(true);

      turns.setCurrent(monster.identifier);
      turns.setCurrent(hero.identifier);
      turns.setCurrent(squire.identifier);
      say('&TE', hero.identifier);

      expect(turnState.actedIdentifiers).toContain(squire.identifier);
      expect(noticesToMe()).toEqual([]);
    });

    it('has nobody wait while nobody is up', () => {
      const before = standing();

      say('&TW', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.nobodyUp');
    });
  });

  describe('a player moving the round', () => {
    it('starts the round with &RS, as the next button does', () => {
      beSeat(PeerRole.Player);

      say('&RS', hero.identifier);

      expect(turnState.round).toBe(1);
      expect(noticesToMe()).toEqual([]);
    });

    it.each([
      ['&TB', 'prev'],
      ['&RB', 'retreatRound'],
      ['&RR', 'reset'],
    ] as const)('carries %s out through the press its button makes', (line, press) => {
      turns.next();
      turns.next();
      beSeat(PeerRole.Player);
      const pressed = vi.spyOn(turns, press);
      const before = standing();

      say(line, hero.identifier);

      expect(pressed).toHaveBeenCalledOnce();
      expect(standing()).not.toEqual(before);
      expect(noticesToMe()).toEqual([]);
    });

    it('moves to the next round with &RN, asked about the pieces still to move as the button asks', async () => {
      turns.next();
      turns.next();
      beSeat(PeerRole.Player);
      const advance = vi.spyOn(turns, 'advanceRound');

      say('&RN', hero.identifier);
      await advance.mock.results[0].value;

      expect(ask).toHaveBeenCalledOnce();
      expect(turnState.round).toBe(2);
      expect(noticesToMe()).toEqual([]);
    });

    it('is told what the game master is told where the round does not stand for the command', () => {
      beSeat(PeerRole.Player);

      say('&TB', hero.identifier);
      say('&RR', hero.identifier);

      expect(noticesToMe().map((line) => line.text)).toEqual([
        expect.stringContaining('feature.chat.lint.turn.no.nothingToUndo'),
        expect.stringContaining('feature.chat.lint.turn.no.notStarted'),
      ]);
    });
  });

  describe('a player where the order is fixed', () => {
    it('takes no turn out of order, one piece at a time', () => {
      turns.next();
      beSeat(PeerRole.Player);
      const before = standing();

      say('&T', hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.fixedOrder');
    });

    it('takes no turn out of order, side by side in the order listed', () => {
      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionPhaseMode = 'initiative';
      Config.instance.factionOrder = `${heroes.identifier},${monsters.identifier}`;
      turns.next();
      turns.next();
      hero.owner = '';
      squire.owner = MY_USER;
      beSeat(PeerRole.Player);
      const before = standing();

      say('&T', squire.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.fixedOrder');
    });

    it('takes no turn before the round has begun', () => {
      Config.instance.turnOrderMode = 'faction';
      beSeat(PeerRole.Player);

      say('&T', hero.identifier);

      expect(turnState.round).toBe(0);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.notUnderWay');
    });
  });

  describe('a seat that is only watching', () => {
    it.each(['&T', '&TE', '&TW', '&TI', '&TB', '&RS', '&RN', '&RB', '&RR'])('moves nothing with %s', (line) => {
      openFreePhase();
      turns.setCurrent(squire.identifier);
      beSeat(PeerRole.Guest);
      const before = standing();

      say(line, hero.identifier);

      expect(standing()).toEqual(before);
      expect(noticesToMe()).toHaveLength(1);
      expect(noticesToMe()[0].text).toContain('feature.chat.lint.turn.no.watching');
    });
  });

  describe('a line that arrives from another seat', () => {
    it('moves no round, whatever command it opens with', () => {
      openFreePhase();
      turns.setCurrent(hero.identifier);
      const before = standing();
      const presses = (['next', 'prev', 'reset', 'setCurrent', 'hold', 'interrupt', 'retreatRound'] as const).map(
        (press) => vi.spyOn(turns, press)
      );
      const advance = vi.spyOn(turns, 'advanceRound');

      for (const text of ['&T', '&TE', '&TW', '&TI', '&TB', '&RS', '&RN', '&RB', '&RR', '&TE 2d6']) {
        const arrived = tab.addMessage({
          from: 'user-somebody-else',
          name: '従者',
          text,
          timestamp: Date.now(),
          tag: '',
          imageIdentifier: '',
          sendFrom: squire.identifier,
          senderRole: PeerRole.GameMaster,
        });
        emitSendMessage({ messageIdentifier: arrived.identifier, messageTarget: null });
        emitDiceTableMessage({ messageIdentifier: arrived.identifier });
        emitResourceEditMessage({ messageIdentifier: arrived.identifier, messageTargetContext: [] });
      }

      expect(standing()).toEqual(before);
      for (const press of presses) expect(press).not.toHaveBeenCalled();
      expect(advance).not.toHaveBeenCalled();
      expect(squire.buffs.snapshot()).toEqual([]);
    });
  });

  describe('refusalOf', () => {
    it('answers nothing for a command that would be carried out', () => {
      expect(service.refusalOf('roundStart', '')).toBeNull();
      expect(service.refusalOf('roundNext', '')).toBeNull();
    });

    it('answers why for one that would not', () => {
      expect(service.refusalOf('roundReset', '')).toBe('notStarted');
      expect(service.refusalOf('wait', '')).toBe('nobodyUp');
    });

    it('answers a player as it answers the game master, and a seat only watching that it is watching', () => {
      beSeat(PeerRole.Player);
      expect(service.refusalOf('roundNext', '')).toBeNull();
      expect(service.refusalOf('end', '')).toBeNull();
      expect(service.refusalOf('back', '')).toBe('nothingToUndo');
      beSeat(PeerRole.Guest);
      expect(service.refusalOf('roundNext', '')).toBe('watching');
    });
  });
});
