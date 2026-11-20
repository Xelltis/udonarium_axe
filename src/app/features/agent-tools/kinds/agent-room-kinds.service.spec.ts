import { TestBed } from '@angular/core/testing';
import { ChatTabEditService } from '@axe/application/chat/chat-tab-edit.service';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { ROOM_SETTINGS, type RoomSetting, type RoomSettingKey } from '@axe/application/tabletop/room-settings';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { Network } from '@axe/core/network/network';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { OPEN_STAMP_RULES, withStampsAllowed } from '@axe/domain/chat/stamp-rules';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Vote } from '@axe/domain/vote/vote';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;
const DICE_SYSTEMS = DiceBot.diceBotInfos;

describe('AgentRoomKinds', () => {
  let tools: AgentKindTools;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function view(kind: string, id = ''): Record<string, unknown> {
    return call('get_object', { kind, ...(id ? { id } : {}) }) as Record<string, unknown>;
  }

  function act(kind: string, action: string, args: Record<string, unknown> = {}, id = ''): unknown {
    return call('act_on_object', { kind, action, args, ...(id ? { id } : {}) });
  }

  function listed(kind: string): string[] {
    return (call('list_objects', { kind }) as { name: string }[]).map((each) => each.name);
  }

  function beSeat(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
  }

  function onRoomServer(): void {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
  }

  function otherSeat(name: string, peerId: string, userId: string): PeerCursor {
    const seat = new PeerCursor();
    seat.peerId = peerId;
    seat.userId = userId;
    seat.name = name;
    seat.role = PeerRole.Player;
    seat.isDisConnect = false;
    seat.initialize();
    return seat;
  }

  function pieceOnTable(name: string): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: 0, y: 0 };
    piece.update();
    return piece;
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [{ peerId: 'peer-b', isOpen: true } as IPeerContext],
      peerIds: ['peer-b'],
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'ai-user';
    PeerCursor.myCursor.name = 'AI';
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.name = '村';
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DiceBot.diceBotInfos = DICE_SYSTEMS;
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    ChatTabList.forget();
    Config.forget();
    DataSummarySetting.forget();
    StatusAilmentCatalog.forget();
  });

  describe('chat-tab', () => {
    it('makes a tab, renames it, lets speaking bring reading and reading taken take speaking, and takes it away', () => {
      const made = call('create_object', { kind: 'chat-tab', fields: { name: '作戦' } }) as { id: string };

      expect(view('chat-tab', made.id)).toMatchObject({ name: '作戦', players_read: true, guests_speak: false });
      expect(
        call('change_object', { kind: 'chat-tab', id: '作戦', fields: { players_read: false, guests_speak: true } })
      ).toMatchObject({ players_read: false, players_speak: false, guests_read: true, guests_speak: true });
      expect(call('change_object', { kind: 'chat-tab', id: made.id, fields: { players_speak: true } })).toMatchObject({
        players_read: true,
        players_speak: true,
      });
      expect(call('remove_object', { kind: 'chat-tab', id: made.id })).toEqual({
        removed: { id: made.id, name: '作戦' },
      });
      expect(ObjectStore.instance.get(made.id)).toBeNull();
    });

    it('lists only the tabs this seat may read', () => {
      ChatTabList.instance.addChatTab('雑談');
      const secret = ChatTabList.instance.addChatTab('GM相談');
      secret.plCanView = false;
      beSeat(PeerRole.Player);

      expect(listed('chat-tab')).toEqual(['雑談']);
      expect(() => view('chat-tab', secret.identifier)).toThrow(/no chat-tab named/);
      beSeat(PeerRole.GameMaster);
      expect(listed('chat-tab')).toEqual(['雑談', 'GM相談']);
    });

    it('keeps the system tab as it is', () => {
      const system = ChatTabList.instance.ensureSystemTab();

      expect(() =>
        call('change_object', { kind: 'chat-tab', id: system.identifier, fields: { name: '告知' } })
      ).toThrow(/system tab keeps its name/);
      expect(() => call('remove_object', { kind: 'chat-tab', id: system.identifier })).toThrow(/system tab/);
      expect(ObjectStore.instance.get(system.identifier)).toBe(system);
    });

    it('holds who may read a tab, and a tab of server rolls, to the game master on a room server', () => {
      onRoomServer();
      beSeat(PeerRole.Player);
      const tab = ChatTabList.instance.addChatTab('作戦');
      tab.guestCanView = false;
      const rolled = tab.addMessage({ from: 'System-BCDice', name: 'ダイス', text: '2D6 > 7', timestamp: 1000 });
      rolled.serverRoll = true;

      expect(() =>
        call('change_object', { kind: 'chat-tab', id: tab.identifier, fields: { players_read: false } })
      ).toThrow(/only the game master may change who may read/);
      expect(() =>
        call('change_object', { kind: 'chat-tab', id: tab.identifier, fields: { guests_speak: true } })
      ).toThrow(/only in a tab they may already read/);
      expect(
        call('change_object', { kind: 'chat-tab', id: tab.identifier, fields: { players_speak: false } })
      ).toMatchObject({ players_read: true, players_speak: false });
      expect(() => call('remove_object', { kind: 'chat-tab', id: tab.identifier })).toThrow(
        /only the game master may take away a tab holding dice/
      );
      beSeat(PeerRole.GameMaster);
      call('remove_object', { kind: 'chat-tab', id: tab.identifier });
      expect(ObjectStore.instance.get(tab.identifier)).toBeNull();
    });
  });

  describe('chat-tab-list', () => {
    it('moves a tab to another place among the tabs this seat may read', () => {
      const list = ChatTabList.instance;
      list.addChatTab('A');
      list.addChatTab('B');
      list.addChatTab('C');

      expect(act('chat-tab-list', 'move_tab', { tab: 'C', to: 1 })).toMatchObject({
        tabs: [{ name: 'C' }, { name: 'A' }, { name: 'B' }],
      });
      expect(list.chatTabs.map((tab) => tab.name)).toEqual(['C', 'A', 'B']);
      expect(view('chat-tab-list').tabs).toEqual(list.chatTabs.map((tab) => ({ id: tab.identifier, name: tab.name })));
    });

    it('leaves the system tab where it is, and does not move a tab this seat may not read', () => {
      const list = ChatTabList.instance;
      list.ensureSystemTab();
      const hidden = list.addChatTab('GM相談');
      hidden.plCanView = false;
      beSeat(PeerRole.Player);

      expect(() => act('chat-tab-list', 'move_tab', { tab: 'システム', to: 2 })).toThrow(/system tab stays/);
      expect(() => act('chat-tab-list', 'move_tab', { tab: 'GM相談', to: 1 })).toThrow(/no chat tab named/);
    });

    it('says so where a tab could not be moved, and answers as moved one already where it was asked to go', () => {
      const list = ChatTabList.instance;
      list.addChatTab('A');
      list.addChatTab('B');
      const edit = TestBed.inject(ChatTabEditService);

      expect(act('chat-tab-list', 'move_tab', { tab: 'A', to: 1 })).toMatchObject({
        tabs: [{ name: 'A' }, { name: 'B' }],
      });
      vi.spyOn(edit, 'mayRearrange').mockReturnValue(false);
      expect(() => act('chat-tab-list', 'move_tab', { tab: 'B', to: 1 })).toThrow(/not this seat’s to move/);
      expect(() => act('chat-tab-list', 'move_tab', { tab: 'A', to: 1 })).toThrow(/not this seat’s to move/);
      expect(list.chatTabs.map((tab) => tab.name)).toEqual(['A', 'B']);
    });
  });

  describe('chat-reaction', () => {
    it("puts a stamp on a line for this seat and takes it off again, keeping to this seat's own record", () => {
      const tab = ChatTabList.instance.addChatTab('メイン');
      const line = tab.addMessage({ from: 'user-b', name: 'Bob', text: 'こんにちは', timestamp: 1000 });

      expect(act('chat-reaction', 'toggle', { line: line.identifier, stamp: 'sfx:laugh' })).toEqual({
        line: line.identifier,
        stamp: 'sfx:laugh',
        on: true,
      });
      expect(view('chat-reaction').put_on).toEqual([{ line: line.identifier, stamps: ['sfx:laugh'] }]);
      expect(ObjectStore.instance.getObjects<ChatReaction>(ChatReaction)[0].userId).toBe('ai-user');
      expect(act('chat-reaction', 'toggle', { line: line.identifier, stamp: 'sfx:laugh' })).toMatchObject({
        on: false,
      });
      expect(view('chat-reaction').put_on).toEqual([]);
    });

    it('puts no stamp on for a guest, among peers as on a room server', () => {
      const tab = ChatTabList.instance.addChatTab('メイン');
      const line = tab.addMessage({ from: 'user-b', name: 'Bob', text: 'こんにちは', timestamp: 1000 });
      beSeat(PeerRole.Guest);

      expect(() => act('chat-reaction', 'toggle', { line: line.identifier, stamp: 'sfx:laugh' })).toThrow(
        /may not put stamps/
      );
      expect(ObjectStore.instance.getObjects(ChatReaction)).toEqual([]);
    });

    it('refuses a stamp the room denies or does not know, and a line this seat does not read', () => {
      const tab = ChatTabList.instance.addChatTab('メイン');
      const line = tab.addMessage({ from: 'user-b', name: 'Bob', text: 'こんにちは', timestamp: 1000 });
      const hidden = ChatTabList.instance.addChatTab('GM相談');
      hidden.plCanView = false;
      const kept = hidden.addMessage({ from: 'gm-user', name: 'GM', text: '伏線', timestamp: 1000 });
      Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'reaction', ['sfx:laugh'], false);
      beSeat(PeerRole.Player);

      expect(view('chat-reaction').offered).not.toContain('sfx:laugh');
      expect(() => act('chat-reaction', 'toggle', { line: line.identifier, stamp: 'sfx:laugh' })).toThrow(
        /does not let sfx:laugh/
      );
      expect(() => act('chat-reaction', 'toggle', { line: line.identifier, stamp: 'sfx:nothing' })).toThrow(
        /no stamp sfx:nothing/
      );
      expect(() => act('chat-reaction', 'toggle', { line: kept.identifier, stamp: 'sfx:shock' })).toThrow(
        /no line with the id/
      );
      expect(ObjectStore.instance.getObjects(ChatReaction)).toEqual([]);
    });
  });

  describe('palettes', () => {
    beforeEach(() => {
      DiceBot.diceBotInfos = [
        { id: 'DiceBot', name: 'DiceBot', className: 'DiceBot', sortKey: 'a', locale: 'ja', superClassName: 'Base' },
        { id: 'Cthulhu7th', name: 'CoC7', className: 'Cthulhu7th', sortKey: 'b', locale: 'ja', superClassName: 'Base' },
      ];
    });

    it("changes a piece's chat palette and its dice system, and refuses a dice system there is not", () => {
      const goblin = pieceOnTable('ゴブリン');

      expect(call('list_objects', { kind: 'chat-palette' })).toEqual([
        { id: goblin.chatPalette!.identifier, name: 'ゴブリン' },
      ]);
      expect(
        call('change_object', {
          kind: 'chat-palette',
          id: 'ゴブリン',
          fields: { text: '1d100<=50 こぶし', dice_system: 'Cthulhu7th' },
        })
      ).toMatchObject({ piece: { id: goblin.identifier, name: 'ゴブリン' }, text: '1d100<=50 こぶし' });
      expect(goblin.chatPalette!.dicebot).toBe('Cthulhu7th');
      expect(() =>
        call('change_object', {
          kind: 'chat-palette',
          id: 'ゴブリン',
          fields: { text: '消える', dice_system: 'Nothing' },
        })
      ).toThrow(/no dice system with the id Nothing/);
      expect(goblin.chatPalette!.value).toBe('1d100<=50 こぶし');
    });

    it("changes a piece's buff palette, and lists no palette of a piece whose sheet this seat may not open", () => {
      const goblin = pieceOnTable('ゴブリン');
      const boss = pieceOnTable('黒幕');
      boss.owner = 'gm-user';
      boss.disclosureMode = 'gm';

      call('change_object', { kind: 'buff-palette', id: 'ゴブリン', fields: { text: '加速 移動+2 3' } });
      expect(goblin.remoteController!.value).toBe('加速 移動+2 3');
      expect(listed('buff-palette')).toEqual(['ゴブリン', '黒幕']);
      beSeat(PeerRole.Player);
      expect(listed('chat-palette')).toEqual(['ゴブリン']);
      expect(listed('buff-palette')).toEqual(['ゴブリン']);
      expect(() => view('chat-palette', boss.chatPalette!.identifier)).toThrow(AgentToolError);
    });
  });

  describe('stamp-pack', () => {
    it('makes a set, fills it from the pictures, renames and takes out a stamp, and takes the set away', () => {
      ImageStorage.instance.add('smile.png');
      const made = call('create_object', { kind: 'stamp-pack', fields: { name: '表情' } }) as { id: string };

      expect(act('stamp-pack', 'add_stamps', { images: ['smile.png'] }, made.id)).toEqual({ added: 1, stamps: 1 });
      expect(act('stamp-pack', 'rename_stamp', { stamp: 'smile.png', name: '笑顔' }, made.id)).toEqual({
        stamp: 'image:smile.png',
        name: '笑顔',
      });
      expect(view('stamp-pack', made.id).stamps).toEqual([
        { stamp: 'image:smile.png', image: 'smile.png', name: '笑顔' },
      ]);
      expect(act('stamp-pack', 'remove_stamp', { stamp: '笑顔' }, made.id)).toEqual({ removed: 'image:smile.png' });
      call('remove_object', { kind: 'stamp-pack', id: made.id });
      expect(ObjectStore.instance.getObjects(StampPack)).toEqual([]);
    });

    it('takes in no picture this seat may not pick', () => {
      ImageStorage.instance.add('secret.png');
      ImageTag.create('secret.png').isSecret = true;
      const pack = StampPack.create('表情');
      beSeat(PeerRole.Player);

      expect(() => act('stamp-pack', 'add_stamps', { images: ['secret.png'] }, pack.identifier)).toThrow(
        /no picture with the id secret.png/
      );
      expect(pack.stamps).toEqual([]);
    });
  });

  describe('Vote', () => {
    let vote: Vote;
    let tab: ChatTab;

    beforeEach(() => {
      tab = ChatTabList.instance.addChatTab('メイン');
      otherSeat('Bob', 'peer-b', 'user-b');
      vote = new Vote('Vote');
      vote.initialize();
    });

    it('starts a vote with this seat in the chair, answers it, and says both in chat', () => {
      expect(act('Vote', 'start', { title: '行き先', choices: ['北', '南'], to: ['Bob'], include_self: true })).toEqual(
        { started: '行き先', asked: ['Bob', 'AI'], choices: ['北', '南'] }
      );
      expect(view('Vote')).toMatchObject({
        title: '行き先',
        type: 'vote',
        open: true,
        chair: 'AI',
        answers: [
          { seat: 'Bob', answer: 'unanswered' },
          { seat: 'AI', answer: 'unanswered' },
        ],
      });
      expect(act('Vote', 'answer', { choice: '北' })).toEqual({ answered: '北' });
      expect(view('Vote').answers).toContainEqual({ seat: 'AI', answer: '北' });
      expect(() => act('Vote', 'answer', { choice: '南' })).toThrow(/answered already/);
      expect(tab.chatMessages.map((line) => line.isByAi)).toEqual([true, true]);
    });

    it('hides who answered what in a secret vote until it is over, and the answers from a seat not asked', () => {
      const bob = PeerCursor.findByPeerId('peer-b')!;
      vote.makeVote('peer-b', '裏切り者は', ['peer-b', 'ai-peer'], ['A', 'B'], false, '', true);
      bob.voteId = vote.voteId;
      bob.voteAnswer = 1;

      expect(view('Vote').answers).toEqual([
        { seat: 'Bob', answer: 'answered' },
        { seat: 'AI', answer: 'unanswered' },
      ]);
      vote.isFinish = true;
      expect(view('Vote').answers).toContainEqual({ seat: 'Bob', answer: 'B' });

      vote.makeVote('peer-b', '点呼', ['peer-b'], ['OK'], true);
      expect(view('Vote')).not.toHaveProperty('answers');
      expect(() => act('Vote', 'answer', {})).toThrow(/was not asked/);
      expect(() => act('Vote', 'finish')).toThrow(/Only the chair/);
    });

    it('lets a guest start and answer no vote, among peers as on a room server', () => {
      vote.makeVote('peer-b', '行き先', ['peer-b', 'ai-peer'], ['北', '南'], false);
      beSeat(PeerRole.Guest);
      const started = vote.initTimeStamp;

      expect(() => act('Vote', 'start', { title: '行き先' })).toThrow(/guest may not start/);
      expect(() => act('Vote', 'answer', { choice: '北' })).toThrow(/guest may not answer/);
      onRoomServer();
      expect(() => act('Vote', 'start', { title: '行き先' })).toThrow(/guest may not start/);
      expect([vote.initTimeStamp, vote.isVoteEnd('ai-peer')]).toEqual([started, false]);
    });

    it('asks no guest, who could not answer', () => {
      PeerCursor.findByPeerId('peer-b')!.role = PeerRole.Guest;

      expect(() => act('Vote', 'start', { title: '行き先', to: ['Bob'] })).toThrow(/at least one seat/);
      expect(act('Vote', 'start', { title: '行き先', include_self: true })).toMatchObject({ asked: ['AI'] });
    });
  });

  describe('Alarm', () => {
    let alarm: Alarm;

    beforeEach(() => {
      ChatTabList.instance.addChatTab('メイン');
      otherSeat('Bob', 'peer-b', 'user-b');
      alarm = new Alarm('Alarm');
      alarm.initialize();
    });

    it('sets the alarm for the seats named and says so in chat', () => {
      expect(act('Alarm', 'start', { title: '休憩', seconds: 300, to: ['Bob'], include_self: false })).toEqual({
        set: '休憩',
        seconds: 300,
        to: ['Bob'],
      });
      expect(view('Alarm')).toMatchObject({ title: '休憩', seconds: 300, set_by: 'AI', to: ['Bob'], sound: true });
      expect(ChatTabList.instance.chatTabs[0].chatMessages.at(-1)?.isByAi).toBe(true);
      expect(() => act('Alarm', 'start', { to: ['Carol'] })).toThrow(/no seat named Carol/);
    });

    it('lets a guest set no alarm, among peers as on a room server', () => {
      beSeat(PeerRole.Guest);

      expect(() => act('Alarm', 'start', { to: ['Bob'], include_self: false })).toThrow(/guest may not set/);
      onRoomServer();
      expect(() => act('Alarm', 'start', { to: ['Bob'], include_self: false })).toThrow(/guest may not set/);
      expect(alarm.initTimeStamp).toBe(0);
    });
  });

  describe('scenario-text', () => {
    it('writes texts, files and orders them, says one in chat and takes one away', () => {
      const tab = ChatTabList.instance.addChatTab('メイン');
      const first = call('create_object', {
        kind: 'scenario-text',
        fields: { title: '導入', text: '夜の村に霧が出る。', folder: '第1話' },
      }) as { id: string };
      const second = call('create_object', {
        kind: 'scenario-text',
        fields: { title: '依頼', folder: '第1話／', tab: 'メイン', send_as: 'system' },
      }) as { id: string };

      expect(view('scenario-text', second.id)).toMatchObject({
        folder: '第1話',
        position: 2,
        tab: 'メイン',
        send_as: 'system',
        last_said: null,
      });
      call('change_object', { kind: 'scenario-text', id: second.id, fields: { position: 1 } });
      expect(ScenarioText.all().map((text) => text.title)).toEqual(['依頼', '導入']);
      expect(() =>
        call('change_object', { kind: 'scenario-text', id: second.id, fields: { title: '別件', tab: '裏' } })
      ).toThrow(/no chat tab named 裏/);
      expect(view('scenario-text', second.id).title).toBe('依頼');
      expect(act('scenario-text', 'send', { tab: 'メイン' }, first.id)).toEqual({ said: '導入' });
      expect(tab.chatMessages.at(-1)).toMatchObject({ text: '夜の村に霧が出る。', isByAi: true });
      call('remove_object', { kind: 'scenario-text', id: first.id });
      expect(ScenarioText.all().map((text) => text.title)).toEqual(['依頼']);
    });

    it('shows a seat other than the game master no text, and lets it write none', () => {
      const kept = ScenarioText.all().length;
      const passage = new ScenarioText();
      passage.title = '黒幕の正体';
      passage.initialize();
      beSeat(PeerRole.Player);

      expect(listed('scenario-text')).toEqual([]);
      expect(() => view('scenario-text', passage.identifier)).toThrow(/no scenario-text named/);
      expect(() => call('create_object', { kind: 'scenario-text' })).toThrow(/Only the game master's seat/);
      expect(ScenarioText.all()).toHaveLength(kept + 1);
    });
  });

  describe('party', () => {
    it('makes parties, allies them, sets a side and players, and on taking one away leaves its members in none', () => {
      otherSeat('Bob', 'peer-b', 'user-b');
      const heroes = call('create_object', { kind: 'party', fields: { name: '勇者一行' } }) as { id: string };
      const goblins = call('create_object', { kind: 'party', fields: { name: 'ゴブリン軍' } }) as { id: string };
      const hero = pieceOnTable('勇者');
      hero.partyIdentifier = goblins.id;

      expect(
        call('change_object', {
          kind: 'party',
          id: goblins.id,
          fields: { allies: ['勇者一行'], battle_side: 'left', players: ['Bob'], colour: '#fca5a5' },
        })
      ).toMatchObject({
        allies: ['勇者一行'],
        battle_side: 'left',
        players: ['Bob'],
        colour: '#fca5a5',
        members: [{ id: hero.identifier, name: '勇者' }],
      });
      expect(view('party', heroes.id).allies).toEqual(['ゴブリン軍']);
      expect(() =>
        call('change_object', { kind: 'party', id: goblins.id, fields: { name: '魔王軍', players: ['Carol'] } })
      ).toThrow(/no player named Carol/);
      expect(() =>
        call('change_object', { kind: 'party', id: goblins.id, fields: { name: '魔王軍', allies: ['盗賊団'] } })
      ).toThrow(/no party named 盗賊団/);
      expect(view('party', goblins.id)).toMatchObject({ name: 'ゴブリン軍', players: ['Bob'] });
      call('remove_object', { kind: 'party', id: goblins.id });
      expect(hero.partyIdentifier).toBe('');
      expect(view('party', heroes.id).allies).toEqual([]);
    });

    it('shows another seat only the parties of its own pieces and those it plays, and lets it change none', () => {
      const mine = new Party();
      mine.name = '勇者一行';
      mine.initialize();
      const played = new Party();
      played.name = '傭兵団';
      played.players = 'ai-user';
      played.initialize();
      const theirs = new Party();
      theirs.name = '魔王軍';
      theirs.initialize();
      const hero = pieceOnTable('勇者');
      hero.owner = 'ai-user';
      hero.partyIdentifier = mine.identifier;
      beSeat(PeerRole.Player);

      expect(listed('party').sort()).toEqual(['傭兵団', '勇者一行']);
      expect(() => call('change_object', { kind: 'party', id: mine.identifier, fields: { name: '新' } })).toThrow(
        /Only the game master's seat may write the name/
      );
      expect(() => call('remove_object', { kind: 'party', id: mine.identifier })).toThrow(
        /Only the game master's seat/
      );
      expect(theirs.name).toBe('魔王軍');
    });
  });

  describe('board-scene', () => {
    it('makes a scene of the table as it stands, files it, puts it on and takes it away', () => {
      const made = call('create_object', { kind: 'board-scene', fields: { name: '夜の村', folder: '第1話' } }) as {
        id: string;
      };

      expect(view('board-scene', made.id)).toMatchObject({
        name: '夜の村',
        folder: '第1話',
        position: 1,
        table: '村',
        current: false,
      });
      expect(view('board-scene', made.id).changes).toContain('table');
      expect(act('board-scene', 'apply', { words: false }, made.id)).toEqual({ applied: '夜の村' });
      expect(view('board-scene', made.id).current).toBe(true);
      call('remove_object', { kind: 'board-scene', id: made.id });
      expect(BoardScene.all()).toEqual([]);
    });

    it('shows a seat other than the game master no scene, and lets it make none', () => {
      const scene = new BoardScene();
      scene.name = '決戦';
      scene.initialize();
      beSeat(PeerRole.Player);

      expect(listed('board-scene')).toEqual([]);
      expect(() => call('create_object', { kind: 'board-scene' })).toThrow(/Only the game master's seat/);
      expect(() => act('board-scene', 'apply', {}, scene.identifier)).toThrow(AgentToolError);
    });
  });

  describe('config', () => {
    it("moves the story's clock, sets the dice system and changes the rules", () => {
      ChatTabList.instance.addChatTab('メイン');
      DiceBot.diceBotInfos = [
        { id: 'DiceBot', name: 'DiceBot', className: 'DiceBot', sortKey: 'a', locale: 'ja', superClassName: 'Base' },
        { id: 'SwordWorld2.5', name: 'SW2.5', className: 'SW', sortKey: 'b', locale: 'ja', superClassName: 'Base' },
      ];
      TestBed.inject(GameClockService).setPeriods('朝,昼,夜');

      expect(view('config').clock).toMatchObject({ day: 1, part: '朝', parts: ['朝', '昼', '夜'] });
      act('config', 'step_clock');
      expect(view('config').clock).toMatchObject({ part: '昼' });
      act('config', 'set_clock', { day: 3, part: '夜' });
      expect(view('config').clock).toMatchObject({ day: 3, part: '夜' });
      expect(() => act('config', 'set_clock', { part: '深夜' })).toThrow(/no part of the day called 深夜/);
      expect(
        call('change_object', {
          kind: 'config',
          fields: { dice_system: 'SwordWorld2.5', turn_order: 'faction', move_range: false, zone_of_control: 'stop' },
        })
      ).toMatchObject({
        dice_system: 'SwordWorld2.5',
        turn_order: 'faction',
        move_range: false,
        zone_of_control: 'stop',
      });
      expect(Config.instance.moveRangeEnabled).toBe(false);
      expect(() =>
        call('change_object', { kind: 'config', fields: { turn_order: 'initiative', dice_system: 'Nothing' } })
      ).toThrow(/no dice system/);
      expect(Config.instance.turnOrderMode).toBe('faction');
    });

    it("keeps the clock and the settings every screen shows to the game master, and the table's rules to any player", () => {
      beSeat(PeerRole.Player);

      expect(() => act('config', 'step_clock')).toThrow(/Only the game master's seat/);
      expect(() => call('change_object', { kind: 'config', fields: { dice_system: 'DiceBot' } })).toThrow(
        /Only the game master's seat may write the dice_system/
      );
      expect(call('change_object', { kind: 'config', fields: { jump_squares: 2 } })).toMatchObject({ jump_squares: 2 });
    });
  });

  describe('the room settings it offers', () => {
    /** The room settings the AI's config offers, by field, and the config field each is kept in. */
    const OFFERED: Readonly<Record<string, RoomSettingKey>> = {
      dice_system: 'defaultDiceBot',
      turn_order: 'turnOrderMode',
      faction_phase: 'factionPhaseMode',
      faction_skip_unassigned: 'factionSkipUnassigned',
      move_range: 'moveRangeEnabled',
      move_strict: 'moveStrict',
      diagonal_move: 'diagonalMove',
      pieces_share_squares: 'piecesShareCells',
      jump_squares: 'jumpCells',
      zone_of_control: 'zocMode',
      zone_of_control_reach: 'zocRange',
      engagement_zones: 'zoneEnabled',
    };

    /** What the AI writes into each, which is not what the room starts with. */
    const WRITTEN: Readonly<Record<string, unknown>> = {
      dice_system: 'DiceBot',
      turn_order: 'faction',
      faction_phase: 'initiative',
      faction_skip_unassigned: true,
      move_range: false,
      move_strict: true,
      diagonal_move: 'double',
      pieces_share_squares: false,
      jump_squares: 2,
      zone_of_control: 'stop',
      zone_of_control_reach: 2,
      engagement_zones: true,
    };

    const entry = (key: RoomSettingKey) => ROOM_SETTINGS[key] as RoomSetting<RoomSettingKey, unknown>;

    it('lets write each the seats the room settings let write it, and offers no other but the clock', () => {
      const [config] = call('describe_kinds', { kind: 'config' }) as {
        fields: { name: string; written_by: string }[];
      }[];

      expect(config.fields.map((field) => field.name).filter((name) => name !== 'clock')).toEqual(Object.keys(OFFERED));
      for (const field of config.fields.filter((each) => each.name in OFFERED)) {
        expect(field.written_by, field.name).toBe(entry(OFFERED[field.name]).writer === 'shared' ? 'gm' : 'write');
      }
    });

    it('reads and writes each through the one entry the room settings read and write it by', () => {
      DiceBot.diceBotInfos = [
        { id: 'DiceBot', name: 'DiceBot', className: 'DiceBot', sortKey: 'a', locale: 'ja', superClassName: 'Base' },
      ];
      const reads = Object.values(OFFERED).map((key) => [key, vi.spyOn(entry(key), 'read')] as const);
      const writes = Object.values(OFFERED).map((key) => [key, vi.spyOn(entry(key), 'write')] as const);

      view('config');
      call('change_object', { kind: 'config', fields: WRITTEN });

      expect(reads.filter(([, read]) => read.mock.calls.length < 1).map(([key]) => key)).toEqual([]);
      expect(writes.filter(([, write]) => write.mock.calls.length < 1).map(([key]) => key)).toEqual([]);
      expect([Config.instance.moveStrict, Config.instance.zocMode, Config.instance.jumpCells]).toEqual([
        true,
        'stop',
        2,
      ]);
    });
  });

  describe('summary-setting', () => {
    it("sets the inventory's order, items, columns and folders, and keeps its aliases to the game master", () => {
      beSeat(PeerRole.Player);
      call('change_object', {
        kind: 'summary-setting',
        fields: {
          sort: [
            { item: 'HP', order: 'descending' },
            { item: 'name', order: 'ascending' },
            { item: 'MP', order: 'ascending' },
          ],
          display_items: 'HP MP',
          folders: ['敵／ボス', '敵/ボス', ' '],
        },
      });
      const setting = DataSummarySetting.instance;

      expect([setting.sortTag, setting.sortOrder, setting.sortTag2nd, setting.extraSortKeys]).toEqual([
        'HP',
        SortOrder.DESC,
        'name',
        [{ tag: 'MP', order: SortOrder.ASC }],
      ]);
      expect([setting.dataTag, setting.folderPaths]).toEqual(['HP MP', ['敵/ボス']]);
      expect(() =>
        call('change_object', { kind: 'summary-setting', fields: { sort: [{ item: 'HP', order: 'ascending' }] } })
      ).toThrow(/at least 2/);
      expect(() =>
        call('change_object', { kind: 'summary-setting', fields: { aliases: [{ name: '体力', candidates: ['HP'] }] } })
      ).toThrow(/Only the game master's seat may write the aliases/);
      beSeat(PeerRole.GameMaster);
      call('change_object', {
        kind: 'summary-setting',
        fields: { aliases: [{ name: ' 体力 ', candidates: ['HP', 'HP'] }] },
      });
      expect(setting.aliases).toEqual([{ name: '体力', candidates: ['HP'] }]);
    });
  });

  describe('status-ailment-catalog', () => {
    it('adds, changes, moves and removes states as the status ailment panel does', () => {
      beSeat(PeerRole.Player);

      expect(act('status-ailment-catalog', 'add', { name: '毒', rounds: 3, color: 'green' })).toMatchObject({
        name: '毒',
        rounds: 3,
        timing: 'roundEnd',
        color: 'green',
      });
      act('status-ailment-catalog', 'add', { name: '拘束' });
      expect(act('status-ailment-catalog', 'change', { name: '拘束', stat: '移動' })).toMatchObject({
        stat: '移動',
        op: '=',
        amount: '0',
      });
      expect(act('status-ailment-catalog', 'move', { name: '拘束', by: -5 })).toEqual({ order: ['拘束', '毒'] });
      expect(() => act('status-ailment-catalog', 'add', { name: '毒' })).toThrow(/already/);
      expect(() => act('status-ailment-catalog', 'add', { name: '猛 毒' })).toThrow(/one word/);
      expect(act('status-ailment-catalog', 'remove', { name: '毒' })).toEqual({ removed: '毒' });
      expect((view('status-ailment-catalog').ailments as { name: string }[]).map((each) => each.name)).toEqual([
        '拘束',
      ]);
      call('change_object', { kind: 'status-ailment-catalog', fields: { plays_effect: true } });
      expect(StatusAilmentCatalog.instance.playsEffectOnPlant).toBe(true);
    });

    it('adds and changes no state that would not read back as written, as the panel refuses it', () => {
      expect(() => act('status-ailment-catalog', 'add', { name: '毒:強' })).toThrow(/without a colon/);
      expect(() => act('status-ailment-catalog', 'add', { name: '毒', icon: '☠ ☠' })).toThrow(/effect may hold spaces/);
      act('status-ailment-catalog', 'add', { name: '毒' });
      expect(() => act('status-ailment-catalog', 'change', { name: '毒', stat: '移動 力' })).toThrow(
        /effect may hold spaces/
      );

      expect(StatusAilmentCatalog.instance.ailments.map((each) => [each.name, each.icon, each.stat])).toEqual([
        ['毒', '', ''],
      ]);
    });
  });
});
