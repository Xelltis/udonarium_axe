import { inject, Injectable, signal } from '@angular/core';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService, type VerbatimSpeaker } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { Network } from '@axe/core/network/network';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEY_PREFIXES, storageKeyFor } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { chatColorOf, DEFAULT_CHAT_COLOR } from '@axe/domain/chat/chat-color';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ScenarioText, type ScenarioTextSpeaker, scenarioTextSpeakerOf } from '@axe/domain/scenario-text/scenario-text';

/** How a scenario text is said this time, where it is said otherwise than the text keeps. */
export interface ScenarioTextSendOptions {
  /** The tab, by identifier; the text's own, else the tab being read. */
  readonly tab?: string;
  readonly speaker?: ScenarioTextSpeaker;
  /** The players it is whispered to, by their cursors; none says it to everyone who reads the tab. */
  readonly to?: readonly string[];
}

/** The colour the room says things in, as a system line goes out. */
const SYSTEM_COLOR = '#006633';

/** The fields of a text a copy of it takes over. */
const COPIED_FIELDS = ['text', 'folderName', 'sendAs', 'tab', 'color', 'stamps'] as const;

/**
 * Writes the game master's scenario texts and says them in the chat, word for word, decorated as
 * they were written: under the text's title, as the piece being spoken as, or as the room. Nothing
 * in a text is rolled. Only the game master writes or says them.
 *
 * Which texts have been said, and when, is kept in this browser for each room, for the game master
 * to see what the players have heard already. It reaches nobody else.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioTextService {
  private readonly permission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly activeTab = inject(ActiveChatTabService);
  private readonly speaking = inject(ChatSpeakerService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  /** When each text was last said, for the room read last; read again on a change of room. */
  private sentAtByText = new Map<string, number>();
  private sentRoom: string | null = null;
  /** Moves on each time a text is said, for whatever shows when texts were said to read again. */
  private readonly sentVersion = signal(0);

  /** Whether this seat may write and say scenario texts, which only the game master does. */
  canUse(): boolean {
    return this.permission.isGameMaster();
  }

  /** Makes an empty text under a title, last in the list. */
  create(title: string, folderName = ''): ScenarioText | null {
    if (!this.canUse()) return null;
    const text = new ScenarioText();
    text.title = title;
    text.folderName = folderName;
    text.order = ScenarioText.nextOrder();
    text.initialize();
    return text;
  }

  /** Makes a copy of a text under another title, just after the last in the list. */
  duplicate(text: ScenarioText, title: string): ScenarioText | null {
    if (!this.canUse()) return null;
    const copy = new ScenarioText();
    for (const field of COPIED_FIELDS) copy[field] = text[field];
    copy.title = title;
    copy.order = ScenarioText.nextOrder();
    copy.initialize();
    return copy;
  }

  /**
   * Says a text in the chat as it was written. Answers the line said, or null where nothing was:
   * for anybody but the game master, for a text with no words, or with no tab to say it in.
   */
  send(text: ScenarioText, options: ScenarioTextSendOptions = {}): ChatMessage | null {
    if (!this.canUse()) return null;
    const words = `${text.text ?? ''}`;
    if (words.trim().length < 1) return null;
    const speaker = this.speakerOf(text, options.speaker);
    const tab = this.tabOf(options.tab ?? text.tab, speaker);
    if (!tab) return null;
    const color = `${text.color ?? ''}`.trim();
    const message = this.chat.sendVerbatim(tab, words, speaker, {
      to: options.to ?? [],
      ...(color ? { color } : {}),
    });
    if (message) this.markSent(text.identifier);
    return message;
  }

  /** When the text was last said in this room from this browser, or null for never. */
  sentAt(identifier: string): number | null {
    this.sentVersion();
    this.loadSentMarks();
    return this.sentAtByText.get(identifier) ?? null;
  }

  /** The colour a text is said in as it stands: its own, else that of whoever says it. */
  colorOf(text: ScenarioText): string {
    const own = `${text.color ?? ''}`.trim();
    if (own) return own;
    const speaker = this.speakerOf(text);
    if (speaker.kind === 'system') return SYSTEM_COLOR;
    return speaker.kind === 'character' ? chatColorOf(speaker.character, 0) : DEFAULT_CHAT_COLOR;
  }

  private speakerOf(text: ScenarioText, asked?: ScenarioTextSpeaker): VerbatimSpeaker {
    const speaker = asked ?? scenarioTextSpeakerOf(text.sendAs);
    if (speaker === 'system') return { kind: 'system' };
    const character = speaker === 'character' ? this.speaking.current() : null;
    if (character) return { kind: 'character', character };
    return { kind: 'named', name: text.title.trim() || this.t('feature.scenarioText.untitled') };
  }

  /**
   * The tab a text is said in: the one named, else the one being read. The system tab, which only
   * the system says anything in, gives way to the first tab anyone else may speak in.
   */
  private tabOf(identifier: string, speaker: VerbatimSpeaker): ChatTab | null {
    const named = identifier ? this.objectStore.get(identifier) : null;
    const tab = named instanceof ChatTab ? named : (this.activeTab.current() ?? this.chat.chatTabs[0] ?? null);
    if (!tab?.isSystemTab || speaker.kind === 'system') return tab;
    return this.chat.chatTabs.find((candidate) => !candidate.isSystemTab) ?? null;
  }

  private markSent(identifier: string): void {
    this.loadSentMarks();
    this.sentAtByText.set(identifier, Date.now());
    writeLocal(this.sentKey(), JSON.stringify(Object.fromEntries(this.sentAtByText)));
    this.sentVersion.update((version) => version + 1);
  }

  /** Reads the marks kept for the room this browser is in, again whenever it is in another. */
  private loadSentMarks(): void {
    const room = Network.peerContext?.roomId ?? '';
    if (this.sentRoom === room) return;
    this.sentRoom = room;
    const marks = new Map<string, number>();
    try {
      const parsed: unknown = JSON.parse(readLocal(this.sentKey()) ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [identifier, at] of Object.entries(parsed)) {
          if (typeof at === 'number' && Number.isFinite(at)) marks.set(identifier, at);
        }
      }
    } catch {
      marks.clear();
    }
    this.sentAtByText = marks;
  }

  private sentKey(): string {
    return storageKeyFor(STORAGE_KEY_PREFIXES.scenarioTextSent, this.sentRoom ?? '');
  }
}
