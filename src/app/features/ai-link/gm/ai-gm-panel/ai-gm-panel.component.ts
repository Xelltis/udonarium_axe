import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AGENT_BRIDGE_PORT, AGENT_TRUSTED_ORIGINS, type GmEffort } from '@axe/core/agent/agent-protocol';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { AI_LINK_RELEASES_URL } from '@axe/features/ai-link/ai-link-releases';
import { AiGmService } from '@axe/features/ai-link/gm/ai-gm.service';
import type { AiGmMode } from '@axe/features/ai-link/gm/ai-gm-wake';
import { TranslocoModule } from '@jsverse/transloco';

/** What the panel says of the game master, by the i18n key under feature.aiGm.state. */
export type AiGmStateKey =
  'unlinked' | 'linking' | 'off' | 'waiting' | 'thinking' | 'away' | 'asked' | 'budget' | 'key' | 'failed' | 'seat';

/**
 * The half of the AI link panel the game master's seat runs an AI as the game master from: how it stands and what it
 * spent, starting and stopping it, how it is run, the instructions and the notebook, asking it to
 * go on, what it wrote aside, the pieces it runs, and how to start the bridge that holds the key.
 * With a bridge that hands the turns to an AI app connected over MCP, the model, how deeply it thinks
 * and what it may spend are that app's, and are left out here.
 */
@Component({
  selector: 'ai-gm-panel',
  templateUrl: './ai-gm-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block h-full' },
})
export class AiGmPanelComponent {
  protected readonly gm = inject(AiGmService);
  protected readonly link = inject(AiLinkService);
  private readonly permission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);

  protected readonly releasesUrl = AI_LINK_RELEASES_URL;
  protected readonly efforts: readonly GmEffort[] = ['low', 'medium', 'high'];
  protected readonly modes: readonly AiGmMode[] = ['respond', 'called'];
  /** The word to the game master being written. */
  protected readonly direction = signal('');
  protected readonly isGameMaster = computed(() => this.permission.isGameMaster());
  /**
   * The notebook as it stood when the person began writing in it, held while they write: one the AI
   * writes meanwhile does not take the words from under them, and theirs is told when they finish.
   */
  private readonly notesBeingWritten = signal<string | null>(null);
  protected readonly notesShown = computed(() => this.notesBeingWritten() ?? this.gm.preferences().notes);

  protected readonly stateKey = computed<AiGmStateKey>(() => {
    const state = this.link.state();
    if (state.kind === 'idle' || state.kind === 'refused') return 'unlinked';
    if (state.kind !== 'connected') return 'linking';
    const status = this.gm.status();
    if (!status) return 'off';
    if (this.gm.unattended()) return 'away';
    if (status.run !== 'off') return status.run;
    return status.halted ?? 'off';
  });

  /**
   * What it spent and may spend, once a bridge has told it: in dollars, or for a model whose prices the
   * bridge does not know in the tokens it used and may use while the bridge runs.
   */
  protected readonly spending = computed(() => {
    const status = this.gm.status();
    if (!status) return null;
    const tokens = status.contextTokens.toLocaleString();
    if (status.tokens) {
      return {
        key: 'feature.aiGm.spentTokens',
        spent: status.tokens.spent.toLocaleString(),
        budget: status.tokens.limit.toLocaleString(),
        near: status.tokens.spent >= status.tokens.limit * 0.8,
        tokens,
      };
    }
    if (status.budgetUsd <= 0) return null;
    return {
      key: 'feature.aiGm.spent',
      spent: status.spentUsd.toFixed(2),
      budget: status.budgetUsd.toFixed(2),
      near: status.spentUsd >= status.budgetUsd * 0.8,
      tokens,
    };
  });

  protected readonly chatTabs = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    return ChatTabList.instance.chatTabs
      .filter((tab) => !tab.isSystemTab)
      .map((tab) => {
        this.objectChange.versionOf(tab.identifier)();
        return { identifier: tab.identifier, name: tab.name };
      });
  });

  /** What the bridge is started with beyond the file: this page where it is not trusted already, and the port. */
  private readonly bridgeArgs = computed(() => {
    const args: string[] = [];
    const origin = globalThis.location?.origin ?? '';
    if (origin && !AGENT_TRUSTED_ORIGINS.includes(origin)) args.push('--allow-origin', origin);
    if (this.link.port() !== AGENT_BRIDGE_PORT) args.push('--port', String(this.link.port()));
    return args;
  });

  protected readonly shellCommand = computed(() =>
    ['ANTHROPIC_API_KEY=sk-ant-... node axe-mcp.mjs gm', ...this.bridgeArgs()].join(' ')
  );
  protected readonly powerShellCommand = computed(() =>
    ['$env:ANTHROPIC_API_KEY="sk-ant-..."; node axe-mcp.mjs gm', ...this.bridgeArgs()].join(' ')
  );

  constructor() {
    this.link.noteGmPanel(true);
    inject(DestroyRef).onDestroy(() => this.link.noteGmPanel(false));
  }

  protected setModel(model: string): void {
    this.gm.update({ settings: { ...this.gm.preferences().settings, model } });
  }

  protected setEffort(effort: GmEffort): void {
    this.gm.update({ settings: { ...this.gm.preferences().settings, effort } });
  }

  /** Takes a budget typed in; anything but a sum from a cent to a thousand dollars is put back as it was. */
  protected setBudget(input: HTMLInputElement): void {
    const budget = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(budget) || budget < 0.01 || budget > 1000) {
      input.value = String(this.gm.preferences().settings.budgetUsd);
      return;
    }
    this.gm.update({ settings: { ...this.gm.preferences().settings, budgetUsd: budget } });
  }

  protected setMode(mode: AiGmMode): void {
    this.gm.update({ mode });
  }

  protected setCallName(callName: string): void {
    this.gm.update({ callName: callName.trim() });
  }

  protected toggleTab(identifier: string, listened: boolean): void {
    const tabs = this.gm.preferences().tabs.filter((tab) => tab !== identifier);
    this.gm.update({ tabs: listened ? [...tabs, identifier] : tabs });
  }

  protected setInstructions(instructions: string): void {
    this.gm.update({ instructions });
  }

  protected setNotes(notes: string): void {
    this.gm.update({ notes });
  }

  protected beginNotes(): void {
    this.notesBeingWritten.set(this.gm.preferences().notes);
  }

  protected endNotes(): void {
    this.notesBeingWritten.set(null);
  }

  protected nudge(): void {
    if (this.gm.nudge(this.direction())) this.direction.set('');
  }

  protected timeOf(at: number): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
