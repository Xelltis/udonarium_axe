import { TestBed } from '@angular/core/testing';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { Network } from '@axe/core/network/network';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { AgentGmTools } from '@axe/features/agent-tools/agent-gm-tools.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

describe('AgentGmTools', () => {
  let tools: AgentGmTools;
  let table: GameTable;

  async function call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return tools.handlers[tool](args, { signal });
  }

  function pieceAt(name: string, col: number, row: number): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: (col - 1) * GRID, y: (row - 1) * GRID };
    piece.update();
    return piece;
  }

  function tableNamed(name: string): GameTable {
    const made = new GameTable();
    made.name = name;
    made.width = 10;
    made.height = 8;
    made.gridSize = GRID;
    made.initialize();
    return made;
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-gm-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-gm-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = tableNamed('洞窟');
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentGmTools);
  });

  afterEach(() => {
    TestBed.inject(AgentEventLog).stop();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('fires an effect at pieces, at a square, or from a caster, for the whole room', async () => {
    const preset = new EffectPreset();
    preset.name = '爆炎';
    ObjectStore.instance.add(preset, false);
    const goblin = pieceAt('ゴブリン', 3, 3);
    const casts: unknown[] = [];
    const send = vi.spyOn(Network.instance, 'send').mockImplementation((context) => {
      const sent = context as { eventName?: string; data?: unknown };
      if (sent.eventName === 'EFFECT_CAST') casts.push(sent.data);
    });

    expect(await call('fire_effect', { effect: '爆炎', targets: ['ゴブリン'] })).toEqual({
      fired: '爆炎',
      at: ['ゴブリン'],
    });
    expect(await call('fire_effect', { effect: '爆炎', at: { col: 2, row: 4 } })).toEqual({
      fired: '爆炎',
      at: { col: 2, row: 4 },
    });
    send.mockRestore();

    expect(casts).toEqual([
      expect.objectContaining({ targets: [expect.objectContaining({ identifier: goblin.identifier })] }),
      expect.objectContaining({
        targets: [{ identifier: '', x: 1.5 * GRID, y: 3.5 * GRID, z: 0 }],
        casterIdentifier: '',
        origin: null,
      }),
    ]);
    await expect(call('fire_effect', { effect: '爆炎' })).rejects.toThrow('Give targets, a square to fire at');
    await expect(call('fire_effect', { effect: '氷結', targets: ['ゴブリン'] })).rejects.toThrow(AgentToolError);
  });

  it('fires an effect at no more pieces than it takes, naming those it left', async () => {
    const preset = new EffectPreset();
    preset.name = '雷撃';
    preset.targeting = 'single';
    ObjectStore.instance.add(preset, false);
    pieceAt('ゴブリン', 1, 1);
    pieceAt('オーク', 2, 1);
    vi.spyOn(Network.instance, 'send').mockImplementation(() => undefined);

    expect(await call('fire_effect', { effect: '雷撃', targets: ['ゴブリン', 'オーク'] })).toMatchObject({
      at: ['ゴブリン'],
      not_hit: ['オーク'],
    });
  });

  it('fires no effect the master keeps for themselves from a player’s seat, by name or by id', async () => {
    const preset = new EffectPreset();
    preset.name = '秘奥義';
    preset.gmOnly = true;
    ObjectStore.instance.add(preset, false);
    pieceAt('ゴブリン', 3, 3);
    PeerCursor.myCursor.role = PeerRole.Player;

    for (const effect of ['秘奥義', preset.identifier]) {
      await expect(call('fire_effect', { effect, targets: ['ゴブリン'] })).rejects.toThrow('There is no effect');
    }
  });

  it('plays music, an ambient sound and a sound effect by name, and stops them', async () => {
    const audios = [
      { identifier: 'a1', name: '戦闘' },
      { identifier: 'a2', name: '雨' },
      { identifier: 'a3', name: '剣戟' },
    ] as AudioFile[];
    vi.spyOn(TestBed.inject(AudioStorage), 'audios', 'get').mockReturnValue(audios);
    const jukebox = TestBed.inject(JukeboxPlaybackService);
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    const stopMusic = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
    const ambient = vi.spyOn(BackgroundSound, 'start').mockReturnValue(null);
    const stopAmbient = vi.spyOn(BackgroundSound, 'stopAll').mockImplementation(() => undefined);
    const effect = vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);

    await call('play_sound', { kind: 'bgm', sound: '戦闘' });
    await call('play_sound', { kind: 'ambient', sound: '雨' });
    await call('play_sound', { kind: 'sound_effect', sound: 'a3' });
    await call('stop_sound', { kind: 'all' });

    expect(play).toHaveBeenCalledWith(audios[0]);
    expect(ambient).toHaveBeenCalledWith('a2');
    expect(effect).toHaveBeenCalledWith(audios[2]);
    expect(stopMusic).toHaveBeenCalled();
    expect(stopAmbient).toHaveBeenCalled();
    await expect(call('play_sound', { kind: 'bgm', sound: '無音' })).rejects.toThrow('There is no sound named 無音');
  });

  it('starts an ambient sound stopped before again, from a player’s seat as from the master’s', async () => {
    vi.spyOn(TestBed.inject(AudioStorage), 'audios', 'get').mockReturnValue([
      { identifier: 'rain-agent', name: '雨' },
    ] as AudioFile[]);
    const keep = vi.spyOn(BackgroundSound, 'keepPlaying').mockReturnValue(null);
    PeerCursor.myCursor.role = PeerRole.Player;

    await call('play_sound', { kind: 'ambient', sound: '雨' });

    expect(keep).toHaveBeenCalledWith('rain-agent');
  });

  it('says a scenario text marked as the AI’s, as the lines it sends are', async () => {
    const main = new ChatTab();
    main.name = 'メイン';
    main.initialize();
    ChatTabList.instance.addChatTab(main);
    const text = new ScenarioText();
    text.title = '導入';
    text.text = '嵐の夜、宿の扉が開く。';
    text.initialize();

    expect(await call('send_scenario_text', { text: '導入' })).toEqual({ sent: '導入' });
    const [line] = [...main.chatMessages];
    expect(line.text).toBe('嵐の夜、宿の扉が開く。');
    expect(line.isByAi).toBe(true);
  });

  it('shows a cut-in by name', async () => {
    const cutIn = new CutIn('cut-in-dragon');
    cutIn.name = 'ドラゴン登場';
    cutIn.initialize();
    const launch = vi.spyOn(TestBed.inject(CutInService), 'launch').mockReturnValue(true);

    expect(await call('play_cut_in', { cut_in: 'ドラゴン登場' })).toEqual({ shown: 'ドラゴン登場' });
    expect(launch).toHaveBeenCalledWith(cutIn);
  });

  it('switches everyone to another table, starting its music and cut-in as the master’s switch does', async () => {
    const dungeon = tableNamed('地下迷宮');
    const launch = vi.spyOn(TestBed.inject(CutInService), 'launchForTable').mockReturnValue(false);
    const music = vi.spyOn(TestBed.inject(TableBgmService), 'playFor').mockImplementation(() => undefined);

    expect(await call('switch_table', { table: '地下迷宮' })).toEqual({
      table: { id: dungeon.identifier, name: '地下迷宮' },
    });
    expect(TableSelecter.instance.viewTableIdentifier).toBe(dungeon.identifier);
    expect(launch).toHaveBeenCalledWith(dungeon);
    expect(music).toHaveBeenCalledWith(dungeon);
  });

  it('places a range at a square or following a piece, flat or standing up, and removes it', async () => {
    const goblin = pieceAt('ゴブリン', 4, 4);
    const tabletop = TestBed.inject(TabletopService);

    const placed = (await call('place_range', {
      shape: 'circle',
      solid: 'sphere',
      length: 2,
      at: { col: 3, row: 2 },
      name: '火球',
    })) as { id: string };
    const ball = ObjectStore.instance.get<RangeArea>(placed.id)!;
    expect(ball).toMatchObject({ name: '火球', length: 2, solidKind: 'sphere', type: 'CIRCLE' });
    expect(ball.location).toMatchObject({ x: 2.5 * GRID, y: 1.5 * GRID });

    const breath = (await call('place_range', { shape: 'cone', length: 4, follow: 'ゴブリン', facing: 90 })) as {
      id: string;
    };
    const cone = ObjectStore.instance.get<RangeArea>(breath.id)!;
    expect(cone).toMatchObject({ followingCharacterIdentifier: goblin.identifier, rotate: 0 });
    expect(TestBed.inject(AgentViews)).toBeTruthy();

    await expect(
      call('place_range', { shape: 'line', solid: 'sphere', length: 3, at: { col: 1, row: 1 } })
    ).rejects.toThrow('A line cannot stand up as a sphere.');
    await expect(call('place_range', { shape: 'circle', length: 3 })).rejects.toThrow('Give a square');

    await call('remove_range', { range: '火球' });
    expect(tabletop.ranges.map((range) => range.identifier)).not.toContain(placed.id);
  });
});
