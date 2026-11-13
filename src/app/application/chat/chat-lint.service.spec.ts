import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatLintService, type ChatLintSource } from '@axe/application/chat/chat-lint.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { Network } from '@axe/core/network/network';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLintService', () => {
  let service: ChatLintService;
  let speaker: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatLintService);
    speaker = GameCharacter.create('戦士', 1, '');
  });

  afterEach(() => {
    speaker.destroy();
  });

  function watch(text: string, overrides: Partial<ChatLintSource> = {}) {
    const source = {
      text: signal(text),
      sendFrom: signal(speaker.identifier),
      gameType: signal('DiceBot'),
      path: 'chatWindow' as const,
      ...overrides,
    };
    return { source, session: service.watch(source) };
  }

  const codesOf = (session: ReturnType<ChatLintService['watch']>) => session.diagnostics().map((found) => found.code);

  it('checks against the piece spoken as, and again when the speaker changes', () => {
    const sendFrom = signal(speaker.identifier);
    const { session } = watch(':HP-5', { sendFrom });
    expect(codesOf(session)).toEqual([]);

    sendFrom.set('');
    expect(codesOf(session)).toEqual(['edit.noSpeaker']);
  });

  it('checks again when the text changes', () => {
    const text = signal(':HP-5');
    const { session } = watch('', { text });
    text.set(':気力-5');
    expect(codesOf(session)).toEqual(['res.unknownStatus']);
  });

  it('shows what a reference is filled in with', () => {
    const { session } = watch('{HP}');
    const [annotation] = session.annotations();
    expect(annotation).toMatchObject({ kind: 'value', from: 0, to: 4 });
    expect(annotation.label).toBe(String(speaker.status.getValue('HP', 'now')));
  });

  it('fills in the number to beat from the rolls in the tab, again as one comes in', () => {
    const tab = new ChatTab();
    tab.initialize();
    ObjectStore.instance.add(tab);
    try {
      const { session } = watch('2d6>={目標値}', { tabIdentifier: signal(tab.identifier) });
      expect(codesOf(session)).toEqual(['ref.targetNumberNone']);

      tab.addMessage({
        from: 'System-BCDice',
        originFrom: 'gm',
        name: '<BCDice：ゴブリン>',
        text: 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [戦士]',
        tag: 'system',
        timestamp: 1001,
      });

      expect(codesOf(session)).toEqual([]);
      expect(session.annotations()).toEqual([{ kind: 'value', label: '14', from: 5, to: 10 }]);
    } finally {
      tab.destroy();
    }
  });

  it('fills in the number to beat for a line said as no piece, as sending it does', () => {
    const tab = new ChatTab();
    tab.initialize();
    ObjectStore.instance.add(tab);
    try {
      tab.addMessage({
        from: 'System-BCDice',
        originFrom: 'gm',
        name: '<BCDice：ゴブリン>',
        text: 'DiceBot : (2D6+8) → 7[3,4]+8 → 15',
        tag: 'system',
        timestamp: 1001,
      });
      const { session } = watch('2d6>={目標値}', {
        sendFrom: signal('someone-else'),
        tabIdentifier: signal(tab.identifier),
      });

      expect(codesOf(session)).toEqual([]);
      expect(session.annotations()).toEqual([{ kind: 'value', label: '15', from: 5, to: 10 }]);
    } finally {
      tab.destroy();
    }
  });

  describe('the number to beat a line holds', () => {
    let tab: ChatTab;

    beforeEach(() => {
      tab = new ChatTab();
      tab.initialize();
      ObjectStore.instance.add(tab);
    });

    afterEach(() => {
      tab.destroy();
    });

    function answer(text: string, at: number, tag = 'system') {
      return tab.addMessage({
        from: 'System-BCDice',
        originFrom: 'gm',
        name: '<BCDice：ゴブリン>',
        text,
        tag,
        timestamp: at,
      });
    }

    it('tells the number found and where, with the newest answers that may be picked instead', () => {
      const older = answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
      answer('DiceBot : (2D6+5) → 9[4,5]+5 → 14 [戦士]', 1011);
      answer('DiceBot : (1D6) → 3', 1021, 'system secret');
      const { session } = watch('2d6>={目標値}', { tabIdentifier: signal(tab.identifier) });

      const number = session.targetNumber();
      expect(number?.found).toMatchObject({ total: 14, from: 'aimed' });
      expect(number?.chosen).toBeNull();
      expect(number?.choices.map((choice) => choice.total)).toEqual([14, 15]);
      expect(number?.choices[1].answer).toBe(older);
    });

    it('fills the line in with the answer picked, and with the one found again once the pick is gone', () => {
      const older = answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
      answer('DiceBot : (2D6+5) → 9[4,5]+5 → 14 [戦士]', 1011);
      const chosenTargetNumber = signal(older.identifier);
      const { session } = watch('2d6>={目標値}', { tabIdentifier: signal(tab.identifier), chosenTargetNumber });

      expect(session.targetNumber()?.chosen?.total).toBe(15);
      expect(session.annotations()).toEqual([{ kind: 'value', label: '15', from: 5, to: 10 }]);

      chosenTargetNumber.set('gone');
      expect(session.targetNumber()?.chosen).toBeNull();
      expect(session.annotations()).toEqual([{ kind: 'value', label: '14', from: 5, to: 10 }]);
    });

    it("tells the tab's own number to beat once it is set", async () => {
      const older = answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
      answer('DiceBot : (1D6) → 3', 1011);
      const { session } = watch('2d6>={目標値}', {
        sendFrom: signal('someone-else'),
        tabIdentifier: signal(tab.identifier),
      });
      expect(session.targetNumber()?.found).toMatchObject({ total: 3, from: 'byOthers' });

      tab.pinnedTargetNumber = older.identifier;

      await vi.waitFor(() => expect(session.targetNumber()?.found).toMatchObject({ total: 15, from: 'pinned' }));
    });

    it('tells the number for a line a variable of the palette brings a {目標値} into', () => {
      answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
      speaker.chatPalette!.setPalette('//抵抗=2d6>={目標値}\n{抵抗} 生命抵抗');
      const { session } = watch('{抵抗} 生命抵抗', {
        sendFrom: signal(speaker.identifier),
        tabIdentifier: signal(tab.identifier),
        path: 'palette',
      });

      expect(session.targetNumber()?.found).toMatchObject({ total: 15 });
    });

    it("tells nothing for a line that holds none, or one the speaker's own sheet answers", () => {
      answer('DiceBot : (2D6+8) → 7[3,4]+8 → 15', 1001);
      const text = signal('2d6>=12');
      const { session } = watch('', { text, tabIdentifier: signal(tab.identifier) });
      expect(session.targetNumber()).toBeNull();

      speaker.rootDataElement?.appendChild(DataElement.create('目標値', 9, {}, '目標値_' + speaker.identifier));
      text.set('2d6>={目標値}');
      expect(session.targetNumber()).toBeNull();
    });
  });

  it('checks a roll once the game system has arrived', async () => {
    const notHereYet = vi.spyOn(DiceBot, 'loadedGameSystem').mockReturnValue(null);
    try {
      const { session } = watch('CC<=abc', { gameType: signal('Cthulhu7th') });
      expect(codesOf(session)).toEqual([]);

      await vi.waitFor(() => expect(codesOf(session)).toEqual(['dice.unrollable']), { timeout: 5000 });
    } finally {
      notHereYet.mockRestore();
    }
  });

  it('rolls each line of a long palette once, however often it is checked again', () => {
    const roll = vi.fn((command: string) => ({ text: `(${command}) ＞ 7` }));
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: null, eval: roll };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    try {
      const lines = Array.from({ length: 100 }, (_, index) => `2d6+${index} 技能${index}`).join('\n');
      const text = signal(lines);
      const { session } = watch('', { text, path: 'palette', mode: 'palette' });
      session.diagnostics();
      session.rolls();
      const rolled = roll.mock.calls.length;

      text.set(`${lines}\n`);
      session.diagnostics();
      session.rolls();

      expect(rolled).toBeGreaterThanOrEqual(100);
      expect(roll.mock.calls.length).toBe(rolled);
    } finally {
      loaded.mockRestore();
    }
  });

  it('rolls nothing for what is shown as the text is typed, leaving each roll to the rolls', () => {
    const roll = vi.fn((command: string) => ({ text: `(${command}) ＞ 7` }));
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: null, eval: roll };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    try {
      const { session } = watch('2d6+{HP} 攻撃');

      expect(session.annotations().map((annotation) => annotation.kind)).toEqual(['value']);
      expect(roll).not.toHaveBeenCalled();

      expect(session.rolls()).toEqual([expect.objectContaining({ kind: 'roll', label: expect.stringContaining('7') })]);
      expect(roll).toHaveBeenCalled();
    } finally {
      loaded.mockRestore();
    }
  });

  it('checks nothing again for a move of the reader’s cursor that leaves its role as it was', () => {
    PeerCursor.createMyCursor();
    try {
      const { session } = watch(':HP-1');
      const first = session.diagnostics();

      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      expect(session.diagnostics()).toBe(first);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      expect(session.diagnostics()).not.toBe(first);
    } finally {
      PeerCursor.myCursor.destroy();
      PeerCursor.myCursor = null!;
    }
  });

  it('reads afresh at each change to the text whether the seat is kept off the table', () => {
    const text = signal(':HP-1');
    const { session } = watch('', { text });
    expect(codesOf(session)).toEqual([]);

    const keptOff = vi.spyOn(PeerCursor, 'isMyselfKeptOffTable', 'get').mockReturnValue(true);
    try {
      text.set(':HP-2');

      expect(codesOf(session)).toEqual(['edit.keptOffTable']);
    } finally {
      keptOff.mockRestore();
    }
  });

  it('finds a battle with nobody to strike where the speaker is the one piece selected', () => {
    speaker.location = { name: 'table', x: 0, y: 0 };
    const other = GameCharacter.create('敵', 1, '');
    other.location = { name: 'table', x: 100, y: 0 };
    try {
      const selection = TestBed.inject(SelectionSignalService);
      selection.selectObject(other.identifier, other.aliasName);
      const { session } = watch('斬る 《vs》');
      expect(codesOf(session)).toEqual([]);

      selection.selectObject(speaker.identifier, speaker.aliasName);

      expect(codesOf(session)).toEqual(['battle.noTarget']);
    } finally {
      other.destroy();
    }
  });

  it('checks again as the reader is made a player from a guest, the text as it was', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Guest;
    const { session } = watch(':HP-1');
    expect(codesOf(session)).toEqual(['edit.keptOffTable']);

    PeerCursor.myCursor.role = PeerRole.Player;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);

    expect(codesOf(session)).toEqual([]);
  });

  it('looks the room over again for a change to the room, not for each letter typed', () => {
    const text = signal('{HP} :HP-1');
    const { session } = watch('', { text });
    session.annotations();
    const lookups = vi.spyOn(TestBed.inject(ObjectStore), 'getObjects');
    try {
      text.set('{HP} :HP-2');
      expect(session.annotations().map((annotation) => annotation.kind)).toEqual(['value']);

      expect(lookups).not.toHaveBeenCalled();
    } finally {
      lookups.mockRestore();
    }
  });

  it('checks no roll in a line a dice table of the room answers', () => {
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: /^1d6T/i, eval: () => null };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    const table = new DiceTable();
    table.initialize();
    try {
      const { session } = watch('1d6T');
      table.command = '1d6U';
      expect(codesOf(session)).toEqual(['dice.unrollable']);

      table.command = '1d6T';
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);

      expect(codesOf(session)).toEqual([]);
    } finally {
      table.destroy();
      loaded.mockRestore();
    }
  });

  it('checks again as a piece is renamed to the name a dice token is put onto', () => {
    const piece = GameCharacter.create('ゴブ', 1, '');
    try {
      const { session } = watch('2d6 dice:ゴブリン');
      expect(codesOf(session)).toEqual(['diceToken.unknown']);

      piece.name = 'ゴブリン';
      TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);

      expect(codesOf(session)).toEqual([]);
    } finally {
      piece.destroy();
    }
  });

  it('checks again as the piece a battle is aimed at is put on the table or taken off it', () => {
    const piece = GameCharacter.create('ゴブリン', 1, '');
    piece.setLocation('graveyard');
    piece.targeted = true;
    try {
      const { session } = watch('いくぞ《vs》');
      expect(codesOf(session)).toEqual(['battle.noTarget']);

      piece.setLocation('table');
      TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);

      expect(codesOf(session)).toEqual([]);
    } finally {
      piece.destroy();
    }
  });

  it('checks a portrait command again as the picture it picks arrives', () => {
    const url = 'https://example.com/smile.png';
    const portrait = DataElement.create('imageIdentifier', url, { type: 'image', currentValue: '笑顔' });
    speaker.imageDataElement!.appendChild(portrait);
    const { session } = watch('こんにちは @笑顔');
    expect(codesOf(session)).toContain('portrait.unknown');

    const image = TestBed.inject(ImageStorage).add(url);
    try {
      TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);

      expect(codesOf(session)).not.toContain('portrait.unknown');
    } finally {
      TestBed.inject(ImageStorage).delete(image.identifier);
    }
  });

  it('checks a buff again as the room’s states change', () => {
    const catalog = StatusAilmentCatalog.instance;
    const before = catalog.ailments;
    try {
      const { session } = watch('&毒/2d6/ずっと');
      expect(codesOf(session)).toContain('buff.roundsDefault');

      catalog.ailments = [...before, { ...newStatusAilment('毒'), rounds: 2 }];
      TestBed.inject(ObjectChangeService).notifyChanged(catalog.identifier);

      expect(codesOf(session)).not.toContain('buff.roundsDefault');
    } finally {
      catalog.ailments = before;
    }
  });

  it('finds no target for a reference of the speaker that reads one through t{}, as sending it would', () => {
    speaker.detailDataElement!.appendChild(DataElement.create('攻撃', '2d6+t{防御}'));

    const { session } = watch('{攻撃}');

    expect(codesOf(session)).toEqual(['target.none']);
  });

  it('finds no target missing in a palette as it is written, but does in the palette’s own box, sent at once', () => {
    const palette = watch('t:HP-1', { path: 'palette', mode: 'palette' });
    const box = watch('t:HP-1', { path: 'palette' });

    expect(codesOf(palette.session)).not.toContain('target.none');
    expect(codesOf(box.session)).toContain('target.none');
  });

  it('checks no roll in a line a dice table answers with a stamp put right after its command', () => {
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: /^1d6T/i, eval: () => null };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    const table = new DiceTable();
    table.initialize();
    table.command = '1d6T';
    try {
      const { session } = watch('1d6T［ok:seal:ok］');

      expect(codesOf(session)).toEqual([]);
    } finally {
      table.destroy();
      loaded.mockRestore();
    }
  });

  it('checks again as a cut-in starts from chat or no longer does', () => {
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.name = '爆発';
    try {
      const { session } = watch('行くぞ 爆発');
      expect(session.annotations().map((annotation) => annotation.kind)).toEqual([]);

      cutIn.chatActivate = true;
      TestBed.inject(ObjectChangeService).notifyChanged(cutIn.identifier);

      expect(session.annotations().map((annotation) => annotation.kind)).toEqual(['cutIn']);
    } finally {
      cutIn.destroy();
    }
  });

  it('says a cut-in at the end of a secret roll does not start, as the game system takes the roll', () => {
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: /^s?\d+d\d+/i, eval: () => ({ text: '(2D6) ＞ 7' }) };
    const loaded = vi
      .spyOn(DiceBot, 'loadedGameSystem')
      .mockReturnValue(system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>);
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.name = '爆発';
    cutIn.chatActivate = true;
    try {
      expect(codesOf(watch('S2d6 爆発').session)).toEqual(['cutIn.secret']);
      expect(codesOf(watch('Sこんにちは 爆発').session)).toEqual([]);
    } finally {
      cutIn.destroy();
      loaded.mockRestore();
    }
  });

  it('checks a palette line as it is sent, its written line breaks broken', () => {
    const roll = vi.fn((command: string) => (/^2d6(\s|$)/i.test(command) ? { text: '(2D6) ＞ 7' } : null));
    const system = { ID: 'FakeSystem', COMMAND_PATTERN: null, eval: roll };
    vi.spyOn(DiceBot, 'loadedGameSystem').mockReturnValue(
      system as unknown as ReturnType<typeof DiceBot.loadedGameSystem>
    );
    const { session } = watch('2d6\\nBoom', { path: 'palette', mode: 'palette' });

    expect(codesOf(session)).not.toContain('dice.unrollable');
    expect(roll).toHaveBeenCalledWith('2d6');
  });

  it('reads the variables written into a palette being edited', () => {
    const { session } = watch('//強さ=3\n{強さ} 殴る\n{弱さ}', { path: 'palette', mode: 'palette' });
    expect(session.diagnostics().map((found) => [found.code, found.params?.['name']])).toEqual([
      ['ref.unknownEmptied', '弱さ'],
    ]);
  });
});
