import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import type { AgentLinkState } from '@axe/core/agent/agent-bridge-client';
import type { AgentScope } from '@axe/core/agent/agent-protocol';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { AiLinkPanelComponent } from '@axe/features/ai-link/ai-link-panel/ai-link-panel.component';

describe('AiLinkPanelComponent', () => {
  let role: PeerRole;
  const state = signal<AgentLinkState>({ kind: 'idle' });
  const scope = signal<AgentScope>('read');
  const link = {
    state,
    scope,
    port: signal(47610),
    seat: () => ({ name: 'AI GM', role, scope: role === PeerRole.Guest ? 'read' : scope() }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    setScope: vi.fn((next: AgentScope) => scope.set(next)),
    setPort: vi.fn(),
  };

  beforeEach(() => {
    role = PeerRole.GameMaster;
    state.set({ kind: 'idle' });
    scope.set('read');
    TestBed.configureTestingModule({
      imports: [AiLinkPanelComponent],
      providers: [
        { provide: AiLinkService, useValue: link },
        { provide: RolePermissionService, useValue: { role: () => role } },
      ],
    });
  });

  async function panel(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AiLinkPanelComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (host: HTMLElement, id: string) =>
    host.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? '';

  it('says it is not connected, and connects at a press', async () => {
    const host = await panel();
    expect(text(host, 'ai-link-state')).toBe('つないでいません');
    expect(text(host, 'ai-link-toggle')).toBe('つなぐ');

    host.querySelector<HTMLButtonElement>('[data-testid="ai-link-toggle"]')!.click();
    expect(link.connect).toHaveBeenCalled();
  });

  it('says which bridge it is connected to, and lets go of it at a press', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'mcp', models: [] });
    const host = await panel();

    expect(text(host, 'ai-link-state')).toBe('つながっています（ブリッジ1.80.0）');
    host.querySelector<HTMLButtonElement>('[data-testid="ai-link-toggle"]')!.click();
    expect(link.disconnect).toHaveBeenCalled();
  });

  it('says why a bridge turned the tab away', async () => {
    state.set({ kind: 'refused', reason: 'protocol', bridge: '1.79.0' });
    expect(text(await panel(), 'ai-link-state')).toContain('ブリッジ（1.79.0）とこのAxeの版が合いません');
  });

  it('lets the AI be let do more, but not from a watching seat', async () => {
    let host = await panel();
    host.querySelector<HTMLInputElement>('[data-testid="ai-link-scope-write"]')!.click();
    expect(link.setScope).toHaveBeenCalledWith('write');

    TestBed.resetTestingModule();
    role = PeerRole.Guest;
    TestBed.configureTestingModule({
      imports: [AiLinkPanelComponent],
      providers: [
        { provide: AiLinkService, useValue: link },
        { provide: RolePermissionService, useValue: { role: () => role } },
      ],
    });
    host = await panel();
    expect(host.querySelector<HTMLInputElement>('[data-testid="ai-link-scope-write"]')!.disabled).toBe(true);
    expect(text(host, 'ai-link-scope')).toContain('見学の席では、AIは読むだけです');
  });

  it('lists what the AI did, marking what was refused', async () => {
    const runner = TestBed.inject(AgentToolRunner);
    runner.history.set([
      { at: 0, tool: 'send_chat', input: '{"text":"hi"}', error: { code: 'not_allowed', message: 'read only' } },
    ]);
    const host = await panel();

    expect(text(host, 'ai-link-history-entry')).toContain('発言する');
    expect(text(host, 'ai-link-history-entry')).toContain('断りました');
    runner.clearHistory();
  });

  it('writes the setup for this page, naming it to the bridge where the bridge does not know it', async () => {
    const host = await panel();
    const origin = globalThis.location.origin;

    expect(text(host, 'ai-link-claude-code')).toBe(
      `claude mcp add axe -- node /path/to/axe-mcp.mjs --allow-origin ${origin}`
    );
    expect(JSON.parse(text(host, 'ai-link-claude-desktop'))).toEqual({
      mcpServers: { axe: { command: 'node', args: ['/path/to/axe-mcp.mjs', '--allow-origin', origin] } },
    });
    expect(text(host, 'ai-link-origin-note')).toContain(origin);
  });
});
