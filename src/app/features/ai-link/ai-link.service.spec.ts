import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AGENT_PROTOCOL_VERSION } from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
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

  greet(): void {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({
      data: JSON.stringify({
        type: 'hello',
        protocol: AGENT_PROTOCOL_VERSION,
        tools: agentToolsDigest(),
        bridge: '1.80.0',
        mode: 'mcp',
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
      ],
    });
    return TestBed.inject(AiLinkService);
  }

  beforeEach(() => {
    sockets.length = 0;
    notices = [];
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
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.aiLink)!)).toEqual({ port: 47610, scope: 'write' });
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
