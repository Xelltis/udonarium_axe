import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AgentEventBatch, AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import type { AgentLinkState } from '@axe/core/agent/agent-bridge-client';
import { GM_DEFAULT_SETTINGS } from '@axe/core/agent/agent-gm';
import type { GmBridgeMessage, GmStatus, GmTabMessage } from '@axe/core/agent/agent-protocol';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AI_GM_DEFAULT_CALL_NAME, AiGmService, readAiGmPreferences } from '@axe/features/ai-gm/ai-gm.service';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Subject } from 'rxjs';

const GM_BRIDGE: AgentLinkState = {
  kind: 'connected',
  bridge: '1.80.0',
  mode: 'gm',
  models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
};

function status(set: Partial<GmStatus> = {}): GmStatus {
  return { run: 'off', model: 'claude-opus-5-5', spentUsd: 0, budgetUsd: 5, contextTokens: 0, kept: false, ...set };
}

describe('readAiGmPreferences', () => {
  it('reads nothing kept, or anything it cannot read, as the defaults', () => {
    for (const raw of [null, 'not json', '[1]', '{"settings":"x"}']) {
      expect(readAiGmPreferences(raw)).toEqual({
        settings: GM_DEFAULT_SETTINGS,
        mode: 'respond',
        callName: AI_GM_DEFAULT_CALL_NAME,
        tabs: [],
        instructions: '',
        notes: '',
      });
    }
  });

  it('never reads a budget left empty, at nothing or out of bounds as nothing to spend', () => {
    for (const budgetUsd of ['', 0, -1, 1001, '5', null]) {
      expect(readAiGmPreferences(JSON.stringify({ settings: { budgetUsd } })).settings.budgetUsd).toBe(5);
    }
    expect(readAiGmPreferences(JSON.stringify({ settings: { budgetUsd: 12.5 } })).settings.budgetUsd).toBe(12.5);
  });

  it('keeps what it can read of each part', () => {
    expect(
      readAiGmPreferences(
        JSON.stringify({
          settings: { model: 'claude-haiku-5-5', effort: 'max', budgetUsd: 2 },
          mode: 'called',
          callName: 'マスター',
          tabs: ['main', 3],
          instructions: '舞台は港町',
          notes: 7,
        })
      )
    ).toEqual({
      settings: { model: 'claude-haiku-5-5', effort: 'medium', budgetUsd: 2 },
      mode: 'called',
      callName: 'マスター',
      tabs: ['main'],
      instructions: '舞台は港町',
      notes: '',
    });
  });
});

describe('AiGmService', () => {
  let role: PeerRole;
  let notices: string[];
  let told: GmTabMessage[];
  let heard: Subject<GmBridgeMessage>;
  let state: ReturnType<typeof signal<AgentLinkState>>;
  let batches: AgentEventBatch[];
  let waiting: ((batch: AgentEventBatch) => void) | null;
  let setScope: ReturnType<typeof vi.fn>;
  let latest: { status: GmStatus | null; notes: string | null };

  /** Something happens in the room: a wait under way hears it at once, as the log's own does. */
  function happen(batch: AgentEventBatch): void {
    const waiter = waiting;
    waiting = null;
    if (waiter) waiter(batch);
    else batches.push(batch);
  }

  function make(): AiGmService {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RolePermissionService,
          useValue: { role: () => role, isGameMaster: () => role === PeerRole.GameMaster },
        },
        {
          provide: ChatMessageService,
          useValue: { sendSystemNotice: (_kind: string, text: string) => notices.push(text) },
        },
        {
          provide: AiLinkService,
          useValue: {
            state,
            gmHeard: heard,
            latestGm: () => latest,
            setScope,
            tellGm: (message: GmTabMessage) => (told.push(message), state().kind === 'connected'),
          },
        },
        {
          provide: AgentEventLog,
          useValue: {
            cursorNow: () => 'r.0',
            waitFor: (_after: string, _ms: number, abort: AbortSignal) =>
              batches.length > 0
                ? Promise.resolve(batches.shift()!)
                : new Promise((resolve) => {
                    waiting = resolve;
                    abort.addEventListener('abort', () => resolve({ cursor: 'r.0', events: [] }), { once: true });
                  }),
          },
        },
      ],
    });
    return TestBed.inject(AiGmService);
  }

  beforeEach(() => {
    role = PeerRole.GameMaster;
    notices = [];
    told = [];
    heard = new Subject();
    state = signal<AgentLinkState>(GM_BRIDGE);
    batches = [];
    waiting = null;
    latest = { status: null, notes: null };
    setScope = vi.fn();
    localStorage.removeItem(STORAGE_KEYS.aiGm);
    setPeerContextProvider({
      peerContext: { userId: 'gm-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'gm-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.name = 'AI GM';
    PeerCursor.myCursor.userId = 'gm-user';
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.aiGm);
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('starts only on the game master’s seat with a bridge that runs it, letting the AI change the room', () => {
    const gm = make();
    state.set({ ...GM_BRIDGE, mode: 'mcp' });
    expect(gm.start(false)).toBe(false);
    state.set(GM_BRIDGE);
    role = PeerRole.Player;
    expect(gm.start(false)).toBe(false);
    expect(told).toEqual([]);

    role = PeerRole.GameMaster;
    gm.update({ instructions: '舞台は港町' });
    expect(gm.start(true)).toBe(true);
    expect(setScope).toHaveBeenCalledWith('write');
    // What the tab tells the bridge: how to run it and what the person wrote, never a key.
    expect(told).toEqual([
      { type: 'gm.start', settings: GM_DEFAULT_SETTINGS, instructions: '舞台は港町', notes: '', fresh: true },
    ]);
  });

  it('takes up what the bridge told before it was listened to, its notebook over the one kept here', () => {
    localStorage.setItem(STORAGE_KEYS.aiGm, JSON.stringify({ notes: '古いメモ' }));
    latest = { status: status({ run: 'waiting' }), notes: '新しいメモ' };
    const gm = make();

    expect(gm.running()).toBe(true);
    expect(gm.preferences().notes).toBe('新しいメモ');
    expect(notices).toEqual([]);
  });

  it('tells the room when it starts and stops, not when a page opened afresh finds it running', () => {
    const gm = make();
    heard.next({ type: 'gm.status', status: status({ run: 'waiting' }) });
    expect(notices).toEqual([]);
    heard.next({ type: 'gm.status', status: status({ run: 'off', halted: 'budget' }) });
    heard.next({ type: 'gm.status', status: status({ run: 'thinking' }) });

    expect(notices).toEqual([
      expect.stringContaining('feature.aiGm.notice.stopped'),
      expect.stringContaining('feature.aiGm.notice.started'),
    ]);
    expect(gm.running()).toBe(true);
  });

  it('keeps the notebook it writes in this browser, and what it says aside newest first', () => {
    const gm = make();
    heard.next({ type: 'gm.notes', notes: '港町に着いた' });
    for (let at = 1; at <= 51; at++) heard.next({ type: 'gm.said', text: `${at}`, at });

    expect(gm.preferences().notes).toBe('港町に着いた');
    expect(readAiGmPreferences(localStorage.getItem(STORAGE_KEYS.aiGm)).notes).toBe('港町に着いた');
    expect(gm.asides()).toHaveLength(50);
    expect(gm.asides()[0]).toEqual({ text: '51', at: 51 });
  });

  it('hands on what happens while it runs, each event marked where it calls for a turn, and nothing once stopped', async () => {
    const gm = make();
    happen({
      cursor: 'r.2',
      events: [
        {
          kind: 'chat',
          id: 'm1',
          tab: 'main',
          time: 1,
          speaker: 'アリス',
          seat: 'プレイヤー1',
          text: '扉を開ける',
          by_ai: false,
        },
        { kind: 'seat_joined', seat: 'ボブ' },
      ],
    });
    heard.next({ type: 'gm.status', status: status({ run: 'waiting' }) });
    TestBed.tick();

    await vi.waitFor(() => expect(told.some((message) => message.type === 'gm.events')).toBe(true));
    expect(told.find((message) => message.type === 'gm.events')).toEqual({
      type: 'gm.events',
      events: [
        { event: expect.objectContaining({ kind: 'chat', text: '扉を開ける' }), wake: 'line' },
        { event: { kind: 'seat_joined', seat: 'ボブ' } },
      ],
    });

    heard.next({ type: 'gm.status', status: status({ run: 'off', halted: 'asked' }) });
    TestBed.tick();
    told.length = 0;
    happen({ cursor: 'r.3', events: [{ kind: 'seat_left', seat: 'ボブ' }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gm.running()).toBe(false);
    expect(told).toEqual([]);
  });

  it('tells a running game master what the person changed, and keeps it all out of the room', () => {
    const gm = make();
    const objects = ObjectStore.instance.getObjects().length;
    gm.update({ notes: '一行目' });
    expect(told).toEqual([]);

    heard.next({ type: 'gm.status', status: status({ run: 'waiting' }) });
    gm.update({ settings: { ...GM_DEFAULT_SETTINGS, budgetUsd: 2 } });
    gm.update({ mode: 'called' });
    expect(told).toEqual([
      {
        type: 'gm.update',
        settings: { ...GM_DEFAULT_SETTINGS, budgetUsd: 2 },
        instructions: '',
        notes: '一行目',
      },
    ]);
    expect(ObjectStore.instance.getObjects()).toHaveLength(objects);
  });

  it('runs the pieces marked as NPCs and those of its own seat', () => {
    const npc = GameCharacter.create('ゴブリン', 1, '');
    npc.isNpc = true;
    const own = GameCharacter.create('村長', 1, '');
    own.owner = 'gm-user';
    const player = GameCharacter.create('アリス', 1, '');
    player.owner = 'player-user';
    GameCharacter.create('名無し', 1, '');

    expect(make().pieces()).toEqual(['ゴブリン', '村長']);
  });
});
