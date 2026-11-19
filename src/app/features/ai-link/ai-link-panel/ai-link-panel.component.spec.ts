import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { AiLinkViewService } from '@axe/application/agent/ai-link-view.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import type { AgentLinkState } from '@axe/core/agent/agent-bridge-client';
import type { AgentScope } from '@axe/core/agent/agent-protocol';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { AiLinkPanelComponent } from '@axe/features/ai-link/ai-link-panel/ai-link-panel.component';
import { AiGmPanelComponent } from '@axe/features/ai-link/gm/ai-gm-panel/ai-gm-panel.component';

/** Stands in for the half the game master is run from, which has specs of its own. */
@Component({ selector: 'ai-gm-panel', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class GmHalfStubComponent {}

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
    TestBed.overrideComponent(AiLinkPanelComponent, {
      remove: { imports: [AiGmPanelComponent] },
      add: { imports: [GmHalfStubComponent] },
    });
    TestBed.inject(AiLinkViewService).show('link');
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

  it('shows the link and what the AI did, or the running of the game master, whichever half is chosen', async () => {
    const fixture = TestBed.createComponent(AiLinkPanelComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const find = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    expect(find('ai-link-tab-link')?.getAttribute('aria-selected')).toBe('true');
    expect(find('ai-link-history')).not.toBeNull();
    expect(host.querySelector('ai-gm-panel')).toBeNull();

    find('ai-link-tab-gm')!.click();
    await fixture.whenStable();
    expect(find('ai-link-tab-gm')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('ai-gm-panel')).not.toBeNull();
    expect(find('ai-link-history')).toBeNull();
    // Whether it is linked, and what the AI is let do, stand over both halves.
    expect(find('ai-link-state')).not.toBeNull();
    expect(find('ai-link-scope-write')).not.toBeNull();

    TestBed.inject(AiLinkViewService).show('link');
    await fixture.whenStable();
    expect(find('ai-link-history')).not.toBeNull();
  });

  it('opens on the half it was last asked to show', async () => {
    TestBed.inject(AiLinkViewService).show('gm');
    const host = await panel();
    expect(host.querySelector('ai-gm-panel')).not.toBeNull();
  });

  it('says what the AI is let do under the choice, as it stands', async () => {
    const fixture = TestBed.createComponent(AiLinkPanelComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(text(host, 'ai-link-scope-hint')).toContain('何も変えません');

    scope.set('write');
    await fixture.whenStable();
    expect(text(host, 'ai-link-scope-hint')).toContain('この席でできることをAIがします');
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
    TestBed.overrideComponent(AiLinkPanelComponent, {
      remove: { imports: [AiGmPanelComponent] },
      add: { imports: [GmHalfStubComponent] },
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
