import { computed, inject, signal, untracked } from '@angular/core';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import type { ChatEditorField, ChatEditorHost } from '@axe/features/chat/chat-editor/chat-editor';
import { CHAT_EDITOR_LOADER, type ChatEditorModule } from '@axe/features/chat/chat-editor/chat-editor-loader';
import { whenNotComposing } from '@axe/ui/directives/composing-mark.directive';
import { followPlainBox, type PlainBoxStand } from '@axe/ui/plain-box-handover';

/** What the editor of a chat palette's text is put into, and the text area it takes the place of. */
export interface PaletteEditorMountHost {
  /** Whether the palette's text is being written. */
  isEditing(): boolean;
  /** The element the editor is drawn in, while the template has one. */
  place(): HTMLElement | null;
  /** The text area the palette is written in until the editor arrives, while the template has one. */
  textArea(): HTMLTextAreaElement | null;
  /** The palette's text as it is being written. */
  text(): string;
  /** What the editor asks of the palette it is mounted in. */
  readonly api: ChatEditorHost;
}

/**
 * Fetches the editor that colours each line of a palette's text and marks what will not work, puts
 * it in the edit area in place of the text area, and keeps the edit area about where the list was.
 *
 * Made where services can be injected, as a field of the palette it belongs to. The palette runs
 * {@link fetchWhileEditing} and {@link follow} in effects of its own, so that they stand in order
 * among the palette's other effects.
 */
export class PaletteEditorMount {
  private readonly chatPreferences = inject(ChatPreferencesService);
  private readonly editorLoader = inject(CHAT_EDITOR_LOADER);

  private readonly module = signal<ChatEditorModule | null>(null);
  private editor: ChatEditorField | null = null;
  /** How far down the list was as editing opened, as a share of it, for the edit area to be scrolled to once drawn. */
  private scrollShare: number | null = null;
  /** Where the reader stands in the text area the editor arrived to take the place of, read as it is put in. */
  private plainStand: (() => PlainBoxStand) | null = null;

  constructor(private readonly host: PaletteEditorMountHost) {}

  /**
   * Whether the palette is written in the editor, for a reader who has it on and once it has
   * arrived.
   */
  readonly active = computed(() => this.host.isEditing() && this.chatPreferences.richInput() && this.module() !== null);

  /** The editor, while it is mounted. */
  get field(): ChatEditorField | null {
    return this.editor;
  }

  /** Fetches the editor while the palette is being written by a reader who has it on, where it has not arrived. */
  fetchWhileEditing(): void {
    if (!this.host.isEditing() || !this.chatPreferences.richInput() || this.module()) return;
    untracked(
      () =>
        void this.editorLoader().then((module) =>
          whenNotComposing(this.host.textArea(), () => {
            if (!module) return;
            this.handOverFromTextArea();
            this.module.set(module);
          })
        )
    );
  }

  /** Puts the editor into the edit area while the palette is being written, and takes it down after. */
  follow(): void {
    const place = this.host.place();
    const module = this.module();
    untracked(() => {
      if (this.editor && this.editor.parent !== place) {
        this.editor.destroy();
        this.editor = null;
      }
      if (!place || !module || this.editor) return;
      const text = this.host.text();
      const start = this.plainStand?.() ?? { selection: { from: 0, to: 0 }, focused: false };
      this.plainStand = null;
      this.editor = module.mountChatEditor(place, { text, ...start }, this.host.api);
      this.editor.refresh(false);
      this.scrollToList();
      this.scrollShare = null;
    });
  }

  /**
   * Follows the text area as the editor arrives to take its place, for where the reader stands in it
   * to be read as the editor is put in: the caret, and whether it has the keys. How far down it is
   * scrolled is kept as the editor arrives, as a text area taken off the page is scrolled no more.
   * Let go as editing ends.
   */
  private handOverFromTextArea(): void {
    const area = this.host.textArea();
    if (!area || !this.host.isEditing() || !this.chatPreferences.richInput()) return;
    this.plainStand = followPlainBox(area);
    this.scrollShare = area.scrollTop / Math.max(1, area.scrollHeight);
  }

  /** Notes how far down the list was as editing opened, as a share of it. */
  opened(listShare: number): void {
    this.scrollShare = listShare;
  }

  /** Lets go of where the reader stood in the text area, as editing ends. */
  closed(): void {
    this.plainStand = null;
  }

  /** Scrolls the edit area, the editor or the text area, to about where the list was as editing opened. */
  scrollToList(): void {
    const share = this.scrollShare;
    const scroller = this.host.textArea() ?? this.host.place();
    if (share !== null && scroller) scroller.scrollTop = share * scroller.scrollHeight;
  }

  /** Takes the editor down, as the palette goes. */
  destroy(): void {
    this.editor?.destroy();
  }
}
