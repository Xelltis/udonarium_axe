import { TestBed } from '@angular/core/testing';
import { AiLinkViewService } from '@axe/application/agent/ai-link-view.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AGENT_PROTOCOL_VERSION } from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The sockets the service opened, newest last, each a stand-in a spec plays the bridge through. */
const sockets: FakeSocket[] = [];

class FakeSocket {
  readyState = 0;
  readonly sent: Record<string, unknown>[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
  }

  greet(mode: 'mcp' | 'gm' = 'mcp'): void {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({
      data: JSON.stringify({
        type: 'hello',
        protocol: AGENT_PROTOCOL_VERSION,
        tools: agentToolsDigest(),
        bridge: '1.80.0',
        mode,
        models: [],
      }),
    });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

describe('AiLinkService', () => {
  let role: PeerRole;
  let notices: string[];
  let openPanel: ReturnType<typeof vi.fn>;
  let panelStands: boolean;

  function make(): AiLinkService {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RolePermissionService,
          useValue: {
            role: () => role,
            isGameMaster: () => role === PeerRole.GameMaster,
            canEditTabletop: () => role !== PeerRole.Guest,
            canSeeHidden: () => role === PeerRole.GameMaster,
            canEditShared: () => role !== PeerRole.Guest,
          },
        },
        {
          provide: ChatMessageService,
          useValue: { sendSystemNotice: (_kind: string, text: string) => notices.push(text) },
        },
        { provide: RoomPanelService, useValue: { open: openPanel, isOpen: () => panelStands } },
      ],
    });
    return TestBed.inject(AiLinkService);
  }

  beforeEach(() => {
    sockets.length = 0;
    notices = [];
    openPanel = vi.fn();
    panelStands = false;
    role = PeerRole.GameMaster;
    localStorage.removeItem(STORAGE_KEYS.aiLink);
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(STORAGE_KEYS.aiLink);
  });

  it('connects to the bridge on its port, and tells the room the seat linked an AI', () => {
    const link = make();
    link.connect();
    sockets[0].greet();

    expect(sockets[0].url).toBe('ws://127.0.0.1:47610/axe');
    expect(link.state()).toEqual({ kind: 'connected', bridge: '1.80.0', mode: 'mcp', models: [] });
    expect(sockets[0].sent[0]).toMatchObject({ type: 'welcome', seat: { role: 'gm', scope: 'read' } });
    expect(notices).toEqual([expect.stringContaining('feature.aiLink.notice.startedRead')]);
  });

  it('tells the bridge and the room when the AI is let do more, and keeps it for next time', () => {
    const link = make();
    link.connect();
    sockets[0].greet();
    link.setScope('write');

    expect(sockets[0].sent[1]).toMatchObject({ type: 'seat', seat: { scope: 'write' } });
    expect(notices[1]).toContain('feature.aiLink.notice.nowWrite');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.aiLink)!)).toEqual({
      port: 47610,
      scope: 'write',
      lentFrom: null,
    });
  });

  it('lends a game master the changing of the room and takes it back, kept across a page opened again', () => {
    const link = make();
    link.connect();
    sockets[0].greet('gm');
    link.lendWrite();
    expect(link.scope()).toBe('write');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.aiLink)!)).toMatchObject({ scope: 'write', lentFrom: 'read' });

    TestBed.resetTestingModule();
    const again = make();
    expect(again.scope()).toBe('write');
    again.takeBack();
    expect(again.scope()).toBe('read');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.aiLink)!)).toMatchObject({ scope: 'read', lentFrom: null });
    again.takeBack();
    expect(again.scope()).toBe('read');
  });

  it('lets what the person chooses stand, giving nothing back over it', () => {
    const link = make();
    link.connect();
    sockets[0].greet('gm');
    link.setScope('write');
    link.lendWrite();
    link.setScope('read');
    link.takeBack();
    expect(link.scope()).toBe('read');

    link.lendWrite();
    link.setScope('write');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.aiLink)!)).toMatchObject({ scope: 'write', lentFrom: null });
    link.takeBack();
    expect(link.scope()).toBe('write');
  });

  it('gives back what a game master was lent once the bridge tells that none runs, with nobody here to hear it', () => {
    const off = { run: 'off', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: false, starts: 0 };
    localStorage.setItem(STORAGE_KEYS.aiLink, JSON.stringify({ port: 47610, scope: 'write', lentFrom: 'read' }));
    const link = make();
    link.connect();
    sockets[0].greet('mcp');
    expect(link.scope()).toBe('write');

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: { ...off, run: 'waiting' } }) });
    expect(link.scope()).toBe('write');

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: off }) });
    expect(link.scope()).toBe('read');
    expect(sockets[0].sent.at(-1)).toMatchObject({ type: 'seat', seat: { scope: 'read' } });
  });

  it('opens the AI GM panel on finding a game master running with nobody here to hand it what happens', () => {
    const waiting = { run: 'waiting', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: true, starts: 1 };
    const link = make();
    link.connect();
    sockets[0].greet('mcp');
    expect(openPanel).not.toHaveBeenCalled();

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: waiting }) });
    expect(openPanel).toHaveBeenCalledWith('aiLink');
    expect(TestBed.inject(AiLinkViewService).tab()).toBe('gm');

    // Once the panel stands, it is not opened again, and once its keeper is here, it is the keeper's to see to.
    openPanel.mockClear();
    panelStands = true;
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: waiting }) });
    expect(openPanel).not.toHaveBeenCalled();
    panelStands = false;
    const gone = link.keepsGm();
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: waiting }) });
    expect(openPanel).not.toHaveBeenCalled();
    gone();
  });

  it('turns an AI link panel standing already to the game master’s half rather than opening it again', () => {
    panelStands = true;
    const link = make();
    link.connect();
    sockets[0].greet('gm');

    expect(openPanel).not.toHaveBeenCalled();
    expect(TestBed.inject(AiLinkViewService).tab()).toBe('gm');
  });

  it('leaves the giving back to whoever keeps the game master here, and to nobody who merely listens', () => {
    const off = { run: 'off', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: false, starts: 0 };
    const tell = () => sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status: off }) });
    localStorage.setItem(STORAGE_KEYS.aiLink, JSON.stringify({ port: 47610, scope: 'write', lentFrom: 'read' }));
    const link = make();
    const listening = link.gmHeard.subscribe(() => undefined);
    const gone = link.keepsGm();
    link.connect();
    sockets[0].greet('mcp');
    tell();
    expect(link.scope()).toBe('write');

    // The keeper goes; a listener still there keeps nothing, and the link gives back what was lent.
    gone();
    gone();
    tell();
    expect(link.scope()).toBe('read');
    listening.unsubscribe();
  });

  it('passes on what a game-master bridge tells, keeps its latest status and notebook, and tells it what it is asked to', () => {
    const link = make();
    const heard: unknown[] = [];
    link.gmHeard.subscribe((message) => heard.push(message));
    expect(link.tellGm({ type: 'gm.stop' })).toBe(false);
    link.connect();
    sockets[0].greet();
    const status = {
      run: 'waiting',
      model: 'claude-opus-5-5',
      spentUsd: 0,
      budgetUsd: 5,
      contextTokens: 0,
      kept: true,
      starts: 1,
    };
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.status', status }) });
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'gm.notes', notes: '一行目' }) });

    expect(heard).toEqual([
      { type: 'gm.status', status },
      { type: 'gm.notes', notes: '一行目' },
    ]);
    expect(link.latestGm()).toEqual({ status, notes: '一行目' });
    expect(link.tellGm({ type: 'gm.nudge', direction: '' })).toBe(true);
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'gm.nudge', direction: '' });

    link.disconnect();
    expect(link.latestGm()).toEqual({ status: null, notes: null });
  });

  it('opens the AI GM panel on reaching a bridge that runs the game master, unless it is open already', () => {
    const link = make();
    link.connect();
    sockets[0].greet('mcp');
    expect(openPanel).not.toHaveBeenCalled();

    link.connect();
    sockets[1].greet('gm');
    expect(openPanel).toHaveBeenCalledWith('aiLink');
    expect(TestBed.inject(AiLinkViewService).tab()).toBe('gm');

    openPanel.mockClear();
    link.noteGmPanel(true);
    link.connect();
    sockets[2].greet('gm');
    expect(openPanel).not.toHaveBeenCalled();
    link.noteGmPanel(false);
    link.connect();
    sockets[3].greet('gm');
    expect(openPanel).toHaveBeenCalledWith('aiLink');
    expect(TestBed.inject(AiLinkViewService).tab()).toBe('gm');
  });

  it('lets a watching seat give the AI reading only, whatever was chosen', () => {
    localStorage.setItem(STORAGE_KEYS.aiLink, JSON.stringify({ port: 5000, scope: 'write' }));
    role = PeerRole.Guest;
    const link = make();

    expect(link.port()).toBe(5000);
    expect(link.scope()).toBe('write');
    expect(link.seat().scope).toBe('read');
  });

  it('tells the room when the seat ends the link, and lets go of the bridge', () => {
    const link = make();
    link.connect();
    sockets[0].greet();
    link.disconnect();

    expect(link.state()).toEqual({ kind: 'idle' });
    expect(sockets[0].readyState).toBe(3);
    expect(notices.at(-1)).toContain('feature.aiLink.notice.ended');
  });

  it('keeps looking for the bridge once it is lost, until told to stop', () => {
    vi.useFakeTimers();
    const link = make();
    link.connect();
    sockets[0].drop();
    expect(link.state()).toEqual({ kind: 'lost', unreachable: true });
    expect(notices).toEqual([]);

    vi.advanceTimersByTime(3000);
    expect(sockets).toHaveLength(2);
    sockets[1].greet();
    sockets[1].drop();
    expect(notices.at(-1)).toContain('feature.aiLink.notice.lost');

    link.disconnect();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(2);
  });

  it('looks for the bridge on another port once told one', () => {
    const link = make();
    link.setPort(5001);
    link.setPort(70_000);
    link.connect();

    expect(sockets[0].url).toBe('ws://127.0.0.1:5001/axe');
  });
});
