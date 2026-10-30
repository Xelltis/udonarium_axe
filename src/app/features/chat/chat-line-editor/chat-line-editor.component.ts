import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ChatLintSession } from '@axe/application/chat/chat-lint.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { stampLabel } from '@axe/application/chat/stamp-words';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { inlineStampToken } from '@axe/domain/chat/inline-stamp';
import { type ChatLintContext, lintChatSyntax } from '@axe/domain/chat-syntax/chat-lint';
import { scanChatSyntax, type SyntaxKind } from '@axe/domain/chat-syntax/chat-syntax';
import type { ChatEditorField, ChatEditorHost, ChatEditorStart } from '@axe/features/chat/chat-editor/chat-editor';
import type { ChatCompletionWords } from '@axe/features/chat/chat-editor/chat-editor-complete';
import { CHAT_EDITOR_LOADER, type ChatEditorModule } from '@axe/features/chat/chat-editor/chat-editor-loader';
import { ChatSyntaxSourceService } from '@axe/features/chat/chat-input/chat-syntax-source.service';
import { type ChatTextField, TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';
import { ChatToolbarComponent } from '@axe/features/chat/chat-toolbar/chat-toolbar.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { ComposingMarkDirective, whenNotComposing } from '@axe/ui/directives/composing-mark.directive';
import { followPlainBox, type PlainBoxStand } from '@axe/ui/plain-box-handover';
import { TranslocoModule } from '@jsverse/transloco';

/** What editing a line looks at: its decorations, its rubies and its stamps, none of its commands. */
const KINDS_EDITED: ReadonlySet<SyntaxKind> = new Set(['decoration', 'ruby', 'stamp', 'quote']);

/** No names are offered while a line already sent is edited, as nothing it names is carried out again. */
const NO_WORDS: ChatCompletionWords = {
  statuses: [],
  variables: [],
  portraits: [],
  effects: [],
  buffs: [],
  cutIns: [],
};

/** The attribute the editor for a line already sent is found by, apart from the chat input's. */
const LINE_EDIT_ATTR = 'data-chat-line-edit';

/**
 * The box a line already sent is edited in, in place: the editor that draws it as it will look,
 * where the reader has it and it can be fetched, or else a plain box, with the buttons for its
 * decorations, its ruby and its stamps under it. Editing a line carries none of its commands out
 * again, so it offers no syntax to put in and finds nothing about commands; it still marks a
 * decoration left unclosed and a stamp that cannot be sent. Enter keeps the edit and Escape puts it
 * down, as before.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-line-editor',
  templateUrl: './chat-line-editor.component.html',
  host: { class: 'block w-full min-w-0' },
  imports: [ComposingMarkDirective, FormsModule, TranslocoModule, ChatToolbarComponent],
})
export class ChatLineEditorComponent {
  private readonly preferences = inject(ChatPreferencesService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly language = inject(LanguageService);
  private readonly loader = inject(CHAT_EDITOR_LOADER);
  private readonly syntaxSource = inject(ChatSyntaxSourceService);
  private readonly stampPicker = inject(StampPickerService);
  private readonly stampRules = inject(StampRulesService);
  private readonly stampPacks = inject(StampPackService);
  private readonly t = inject(TRANSLATE_FN);

  /** What the line says as the edit starts. */
  readonly draft = input.required<string>();
  /** What the line says as it is edited. */
  readonly draftChange = output<string>();
  /** Enter, or the change button beside it: the edit is to be kept. */
  readonly kept = output<void>();
  /** Escape, or the cancel button beside it: the edit is to be put down. */
  readonly abandoned = output<void>();

  protected readonly stampButtonClass =
    'text-(--chat-toolbar-ink) hover:bg-(--chat-toolbar-hover) hover:text-(--chat-toolbar-ink-hover) rounded-ui-sm m-0 flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors hover:shadow-none [&_.material-icons]:text-[17px]!';

  private readonly module = signal<ChatEditorModule | null>(null);
  /** Whether the line is edited in the editor rather than in the plain box. */
  protected readonly inEditor = computed(() => this.module() !== null);
  protected readonly stampLinesOn = computed(() => this.stampRules.isOn('line'));

  private readonly editorHost = viewChild<ElementRef<HTMLElement>>('editorHost');
  private readonly plainBox = viewChild<ElementRef<HTMLTextAreaElement>>('plainBox');
  /** The buttons along the line, which the bar over a selection keeps clear of. */
  private readonly editsBar = viewChild<ElementRef<HTMLElement>>('editsBar');
  /** Where the reader stands in the plain box the editor arrived to take the place of, read as it is put in. */
  private plainStand: (() => PlainBoxStand) | null = null;
  /** Whether the reader has typed, pressed a key or pressed in the plain box, which then holds where they stand. */
  protected plainUsed = false;
  /** Whether the plain box has been given the keys, as it is when the line opens. */
  private plainFocused = false;
  private readonly toolbar = viewChild(ChatToolbarComponent);
  private readonly richField = signal<ChatEditorField | null>(null);
  private readonly plainField = computed(() => {
    const box = this.plainBox()?.nativeElement;
    return box ? new TextareaChatField(box, () => this.syntaxSource.tagLanguage()) : null;
  });
  /** What the buttons work on: the editor, or the plain box. */
  protected readonly field = computed<ChatTextField | null>(() => this.richField() ?? this.plainField());

  private readonly text = linkedSignal(() => this.draft());

  /**
   * The line's decorations, rubies and stamps, checked as it is edited; its commands left alone,
   * which run no more, nor whether a decoration keeps one from being read.
   */
  private readonly session: ChatLintSession = (() => {
    const scan = computed(() => {
      const read = scanChatSyntax(this.text(), 'chat');
      return { ...read, spans: read.spans.filter((span) => KINDS_EDITED.has(span.kind)) };
    });
    const context: ChatLintContext = {
      path: 'chatWindow',
      speaker: null,
      targets: [],
      isGameMaster: false,
      keptOffTable: false,
      referenceValue: () => null,
      portraits: () => [],
      isChatCutIn: () => false,
      hasEffect: () => true,
      hasPieceNamed: () => true,
      rollCheck: () => null,
      stampAllowed: (stampId) => this.stampRules.allows('line', stampId),
    };
    return {
      scan,
      diagnostics: computed(() =>
        lintChatSyntax(scan(), context).filter((found) => found.code !== 'deco.hidesCommand')
      ),
      annotations: computed(() => []),
      rolls: computed(() => []),
    };
  })();

  private readonly editorHostApi: ChatEditorHost = {
    mode: 'chat',
    marker: LINE_EDIT_ATTR,
    readsLineEnd: false,
    placeholder: () => this.t('feature.chat.message.edit'),
    language: () => this.syntaxSource.tagLanguage(),
    cutInNames: () => new Set(),
    submit: () => this.kept.emit(),
    cancel: () => this.abandoned.emit(),
    changed: (text) => this.write(text),
    session: () => this.session,
    completionWords: () => NO_WORDS,
    portraitImage: () => null,
    openRuby: () => this.toolbar()?.openRuby(),
    toolbarElement: () => this.editsBar()?.nativeElement ?? null,
    translate: (key, params) => this.t(key, params),
    stampHtml: (stampId, key) => this.syntaxSource.stampHtml(stampId, key),
  };

  constructor() {
    afterNextRender(() => this.focusPlainBox());
    if (this.preferences.richInput()) {
      void this.loader().then((module) =>
        whenNotComposing(this.plainBox()?.nativeElement, () => {
          const box = this.plainBox()?.nativeElement;
          this.plainStand = box ? followPlainBox(box) : null;
          this.module.set(module);
        })
      );
    }
    effect(() => {
      const host = this.editorHost()?.nativeElement ?? null;
      const module = this.module();
      untracked(() => this.followEditorHost(host, module));
    });
    let refreshedText: string | null = null;
    let refreshedField: ChatEditorField | null = null;
    effect(() => {
      const field = this.richField();
      if (!field) return;
      const text = this.session.scan().text;
      this.session.diagnostics();
      this.objectChange.fileVersion();
      untracked(() => {
        if (field === refreshedField && text === refreshedText) field.refreshSoon();
        else field.refresh(field === refreshedField);
      });
      refreshedText = text;
      refreshedField = field;
    });
    effect(() => {
      this.language.currentLang();
      const field = this.richField();
      untracked(() => field?.reconfigure());
    });
    afterEveryRender(() => this.richField()?.followRoot());
    inject(DestroyRef).onDestroy(() => this.richField()?.destroy());
  }

  /** Puts the editor in its place, starting from what the line says, the caret at its end. */
  private followEditorHost(host: HTMLElement | null, module: ChatEditorModule | null): void {
    const field = this.richField();
    if (field && field.parent !== host) {
      field.destroy();
      this.richField.set(null);
    }
    if (!host || !module || this.richField()) return;
    const text = this.plainField()?.text() ?? this.text();
    this.text.set(text);
    const start = this.startFromPlainBox(text.length);
    this.richField.set(module.mountChatEditor(host, { text, ...start }, this.editorHostApi));
  }

  /**
   * Where the editor starts as it takes the plain box's place, read from the box as it is put in:
   * where the reader stood in the box, once they have used it, with the keys only where the box
   * still had them. One put in before the box was put to use starts as the box does, with the caret
   * at the end and the keys, unless the reader has taken the keys from the box meanwhile.
   */
  private startFromPlainBox(end: number): Pick<ChatEditorStart, 'selection' | 'focused'> {
    const stand = this.plainStand?.();
    this.plainStand = null;
    const atEnd = { from: end, to: end };
    if (!stand) return { selection: atEnd, focused: true };
    if (this.plainUsed) return stand;
    return { selection: atEnd, focused: stand.focused || !this.plainFocused };
  }

  private focusPlainBox(): void {
    const box = this.plainBox()?.nativeElement;
    if (!box) return;
    this.plainField()?.refit();
    this.plainFocused = true;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }

  private write(text: string): void {
    this.text.set(text);
    this.draftChange.emit(text);
  }

  /** Takes what the box holds as the draft, as the buttons wrote into it. */
  protected takeFieldText(): void {
    const field = this.field();
    if (!field) return;
    this.write(field.text());
    this.plainField()?.refit();
  }

  protected typed(value: string): void {
    this.write(value);
    this.plainField()?.refit();
  }

  /** Escape puts the edit down and Enter keeps it; Shift+Enter and keys pressed mid-composition type as usual. */
  protected onPlainKeydown(event: KeyboardEvent): void {
    this.plainUsed = true;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.abandoned.emit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.kept.emit();
    }
  }

  /** Opens the stamps over their button, the one picked going in at the caret. */
  protected openStamps(anchor: EventTarget | null): void {
    if (!(anchor instanceof Element)) return;
    this.stampPicker.toggle(anchor, 'line', (stampId) => this.putStamp(stampId), 'end');
  }

  private putStamp(stampId: string): void {
    const field = this.field();
    if (!field || !this.stampRules.allows('line', stampId)) return;
    const label = stampLabel(stampId, this.t, (imageIdentifier) => this.stampPacks.nameOf(imageIdentifier));
    field.insertChip({ kind: 'stamp', id: stampId, label, raw: inlineStampToken(label, stampId) }, 'caret');
    field.focus();
    this.takeFieldText();
  }
}
