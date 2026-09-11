import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ChatLogStylePreferenceService } from '@axe/application/chat/chat-log-style-preference.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatLogImages } from '@axe/domain/chat/chat-log-export';
import { ChatLogExporter, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { ChatLogScope } from '@axe/domain/chat/chat-log-rich';
import { CHAT_LOG_STYLE_SWATCHES, CHAT_LOG_STYLES, ChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { buildChatLogPreviewSample } from '@axe/features/chat/chat-log-preview/chat-log-preview-sample';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

export const CHAT_LOG_PREVIEW_LIMIT = 60;

interface PreparedPreview {
  readonly tabs: readonly ChatLogTab[];
  readonly images: ChatLogImages;
  readonly limited: boolean;
  readonly sample: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-log-preview',
  templateUrl: './chat-log-preview.component.html',
  host: { class: 'block h-full' },
  imports: [TranslocoModule, SafePipe],
})
export class ChatLogPreviewComponent {
  private readonly saveDataService = inject(SaveDataService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly preference = inject(ChatLogStylePreferenceService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  readonly styles = CHAT_LOG_STYLES;
  readonly swatches = CHAT_LOG_STYLE_SWATCHES;
  readonly style = this.preference.style;
  readonly tab = signal<ChatTab | null>(null);
  readonly scope = signal<ChatLogScope>('tab');
  readonly isSaving = signal(false);
  private readonly prepared = signal<PreparedPreview | null>(null);
  private loadCount = 0;

  readonly isSystemTab = computed(() => !!this.tab()?.isSystemTab);
  readonly effectiveStyle = computed<ChatLogStyle>(() =>
    this.style() === 'coc' && this.isSystemTab() ? 'standard' : this.style()
  );
  readonly effectiveScope = computed<ChatLogScope>(() => (this.isSystemTab() ? 'tab' : this.scope()));

  readonly html = computed(() => {
    const prepared = this.prepared();
    if (!prepared) return '';
    return this.saveDataService.renderChatLog(
      this.effectiveStyle(),
      this.effectiveScope(),
      prepared.tabs,
      prepared.images
    );
  });

  readonly note = computed(() => {
    const prepared = this.prepared();
    if (prepared?.sample) return this.t('feature.chat.log.previewSample');
    if (prepared?.limited) return this.t('feature.chat.log.previewLimited', { count: CHAT_LOG_PREVIEW_LIMIT });
    return '';
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.chat.log.previewTitle')));
    effect(() => {
      const tab = this.tab();
      const scope = this.effectiveScope();
      untracked(() => void this.load(tab, scope));
    });
  }

  choose(style: ChatLogStyle): void {
    this.preference.choose(style);
  }

  chooseScope(scope: ChatLogScope): void {
    this.scope.set(scope);
  }

  async save(): Promise<void> {
    const scope = this.effectiveScope();
    const tabs = this.sourceTabs(this.tab(), scope);
    if (tabs.length < 1 || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const label = scope === 'all' ? this.t('feature.chat.tabSetting.allTabsLogName') : tabs[0].name;
      await this.saveDataService.saveChatLog(this.effectiveStyle(), scope, tabs, label);
    } finally {
      this.isSaving.set(false);
    }
  }

  private sourceTabs(tab: ChatTab | null, scope: ChatLogScope): readonly ChatTab[] {
    if (scope === 'all') return this.chatMessageService.chatTabs;
    return tab ? [tab] : [];
  }

  private async load(tab: ChatTab | null, scope: ChatLogScope): Promise<void> {
    const count = ++this.loadCount;
    this.prepared.set(null);

    const source = this.sourceTabs(tab, scope);
    const spoken = scope === 'all' ? ChatLogExporter.spokenTabs(source) : source;
    const trimmed: ChatLogTab[] = spoken.map((each) => ({
      name: each.name,
      isSystemTab: each.isSystemTab,
      chatMessages: each.chatMessages.slice(-CHAT_LOG_PREVIEW_LIMIT),
    }));
    const sample = trimmed.every((each) => each.chatMessages.length === 0);
    const limited = !sample && spoken.some((each) => each.chatMessages.length > CHAT_LOG_PREVIEW_LIMIT);
    const tabs = sample ? [buildChatLogPreviewSample(this.t, tab?.name ?? '')] : trimmed;

    const images = await this.saveDataService.prepareChatLogImages(tabs);
    if (count !== this.loadCount) return;
    this.prepared.set({ tabs, images, limited, sample });
  }
}
