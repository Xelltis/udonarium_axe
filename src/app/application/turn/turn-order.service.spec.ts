import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnHooksService } from '@axe/application/turn/turn-hooks.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { readTurnStart, turnStartMark, TurnState } from '@axe/domain/tabletop/turn-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TurnOrderService', () => {
  let service: TurnOrderService;
  let turnState: TurnState;
  let askedToLeaveBehind: ReturnType<typeof vi.spyOn>;
  let chars: GameCharacter[];
  let orderedSpy: ReturnType<typeof vi.spyOn>;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: TRANSLATE_FN, useValue: (key: string) => key }],
    });

    // Config is a singleton that outlives a test, so how the round is taken has to be put
    // back or one faction test rules every test that runs after it.
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
    const config = Config.instance;
    config.turnOrderMode = 'initiative';
    config.factionPhaseMode = 'free';
    config.factionOrder = '';
    config.factionSkipUnassigned = false;

    askedToLeaveBehind = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

    turnState = TestBed.inject(TurnState);
    turnState.currentIdentifier = '';
    turnState.currentSide = '';
    turnState.round = 0;
    turnState.phase = 'idle';
    turnState.buffDecay = true;
    turnState.actedIdentifiers = [];
    turnState.history = '[]';
    turnState.holding = '';
    turnState.turnOpening = '';

    chars = [new GameCharacter(), new GameCharacter(), new GameCharacter()];
    chars.forEach((c) => c.initialize());

    service = TestBed.inject(TurnOrderService);
    orderedSpy = vi.spyOn(service, 'orderedCharacters').mockReturnValue(chars);
    sendSpy = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(undefined as never);
  });

  describe('a seat that is only watching', () => {
    const beSeat = (role: PeerRole) => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = role;
    };

    it('moves no round of its own', async () => {
      beSeat(PeerRole.Player);
      service.next();
      const standing = { round: turnState.round, current: turnState.currentIdentifier, history: turnState.history };

      beSeat(PeerRole.Guest);
      service.next();
      await service.advanceRound();
      service.prev();
      service.retreatRound();
      service.reset();
      service.setCurrent(chars[2].identifier);
      service.setBuffDecay(false);

      expect(turnState.round).toBe(standing.round);
      expect(turnState.currentIdentifier).toBe(standing.current);
      expect(turnState.history).toBe(standing.history);
      expect(turnState.buffDecay).toBe(true);
    });

    it('neither holds a piece back nor steps one in', () => {
      beSeat(PeerRole.Player);
      service.next();
      service.next();
      service.hold(chars[1].identifier);
      const standing = { current: turnState.currentIdentifier, holding: turnState.holding };

      beSeat(PeerRole.Guest);
      service.hold(chars[0].identifier);
      service.interrupt(chars[1].identifier);

      expect(service.mayHold(chars[2].identifier)).toBe(false);
      expect(service.mayInterrupt(chars[1].identifier)).toBe(false);
      expect(turnState.currentIdentifier).toBe(standing.current);
      expect(turnState.holding).toBe(standing.holding);
    });

    it('is not asked what to do about the pieces still waiting', async () => {
      beSeat(PeerRole.Player);
      service.next();
      askedToLeaveBehind.mockClear();

      beSeat(PeerRole.Guest);
      await service.advanceRound();

      expect(askedToLeaveBehind).not.toHaveBeenCalled();
    });

    it('says nothing to the table in its name', () => {
      beSeat(PeerRole.Player);
      service.next();
      sendSpy.mockClear();

      beSeat(PeerRole.Guest);
      service.next();
      service.prev();
      service.reset();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('orderedCharacters excludes inventory-hidden characters', () => {
    orderedSpy.mockRestore();
    const inventory = TestBed.inject(GameObjectInventoryService);
    const [visible, hidden] = [new GameCharacter(), new GameCharacter()];
    [visible, hidden].forEach((c) => c.initialize());
    hidden.hideInventory = true;
    vi.spyOn(inventory.tableInventory, 'tabletopObjects', 'get').mockReturnValue([visible, hidden]);
    expect(service.orderedCharacters()).toEqual([visible]);
  });

  describe('a piece riding a mount', () => {
    function riding(): { knight: GameCharacter; horse: GameCharacter; squire: GameCharacter; crate: GameCharacter } {
      orderedSpy.mockRestore();
      const [knight, horse, squire, crate] = [
        new GameCharacter(),
        new GameCharacter(),
        new GameCharacter(),
        new GameCharacter(),
      ];
      [knight, horse, squire, crate].forEach((c) => c.initialize());
      horse.mountable = '1';
      knight.ridingOn = horse.identifier;
      squire.ridingOn = horse.identifier;
      squire.rideSeat = 'passenger';
      crate.ridingOn = horse.identifier;
      crate.rideSeat = 'cargo';
      vi.spyOn(TestBed.inject(GameObjectInventoryService).tableInventory, 'tabletopObjects', 'get').mockReturnValue([
        knight,
        horse,
        squire,
        crate,
      ]);
      return { knight, horse, squire, crate };
    }

    it('takes the turn for the mount and the second rider, leaving a load its own', () => {
      const { knight, horse, squire, crate } = riding();

      expect(service.orderedCharacters()).toEqual([knight, crate]);
      expect(service.companionsOf(knight.identifier)).toEqual([horse, squire]);
    });

    it('starts and ends the turn of those it carries with its own', () => {
      const { knight, horse, squire } = riding();
      const started: string[] = [];
      TestBed.inject(TurnHooksService).onTurnStart((id) => started.push(id));

      service.next();
      service.next();
      expect(turnState.currentIdentifier).toBe(knight.identifier);
      expect(started).toEqual([knight.identifier, horse.identifier, squire.identifier]);
      service.next();

      expect(service.isActed(horse.identifier)).toBe(true);
      expect(service.isActed(squire.identifier)).toBe(true);
    });

    it('gives a mount and its second rider turns of their own where the one in front takes none', () => {
      const { knight, horse, squire, crate } = riding();
      knight.noTurn = true;
      expect(service.orderedCharacters()).toEqual([horse, squire, crate]);

      knight.noTurn = false;
      knight.hideInventory = true;
      expect(service.orderedCharacters()).toEqual([horse, squire, crate]);
    });

    it('gives a mount nobody rides in front, and its second rider, turns of their own', () => {
      const { knight, horse, squire, crate } = riding();
      knight.ridingOn = '';

      expect(service.orderedCharacters()).toEqual([knight, horse, squire, crate]);
    });
  });

  it('next from idle begins round 1 without a character', () => {
    service.next();
    expect(turnState.round).toBe(1);
    expect(turnState.phase).toBe('roundStart');
    expect(turnState.currentIdentifier).toBe('');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBe('round');
  });

  it('next walks round start, each character, round end, then the next round', () => {
    service.next(); // round 1 begins
    service.next(); // first character
    expect(turnState.phase).toBe('acting');
    expect(turnState.currentIdentifier).toBe(chars[0].identifier);
    service.next(); // second character
    expect(turnState.currentIdentifier).toBe(chars[1].identifier);
    service.next(); // last character
    expect(turnState.currentIdentifier).toBe(chars[2].identifier);
    service.next(); // round 1 ends
    expect(turnState.phase).toBe('roundEnd');
    expect(turnState.currentIdentifier).toBe('');
    expect(turnState.round).toBe(1);
    service.next(); // round 2 begins
    expect(turnState.phase).toBe('roundStart');
    expect(turnState.round).toBe(2);
  });

  it('setCurrent jumps straight to a character in the acting phase', () => {
    service.setCurrent(chars[1].identifier);
    expect(turnState.phase).toBe('acting');
    expect(turnState.currentIdentifier).toBe(chars[1].identifier);
    expect(turnState.round).toBe(1);
  });

  it('prev reverses the sequence back to idle', () => {
    service.next(); // round 1 begins
    service.next(); // first character
    service.prev(); // back to round start
    expect(turnState.phase).toBe('roundStart');
    expect(turnState.currentIdentifier).toBe('');
    service.prev(); // round 1 start -> idle
    expect(turnState.phase).toBe('idle');
    expect(turnState.round).toBe(0);
  });

  it('marks whose turn has begun and when, whether handed on or jumped to, and not when put back', () => {
    service.next(); // round begins
    service.next(); // first turn opens
    expect(readTurnStart(turnState.turnStart)?.identifier).toBe(chars[0].identifier);

    service.setCurrent(chars[2].identifier);
    const jumped = readTurnStart(turnState.turnStart);
    expect(jumped?.identifier).toBe(chars[2].identifier);
    expect(Date.now() - jumped!.at).toBeLessThan(5000);

    service.prev();
    expect(turnState.turnStart).toBe(turnStartMark(jumped!.identifier, jumped!.at));
  });

  it('tells whatever waits on the turn whose turn has begun', () => {
    const started = vi.fn();
    TestBed.inject(TurnHooksService).onTurnStart(started);

    service.next(); // round begins
    service.next(); // first turn opens

    expect(started).toHaveBeenCalledWith(chars[0].identifier);
  });

  it('tells whatever waits on the turn that a turn has ended, and that the round has', () => {
    const ended = vi.fn();
    TestBed.inject(TurnHooksService).onTurnEnd(ended);

    service.next(); // round begins
    expect(ended).not.toHaveBeenCalled();
    service.next(); // first turn opens
    service.next(); // first turn ends
    expect(ended).toHaveBeenCalledTimes(1);
  });

  describe('buff decay', () => {
    let buffed: GameCharacter[];

    function buffsOf(character: GameCharacter): readonly DataElement[] {
      return character.buffDataElement?.children[0]?.children ?? [];
    }

    function advanceToRoundEnd(): void {
      service.next(); // round begins
      for (let i = 0; i <= buffed.length; i++) service.next();
    }

    beforeEach(() => {
      buffed = [GameCharacter.create('クリフトン', 1, ''), GameCharacter.create('アーサー', 1, '')];
      buffed.forEach((character) => {
        character.addExtendData();
        character.buffs.addRound('猛攻撃', '', 1);
      });
      orderedSpy.mockReturnValue(buffed);
    });

    it('counts buffs down at the end of a round and announces what expired', () => {
      buffed[0].buffs.addRound('加速', '', 3);
      sendSpy.mockClear();

      advanceToRoundEnd();

      expect(buffsOf(buffed[0]).map((buff: DataElement) => buff.name)).toEqual(['加速']);
      expect(buffsOf(buffed[0])[0].value).toBe(2);
      expect(buffsOf(buffed[1])).toHaveLength(0);
      const announced = sendSpy.mock.calls.map((call: unknown[]) => String(call[1]));
      expect(announced.some((text: string) => text.includes('feature.turnOrder.buffExpired'))).toBe(true);
    });

    it('counts down the buffs of pieces kept off the table too, and leaves the graveyard alone', () => {
      const kept = GameCharacter.create('控え', 1, '');
      kept.setLocation('common');
      kept.addExtendData();
      kept.buffs.addRound('挑発攻撃', '', 1);
      const fallen = GameCharacter.create('退場', 1, '');
      fallen.setLocation('graveyard');
      fallen.addExtendData();
      fallen.buffs.addRound('挑発攻撃', '', 1);

      advanceToRoundEnd();

      expect(buffsOf(kept)).toHaveLength(0);
      expect(buffsOf(fallen)).toHaveLength(1);
    });

    it('leaves buffs alone while the toggle is off', () => {
      service.setBuffDecay(false);

      advanceToRoundEnd();

      expect(buffsOf(buffed[0])).toHaveLength(1);
      expect(buffsOf(buffed[0])[0].value).toBe(1);
    });

    it('does not count down when stepping backwards through a round', () => {
      service.next(); // round 1 begins
      service.next(); // first character
      service.prev(); // back to round start
      service.prev(); // round 1 start -> idle

      expect(buffsOf(buffed[0])[0].value).toBe(1);
    });

    it('puts back a buff that ran out in the step it undoes', () => {
      buffed[0].buffs.addRound('加速', '', 2);

      advanceToRoundEnd();
      expect(buffsOf(buffed[0]).map((buff: DataElement) => buff.name)).toEqual(['加速']);

      service.prev();

      expect(buffsOf(buffed[0]).map((buff: DataElement) => buff.name)).toEqual(['猛攻撃', '加速']);
      expect(buffsOf(buffed[0])[0].value).toBe(1);
      expect(buffsOf(buffed[0])[1].value).toBe(2);
      expect(buffsOf(buffed[1]).map((buff: DataElement) => buff.name)).toEqual(['猛攻撃']);
    });

    it("counts a buff down as its trigger's turn opens, and leaves the rest alone", () => {
      // A Sword World enhancement runs out as the caster comes round again, not with the round.
      const [caster, target] = buffed;
      target.buffs.addRound('練技', '', 1, { timing: 'turnStart', trigger: caster.identifier });
      sendSpy.mockClear();

      service.next(); // round 1 begins
      expect(buffsOf(target).map((buff: DataElement) => buff.name)).toContain('練技');

      service.next(); // the caster takes the first turn

      expect(buffsOf(target).map((buff: DataElement) => buff.name)).not.toContain('練技');
      expect(buffsOf(target).map((buff: DataElement) => buff.name)).toContain('猛攻撃');
    });

    describe('a piece that waits once its turn has begun', () => {
      const namesOf = (character: GameCharacter) => buffsOf(character).map((buff: DataElement) => buff.name);
      const roundsOf = (character: GameCharacter, name: string) =>
        buffsOf(character).find((buff: DataElement) => buff.name === name)?.value;

      it('has its opening countdown given back, and counted down again as its turn comes back', () => {
        const [first] = buffed;
        first.buffs.addRound('加護', '', 2, { timing: 'turnStart' });

        service.next(); // round 1 begins
        service.next(); // the first piece's turn opens
        expect(roundsOf(first, '加護')).toBe(1);

        sendSpy.mockClear();
        service.hold(first.identifier);
        expect(roundsOf(first, '加護')).toBe(2);
        const said = sendSpy.mock.calls.map((call: unknown[]) => String(call[1]));
        expect(said.some((text: string) => text.includes('feature.turnOrder.buffsGivenBack'))).toBe(true);

        service.next(); // the second piece is done, and the first comes back
        expect(turnState.currentIdentifier).toBe(first.identifier);
        expect(roundsOf(first, '加護')).toBe(1);
      });

      it('has a buff that ran out at the opening brought back, with what it moved on the sheet', () => {
        const [first] = buffed;
        first.detailDataElement!.appendChild(DataElement.create('命中', 5, {}));
        first.buffs.addRound('集中', '命中+2', 1, { timing: 'turnStart' });
        first.buffs.applyModifier(first.buffs.find('集中')!, {
          target: '命中',
          slot: 'now',
          operator: 'add',
          amount: 2,
        });
        const hit = () => first.detailDataElement!.getFirstElementByName('命中')!.value;
        expect(hit()).toBe(7);

        service.next(); // round 1 begins
        service.next(); // the first piece's turn opens, and 集中 runs out
        expect(namesOf(first)).not.toContain('集中');
        expect(hit()).toBe(5);

        service.hold(first.identifier);
        expect(namesOf(first)).toContain('集中');
        expect(roundsOf(first, '集中')).toBe(1);
        expect(hit()).toBe(7);
      });

      it('leaves the countdown be while a seat at the table runs a version that would not count it again', () => {
        const [first] = buffed;
        first.buffs.addRound('加護', '', 2, { timing: 'turnStart' });
        const older = new PeerCursor('older-cursor');
        older.initialize();
        older.peerId = 'older-peer';
        older.role = 'pl';

        try {
          service.next(); // round 1 begins
          service.next(); // the first piece's turn opens
          service.hold(first.identifier);

          expect(roundsOf(first, '加護')).toBe(1);
          service.next(); // the first comes back, and its opening is not counted a second time
          expect(roundsOf(first, '加護')).toBe(1);
        } finally {
          older.destroy();
        }
      });

      it('goes back to before it waited in one step back', () => {
        const [first] = buffed;
        first.buffs.addRound('加護', '', 2, { timing: 'turnStart' });

        service.next(); // round 1 begins
        service.next(); // the first piece's turn opens
        service.hold(first.identifier);
        service.prev();

        expect(turnState.currentIdentifier).toBe(first.identifier);
        expect(roundsOf(first, '加護')).toBe(1);
      });
    });

    it('waits for the bearer where the buff names no trigger', () => {
      const second = buffed[1];
      second.buffs.addRound('集中', '', 1, { timing: 'turnStart' });

      service.next(); // round 1 begins
      service.next(); // the first character acts
      expect(buffsOf(second).map((buff: DataElement) => buff.name)).toContain('集中');

      service.next(); // the bearer acts

      expect(buffsOf(second).map((buff: DataElement) => buff.name)).not.toContain('集中');
    });

    it('counts a turn-end buff down as its bearer finishes acting', () => {
      const [first] = buffed;
      first.buffs.addRound('残心', '', 1, { timing: 'turnEnd' });

      service.next(); // round 1 begins
      service.next(); // the bearer acts
      expect(buffsOf(first).map((buff: DataElement) => buff.name)).toContain('残心');

      service.next(); // the bearer's turn closes

      expect(buffsOf(first).map((buff: DataElement) => buff.name)).not.toContain('残心');
    });

    it('leaves a buff pinned to a turn out of the round-end sweep', () => {
      const [, target] = buffed;
      target.buffs.addRound('祝福', '', 1, { timing: 'turnStart', trigger: '居ない人' });
      sendSpy.mockClear();

      advanceToRoundEnd();

      expect(buffsOf(target).map((buff: DataElement) => buff.name)).toContain('祝福');
      expect(buffsOf(target)[0].value).toBe(1);
    });

    it('says nothing when no buff expired', () => {
      buffed.forEach((character) => character.buffs.delete('猛攻撃'));
      buffed[0].buffs.addRound('長い', '', 5);
      sendSpy.mockClear();

      advanceToRoundEnd();

      const announced = sendSpy.mock.calls.map((call: unknown[]) => String(call[1]));
      expect(announced.some((text: string) => text.includes('feature.turnOrder.buffExpired'))).toBe(false);
      expect(buffsOf(buffed[0])[0].value).toBe(4);
    });
  });

  describe('pieces that have acted', () => {
    it('marks whoever was up as having acted when the turn is handed on', () => {
      service.next(); // round 1 begins
      service.next(); // first character

      expect(service.isActed(chars[0].identifier)).toBe(false);
      service.next();
      expect(service.isActed(chars[0].identifier)).toBe(true);
    });

    it('hands the turn to the earliest piece that has not acted yet', () => {
      service.next(); // round 1 begins
      // The turn is forced onto the last of them, which is what clicking a piece does.
      service.setCurrent(chars[2].identifier);

      service.next();
      expect(service.isActed(chars[2].identifier)).toBe(true);
      expect(turnState.currentIdentifier).toBe(chars[0].identifier);

      // And it keeps going down the order rather than handing the turn back round again.
      service.next();
      expect(turnState.currentIdentifier).toBe(chars[1].identifier);
    });

    it('ends the round once everybody has acted', () => {
      service.next(); // round 1 begins
      service.setCurrent(chars[0].identifier);
      service.next(); // chars[1]
      service.next(); // chars[2]
      service.next(); // nobody left

      expect(turnState.phase).toBe('roundEnd');
    });

    it('clears what was acted when a round opens', async () => {
      service.next(); // round 1 begins
      service.next(); // first character
      service.next(); // marks the first as acted

      await service.advanceRound();

      expect(turnState.actedIdentifiers).toEqual([]);
    });
  });

  it('keeps a piece that takes no turn out of the order', () => {
    orderedSpy.mockRestore();
    const inventory = TestBed.inject(GameObjectInventoryService);
    const [acting, watching] = [new GameCharacter(), new GameCharacter()];
    [acting, watching].forEach((c) => c.initialize());
    watching.noTurn = true;
    vi.spyOn(inventory.tableInventory, 'tabletopObjects', 'get').mockReturnValue([acting, watching]);

    expect(service.orderedCharacters()).toEqual([acting]);
  });

  describe('where the round stands, read in one go', () => {
    it('follows the round as it is written, once the change has been told', async () => {
      expect(service.progress()).toMatchObject({ round: 0, currentIdentifier: '', canUndo: false, buffDecay: true });

      service.next();
      service.next();
      service.next();
      service.hold(chars[1].identifier);
      await Promise.resolve();

      const progress = service.progress();
      expect(progress.round).toBe(1);
      expect(progress.currentIdentifier).toBe(chars[2].identifier);
      expect([...progress.acted]).toEqual([chars[0].identifier]);
      expect([...progress.held]).toEqual([chars[1].identifier]);
      expect(progress.canUndo).toBe(true);
    });
  });

  describe('saying whose turn it is', () => {
    it('names the piece the players can see, and leaves one they cannot unnamed', () => {
      const seen = vi
        .spyOn(TestBed.inject(VisionService), 'isSeenByParty')
        .mockImplementation((character) => character !== chars[1]);
      service.next(); // round 1 begins
      sendSpy.mockClear();

      service.next(); // chars[0] is up
      service.next(); // chars[1] is up

      const announced = sendSpy.mock.calls.map((call: unknown[]) => String(call[1]));
      expect(announced).toEqual(['feature.turnOrder.announce', 'feature.turnOrder.announceUnseen']);
      seen.mockRestore();
    });
  });

  describe('advancing the round itself', () => {
    it('closes the round it is in and opens the next one', async () => {
      service.next(); // round 1 begins
      service.next(); // first character

      await service.advanceRound();

      expect(turnState.round).toBe(2);
      expect(turnState.phase).toBe('roundStart');
      expect(turnState.currentIdentifier).toBe('');
      const announced = sendSpy.mock.calls.map((call: unknown[]) => String(call[1]));
      expect(announced).toContain('feature.turnOrder.roundEnd');
      expect(announced).toContain('feature.turnOrder.roundStart');
    });

    it('takes the round back to where the one before it left off', async () => {
      service.next(); // round 1 begins
      service.next(); // chars[0] is up
      await service.advanceRound(); // round 2 begins

      service.retreatRound();

      expect(turnState.round).toBe(1);
      expect(turnState.currentIdentifier).toBe(chars[0].identifier);
    });

    it('opens the first round from idle without closing one that never began', async () => {
      await service.advanceRound();

      expect(turnState.round).toBe(1);
      expect(turnState.phase).toBe('roundStart');
      expect(sendSpy.mock.calls.map((call: unknown[]) => String(call[1]))).not.toContain('feature.turnOrder.roundEnd');
    });
  });

  describe('the ground under whoever is up', () => {
    let sprang: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      sprang = vi.spyOn(TestBed.inject(TriggerFireService), 'standingOn').mockReturnValue([]);
    });

    it('springs what the piece taking a turn is standing on', () => {
      service.next();
      service.next();

      expect(sprang).toHaveBeenCalledWith(chars[0], 'turnStart');
    });

    it('springs what the piece leaving a turn is standing on before the next takes one', () => {
      service.next();
      service.next();
      sprang.mockClear();

      service.next();

      expect(sprang.mock.calls.map((call: unknown[]) => call[1])).toEqual(['turnEnd', 'turnStart']);
    });

    it('keeps a turn the ground closes in passing as a piece leaves its own, and passes that piece over', () => {
      service.next();
      service.next();
      sprang.mockImplementation((piece: GameCharacter, moment: string) => {
        if (piece === chars[0] && moment === 'turnEnd') service.closeTurnsInPassing([chars[1].identifier]);
        return [];
      });

      service.next();

      expect(turnState.actedIdentifiers).toEqual([chars[1].identifier, chars[0].identifier]);
      expect(turnState.currentIdentifier).toBe(chars[2].identifier);
    });

    it('keeps turning where the ground will not go off', () => {
      sprang.mockImplementation(() => {
        throw new Error('no table out');
      });

      service.next();
      service.next();

      expect(turnState.currentIdentifier).toBe(chars[0].identifier);
    });
  });

  describe('stepping the round back', () => {
    it('puts the acted list back as it was', () => {
      service.next(); // round 1 begins
      service.next(); // first character
      service.next(); // first character has acted

      service.prev();

      expect(turnState.actedIdentifiers).toEqual([]);
      expect(turnState.currentIdentifier).toBe(chars[0].identifier);
    });

    it('puts back the buffs a whole round took away', async () => {
      const bearer = GameCharacter.create('ラウンド戻し', 1, '');
      bearer.addExtendData();
      bearer.buffs.addRound('祝福', '', 1);
      orderedSpy.mockReturnValue([bearer]);

      service.next(); // round 1 begins
      service.next(); // the bearer is up
      await service.advanceRound(); // the round ends and 祝福 runs out

      expect(bearer.buffDataElement?.children[0]?.children ?? []).toHaveLength(0);

      service.retreatRound();

      const left = bearer.buffDataElement?.children[0]?.children ?? [];
      expect(left.map((buff) => buff.name)).toEqual(['祝福']);
      expect(left[0].value).toBe(1);
    });

    it('does nothing once there is nothing left to go back to', () => {
      service.prev();

      expect(turnState.phase).toBe('idle');
      expect(turnState.round).toBe(0);
    });
  });

  it('reset clears the state and announces it', () => {
    service.setCurrent(chars[1].identifier);
    sendSpy.mockClear();
    service.reset();
    expect(turnState.currentIdentifier).toBe('');
    expect(turnState.round).toBe(0);
    expect(turnState.phase).toBe('idle');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  describe('waiting to step in', () => {
    const [a, b, c] = [0, 1, 2];
    const id = (index: number) => chars[index].identifier;
    const said = () => sendSpy.mock.calls.map((call: unknown[]) => call[1] as string);

    beforeEach(() => {
      service.next(); // round 1 begins
      service.next(); // A is up
    });

    it('has the piece whose turn it is wait, handing the turn on without counting it as had', () => {
      service.hold(id(a));

      expect(service.currentIdentifier).toBe(id(b));
      expect(service.isHeld(id(a))).toBe(true);
      expect(service.isActed(id(a))).toBe(false);
      expect(said()).toContain('feature.turnOrder.holdAnnounce');
    });

    it('passes a waiting piece over, and gives it its turn once nobody else is waiting', () => {
      service.hold(id(a));
      service.next();
      expect(service.currentIdentifier).toBe(id(c));

      service.next();
      expect(service.currentIdentifier).toBe(id(a));
      expect(service.isHeld(id(a))).toBe(false);

      service.next();
      expect(turnState.phase).toBe('roundEnd');
    });

    it('does not open the turn of a waiting piece a second time when it comes back', () => {
      const started = vi.fn();
      TestBed.inject(TurnHooksService).onTurnStart(started);
      service.hold(id(a));
      service.next();
      service.next();

      expect(service.currentIdentifier).toBe(id(a));
      expect(started.mock.calls.filter(([piece]) => piece === id(a))).toHaveLength(0);
      expect(started).toHaveBeenCalledWith(id(c));
    });

    it('steps a waiting piece in at once, and goes back to the turn it stepped into', () => {
      service.hold(id(a));
      expect(service.mayInterrupt(id(a))).toBe(true);

      service.interrupt(id(a));
      expect(service.currentIdentifier).toBe(id(a));
      expect(service.isHeld(id(a))).toBe(false);
      expect(service.isActed(id(b))).toBe(false);
      expect(said()).toContain('feature.turnOrder.interruptAnnounce');

      service.next();
      expect(service.currentIdentifier).toBe(id(b));
      expect(service.isActed(id(a))).toBe(true);
      expect(said()).toContain('feature.turnOrder.resumeAnnounce');

      service.next();
      expect(service.currentIdentifier).toBe(id(c));
      service.next();
      expect(turnState.phase).toBe('roundEnd');
    });

    it('ends the turn stepped into for whatever waits on a turn, and opens the one stepping in', () => {
      const ended = vi.fn();
      const started = vi.fn();
      const hooks = TestBed.inject(TurnHooksService);
      hooks.onTurnEnd(ended);
      service.hold(id(c));
      hooks.onTurnStart(started);

      service.interrupt(id(c));

      expect(ended).toHaveBeenCalledTimes(1);
      expect(started).toHaveBeenCalledWith(id(c));
    });

    it('holds a piece back before its turn comes, which the round then passes over', () => {
      service.hold(id(b));
      expect(service.currentIdentifier).toBe(id(a));

      service.next();
      expect(service.currentIdentifier).toBe(id(c));
      service.next();
      expect(service.currentIdentifier).toBe(id(b));
    });

    it('lets nobody wait who has had a turn or is already waiting, nor anybody outside a round', () => {
      service.next();
      expect(service.mayHold(id(a))).toBe(false);
      service.hold(id(c));
      expect(service.mayHold(id(c))).toBe(false);
      expect(service.mayInterrupt(id(b))).toBe(false);

      service.reset();
      expect(service.mayHold(id(b))).toBe(false);
    });

    it('names a waiting piece among those left behind when the round is pressed on', async () => {
      service.next();
      service.hold(id(c));
      expect(service.unactedCharacters()).toEqual([chars[b], chars[c]]);

      await service.advanceRound();

      expect(askedToLeaveBehind).toHaveBeenCalledTimes(1);
      expect(service.isHeld(id(c))).toBe(false);
      expect(turnState.holding).toBe('');
    });

    it('puts the waiting back as it was with a step back', () => {
      service.hold(id(a));

      service.prev();

      expect(service.currentIdentifier).toBe(id(a));
      expect(service.isHeld(id(a))).toBe(false);
    });

    it('goes back to the turn stepped into after a step back over the one that stepped in', () => {
      service.hold(id(a));
      service.interrupt(id(a));
      service.next();
      service.prev();

      expect(service.currentIdentifier).toBe(id(a));
      service.next();
      expect(service.currentIdentifier).toBe(id(b));
    });

    it('lets nobody wait whose turn was stepped into, and gives a piece no second turn in the round', () => {
      service.hold(id(c));
      service.interrupt(id(c));
      expect(service.mayHold(id(a))).toBe(false);
      service.hold(id(a));
      expect(service.isHeld(id(a))).toBe(false);

      service.next();
      expect(service.currentIdentifier).toBe(id(a));
      service.next();
      expect(service.currentIdentifier).toBe(id(b));

      expect(service.mayInterrupt(id(a))).toBe(false);
      expect(service.mayInterrupt(id(c))).toBe(false);
      service.next();
      expect(turnState.phase).toBe('roundEnd');
    });

    it('takes a waiting piece out of waiting once its turn ends in passing', () => {
      service.hold(id(b));

      service.closeTurnsInPassing([id(b)]);

      expect(service.isActed(id(b))).toBe(true);
      expect(service.isHeld(id(b))).toBe(false);
      expect(service.mayInterrupt(id(b))).toBe(false);
    });

    it('reads a turn sent by a peer that has never heard of waiting as holding nobody back', () => {
      (turnState as unknown as { holding: string | undefined }).holding = undefined;

      expect(service.heldIdentifiers).toEqual([]);
      service.next();
      expect(service.currentIdentifier).toBe(id(b));
    });
  });

  describe('pressing the round on over pieces that have not moved', () => {
    let waiting: GameCharacter[];

    beforeEach(() => {
      waiting = ['コマ1', 'コマ2', 'コマ3'].map((name) => GameCharacter.create(name, 1, ''));
      orderedSpy.mockReturnValue(waiting);
      service.next();
    });

    it('asks before leaving anyone behind, naming who is being left', async () => {
      await service.advanceRound();

      const asked = askedToLeaveBehind.mock.calls[0][0] as { message: string };
      expect(asked.message).toContain('コマ1');
      expect(asked.message).toContain('コマ2');
      expect(asked.message).toContain('コマ3');
    });

    it('stays where it is when the answer is no', async () => {
      askedToLeaveBehind.mockResolvedValue(false);

      await service.advanceRound();

      expect(turnState.round).toBe(1);
    });

    it('moves on when the answer is yes', async () => {
      await service.advanceRound();

      expect(turnState.round).toBe(2);
    });

    it('leaves out a piece kept from the inventory, which was never going to be reached', async () => {
      orderedSpy.mockRestore();
      const inventory = TestBed.inject(GameObjectInventoryService);
      const seen = ['見えるコマ1', '見えるコマ2'].map((name) => GameCharacter.create(name, 1, ''));
      const unseen = GameCharacter.create('隠れコマ', 1, '');
      unseen.hideInventory = true;
      vi.spyOn(inventory.tableInventory, 'tabletopObjects', 'get').mockReturnValue([...seen, unseen]);
      service.reset();
      service.next(); // round 1 begins
      service.next(); // the first of them is up
      service.next(); // the first has acted, the second is up

      await service.advanceRound();

      const asked = askedToLeaveBehind.mock.calls[0][0] as { message: string };
      expect(asked.message).toContain('見えるコマ2');
      expect(asked.message).not.toContain('隠れコマ');
    });

    it('asks nothing at all once everyone has moved', async () => {
      turnState.actedIdentifiers = waiting.map((piece) => piece.identifier);

      await service.advanceRound();

      expect(askedToLeaveBehind).not.toHaveBeenCalled();
      expect(turnState.round).toBe(2);
    });

    it('counts the rest rather than naming a whole table of them', async () => {
      orderedSpy.mockReturnValue(
        Array.from({ length: 12 }, (_, index) => GameCharacter.create(`兵${index + 1}`, 1, ''))
      );

      await service.advanceRound();

      const asked = askedToLeaveBehind.mock.calls[0][0] as { message: string };
      expect(asked.message).toContain('兵8');
      expect(asked.message).not.toContain('兵9');
      expect(asked.message).toContain('feature.turnOrder.unactedMore');
    });
  });

  describe('taking the round side by side', () => {
    let heroes: Party;
    let monsters: Party;
    let hero: GameCharacter;
    let squire: GameCharacter;
    let monster: GameCharacter;
    let bystander: GameCharacter;

    function saidTo(): string[] {
      return sendSpy.mock.calls.map((call: unknown[]) => call[1] as string);
    }

    function pressUntil(reached: () => boolean, limit = 30): void {
      for (let press = 0; press < limit && !reached(); press += 1) service.next();
    }

    beforeEach(() => {
      orderedSpy.mockRestore();
      heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      monsters = new Party();
      monsters.name = '敵';
      monsters.initialize();

      [hero, squire, monster, bystander] = [
        new GameCharacter(),
        new GameCharacter(),
        new GameCharacter(),
        new GameCharacter(),
      ];
      [hero, squire, monster, bystander].forEach((piece) => piece.initialize());
      hero.partyIdentifier = heroes.identifier;
      squire.partyIdentifier = heroes.identifier;
      monster.partyIdentifier = monsters.identifier;

      vi.spyOn(TestBed.inject(GameObjectInventoryService).tableInventory, 'tabletopObjects', 'get').mockReturnValue([
        hero,
        monster,
        squire,
        bystander,
      ]);

      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionOrder = `${heroes.identifier},${monsters.identifier}`;
    });

    it('gathers the pieces under their sides, in the order the sides are taken', () => {
      expect(service.orderedSides().map((group) => group.side)).toEqual([
        heroes.identifier,
        monsters.identifier,
        '@none',
      ]);
      expect(service.orderedCharacters()).toEqual([hero, squire, monster, bystander]);
    });

    it('leaves the pieces on no party out where the room asks it to', () => {
      Config.instance.factionSkipUnassigned = true;

      expect(service.orderedCharacters()).toEqual([hero, squire, monster]);
    });

    it('opens the first side once the round has begun', () => {
      service.next();
      expect(turnState.phase).toBe('roundStart');

      service.next();

      expect(service.currentSide).toBe(heroes.identifier);
      expect(turnState.phase).toBe('acting');
      expect(saidTo()).toContain('feature.turnOrder.sidePhaseStart');
    });

    it('answers for a turn sent by a peer that has never heard of sides', () => {
      // Applying a context replaces the whole record, so a field the sender does not have
      // comes back as nothing rather than as an empty string.
      (turnState as unknown as { currentSide: string | undefined }).currentSide = undefined;

      expect(() => service.currentSide).not.toThrow();
      expect(service.currentSide).toBe('');
    });

    it('tells whatever waits on the turn that a turn has ended, side by side as one at a time', () => {
      const ended = vi.fn();
      TestBed.inject(TurnHooksService).onTurnEnd(ended);
      service.next();
      service.next();
      service.next();
      expect(service.currentIdentifier).toBe(hero.identifier);
      expect(ended).not.toHaveBeenCalled();

      service.next();
      expect(ended).toHaveBeenCalledTimes(1);
      service.setCurrent(monster.identifier);
      expect(ended).toHaveBeenCalledTimes(2);
    });

    it('goes round the pieces of a side before it leaves for the next', () => {
      service.next();
      service.next();

      service.next();
      expect(service.currentIdentifier).toBe(hero.identifier);
      expect(service.currentSide).toBe(heroes.identifier);

      service.next();
      expect(service.currentIdentifier).toBe(squire.identifier);
      expect(service.currentSide).toBe(heroes.identifier);

      service.next();
      expect(service.currentSide).toBe(monsters.identifier);
      expect(service.isActed(hero.identifier)).toBe(true);
      expect(service.isActed(squire.identifier)).toBe(true);
    });

    it('leaves nobody behind on the side it is closing', () => {
      service.next();
      service.next();

      service.next();

      expect(service.currentSide).toBe(heroes.identifier);
      expect(service.isActed(squire.identifier)).toBe(false);
    });

    it('ends the round once the last side has had its phase', () => {
      pressUntil(() => turnState.phase === 'roundEnd');

      expect(turnState.phase).toBe('roundEnd');
      expect(saidTo()).toContain('feature.turnOrder.roundEnd');
    });

    it('lets a side move in whatever order it likes', () => {
      service.next();
      service.next();

      service.setCurrent(squire.identifier);

      expect(turnState.currentIdentifier).toBe(squire.identifier);
      expect(service.currentSide).toBe(heroes.identifier);
      expect(service.isActed(hero.identifier)).toBe(false);
    });

    it('closes one piece off before opening the next, so each is opened once', () => {
      service.next();
      service.next();
      service.setCurrent(hero.identifier);

      service.setCurrent(squire.identifier);

      expect(service.isActed(hero.identifier)).toBe(true);
      expect(service.isActed(squire.identifier)).toBe(false);
    });

    it('does nothing on being handed the turn a piece already holds', () => {
      service.next();
      service.next();
      service.setCurrent(hero.identifier);
      const before = turnState.history;

      service.setCurrent(hero.identifier);

      expect(turnState.history).toBe(before);
      expect(service.isActed(hero.identifier)).toBe(false);
    });

    it('goes round the pieces of a side in order where the room asks for it', () => {
      Config.instance.factionPhaseMode = 'initiative';
      service.next();

      service.next();

      expect(turnState.currentIdentifier).toBe(hero.identifier);

      service.next();

      expect(turnState.currentIdentifier).toBe(squire.identifier);
      expect(service.currentSide).toBe(heroes.identifier);

      service.next();

      expect(service.currentSide).toBe(monsters.identifier);
      expect(turnState.currentIdentifier).toBe(monster.identifier);
    });

    it('passes over a side nobody is on', () => {
      monster.noTurn = true;

      pressUntil(() => service.currentSide === '@none');

      expect(service.currentSide).toBe('@none');
    });

    it('stands somewhere a piece is on when the party it was on is taken away', () => {
      service.next();
      service.next();
      expect(service.currentSide).toBe(heroes.identifier);

      heroes.destroy();

      expect(service.currentSide).toBe(monsters.identifier);
    });

    it('passes a waiting piece over within its side, and gives it its turn once every side has had its phase', () => {
      service.next();
      service.next();
      service.next();
      expect(service.currentIdentifier).toBe(hero.identifier);

      service.hold(hero.identifier);
      expect(service.currentIdentifier).toBe(squire.identifier);

      pressUntil(() => service.currentIdentifier === hero.identifier);

      expect(service.isActed(monster.identifier)).toBe(true);
      expect(service.isActed(bystander.identifier)).toBe(true);
      expect(service.currentSide).toBe(heroes.identifier);
      service.next();
      expect(turnState.phase).toBe('roundEnd');
    });

    it("steps in within another side's phase without opening its own, and goes back to the turn it stepped into", () => {
      service.next();
      service.next();
      service.next();
      service.hold(hero.identifier);
      pressUntil(() => service.currentIdentifier === monster.identifier);

      service.interrupt(hero.identifier);
      expect(service.currentIdentifier).toBe(hero.identifier);
      expect(service.currentSide).toBe(monsters.identifier);

      service.next();
      expect(service.currentIdentifier).toBe(monster.identifier);
      expect(service.isActed(hero.identifier)).toBe(true);
      expect(service.isActed(monster.identifier)).toBe(false);
    });

    it('puts the round back a step, side and all', () => {
      pressUntil(() => service.currentSide === monsters.identifier);
      expect(service.currentSide).toBe(monsters.identifier);

      service.prev();

      expect(service.currentSide).toBe(heroes.identifier);
      expect(service.isActed(squire.identifier)).toBe(false);
    });

    it('puts a whole round back', () => {
      pressUntil(() => turnState.round === 2, 40);
      expect(turnState.round).toBe(2);

      service.retreatRound();

      expect(turnState.round).toBe(1);
    });

    it('leaves the round on no side once it is reset', () => {
      service.next();
      service.next();

      service.reset();

      expect(turnState.currentSide).toBe('');
      expect(service.currentSide).toBe('');
    });
  });
});
