import { afterNextRender, computed, DestroyRef, inject, Injector, signal, untracked } from '@angular/core';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { delay } from '@axe/core/util/delay';
import type { ChatEditorField, ChatEditorHost, ChatEditorStart } from '@axe/features/chat/chat-editor/chat-editor';
import { CHAT_EDITOR_LOADER, type ChatEditorModule } from '@axe/features/chat/chat-editor/chat-editor-loader';
import type { TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';
import { whenNotComposing } from '@axe/ui/directives/composing-mark.directive';
import { followPlainBox, type PlainBoxStand } from '@axe/ui/plain-box-handover';

/** What the editor of a chat input is put into, and the plain box it changes places with. */
export interface ChatEditorMountHost {
  /** The element the editor is drawn in, while the template has one. */
  place(): HTMLElement | null;
  /** The plain box, while the template has one. */
  plainField(): TextareaChatField | null;
  /** The line being written. */
  text(): string;
  /** The window the input stands in. */
  view(): Window | null;
  /** What the editor asks of the input it is mounted in. */
  readonly api: ChatEditorHost;
}

/**
 * Fetches the editor that draws a chat line as it will look, puts it in the place the input's
 * template gives it, and hands the line and the caret over between it and the plain box as one
 * takes the other's place.
 *
 * Made where services can be injected, as a field of the input it belongs to. The input runs
 * {@link follow} in an effect of its own, so that it stands in order among the input's other effects.
 */
export class ChatEditorMount {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly chatPreferences = inject(ChatPreferencesService);
  private readonly editorLoader = inject(CHAT_EDITOR_LOADER);

  private readonly module = signal<ChatEditorModule | null>(null);
  private readonly unreachable = signal(false);
  private readonly mounted = signal<ChatEditorField | null>(null);
  private requested = false;
  private fetched = false;
  /** Where the box stood when one kind gave way to the other, for the other to start from. */
  private handover: ChatEditorStart | null = null;
  /** Where the reader stands in the plain box the editor arrived to take the place of, read as it is put in. */
  private plainStand: (() => PlainBoxStand) | null = null;

  constructor(private readonly host: ChatEditorMountHost) {}

  /** The editor, once it is mounted. */
  readonly field = this.mounted.asReadonly();

  /**
   * Which box lines are typed into: the editor that draws them as they will look, the plain box
   * while it is on its way, or the plain box for a reader who has not asked for the editor or
   * whose browser could not fetch it.
   */
  readonly mode = computed<'rich' | 'loading' | 'plain'>(() => {
    if (!this.chatPreferences.richInput() || this.unreachable()) return 'plain';
    return this.module() ? 'rich' : 'loading';
  });

  /**
   * Fetches the editor once the page has drawn and has time to spare, or at once on the first touch
   * of the box, for a reader who has it on; none for a box taken away meanwhile.
   */
  request(soon = false): void {
    if (this.fetched || !this.chatPreferences.richInput()) return;
    if (soon) return this.fetch();
    if (this.requested) return;
    this.requested = true;
    const fetch = () => {
      if (!this.destroyRef.destroyed) this.fetch();
    };
    const view = this.host.view();
    if (view?.requestIdleCallback) view.requestIdleCallback(fetch, { timeout: 2000 });
    else void delay(200).then(fetch);
  }

  private fetch(): void {
    if (this.fetched) return;
    this.fetched = true;
    void this.editorLoader().then((module) => {
      if (!module) {
        this.unreachable.set(true);
        return;
      }
      whenNotComposing(this.host.plainField()?.element, () => {
        const box = this.host.plainField()?.element;
        this.plainStand = box ? followPlainBox(box) : null;
        this.module.set(module);
      });
    });
  }

  /** Puts the editor into its place when it is drawn, and takes it down when the place goes. */
  follow(): void {
    const place = this.host.place();
    const module = this.module();
    untracked(() => {
      const field = this.mounted();
      if (field && field.parent !== place) {
        this.handover = field.snapshot();
        field.destroy();
        this.mounted.set(null);
      }
      if (place && module && !this.mounted()) {
        const stand = this.plainStand?.();
        this.plainStand = null;
        const text = this.host.text();
        const start = this.handover ?? stand ?? { selection: { from: text.length, to: text.length }, focused: false };
        this.handover = null;
        this.mounted.set(module.mountChatEditor(place, { ...start, text }, this.host.api));
      }
      if (!place && this.handover) this.restorePlainBox();
    });
  }

  /**
   * Puts the caret back where it stood, in the plain box that took the editor's place, its text put
   * in with it, as the box's own is written in only after; where none did, as when the seat may no
   * longer speak, it is let go, for no later editor to take it up.
   */
  private restorePlainBox(): void {
    afterNextRender(
      () => {
        const field = this.host.plainField();
        const start = this.handover;
        this.handover = null;
        if (!field || !start) return;
        if (start.focused) field.focus();
        field.setText(start.text, start.selection);
      },
      { injector: this.injector }
    );
  }

  /** Takes the editor down, as the input goes. */
  destroy(): void {
    this.mounted()?.destroy();
  }
}
