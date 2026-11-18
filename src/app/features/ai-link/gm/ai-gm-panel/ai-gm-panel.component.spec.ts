import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import type { AgentLinkState } from '@axe/core/agent/agent-bridge-client';
import { GM_DEFAULT_SETTINGS } from '@axe/core/agent/agent-gm';
import type { GmStatus } from '@axe/core/agent/agent-protocol';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { AiLinkService } from '@axe/features/ai-link/ai-link.service';
import { type AiGmPreferences, AiGmService } from '@axe/features/ai-link/gm/ai-gm.service';
import { AiGmPanelComponent } from '@axe/features/ai-link/gm/ai-gm-panel/ai-gm-panel.component';

describe('AiGmPanelComponent', () => {
  let role: PeerRole;
  const state = signal<AgentLinkState>({ kind: 'idle' });
  const status = signal<GmStatus | null>(null);
  const preferences = signal<AiGmPreferences>({
    settings: GM_DEFAULT_SETTINGS,
    mode: 'respond',
    callName: 'GM',
    tabs: [],
    instructions: '',
    notes: '',
  });
  const linked = computed(() => state().kind === 'connected');
  const bridgeHandsTurns = computed(() => {
    const now = state();
    return now.kind === 'connected' && now.mode === 'mcp';
  });
  const running = computed(() => linked() && (status()?.run ?? 'off') !== 'off');
  const unattended = computed(() => running() && status()?.attended === false);
  const gm = {
    preferences,
    status,
    asides: signal([{ text: '酒場の場面へ', at: 0 }]),
    linked,
    bridgeHandsTurns,
    running,
    unattended,
    models: signal([
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
    ]),
    modelNotRun: signal(false),
    pieces: signal(['ゴブリン']),
    mayStart: () => linked() && role === PeerRole.GameMaster,
    start: vi.fn(),
    stop: vi.fn(),
    nudge: vi.fn(() => true),
    update: vi.fn((changes: Partial<AiGmPreferences>) => preferences.update((now) => ({ ...now, ...changes }))),
  };
  const link = { state, port: signal(47610), connect: vi.fn(), disconnect: vi.fn(), noteGmPanel: vi.fn() };

  beforeEach(() => {
    role = PeerRole.GameMaster;
    state.set({ kind: 'idle' });
    status.set(null);
    gm.modelNotRun.set(false);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [AiGmPanelComponent],
      providers: [
        { provide: AiGmService, useValue: gm },
        { provide: AiLinkService, useValue: link },
        {
          provide: RolePermissionService,
          useValue: { role: () => role, isGameMaster: () => role === PeerRole.GameMaster },
        },
      ],
    });
  });

  async function panel(): Promise<{ host: HTMLElement; settle: () => Promise<void> }> {
    const fixture = TestBed.createComponent(AiGmPanelComponent);
    await fixture.whenStable();
    return { host: fixture.nativeElement as HTMLElement, settle: () => fixture.whenStable() };
  }

  const find = <T extends HTMLElement>(host: HTMLElement, id: string) => host.querySelector<T>(`[data-testid="${id}"]`);

  it('says it is not connected, leaving the connecting to the panel it is a half of', async () => {
    const { host } = await panel();
    expect(find(host, 'ai-gm-state')?.getAttribute('data-state')).toBe('unlinked');
    expect(find(host, 'ai-gm-link-toggle')).toBeNull();
    expect(find(host, 'ai-gm-start')).toBeNull();
  });

  it('tells the AI link it is open while it is, so that reaching the bridge does not open another', async () => {
    const fixture = TestBed.createComponent(AiGmPanelComponent);
    expect(link.noteGmPanel).toHaveBeenLastCalledWith(true);
    fixture.destroy();
    expect(link.noteGmPanel).toHaveBeenLastCalledWith(false);
  });

  it('starts the game master on a bridge that hands the turns to an AI app, leaving the model and the spending out', async () => {
    state.set({ kind: 'connected', bridge: '1.81.0', mode: 'mcp', models: [] });
    status.set({ run: 'off', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: false, starts: 0 });
    const { host } = await panel();

    expect(find(host, 'ai-gm-state')?.getAttribute('data-state')).toBe('off');
    expect(find(host, 'ai-gm-mcp-hint')?.textContent).toContain('run_ai_gm');
    expect(find(host, 'ai-gm-model-section')).toBeNull();
    expect(find(host, 'ai-gm-effort-low')).toBeNull();
    expect(find(host, 'ai-gm-budget')).toBeNull();
    expect(find(host, 'ai-gm-spent')).toBeNull();
    expect(find(host, 'ai-gm-mode-called')).not.toBeNull();
    find(host, 'ai-gm-start')!.click();
    expect(gm.start).toHaveBeenCalledWith(false);
  });

  it('says that no AI is waiting for its turn while it runs with none there, and how it stands once one is', async () => {
    state.set({ kind: 'connected', bridge: '1.81.0', mode: 'mcp', models: [] });
    const waiting = { run: 'waiting', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: true, starts: 1 };
    status.set({ ...waiting, attended: false } as GmStatus);
    const { host, settle } = await panel();
    expect(find(host, 'ai-gm-state')?.getAttribute('data-state')).toBe('away');
    expect(find(host, 'ai-gm-stop')).not.toBeNull();

    status.set({ ...waiting, attended: true } as GmStatus);
    await settle();
    expect(find(host, 'ai-gm-state')?.getAttribute('data-state')).toBe('waiting');
  });

  it('shows the model, the depth and the budget for a bridge that runs the model itself', async () => {
    state.set({ kind: 'connected', bridge: '1.81.0', mode: 'gm', models: gm.models() });
    const { host } = await panel();

    expect(find(host, 'ai-gm-mcp-hint')).toBeNull();
    expect(find(host, 'ai-gm-model-section')).not.toBeNull();
    expect(find(host, 'ai-gm-effort-low')).not.toBeNull();
    expect(find(host, 'ai-gm-budget')).not.toBeNull();
  });

  it('starts it only on the game master’s seat, and starts over where a conversation is kept', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    status.set({ run: 'off', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: true, starts: 0 });
    role = PeerRole.Player;
    const { host, settle } = await panel();
    expect(find<HTMLButtonElement>(host, 'ai-gm-start')!.disabled).toBe(true);

    role = PeerRole.GameMaster;
    status.set({ ...status()!, budgetUsd: 5 });
    await settle();
    find(host, 'ai-gm-start')!.click();
    find(host, 'ai-gm-restart')!.click();
    expect(gm.start.mock.calls).toEqual([[false], [true]]);
  });

  it('says under the models when the one chosen is none of those the bridge runs', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    const { host, settle } = await panel();
    expect(find(host, 'ai-gm-model-not-run')).toBeNull();

    gm.modelNotRun.set(true);
    await settle();
    expect(find(host, 'ai-gm-model-not-run')?.textContent).toContain('このブリッジでは動かせません');
  });

  it('tells what a model with no price used in tokens, in place of dollars', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    status.set({
      run: 'waiting',
      model: 'model-at-hand',
      spentUsd: 0,
      budgetUsd: 5,
      contextTokens: 12000,
      kept: true,
      tokens: { spent: 1_700_000, limit: 2_000_000 },
      starts: 1,
    });
    const { host } = await panel();

    const spent = find(host, 'ai-gm-spent')!;
    expect(spent.textContent).toContain('1,700,000');
    expect(spent.textContent).toContain('2,000,000');
    expect(spent.textContent).not.toContain('$');
    expect(spent.classList).toContain('text-ui-danger');
  });

  it('shows what the bridge says went wrong last', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    status.set({
      run: 'off',
      halted: 'key',
      model: 'claude-opus-5-5',
      spentUsd: 0,
      budgetUsd: 5,
      contextTokens: 0,
      kept: true,
      problem: 'The key was rejected.',
      starts: 1,
    });
    const { host } = await panel();

    expect(find(host, 'ai-gm-problem')?.textContent).toContain('The key was rejected.');
  });

  it('shows what it spent, stops it, and asks it to go on with a word while it runs', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    status.set({
      run: 'waiting',
      model: 'claude-opus-5-5',
      spentUsd: 4.2,
      budgetUsd: 5,
      contextTokens: 12000,
      kept: true,
      starts: 1,
    });
    const { host } = await panel();

    expect(find(host, 'ai-gm-spent')?.textContent).toContain('4.20');
    expect(find(host, 'ai-gm-spent')?.classList).toContain('text-ui-danger');
    const direction = find<HTMLTextAreaElement>(host, 'ai-gm-direction')!;
    direction.value = '戦闘を始めて';
    direction.dispatchEvent(new Event('input'));
    find(host, 'ai-gm-nudge')!.click();
    expect(gm.nudge).toHaveBeenCalledWith('戦闘を始めて');
    find(host, 'ai-gm-stop')!.click();
    expect(gm.stop).toHaveBeenCalled();
  });

  it('changes how it runs, putting back a budget that is not a sum to spend', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    const { host } = await panel();

    find(host, 'ai-gm-model-claude-haiku-5-5')!.click();
    expect(preferences().settings.model).toBe('claude-haiku-5-5');
    find(host, 'ai-gm-mode-called')!.click();
    expect(preferences().mode).toBe('called');
    const budget = find<HTMLInputElement>(host, 'ai-gm-budget')!;
    budget.value = '';
    budget.dispatchEvent(new Event('change'));
    expect(budget.value).toBe('5');
    budget.value = '12';
    budget.dispatchEvent(new Event('change'));
    expect(preferences().settings.budgetUsd).toBe(12);
    expect(find(host, 'ai-gm-pieces')?.textContent).toContain('ゴブリン');
    expect(find(host, 'ai-gm-aside')?.textContent).toContain('酒場の場面へ');
  });

  it('keeps the words being written in the notebook when the AI writes it meanwhile, and tells them when done', async () => {
    state.set({ kind: 'connected', bridge: '1.80.0', mode: 'gm', models: gm.models() });
    preferences.update((now) => ({ ...now, notes: 'AIのメモ' }));
    const { host, settle } = await panel();
    const notes = find<HTMLTextAreaElement>(host, 'ai-gm-notes')!;
    notes.dispatchEvent(new Event('focus'));
    notes.value = '人が書きかけ';
    preferences.update((now) => ({ ...now, notes: 'AIが書き直したメモ' }));
    await settle();
    expect(notes.value).toBe('人が書きかけ');

    notes.dispatchEvent(new Event('change'));
    notes.dispatchEvent(new Event('blur'));
    await settle();
    expect(gm.update).toHaveBeenLastCalledWith({ notes: '人が書きかけ' });
    expect(notes.value).toBe('人が書きかけ');
    expect(find(host, 'ai-gm-aside')?.textContent).toContain('酒場の場面へ');
  });
});
