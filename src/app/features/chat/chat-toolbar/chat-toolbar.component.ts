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
import type { ChatSyntaxGroup, ChatSyntaxItem } from '@axe/features/chat/chat-input/chat-syntax-items';
import type { ChatMarkChange, ChatTextField } from '@axe/features/chat/chat-input/chat-text-field';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { TranslocoModule } from '@jsverse/transloco';

/** The popovers the toolbar opens, one at a time. */
type ToolbarPopover = 'size' | 'font' | 'color' | 'style' | 'ruby' | 'insert';

/**
 * The buttons over the chat input: bold, italic and a line through, which light up where the caret
 * or the selection is decorated, the size, the font and the colour, a ruby over the words selected,
 * and the syntax there is to put in, a group to each kind. Every popover opens upward, as the chat
 * sits at the foot of the screen, and keeps on the screen.
 *
 * It works the plain box as well as the editor, which then writes the marks round the selection
 * and lights nothing up.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-toolbar',
  templateUrl: './chat-toolbar.component.html',
  host: { class: 'block min-w-0' },
  imports: [TranslocoModule],
})
export class ChatToolbarComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  /** What the buttons work on; nothing while there is no box to write in. */
  readonly field = input<ChatTextField | null>(null);
  /** Packs the buttons down, the size, font and colour folded into one, for a narrow input. */
  readonly compact = input(false);
  /** The syntax there is to put in, worked out as the insert button opens. */
  readonly groups = input<() => ChatSyntaxGroup[]>(() => []);

  protected readonly buttonClass =
    'text-ui-muted hover:bg-ui-hover hover:text-ui-text aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent rounded-ui-sm m-0 flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors [&_.material-icons]:text-[18px]!';
  protected readonly wordButtonClass =
    'text-ui-muted hover:bg-ui-hover hover:text-ui-text aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent rounded-ui-sm m-0 flex h-7 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent px-1.5 py-0 text-[11px] font-semibold transition-colors';
  protected readonly rowClass =
    'text-ui-text hover:bg-ui-hover rounded-ui-sm m-0 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1 text-left text-[12px]';
  protected readonly chipClass =
    'border-ui-border-panel text-ui-text hover:border-ui-accent aria-selected:border-ui-accent aria-selected:text-ui-accent rounded-ui-sm m-0 cursor-pointer border border-solid bg-transparent px-1.5 py-0.5 text-[11px]';
  protected readonly monoChipClass =
    'border-ui-border-panel text-ui-text hover:border-ui-accent rounded-ui-sm m-0 cursor-pointer border border-solid bg-transparent px-1.5 py-0.5 font-mono text-[11px]';
  protected readonly inputClass =
    'border-ui-input-border bg-ui-input text-ui-text focus:border-ui-accent rounded-ui-sm box-border w-full border border-solid px-1.5 py-1 text-[12px] focus:outline-none';

  protected readonly sizes = CHAT_SIZE_KEYS;
  protected readonly sizeClasses: Record<ChatSizeKey, string> = {
    small: 'chat-size-small',
    large: 'chat-size-large',
    huge: 'chat-size-huge',
  };
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
  protected readonly openOne = signal<ToolbarPopover | null>(null);
  protected readonly shownGroups = signal<ChatSyntaxGroup[]>([]);
  protected readonly groupIndex = signal(0);
  protected readonly rubyBase = signal('');
  protected readonly rubyReading = signal('');
  protected readonly rubyEditing = signal(false);

  private readonly sizeButton = viewChild<ElementRef<HTMLElement>>('sizeButton');
  private readonly fontButton = viewChild<ElementRef<HTMLElement>>('fontButton');
  private readonly colorButton = viewChild<ElementRef<HTMLElement>>('colorButton');
  private readonly styleButton = viewChild<ElementRef<HTMLElement>>('styleButton');
  private readonly rubyButton = viewChild<ElementRef<HTMLElement>>('rubyButton');
  private readonly insertButton = viewChild<ElementRef<HTMLElement>>('insertButton');
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
    this.field()?.applyMark(change);
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

  /** Opens a popover over its button, or shuts it where it stands open; one at a time. */
  protected toggle(which: ToolbarPopover): void {
    if (this.openOne() === which) {
      this.close();
      return;
    }
    this.close();
    if (which === 'font' || which === 'style') for (const font of this.fonts) chatFontWanted$.emit(font);
    if (which === 'insert') {
      this.shownGroups.set(this.groups()());
      this.groupIndex.set(Math.min(this.groupIndex(), Math.max(0, this.shownGroups().length - 1)));
    }
    if (which === 'ruby') this.startRuby();
    this.openOne.set(which);
    const anchor = this.anchorOf(which);
    const panel = this.panel();
    if (!anchor || !panel) return;
    this.popover = new AnchoredPopover(
      () => anchor.nativeElement,
      () => panel.nativeElement,
      {
        width: which === 'insert' ? 320 : 240,
        minHeight: 80,
        align: 'start',
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
      case 'size':
        return this.sizeButton();
      case 'font':
        return this.fontButton();
      case 'color':
        return this.colorButton();
      case 'style':
        return this.styleButton();
      case 'ruby':
        return this.rubyButton();
      case 'insert':
        return this.insertButton();
    }
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
    this.close();
  }

  /** Takes the reading off a ruby, leaving its words. */
  protected removeRuby(): void {
    const field = this.field();
    if (!field) return;
    const { from, to } = field.selection();
    field.replaceRange(from, to, this.rubyBase());
    field.focus();
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

  protected selectGroup(index: number): void {
    this.groupIndex.set(index);
    afterNextRender(() => this.popover?.place(), { injector: this.injector });
  }
}
