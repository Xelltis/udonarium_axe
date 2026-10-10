import { TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { NamedCueService } from '@axe/application/media/named-cue.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { SWITCH_COOLDOWN_MS, SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import {
  defaultSwitchDefinition,
  SwitchAction,
  SwitchDefinition,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('SwitchPressService', () => {
  let presses: SwitchPressService;
  let macro: CharacterMacroService;
  let said: string[];
  let table: GameTable;
  const tab = { plCanView: true, plCanSpeak: true, guestCanView: true, guestCanSpeak: false } as unknown as ChatTab;

  function say(text: string, delayMs = 0): SwitchAction {
    return { kind: 'say', text, delayMs, extra: {} };
  }

  function switchWith(change: Partial<SwitchDefinition>): BoardSwitch {
    const made = new BoardSwitch();
    made.initialize();
    made.write({ ...defaultSwitchDefinition(), ...change });
    return made;
  }

  /** A block one cell across standing on a cell of the table, with a switch under it. */
  function chestAt(col: number, row: number, change: Partial<SwitchDefinition>): BoardSwitch {
    const chest = Terrain.create('宝箱', 1, 1, 1, '', '');
    chest.location = { name: 'table', x: col * GRID, y: row * GRID } as never;
    const made = switchWith(change);
    chest.appendChild(made);
    return made;
  }

  function speakAs(col: number, row: number): GameCharacter {
    const hero = GameCharacter.create('勇者', 1, '');
    hero.location = { name: 'table', x: col * GRID, y: row * GRID } as never;
    TestBed.inject(ChatSpeakerService).set(hero.identifier);
    return hero;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor().role = PeerRole.Player;
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    presses = TestBed.inject(SwitchPressService);
    macro = TestBed.inject(CharacterMacroService);
    said = [];
    vi.spyOn(macro, 'currentTab').mockReturnValue(tab);
    vi.spyOn(macro, 'sendAsSelf').mockImplementation(async (line) => {
      said.push(`self:${line}`);
      return null;
    });
    vi.spyOn(macro, 'sendAsCharacter').mockImplementation(async (character, line) => {
      said.push(`${character.name}:${line}`);
      return null;
    });
    vi.spyOn(macro, 'sendAsNamed').mockImplementation(async (name, line) => {
      said.push(`named ${name}:${line}`);
      return null;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('does what the switch says in order, waiting as long as each thing asks after the one before', async () => {
    vi.useFakeTimers();
    vi.spyOn(TestBed.inject(NamedCueService), 'playSound').mockImplementation((name) => {
      said.push(`sound:${name}`);
      return true;
    });
    const lever = switchWith({
      actions: [say('one', 3000), { kind: 'sound', name: 'bell', delayMs: 500, extra: {} }, say('two', 1000)],
    });

    const pressing = presses.press(lever);
    await vi.advanceTimersByTimeAsync(0);
    expect(said).toEqual(['self:one']);

    await vi.advanceTimersByTimeAsync(500);
    expect(said).toEqual(['self:one', 'sound:bell']);

    await vi.advanceTimersByTimeAsync(1000);
    expect(said).toEqual(['self:one', 'sound:bell', 'self:two']);
    await expect(pressing).resolves.toBe('pressed');
  });

  it('ignores a press while the switch is still going, however long it goes on for', async () => {
    vi.useFakeTimers();
    const lever = switchWith({ actions: [say('one'), say('two', SWITCH_COOLDOWN_MS * 2)] });

    const first = presses.press(lever);
    await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS + 100);

    expect(await presses.press(lever)).toBe('busy');
    await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
    await expect(first).resolves.toBe('pressed');
    expect(said).toEqual(['self:one', 'self:two']);
  });

  it('ignores a press for a moment after the last one, so a double click presses once', async () => {
    vi.useFakeTimers();
    const lever = switchWith({ actions: [say('one')] });

    expect(await presses.press(lever)).toBe('pressed');
    expect(await presses.press(lever)).toBe('busy');
    await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);

    expect(await presses.press(lever)).toBe('pressed');
    expect(said).toEqual(['self:one', 'self:one']);
  });

  it('speaks as the piece the presser has picked in the chat, where they have one', async () => {
    speakAs(0, 0);

    await presses.press(switchWith({ actions: [say('1d100<={目星}')] }));

    expect(said).toEqual(['勇者:1d100<={目星}']);
  });

  it('speaks under the name of what it sits on, else its own label, where it speaks for itself', async () => {
    await presses.press(chestAt(1, 1, { speaker: 'host', label: 'lever', actions: [say('creak')] }));
    await presses.press(switchWith({ speaker: 'host', label: 'lever', actions: [say('creak')] }));

    expect(said).toEqual(['named 宝箱:creak', 'named lever:creak']);
  });

  it('writes a system line in the tab where it speaks as the room', async () => {
    const system = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToTab').mockReturnValue(null!);

    await presses.press(switchWith({ speaker: 'system', actions: [say('the floor gives way')] }));

    expect(system).toHaveBeenCalledWith(tab, 'the floor gives way');
  });

  it('turns a watcher away without saying anything', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    expect(await presses.press(switchWith({ actions: [say('hi')] }))).toBe('watching');
    expect(said).toEqual([]);
  });

  it('plays an effect on the piece the presser speaks as, and on nobody where they speak as themselves', async () => {
    const effect = vi.spyOn(TestBed.inject(NamedCueService), 'playEffect').mockReturnValue(true);
    const sparkle = { kind: 'effect' as const, name: 'sparkle', delayMs: 0, extra: {} };

    await presses.press(switchWith({ actions: [sparkle] }));
    const hero = speakAs(0, 0);
    await presses.press(switchWith({ actions: [sparkle] }));

    expect(effect).toHaveBeenNthCalledWith(1, 'sparkle', []);
    expect(effect).toHaveBeenNthCalledWith(2, 'sparkle', [hero]);
  });

  it('goes on with the rest where one thing goes wrong', async () => {
    vi.spyOn(TestBed.inject(NamedCueService), 'launchCutIn').mockImplementation(() => {
      throw new Error('no cut-in');
    });

    const outcome = await presses.press(
      switchWith({ actions: [{ kind: 'cutIn', name: 'boom', delayMs: 0, extra: {} }, say('after')] })
    );

    expect(outcome).toBe('pressed');
    expect(said).toEqual(['self:after']);
  });

  describe('how often it can be pressed', () => {
    it('is used up by the first press where it goes once, written down before it does anything', async () => {
      vi.useFakeTimers();
      const chest = switchWith({ repeat: 'once', actions: [say('opened', 0), say('later', 1000)] });

      const pressing = presses.press(chest);
      expect(chest.spent).toBe(true);
      await vi.advanceTimersByTimeAsync(1000 + SWITCH_COOLDOWN_MS);
      await pressing;

      expect(await presses.press(chest)).toBe('spent');
      expect(said).toEqual(['self:opened', 'self:later']);
    });

    it('goes once for each piece where it goes once a piece', async () => {
      vi.useFakeTimers();
      const chest = switchWith({ repeat: 'oncePerPiece', actions: [say('searched')] });
      speakAs(0, 0);

      expect(await presses.press(chest)).toBe('pressed');
      await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
      expect(await presses.press(chest)).toBe('spent');

      speakAs(0, 0);
      await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
      expect(await presses.press(chest)).toBe('pressed');
    });

    it('lets the master try it out without spending it, however often', async () => {
      vi.useFakeTimers();
      const chest = switchWith({ repeat: 'once', actions: [say('opened')] });
      expect(await presses.press(chest)).toBe('pressed');
      await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      expect(await presses.press(chest, { trial: true })).toBe('pressed');
      expect(chest.spent).toBe(true);
    });
  });

  describe('where it has to be pressed from', () => {
    it('lets a piece standing within reach press it, and turns one farther off away', async () => {
      vi.useFakeTimers();
      const chest = chestAt(5, 5, { range: 2, actions: [say('opened')] });

      speakAs(7, 3);
      expect(await presses.press(chest)).toBe('pressed');

      speakAs(8, 5);
      await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
      expect(await presses.press(chest)).toBe('tooFar');
    });

    it('turns away somebody with no piece on the table, but not the master', async () => {
      const chest = chestAt(5, 5, { range: 1, actions: [say('opened')] });

      expect(await presses.press(chest)).toBe('noPiece');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(await presses.press(chest)).toBe('pressed');
    });

    it('turns away somebody who cannot see it, where it has to be seen', async () => {
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      const seen = new CellBits(cellCount(grid));
      seen.set(cellIndexOf(grid, 1, 1));
      vi.spyOn(TestBed.inject(VisionService), 'overlayVision').mockReturnValue({ visible: seen } as never);

      expect(await presses.press(chestAt(5, 5, { needsSight: true, actions: [say('hidden')] }))).toBe('unseen');
      expect(await presses.press(chestAt(1, 1, { needsSight: true, actions: [say('in view')] }))).toBe('pressed');
    });
  });

  describe('what it does to the table', () => {
    it('brings back what the master put out of sight, and puts out of sight what it names', async () => {
      const concealment = TestBed.inject(ConcealmentService);
      const door = Terrain.create('隠し扉', 1, 1, 2, '', '');
      table.appendChild(door);
      concealment.conceal(door);
      const goblin = GameCharacter.create('ゴブリン', 1, '');
      goblin.location = { name: 'table', x: 0, y: 0 } as never;

      await presses.press(
        switchWith({
          actions: [
            { kind: 'reveal', target: { identifier: door.identifier, name: '隠し扉' }, delayMs: 0, extra: {} },
            { kind: 'conceal', target: { identifier: 'elsewhere', name: 'ゴブリン' }, delayMs: 0, extra: {} },
          ],
        })
      );

      expect(table.terrains).toContain(door);
      expect(concealment.isConcealed(goblin)).toBe(true);
    });

    it('takes away the block it sits on once everything else is done, but not on a trial', async () => {
      vi.useFakeTimers();
      const chest = chestAt(3, 3, { actions: [{ kind: 'removeSelf', delayMs: 0, extra: {} }, say('opened', 500)] });
      const block = chest.parent as Terrain;
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      const trial = presses.press(chest, { trial: true });
      await vi.advanceTimersByTimeAsync(500);
      await trial;
      expect(ObjectStore.instance.get(block.identifier)).toBe(block);

      await vi.advanceTimersByTimeAsync(SWITCH_COOLDOWN_MS);
      const pressing = presses.press(chest);
      await vi.advanceTimersByTimeAsync(0);
      expect(ObjectStore.instance.get(block.identifier)).toBe(block);
      await vi.advanceTimersByTimeAsync(500);
      await pressing;

      expect(said).toEqual(['self:opened', 'self:opened']);
      expect(ObjectStore.instance.get(block.identifier)).toBeFalsy();
    });

    it('puts away painted ground it sits on rather than taking it off the map', async () => {
      const ground = new TableTrigger();
      ground.initialize();
      table.appendChild(ground);
      const made = switchWith({ actions: [{ kind: 'removeSelf', delayMs: 0, extra: {} }] });
      ground.appendChild(made);

      await presses.press(made);

      expect(made.retired).toBe(true);
      expect(triggersOn(table)).toContain(ground);
    });
  });

  describe('calling pieces up', () => {
    /** A copy made the way cloning makes one, since a saved piece cannot be read back in this test runner. */
    function copiesOf(template: GameCharacter): void {
      vi.spyOn(template, 'clone').mockImplementation(() => GameCharacter.create(template.name, template.size, ''));
    }

    function onTable(name: string): GameCharacter[] {
      return ObjectStore.instance
        .getObjects<GameCharacter>(GameCharacter)
        .filter((piece) => piece.name === name && piece.location.name === 'table');
    }

    it('sets down as many copies as asked for round the switch, on free ground, leaving the template where it is', async () => {
      const goblin = GameCharacter.create('ゴブリン', 1, '');
      goblin.location = { name: 'graveyard', x: 0, y: 0 } as never;
      copiesOf(goblin);
      const blocker = GameCharacter.create('岩', 1, '');
      blocker.location = { name: 'table', x: 5 * GRID, y: 5 * GRID } as never;

      await presses.press(
        chestAt(5, 5, {
          actions: [
            {
              kind: 'spawn',
              target: { identifier: goblin.identifier, name: 'ゴブリン' },
              count: 3,
              place: 'host',
              delayMs: 0,
              extra: {},
            },
          ],
        })
      );

      const called = onTable('ゴブリン');
      expect(called).toHaveLength(3);
      const cells = called.map((piece) => `${piece.location.x / GRID},${piece.location.y / GRID}`);
      expect(new Set(cells).size).toBe(3);
      expect(cells).not.toContain('5,5');
      expect(goblin.location.name).toBe('graveyard');
    });

    it('has each copy out of the graveyard before the next is made, so each is numbered after the last', async () => {
      const goblin = GameCharacter.create('ゴブリン', 1, '');
      goblin.location = { name: 'graveyard', x: 0, y: 0 } as never;
      const made: GameCharacter[] = [];
      const leftInGraveyard: number[] = [];
      vi.spyOn(goblin, 'clone').mockImplementation(() => {
        leftInGraveyard.push(made.filter((copy) => copy.location.name === 'graveyard').length);
        const copy = GameCharacter.create(goblin.name, goblin.size, '');
        copy.location = { name: 'graveyard', x: 0, y: 0 } as never;
        made.push(copy);
        return copy;
      });

      await presses.press(
        chestAt(5, 5, {
          actions: [
            {
              kind: 'spawn',
              target: { identifier: goblin.identifier, name: 'ゴブリン' },
              count: 3,
              place: 'host',
              delayMs: 0,
              extra: {},
            },
          ],
        })
      );

      expect(leftInGraveyard).toEqual([0, 0, 0]);
      expect(onTable('ゴブリン')).toHaveLength(3);
    });

    it('sets them down round the presser’s piece where asked to, finding the template by name', async () => {
      const goblin = GameCharacter.create('ゴブリン', 1, '');
      goblin.location = { name: 'graveyard', x: 0, y: 0 } as never;
      copiesOf(goblin);
      speakAs(1, 1);

      await presses.press(
        chestAt(9, 9, {
          actions: [
            {
              kind: 'spawn',
              target: { identifier: 'elsewhere', name: 'ゴブリン' },
              count: 1,
              place: 'presser',
              delayMs: 0,
              extra: {},
            },
          ],
        })
      );

      const [called] = onTable('ゴブリン');
      expect(Math.abs(called.location.x / GRID - 1)).toBeLessThanOrEqual(1);
      expect(Math.abs(called.location.y / GRID - 1)).toBeLessThanOrEqual(1);
    });
  });

  describe('turning the table', () => {
    it('turns everybody’s view to another table, found by its name', async () => {
      const cellar = new GameTable();
      cellar.name = '地下室';
      cellar.initialize();

      await presses.press(
        switchWith({
          actions: [{ kind: 'showTable', table: { identifier: 'elsewhere', name: '地下室' }, delayMs: 0, extra: {} }],
        })
      );

      expect(TestBed.inject(TableSelecter).viewTableIdentifier).toBe(cellar.identifier);
    });

    it('carries the presser’s piece to a cell, on the table being looked at unless another is named', async () => {
      const hero = speakAs(1, 1);

      await presses.press(
        switchWith({
          actions: [{ kind: 'carry', col: 8, row: 3, table: { identifier: '', name: '' }, delayMs: 0, extra: {} }],
        })
      );

      expect(hero.location).toMatchObject({ name: 'table', x: 8 * GRID, y: 3 * GRID });
    });

    it('turns the darkness and the fog on or off, lays a picture on the table and puts music on', async () => {
      table.darknessEnabled = false;
      table.fogEnabled = true;
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      const stop = vi.spyOn(jukebox, 'stop');
      const play = vi.spyOn(jukebox, 'play').mockImplementation(() => {});
      const images = TestBed.inject(ImageStorage);
      const picture = images.add('lit-map');
      picture.context.name = '明るい部屋';
      const audios = TestBed.inject(AudioStorage);
      vi.spyOn(audios, 'get').mockReturnValue({ identifier: 'bgm-1', name: 'battle.mp3' } as never);

      await presses.press(
        switchWith({
          actions: [
            {
              kind: 'tableSetting',
              darkness: 'on',
              fog: 'off',
              image: { identifier: 'from-another-room', name: '明るい部屋' },
              bgm: { identifier: 'bgm-1', name: 'battle.mp3' },
              bgmStop: true,
              delayMs: 0,
              extra: {},
            },
          ],
        })
      );

      expect(table.darknessEnabled).toBe(true);
      expect(table.fogEnabled).toBe(false);
      expect(table.imageIdentifier).toBe(picture.identifier);
      expect(stop).toHaveBeenCalled();
      expect(play).toHaveBeenCalledWith('bgm-1', true);
    });
  });

  describe('lines kept back from the room', () => {
    it('keeps a line for the presser and the master, filled in from the presser’s piece', async () => {
      const secret = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSecretSystemMessageToTab')
        .mockReturnValue(null!);
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'the-presser' } as IPeerContext);
      const hero = speakAs(0, 0);
      hero.chatPalette!.setPalette('//目星=60');

      await presses.press(
        switchWith({
          actions: [{ kind: 'secret', text: '目星 {目星} で見つけた', to: 'presser', delayMs: 0, extra: {} }],
        })
      );

      expect(secret).toHaveBeenCalledWith(tab, '目星 60 で見つけた', 'the-presser');
    });

    it('keeps a line for the master alone, sent from nobody in particular', async () => {
      const secret = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSecretSystemMessageToTab')
        .mockReturnValue(null!);
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'the-presser' } as IPeerContext);

      await presses.press(
        switchWith({ actions: [{ kind: 'secret', text: 'the wire is crossed', to: 'master', delayMs: 0, extra: {} }] })
      );

      expect(secret).toHaveBeenCalledWith(tab, 'the wire is crossed', undefined);
    });
  });
});
