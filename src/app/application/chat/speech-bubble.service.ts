import { computed, DestroyRef, inject, Injectable, type Signal, signal, type WritableSignal } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import {
  answeredLineKeys,
  isSpeechLine,
  SPEECH_BUBBLE_LIMIT,
  type SpeechBubbleContent,
  speechBubbleContentOf,
  speechBubbleDurationMs,
  speechLineKey,
} from '@axe/domain/chat/speech-bubble';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VN_MODE_EVENT } from '@axe/domain/visual-novel/vn-mode-event';

/** A bubble over a piece: what it shows, and the line it shows. */
export interface SpeechBubble extends SpeechBubbleContent {
  /** New for every line shown, so the same words said twice come up twice. */
  readonly key: number;
  readonly messageIdentifier: string;
}

/**
 * How long a line waits before its bubble comes up. The tool answers a roll or a resource change a
 * moment after the line, and a line it answers is not speech; waiting this long spares the bubble
 * that would come up and go again.
 */
export const SPEECH_BUBBLE_WAIT_MS = 400;

/** How long the tool's answers are remembered, to tell a command line that arrives late. */
const ANSWER_MEMORY_MS = 60_000;

interface Shown {
  readonly messageIdentifier: string;
  readonly lineKey: string;
  readonly key: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * The bubbles over the pieces of characters as they speak, for this screen.
 *
 * A line said by a character standing on the table comes up over its piece, as long as the room
 * shows bubbles and this reader may read the line. Only lines said now come up: one that arrives
 * from before, as the log does on joining, comes up for what is left of its time, which is
 * usually none. Each piece has one bubble, which a new line replaces, and only so many show at
 * once. A bubble goes when its line is deleted, whispered after the fact, answered by the tool as a
 * command, or otherwise stops being speech; an edited line shows its new words.
 */
@Injectable({ providedIn: 'root' })
export class SpeechBubbleService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly bubbles = new Map<string, WritableSignal<SpeechBubble | null>>();
  private readonly shown = new Map<string, Shown>();
  private readonly waiting = new Set<ReturnType<typeof setTimeout>>();
  private readonly answered = new Map<string, number>();
  private nextKey = 0;

  /** Whether the room shows bubbles at all. */
  readonly roomAllows = computed(() => {
    this.objectChange.versionOf('Config')();
    return this.config()?.speechBubblesEnabled ?? true;
  });

  private readonly novelMode = signal(false);

  /**
   * Whether bubbles show on this screen: the room shows them, and the screen is not in novel mode,
   * whose window says the lines itself, a letter at a time, where a bubble would give them away
   * whole. Lines still come up while it is, and show for what is left of their time once it closes.
   */
  readonly showsHere = computed(() => this.roomAllows() && !this.novelMode());

  constructor() {
    this.objectChange.messageAdded$.subscribe((event) => this.hear(event.messageIdentifier), this.destroyRef);
    networkMessage$.subscribe((message) => {
      if (message.eventName !== VN_MODE_EVENT) return;
      this.novelMode.set(Boolean((message.data as { active?: unknown } | null)?.active));
    }, this.destroyRef);
    this.objectChange.onObjectChangedFor(
      () => [...this.shown.values()].map((shown) => shown.messageIdentifier),
      (event) => this.recheck(event.identifier),
      this.destroyRef
    );
    this.objectChange.onObjectChangedForIdentifier(
      'Config',
      () => {
        if (!this.allowsNow()) this.clear();
      },
      this.destroyRef
    );
    this.destroyRef.onDestroy(() => this.clear());
  }

  /** The bubble over a piece, null while it has none. */
  bubbleOf(pieceIdentifier: string): Signal<SpeechBubble | null> {
    let bubble = this.bubbles.get(pieceIdentifier);
    if (!bubble) {
      bubble = signal<SpeechBubble | null>(null);
      this.bubbles.set(pieceIdentifier, bubble);
    }
    return bubble.asReadonly();
  }

  /** Takes every bubble down. */
  clear(): void {
    for (const timer of this.waiting) clearTimeout(timer);
    this.waiting.clear();
    for (const pieceIdentifier of [...this.shown.keys()]) this.takeDown(pieceIdentifier);
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config') ?? null;
  }

  /** Whether the room shows bubbles, read from the config as it stands rather than as last drawn. */
  private allowsNow(): boolean {
    return this.config()?.speechBubblesEnabled ?? true;
  }

  private hear(messageIdentifier: string): void {
    const message = this.objectStore.get<ChatMessage>(messageIdentifier);
    if (!(message instanceof ChatMessage)) return;
    const answered = answeredLineKeys(message);
    if (answered.length > 0) {
      this.rememberAnswers(answered);
      return;
    }
    if (!this.allowsNow() || !this.speakerOf(message)) return;
    const timer = setTimeout(() => {
      this.waiting.delete(timer);
      this.show(messageIdentifier);
    }, SPEECH_BUBBLE_WAIT_MS);
    this.waiting.add(timer);
  }

  private rememberAnswers(keys: readonly string[]): void {
    const now = Date.now();
    for (const [key, at] of this.answered) if (now - at > ANSWER_MEMORY_MS) this.answered.delete(key);
    for (const key of keys) this.answered.set(key, now);
    for (const [pieceIdentifier, shown] of this.shown) {
      if (keys.includes(shown.lineKey)) this.takeDown(pieceIdentifier);
    }
  }

  /** The piece a line comes up over, or null where it does not come up. */
  private speakerOf(message: ChatMessage): GameCharacter | null {
    if (!isSpeechLine(message)) return null;
    if (this.answered.has(this.lineKeyOf(message))) return null;
    const tab = this.objectStore.get<ChatTab>(message.tabIdentifier);
    if (!(tab instanceof ChatTab) || !canRoleViewTab(tab, PeerCursor.myRole)) return null;
    const speaker = this.objectStore.get(`${message.sendFrom ?? ''}`);
    if (!(speaker instanceof GameCharacter) || !speaker.isVisibleOnTable) return null;
    return speaker;
  }

  private lineKeyOf(message: ChatMessage): string {
    return speechLineKey(message.tabIdentifier, `${message.from ?? ''}`, message.timestamp);
  }

  private show(messageIdentifier: string): void {
    const message = this.objectStore.get<ChatMessage>(messageIdentifier);
    if (!(message instanceof ChatMessage) || !this.allowsNow()) return;
    const speaker = this.speakerOf(message);
    const content = speaker ? speechBubbleContentOf(message) : null;
    if (!speaker || !content) return;
    const left = speechBubbleDurationMs(content) - (this.chatMessageService.getTime() - message.timestamp);
    if (left <= 0) return;

    const pieceIdentifier = speaker.identifier;
    this.takeDown(pieceIdentifier);
    while (this.shown.size >= SPEECH_BUBBLE_LIMIT) {
      const longest = this.shown.keys().next().value;
      if (longest === undefined) break;
      this.takeDown(longest);
    }
    const key = ++this.nextKey;
    const timer = setTimeout(() => {
      if (this.shown.get(pieceIdentifier)?.key === key) this.takeDown(pieceIdentifier);
    }, left);
    this.shown.set(pieceIdentifier, { messageIdentifier, lineKey: this.lineKeyOf(message), key, timer });
    this.bubbleOf(pieceIdentifier);
    this.bubbles.get(pieceIdentifier)?.set({ key, messageIdentifier, ...content });
  }

  /** Looks again at a shown line that changed: takes its bubble down or shows its new words. */
  private recheck(messageIdentifier: string): void {
    for (const [pieceIdentifier, shown] of this.shown) {
      if (shown.messageIdentifier !== messageIdentifier) continue;
      const message = this.objectStore.get<ChatMessage>(messageIdentifier);
      const speaker = message instanceof ChatMessage ? this.speakerOf(message) : null;
      const content = message && speaker?.identifier === pieceIdentifier ? speechBubbleContentOf(message) : null;
      if (!content) {
        this.takeDown(pieceIdentifier);
        continue;
      }
      const bubble = this.bubbles.get(pieceIdentifier);
      const current = bubble?.();
      if (current && (current.text !== content.text || current.stamp !== content.stamp)) {
        bubble?.set({ ...current, ...content });
      }
    }
  }

  private takeDown(pieceIdentifier: string): void {
    const shown = this.shown.get(pieceIdentifier);
    if (!shown) return;
    clearTimeout(shown.timer);
    this.shown.delete(pieceIdentifier);
    this.bubbles.get(pieceIdentifier)?.set(null);
  }
}
