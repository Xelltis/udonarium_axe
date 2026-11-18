import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AgentToolRunner } from '@axe/application/agent/agent-tool-runner.service';
import { type AiLinkTab, AiLinkViewService } from '@axe/application/agent/ai-link-view.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AGENT_BRIDGE_PORT, AGENT_TRUSTED_ORIGINS, type AgentScope } from '@axe/core/agent/agent-protocol';
import { agentToolOf } from '@axe/core/agent/agent-tools';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { AI_LINK_RELEASES_URL } from '@axe/features/ai-link/ai-link-releases';
import { AiGmPanelComponent } from '@axe/features/ai-link/gm/ai-gm-panel/ai-gm-panel.component';
import { TranslocoModule } from '@jsverse/transloco';

/** What the panel says of where the link stands, by the i18n key under feature.aiLink.state. */
export type AiLinkStateKey = 'idle' | 'connecting' | 'connected' | 'unreachable' | 'lost' | 'busy' | 'protocol';

/**
 * The panel a seat links an AI from. Whether it is linked stands at the top, over two halves: the
 * link itself (the port the bridge waits on, what the AI is let do, what it has done, and how to set
 * up the bridge the AI is started with, written for this page), and having the AI be the game master.
 */
@Component({
  selector: 'ai-link-panel',
  templateUrl: './ai-link-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, AiGmPanelComponent],
  host: { class: 'block h-full' },
})
export class AiLinkPanelComponent {
  protected readonly link = inject(AiLinkService);
  protected readonly runner = inject(AgentToolRunner);
  private readonly permission = inject(RolePermissionService);

  protected readonly view = inject(AiLinkViewService);

  protected readonly tabs: readonly AiLinkTab[] = ['link', 'gm'];
  protected readonly scopes: readonly AgentScope[] = ['read', 'write'];
  /** The half of the panel shown. */
  protected readonly tab = this.view.tab;
  protected readonly releasesUrl = AI_LINK_RELEASES_URL;
  /** Which command was copied last, to say so beside it. */
  protected readonly copied = signal<'code' | 'desktop' | null>(null);

  /** Whether the seat may let the AI change the room at all: a seat that watches may not. */
  protected readonly mayWrite = computed(() => canRoleEdit(this.permission.role()));

  protected readonly stateKey = computed<AiLinkStateKey>(() => {
    const state = this.link.state();
    switch (state.kind) {
      case 'idle':
      case 'connecting':
      case 'connected':
        return state.kind;
      case 'refused':
        return state.reason;
      case 'lost':
        return state.unreachable ? 'unreachable' : 'lost';
    }
  });

  /** The bridge's version, to name in what the panel says. */
  protected readonly bridge = computed(() => {
    const state = this.link.state();
    return state.kind === 'connected' || state.kind === 'refused' ? state.bridge : '';
  });

  /** Whether the link is on, or being looked for: the button then lets go of it. */
  protected readonly linking = computed(() => {
    const kind = this.link.state().kind;
    return kind === 'connecting' || kind === 'connected' || kind === 'lost';
  });

  /** What the bridge is started with beyond the file: this page where the bridge does not trust it already, and the port. */
  protected readonly bridgeArgs = computed(() => {
    const args: string[] = [];
    const origin = globalThis.location?.origin ?? '';
    if (origin && !AGENT_TRUSTED_ORIGINS.includes(origin)) args.push('--allow-origin', origin);
    if (this.link.port() !== AGENT_BRIDGE_PORT) args.push('--port', String(this.link.port()));
    return args;
  });

  /** Whether this page has to be named to the bridge. */
  protected readonly untrustedOrigin = computed(() => this.bridgeArgs().includes('--allow-origin'));
  protected readonly origin = globalThis.location?.origin ?? '';

  protected readonly claudeCodeCommand = computed(() =>
    ['claude mcp add axe -- node /path/to/axe-mcp.mjs', ...this.bridgeArgs()].join(' ')
  );

  protected readonly claudeDesktopConfig = computed(() =>
    JSON.stringify(
      { mcpServers: { axe: { command: 'node', args: ['/path/to/axe-mcp.mjs', ...this.bridgeArgs()] } } },
      null,
      2
    )
  );

  /** The key of a tool's name as the history lists it, or null for a tool no longer defined. */
  protected nameKeyOf(tool: string): string | null {
    return agentToolOf(tool) ? `feature.aiLink.tools.${tool}` : null;
  }

  protected toggle(): void {
    if (this.linking()) this.link.disconnect();
    else this.link.connect();
  }

  protected setScope(scope: AgentScope): void {
    this.link.setScope(scope);
  }

  protected setPort(value: string): void {
    this.link.setPort(Number(value));
  }

  protected async copy(which: 'code' | 'desktop'): Promise<void> {
    const text = which === 'code' ? this.claudeCodeCommand() : this.claudeDesktopConfig();
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(which);
    } catch {
      this.copied.set(null);
    }
  }

  protected timeOf(at: number): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
