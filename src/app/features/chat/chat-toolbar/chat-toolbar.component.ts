import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { chatFontWanted$ } from '@axe/core/event/domain-events';
import {
  CHAT_COLORS,
  CHAT_FONT_KEYS,
  CHAT_SIZE_KEYS,
  type ChatColorKey,
  type ChatFontKey,
  type ChatSizeKey,
} from '@axe/domain/chat/chat-decoration';
import type {
  ChatSyntaxGroup,
  ChatSyntaxGroupKey,
  ChatSyntaxItem,
} from '@axe/features/chat/chat-input/chat-syntax-items';
import type { ChatMarkChange, ChatTextField } from '@axe/features/chat/chat-input/chat-text-field';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { TranslocoModule } from '@jsverse/transloco';

/** The popovers the toolbar opens, one at a time. */
type ToolbarPopover = 'style' | 'ruby' | ChatSyntaxGroupKey;

/** The kinds of syntax there is to put in, a button to each, with the icon it shows. */
const SYNTAX_BUTTONS: readonly { readonly key: ChatSyntaxGroupKey; readonly icon: string }[] = [
  { key: 'dice', icon: 'casino' },
  { key: 'reference', icon: 'data_object' },
  { key: 'resource', icon: 'exposure' },
  { key: 'buff', icon: 'auto_fix_high' },
  { key: 'portrait', icon: 'face' },
  { key: 'effect', icon: 'movie' },
  { key: 'quote', icon: 'format_quote' },
];

/**
 * The formatting buttons in the bar over the chat input, in one row: bold and italic, a style button
 * holding a line through, the size, the font and the colour, a ruby over the words selected, and the
 * syntax there is to put in, a group to each kind. A button lights up where the caret or the
 * selection has what it puts on. Every popover opens upward, as the chat sits at the foot of the
 * screen, and keeps on the screen.
 *
 * It works the plain box as well as the editor, which then writes the marks round the selection
 * and lights nothing up.
 *
 * The buttons are drawn in the panel's greys, or in `--chat-toolbar-ink`, `--chat-toolbar-ink-hover`
 * and `--chat-toolbar-hover` where what holds the bar sets them, as a line's bubble does, whose
 * colours follow the line's own.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-toolbar',
  templateUrl: './chat-toolbar.component.html',
  host: { class: 'flex min-w-0' },
  imports: [TranslocoModule],
})
export class ChatToolbarComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  /** What the buttons work on; nothing while there is no box to write in. */
  readonly field = input<ChatTextField | null>(null);
  /** The syntax there is to put in, worked out as the insert button opens. */
  readonly groups = input<() => ChatSyntaxGroup[]>(() => []);
  /**
   * Whether the buttons for each kind of syntax are offered: not where a line already sent is edited,
   * as editing it carries out no command.
   */
  readonly syntax = input(true);
  /**
   * Tells that the buttons have written into the box, for what holds it to take the box's text as
   * the line being written, as it does what is typed.
   */
  readonly edited = output<void>();

  protected readonly buttonClass =
    'text-(--chat-toolbar-ink,var(--ui-text-muted)) hover:bg-(--chat-toolbar-hover,var(--ui-hover)) hover:text-(--chat-toolbar-ink-hover,var(--ui-text)) aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent rounded-ui-sm m-0 flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors [&_.material-icons]:text-[17px]!';
  protected readonly wordButtonClass =
    'text-(--chat-toolbar-ink,var(--ui-text-muted)) hover:bg-(--chat-toolbar-hover,var(--ui-hover)) hover:text-(--chat-toolbar-ink-hover,var(--ui-text)) aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent rounded-ui-sm m-0 flex h-7 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent px-1 py-0 text-[11px] font-semibold transition-colors';
  protected readonly rowClass =
    'text-ui-text hover:bg-ui-hover rounded-ui-sm m-0 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1 text-left text-[12px]';
  protected readonly chipClass =
    'border-ui-border-panel text-ui-text hover:border-ui-accent aria-selected:border-ui-accent aria-selected:text-ui-accent rounded-ui-sm m-0 cursor-pointer border border-solid bg-transparent px-1.5 py-0.5 text-[11px]';
  protected readonly monoChipClass =
    'border-ui-border-panel text-ui-text hover:border-ui-accent rounded-ui-sm m-0 cursor-pointer border border-solid bg-transparent px-1.5 py-0.5 font-mono text-[11px]';
  protected readonly inputClass =
    'border-ui-input-border bg-ui-input text-ui-text focus:border-ui-accent rounded-ui-sm box-border w-full border border-solid px-1.5 py-1 text-[12px] focus:outline-none';

  protected readonly sizes = CHAT_SIZE_KEYS;
  protected readonly fontClasses: Record<ChatFontKey, string> = {
    mincho: 'chat-font-mincho',
    rounded: 'chat-font-rounded',
    hand: 'chat-font-hand',
    pop: 'chat-font-pop',
    pixel: 'chat-font-pixel',
    gothic: 'chat-font-gothic',
  };
  protected readonly fonts = CHAT_FONT_KEYS.filter((font) => font !== 'gothic');
  protected readonly colors = (Object.keys(CHAT_COLORS) as ChatColorKey[]).map((key) => ({
    key,
    value: CHAT_COLORS[key],
  }));

  protected readonly active = computed(() => this.field()?.activeMarks() ?? null);
  /** Whether the caret or the selection has a line through it or a size, a font or a colour, lighting the style button. */
  protected readonly styled = computed(() => {
    const marks = this.active();
    return !!marks && (!!marks.strike || !!marks.size || !!marks.font || !!marks.color);
  });
  protected readonly openOne = signal<ToolbarPopover | null>(null);
  protected readonly syntaxButtons = SYNTAX_BUTTONS;
  /** The kind of syntax whose list stands open, as it was worked out when it opened. */
  protected readonly openGroup = signal<ChatSyntaxGroup | null>(null);
  protected readonly rubyBase = signal('');
  protected readonly rubyReading = signal('');
  protected readonly rubyEditing = signal(false);

  private readonly styleButton = viewChild<ElementRef<HTMLElement>>('styleButton');
  private readonly rubyButton = viewChild<ElementRef<HTMLElement>>('rubyButton');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly rubyInput = viewChild<ElementRef<HTMLInputElement>>('rubyInput');
  private popover: AnchoredPopover | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.popover?.destroy());
  }

  /** Keeps the box's selection while a button is pressed, so what the button does falls on it. */
  protected keepSelection(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  }

  protected isOn(kind: 'bold' | 'italic' | 'strike'): boolean {
    return !!this.active()?.[kind];
  }

  protected apply(change: ChatMarkChange): void {
    const field = this.field();
    if (!field) return;
    field.applyMark(change);
    this.edited.emit();
  }

  protected setSize(size: ChatSizeKey | null): void {
    this.apply({ kind: 'size', value: size });
    this.close();
  }

  protected setFont(font: ChatFontKey | null): void {
    this.apply({ kind: 'font', value: font });
    this.close();
  }

  protected setColor(color: string | null): void {
    this.apply({ kind: 'color', value: color });
    this.close();
  }

  protected sizeLabel(size: ChatSizeKey): string {
    return this.t(`feature.chat.decoration.${size}`);
  }

  protected fontLabel(font: ChatFontKey): string {
    return this.t(`feature.chat.decoration.${font}`);
  }

  protected colorLabel(key: ChatColorKey): string {
    return this.t(`feature.chat.decoration.${key}`);
  }

  /**
   * Opens a popover over its button, or shuts it where it stands open; one at a time. A kind of
   * syntax opens the list of what there is of it, worked out as it opens.
   */
  protected toggle(which: ToolbarPopover, button: EventTarget | null = null): void {
    if (this.openOne() === which) {
      this.close();
      return;
    }
    this.close();
    if (which === 'style') for (const font of this.fonts) chatFontWanted$.emit(font);
    if (which === 'ruby') this.startRuby();
    const group = which === 'style' || which === 'ruby' ? null : which;
    if (group) {
      this.openGroup.set(
        this.groups()().find((each) => each.key === group) ?? { key: group, label: this.groupLabel(group), rows: [] }
      );
    }
    this.openOne.set(which);
    const anchor = button instanceof HTMLElement ? button : this.anchorOf(which)?.nativeElement;
    const panel = this.panel();
    if (!anchor || !panel) return;
    this.popover = new AnchoredPopover(
      () => anchor,
      () => panel.nativeElement,
      {
        width: group ? 320 : 240,
        minHeight: 80,
        align: 'end',
        prefer: 'up',
      }
    );
    if (!this.popover.show()) {
      this.openOne.set(null);
      return;
    }
    afterNextRender(
      () => {
        this.popover?.place();
        if (which === 'ruby') this.rubyInput()?.nativeElement.focus();
      },
      { injector: this.injector }
    );
  }

  private anchorOf(which: ToolbarPopover): ElementRef<HTMLElement> | undefined {
    switch (which) {
      case 'style':
        return this.styleButton();
      case 'ruby':
        return this.rubyButton();
      default:
        return undefined;
    }
  }

  protected groupLabel(key: ChatSyntaxGroupKey): string {
    return this.t(`feature.chat.syntax.${key}`);
  }

  /** Opens the ruby popover from elsewhere, as the bar over a selection does. */
  openRuby(): void {
    if (this.openOne() !== 'ruby') this.toggle('ruby');
  }

  protected close(): void {
    this.popover?.close();
    this.popover?.destroy();
    this.popover = null;
    this.openOne.set(null);
  }

  /** Reads the ruby to edit: the one selected as a chip, or the words selected, to put a reading over. */
  private startRuby(): void {
    const chip = this.field()?.selectedChip() ?? null;
    if (chip?.kind === 'ruby') {
      this.rubyBase.set(chip.base);
      this.rubyReading.set(chip.reading);
      this.rubyEditing.set(true);
      return;
    }
    this.rubyBase.set((this.field()?.selectedText() ?? '').replace(/\s+/g, ''));
    this.rubyReading.set('');
    this.rubyEditing.set(false);
  }

  /** Puts the reading over the words, as a ruby in place of what was selected. */
  protected applyRuby(): void {
    const field = this.field();
    const base = this.rubyBase().replace(/[|｜《》\s]/g, '');
    const reading = this.rubyReading().replace(/[《》\n]/g, '');
    if (!field || !base || !reading) return;
    field.insertChip({ kind: 'ruby', raw: `|${base}《${reading}》`, base, reading });
    this.edited.emit();
    this.close();
  }

  /** Takes the reading off a ruby, leaving its words. */
  protected removeRuby(): void {
    const field = this.field();
    if (!field) return;
    const { from, to } = field.selection();
    field.replaceRange(from, to, this.rubyBase());
    field.focus();
    this.edited.emit();
    this.close();
  }

  protected onRubyKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    this.applyRuby();
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected write(item: ChatSyntaxItem): void {
    item.run();
    this.close();
  }
}
