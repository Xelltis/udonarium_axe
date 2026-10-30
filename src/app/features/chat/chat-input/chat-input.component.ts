import { NgClass, NgStyle } from '@angular/common';
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
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatLintService } from '@axe/application/chat/chat-lint.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { stampLabel, stampWords } from '@axe/application/chat/stamp-words';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { callWritingAMessage } from '@axe/core/event/domain-events';
import { PeerContext } from '@axe/core/network/peer-context';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatBubbleColors, chatBubbleOf, chatColorOf, DEFAULT_CHAT_COLOR } from '@axe/domain/chat/chat-color';
import { withoutChatDecoration } from '@axe/domain/chat/chat-decoration';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { composeChatOutgoing, composeStampOutgoing, OutgoingStamp } from '@axe/domain/chat/chat-outgoing';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { inlineStampsAlone, inlineStampToken } from '@axe/domain/chat/inline-stamp';
import { stampOf } from '@axe/domain/chat/stamp-catalog';
import type { ChatDiagnostic } from '@axe/domain/chat-syntax/chat-lint';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { readRollLine, rollableText } from '@axe/domain/dice/dice-roll-line';
import { mayBeChosen } from '@axe/domain/peer/chosen-seat';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { ChatColorSettingComponent } from '@axe/features/chat/chat-color-setting/chat-color-setting.component';
import { ChatComposeService } from '@axe/features/chat/chat-compose.service';
import type { ChatEditorField, ChatEditorHost, ChatEditorStart } from '@axe/features/chat/chat-editor/chat-editor';
import {
  CHAT_EDITOR_LOADER,
  CHAT_HIGHLIGHT_LIMIT,
  type ChatEditorModule,
} from '@axe/features/chat/chat-editor/chat-editor-loader';
import { ChatInputDiceBotHelper } from '@axe/features/chat/chat-input/chat-input-dicebot';
import { allowsChat, lineStartOf } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatInputHistory } from '@axe/features/chat/chat-input/chat-input-history';
import {
  type ChatSyntaxGroup,
  chatSyntaxGroups,
  type ChatSyntaxWriter,
} from '@axe/features/chat/chat-input/chat-syntax-items';
import { ChatSyntaxSourceService } from '@axe/features/chat/chat-input/chat-syntax-source.service';
import { type ChatTextField, TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';
import { ChatToolbarComponent } from '@axe/features/chat/chat-toolbar/chat-toolbar.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { PortraitChoice, PortraitPickerComponent } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { PortraitSliderComponent } from '@axe/ui/components/portrait-slider/portrait-slider.component';
import { ComposingMarkDirective, whenNotComposing } from '@axe/ui/directives/composing-mark.directive';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { RovingToolbarDirective } from '@axe/ui/directives/roving-toolbar.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { ChatColorStylePipe } from '@axe/ui/pipes/chat-color-style.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { followPlainBox, type PlainBoxStand } from '@axe/ui/plain-box-handover';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

const COLOR_SETTING_PANEL = 'chat-color-setting';
/** The room a select's list wants above it before it opens upward: the most it shows at once. */
const LIST_ROOM = 240;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-input',
  templateUrl: './chat-input.component.html',
  host: { class: 'block min-w-0 [container-type:inline-size]' },
  imports: [
    ComposingMarkDirective,
    TextTooltipDirective,
    NgClass,
    NgStyle,
    NgSelectComponent,
    FormsModule,
    NgOptionComponent,
    NgSelectWindowDirective,
    PortraitPickerComponent,
    PortraitSliderComponent,
    SafePipe,
    TranslocoModule,
    ChatToolbarComponent,
    RovingToolbarDirective,
  ],
})
export class ChatInputComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly barButtonClass =
    'text-ui-muted hover:bg-ui-hover hover:text-ui-text aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent aria-expanded:bg-ui-hover rounded-ui-sm m-0 flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors hover:shadow-none [&_.material-icons]:text-[17px]!';
  protected readonly barWordButtonClass =
    'text-ui-muted hover:bg-ui-hover hover:text-ui-text rounded-ui-sm m-0 flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent px-1 py-0 text-[12px] font-semibold transition-colors hover:shadow-none';
  protected readonly ruleClass = 'bg-ui-border-panel h-4 w-px shrink-0 @max-[420px]:hidden';
  protected readonly colorSampleClass =
    'flex size-5 items-center justify-center rounded-[5px] text-[12px] leading-none font-bold shadow-[0_0_0_1px_var(--ui-border-panel)]';
  protected readonly panelRowClass =
    'text-ui-text hover:bg-ui-hover rounded-ui-sm m-0 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1 text-left text-[12px]';
  protected readonly findingsChipClass =
    'border-ui-border-panel bg-ui-elevated text-ui-muted shadow-ui-sm data-[severity=error]:text-ui-danger data-[severity=warning]:text-ui-warning data-[severity=info]:text-ui-accent absolute right-5 bottom-1 z-1 m-0 flex h-4.5 cursor-pointer items-center gap-0.5 rounded-full border border-solid px-1.5 text-[11px] leading-none font-semibold hover:shadow-none [&_i]:text-[13px]!';
  protected readonly findingRowClass =
    'text-ui-text hover:bg-ui-hover data-[severity=error]:[&_i]:text-ui-danger data-[severity=warning]:[&_i]:text-ui-warning data-[severity=info]:[&_i]:text-ui-accent rounded-ui-sm m-0 flex w-full cursor-pointer items-start gap-2 border-none bg-transparent px-2 py-1 text-left text-[12px] leading-snug [&_i]:mt-px [&_i]:text-[15px]!';

  private readonly colorsButton = viewChild<ElementRef<HTMLElement>>('colorsButton');
  private readonly colorsPanel = viewChild<ElementRef<HTMLElement>>('colorsPanel');
  private readonly findingsButton = viewChild<ElementRef<HTMLElement>>('findingsButton');
  private readonly findingsPanel = viewChild<ElementRef<HTMLElement>>('findingsPanel');
  /** The bar of buttons over the box, which the bar over a selection keeps clear of. */
  private readonly editsBar = viewChild<ElementRef<HTMLElement>>('editsBar');
  private readonly panel = signal<{ which: 'colors' | 'findings'; popover: AnchoredPopover } | null>(null);

  /**
   * The popover standing open from the bar or the box: the speech colours, or what was found in the
   * line. It shuts on a press outside it and on Escape as well.
   */
  protected readonly openPanel = computed(() => {
    const open = this.panel();
    return open?.popover.isOpen() ? open.which : null;
  });

  /** Opens a popover over its button, upward as the chat sits at the foot of the screen, or shuts it. */
  protected togglePanel(which: 'colors' | 'findings'): void {
    const wasOpen = this.openPanel() === which;
    this.closePanel();
    if (wasOpen) return;
    const anchor = which === 'colors' ? this.colorsButton() : this.findingsButton();
    const panel = which === 'colors' ? this.colorsPanel() : this.findingsPanel();
    if (!anchor || !panel) return;
    const popover = new AnchoredPopover(
      () => anchor.nativeElement,
      () => panel.nativeElement,
      {
        width: which === 'colors' ? 160 : 320,
        minHeight: 40,
        align: 'end',
        prefer: 'up',
      }
    );
    this.panel.set({ which, popover });
    if (!popover.show()) {
      this.closePanel();
      return;
    }
    afterNextRender(() => popover.place(), { injector: this.injector });
  }

  protected closePanel(): void {
    const open = this.panel();
    open?.popover.close();
    open?.popover.destroy();
    this.panel.set(null);
  }

  /** Speaks in one of the three colours, from the colour popover. */
  protected pickColor(index: number): void {
    this.setColorNum(index);
    this.closePanel();
  }

  /** Opens the colour settings from the colour popover. */
  protected openColorSetting(): void {
    this.closePanel();
    this.showColorSetting();
  }

  /**
   * Has a select in the bar open its list upward, as the chat sits at the foot of the screen, and
   * downward only where there is too little room above and more below. Set on the select itself as
   * it is pressed or focused, since it reads the way at the moment it opens.
   */
  protected aimList(select: NgSelectComponent, event: Event): void {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const below = (event.currentTarget.ownerDocument.defaultView?.innerHeight ?? 0) - rect.bottom;
    select.dropdownPosition.set(rect.top >= LIST_ROOM || rect.top >= below ? 'top' : 'bottom');
  }

  private readonly destroyRef = inject(DestroyRef);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  private readonly tabletopService = inject(TabletopService);

  /**
   * Whether this seat has a ticker to send a line to.
   *
   * The band only runs along the edge of a table being looked straight down on, so a seat in
   * perspective has none. Offered there all the same, the switch would send a line to everybody
   * else's band and leave the sender's own screen with nothing to show for it. A guest, who puts
   * nothing on anybody's screen, is not offered it, as the line's own menu offers it none.
   */
  readonly showsTickerSwitch = computed(() => {
    this.objectChange.trackMyCursor();
    return (
      canRoleEdit(PeerCursor.myRole) &&
      this.tabletopService.mode2d() &&
      this.tabletopDisplay.settings().multiAngleTickerEnabled
    );
  });
  readonly sendsToTicker = signal(false);

  private readonly roomPanels = inject(RoomPanelService);

  /**
   * Whether the room shows its rolls' dice, which is when a seat has reason to choose how its own
   * look; never for a guest, who is not offered the panel.
   */
  readonly showsMyDice = computed(() => {
    this.objectChange.versionOf('Config')();
    this.objectChange.trackMyCursor();
    if (PeerCursor.myRole === PeerRole.Guest) return false;
    return (this.objectStore.get<Config>('Config')?.diceStage ?? 'off') !== 'off';
  });

  /** Opens where this seat chooses how its dice look. */
  openMyDice(): void {
    this.roomPanels.open('myDice');
  }

  /** Switches whether the lines this seat sends also run along the ticker band. */
  toggleTickerSend(): void {
    this.sendsToTicker.update((sends) => !sends);
  }

  private readonly syntaxSource = inject(ChatSyntaxSourceService);

  /** Whether the toolbar over the box is fetched yet: once the page has first drawn. */
  protected readonly toolbarWanted = signal(false);
  private readonly toolbar = viewChild(ChatToolbarComponent);

  /** The syntax the toolbar's insert button offers, for the speaker and the room as they are when it opens. */
  protected readonly syntaxGroups = (): ChatSyntaxGroup[] =>
    chatSyntaxGroups(this.syntaxSource.sourceFor(this.sendFrom, this.gameType), this.syntaxWriter, this.t);

  /** Writes what the toolbar's insert button picks into the box, and goes back to writing. */
  private readonly syntaxWriter: ChatSyntaxWriter = {
    insert: (text, select) =>
      this.writeIntoField((field) => {
        const { from, to } = field.selection();
        const picked = select ? { from: from + select.from, to: from + select.to } : undefined;
        field.replaceRange(from, to, text, picked);
      }),
    prefix: (text, line = 'caret') =>
      this.writeIntoField((field) => {
        const { from, to } = field.selection();
        const lineStart =
          line === 'caret'
            ? lineStartOf(field.text(), from)
            : line === 'roll'
              ? readRollLine(rollableText(field.text().split('\n')[0])).rollFrom
              : 0;
        const shifted = (at: number) => (at < lineStart ? at : at + text.length);
        field.replaceRange(lineStart, lineStart, text, { from: shifted(from), to: shifted(to) });
      }),
    chip: (chip, place) => this.writeIntoField((field) => field.insertChip(chip, place)),
  };

  private writeIntoField(write: (field: ChatTextField) => void): void {
    const field = this.textField();
    if (!field) return;
    write(field);
    this.text = field.text();
    field.focus();
    this.kickCalcFitHeight();
  }

  /** Takes what the toolbar wrote into the box as the line being written, as what is typed is taken. */
  protected takeFieldText(): void {
    const field = this.textField();
    if (!field) return;
    this.text = field.text();
    this.onInput();
  }
  private readonly batchService = inject(BatchService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly language = inject(LanguageService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly stampPicker = inject(StampPickerService);
  private readonly stampPacks = inject(StampPackService);
  private readonly stampRules = inject(StampRulesService);

  /** Whether the room lets stamps be sent as lines, which puts the button for them beside the send button. */
  protected readonly stampLinesOn = computed(() => this.stampRules.isOn('line'));
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly uiSignalService = inject(UiSignalService);
  /**
   * The panel this input belongs to, where it stands in one that asks it things.
   *
   * Answering and quoting are said to this input alone; the plain text the room hands round -
   * a roll from the hotbar, a token from the effect library - is still said to whoever is out
   * there, since it was never aimed at a panel in the first place.
   */
  private readonly compose = inject(ChatComposeService, { optional: true });

  private chatHistory = new ChatInputHistory();
  private dicebotHelper = new ChatInputDiceBotHelper();

  /** The box lines are written in, which a reader who may not speak in the tab is not given. */
  private readonly textAreaElementRef = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');

  private readonly plainField = computed(() => {
    const box = this.textAreaElementRef()?.nativeElement;
    return box ? new TextareaChatField(box, () => this.syntaxSource.tagLanguage()) : null;
  });

  private readonly injector = inject(Injector);
  private readonly chatPreferences = inject(ChatPreferencesService);
  private readonly editorLoader = inject(CHAT_EDITOR_LOADER);
  private readonly editorHost = viewChild<ElementRef<HTMLElement>>('editorHost');
  private readonly editorModule = signal<ChatEditorModule | null>(null);
  private readonly editorUnreachable = signal(false);
  private readonly richField = signal<ChatEditorField | null>(null);
  private editorRequested = false;
  private editorFetched = false;
  /** Where the box stood when one kind gave way to the other, for the other to start from. */
  private handover: ChatEditorStart | null = null;
  /** Where the reader stands in the plain box the editor arrived to take the place of, read as it is put in. */
  private plainStand: (() => PlainBoxStand) | null = null;

  /**
   * Which box lines are typed into: the editor that draws them as they will look, the plain box
   * while it is on its way, or the plain box for a reader who has not asked for the editor or
   * whose browser could not fetch it.
   */
  protected readonly inputMode = computed<'rich' | 'loading' | 'plain'>(() => {
    if (!this.chatPreferences.richInput() || this.editorUnreachable()) return 'plain';
    return this.editorModule() ? 'rich' : 'loading';
  });

  /** What lines are typed into, while the reader may speak in the tab. */
  readonly textField = computed<ChatTextField | null>(() => this.richField() ?? this.plainField());

  /** Whether lines are checked as they are sent: through a palette, which empties a reference nothing answers, or as chat. */
  readonly lintPath = input<'chatWindow' | 'palette'>('chatWindow');

  private readonly lintSession = inject(ChatLintService).watch({
    text: computed(() => this._text()),
    sendFrom: computed(() => this._sendFrom()),
    gameType: computed(() => {
      this.objectChange.versionOf('Config')();
      return this.gameType;
    }),
    path: () => this.lintPath(),
  });

  /** The text checked as it will be sent from here, while it is typed into the editor. */
  private readonly activeSession = computed(() => (this.inputMode() === 'rich' ? this.lintSession : null));

  /**
   * Each time the editor has marked what will not work, which the list of findings follows, and
   * whether it could, or the text was too long to mark.
   */
  private readonly lintMarked = signal({ marked: true });

  /**
   * What was found in the line, while it is typed into the editor, and the text it was found in:
   * as the editor last marked it, once the reader paused, so that the line is not checked whole at
   * every key.
   */
  private readonly linted = computed<{ text: string; findings: ChatDiagnostic[] }>(() => {
    const session = this.activeSession();
    const { marked } = this.lintMarked();
    return session && marked
      ? untracked(() => ({ text: session.scan().text, findings: session.diagnostics() }))
      : { text: '', findings: [] };
  });
  protected readonly findings = computed(() => this.linted().findings);
  /** The sharpest of what was found, which the count beside the box is drawn in. */
  protected readonly worstSeverity = computed(() => {
    const found = this.findings();
    if (found.some((one) => one.severity === 'error')) return 'error';
    return found.some((one) => one.severity === 'warning') ? 'warning' : 'info';
  });

  protected severityIcon(severity: ChatDiagnostic['severity']): string {
    return severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
  }

  /** The stretch of the line a finding is about, as it read when found, cut short where it runs long. */
  protected findingSyntax(found: ChatDiagnostic): string {
    const written = this.linted().text.slice(found.from, found.to);
    return written.length > 16 ? `${written.slice(0, 15)}…` : written;
  }

  /** What a finding says, in the reader's language. */
  protected findingText(found: ChatDiagnostic): string {
    this.language.currentLang();
    return this.t(`feature.chat.lint.${found.code}`, found.params ? { ...found.params } : undefined);
  }

  /**
   * Puts the caret on what a finding is about. Where the line has changed since it was found, it
   * is checked again at once instead, the list then showing where each finding now stands.
   */
  protected goToFinding(found: ChatDiagnostic): void {
    const field = this.richField();
    if (this.linted().text !== this.text) {
      field?.refresh(false);
      return;
    }
    this.closePanel();
    field?.select({ from: found.from, to: found.to });
  }

  /** What the empty box says in place of its keys. */
  private readonly placeholderText = computed(() => {
    this.language.currentLang();
    const own = this.placeholder();
    if (own) return own;
    return this.t(
      this.isCompact() ? 'feature.chat.input.textareaPlaceholderShort' : 'feature.chat.input.textareaPlaceholder'
    );
  });

  private readonly editorHostApi: ChatEditorHost = {
    mode: 'chat',
    placeholder: () => this.placeholderText(),
    submit: () => this.sendChat(null),
    historyStep: (direction) => this.moveHistory(null, direction),
    suggestionStep: (direction) => {
      this.autoCompleteSwitch.emit(direction);
      return this.autoCompleteListLen() > 1;
    },
    changed: (text) => {
      this.text = text;
      this.onInput();
    },
    session: () => untracked(() => this.activeSession()),
    completionWords: () => this.syntaxSource.completionWordsFor(this.sendFrom),
    language: () => this.syntaxSource.tagLanguage(),
    cutInNames: () => this.syntaxSource.chatCutInNames(),
    portraitImage: (raw) => this.syntaxSource.portraitImage(this.sendFrom, raw),
    openRuby: () => this.toolbar()?.openRuby(),
    toolbarElement: () => this.editsBar()?.nativeElement ?? null,
    translate: (key, params) => this.t(key, params),
    stampHtml: (stampId, key) => this.syntaxSource.stampHtml(stampId, key),
    linted: (marked) => {
      this.lintMarked.set({ marked });
      if (this.openPanel() === 'findings' && this.findings().length < 1) this.closePanel();
    },
  };

  /**
   * Fetches the editor once the page has drawn and has time to spare, or at once on the first touch
   * of the box, for a reader who has it on.
   */
  protected requestEditor(soon = false): void {
    if (this.editorFetched || !this.chatPreferences.richInput()) return;
    if (soon) return this.fetchEditor();
    if (this.editorRequested) return;
    this.editorRequested = true;
    const fetch = () => this.fetchEditor();
    const view = this.hostElement.nativeElement.ownerDocument.defaultView;
    if (view?.requestIdleCallback) view.requestIdleCallback(fetch, { timeout: 2000 });
    else setTimeout(fetch, 200);
  }

  private fetchEditor(): void {
    if (this.editorFetched) return;
    this.editorFetched = true;
    void this.editorLoader().then((module) => {
      if (!module) {
        this.editorUnreachable.set(true);
        return;
      }
      whenNotComposing(this.plainField()?.element, () => {
        const box = this.plainField()?.element;
        this.plainStand = box ? followPlainBox(box) : null;
        this.editorModule.set(module);
      });
    });
  }

  private readonly hostElement = inject(ElementRef<HTMLElement>);

  /** Puts the editor into its place when it is drawn, and takes it down when the place goes. */
  private followEditorHost(): void {
    const host = this.editorHost()?.nativeElement ?? null;
    const module = this.editorModule();
    untracked(() => {
      const field = this.richField();
      if (field && field.parent !== host) {
        this.handover = field.snapshot();
        field.destroy();
        this.richField.set(null);
      }
      if (host && module && !this.richField()) {
        const stand = this.plainStand?.();
        this.plainStand = null;
        const start = this.handover ??
          stand ?? { selection: { from: this.text.length, to: this.text.length }, focused: false };
        this.handover = null;
        this.richField.set(module.mountChatEditor(host, { ...start, text: this.text }, this.editorHostApi));
      }
      if (!host && this.handover) this.restorePlainBox();
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
        const field = this.plainField();
        const start = this.handover;
        this.handover = null;
        if (!field || !start) return;
        if (start.focused) field.focus();
        field.setText(start.text, start.selection);
      },
      { injector: this.injector }
    );
  }

  /** Puts the caret in the box lines are typed into, where there is one. */
  focusInput(): void {
    this.textField()?.focus();
  }

  readonly onlyCharacters = input(false);
  readonly disableQuote = input(false);
  /**
   * Packs the input down for a panel whose own list needs the room: less space round it, and a box
   * that starts a line high.
   */
  readonly dense = input(false);
  /** What the empty box says in place of its keys, for a panel that fills the box its own way. */
  readonly placeholder = input('');
  readonly canSpeak = input(true);
  readonly chatTabidentifier = input('');
  readonly autoCompleteIndex = input(-1);

  readonly gameTypeInput = input('', { alias: 'gameType' });
  readonly gameTypeChange = output<string>();

  private readonly _gameType = linkedSignal(() => this.gameTypeInput());
  private _isGameTypeByUser = 0;
  /**
   * The game system whose dice bot reads the lines sent from this input.
   *
   * Until the user picks one, the plain dice bot is shown as the room's default dice bot. Picking
   * one reports it through `gameTypeChange`.
   */
  get gameType(): string {
    if (this._gameType() == 'DiceBot' && this._isGameTypeByUser == 0) {
      return this.config?.defaultDiceBot ?? this._gameType();
    } else {
      return this._gameType();
    }
  }

  set gameType(gameType: string) {
    this._isGameTypeByUser = 1;
    this._gameType.set(gameType);
    this.gameTypeChange.emit(gameType);
  }

  readonly sendFromInput = input('', { alias: 'sendFrom' });
  readonly sendFromChange = output<string>();
  private readonly _sendFrom = linkedSignal(() => this.sendFromInput());
  /**
   * The identifier of who is speaking, a character or this seat's own cursor; setting it reports
   * through `sendFromChange`.
   */
  get sendFrom(): string {
    return this._sendFrom();
  }
  set sendFrom(sendFrom: string) {
    this._sendFrom.set(sendFrom);
    this.sendFromChange.emit(sendFrom);
  }

  readonly sendToInput = input('', { alias: 'sendTo' });
  readonly sendToChange = output<string>();
  private readonly _sendTo = linkedSignal(() => this.sendToInput());
  /**
   * The identifier of the peer cursor being whispered to, or empty for everyone; setting it reports
   * through `sendToChange`.
   */
  get sendTo(): string {
    return this._sendTo();
  }
  set sendTo(sendTo: string) {
    this._sendTo.set(sendTo);
    this.sendToChange.emit(sendTo);
  }

  readonly autoCompleteListLen = input(-1);

  readonly textInput = input('', { alias: 'text' });
  readonly textChange = output<string>();
  private readonly _text = linkedSignal(() => this.textInput());
  /** The line being written; setting it reports through `textChange`. */
  get text(): string {
    return this._text();
  }
  set text(text: string) {
    this._text.set(text);
    this.textChange.emit(text);
  }

  readonly chat = output<ChatOutgoing>();

  readonly replyTarget = signal<ChatMessage | null>(null);
  readonly replyToName = computed(() => this.replyTarget()?.name ?? '');
  readonly replyToText = computed(() => {
    const target = this.replyTarget();
    if (!target) return '';
    const text = withoutChatDecoration(target.text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  });

  /** Drops the message being replied to, both here and wherever the asking came from. */
  cancelReply(): void {
    this.replyTarget.set(null);
    if (this.compose) this.compose.clearReply();
    else this.uiSignalService.clearChatReply();
  }

  readonly quoteTarget = signal<ChatMessage | null>(null);
  readonly quoteToName = computed(() => this.quoteTarget()?.name ?? '');
  readonly quoteToText = computed(() => {
    const target = this.quoteTarget();
    if (!target) return '';
    const text = withoutChatDecoration(target.text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  });

  /** Drops the message being quoted, both here and wherever the asking came from. */
  cancelQuote(): void {
    this.quoteTarget.set(null);
    if (this.compose) this.compose.clearQuote();
    else this.uiSignalService.clearChatQuote();
  }

  readonly autoCompleteSwitch = output<number>();

  readonly autoCompleteDo = output<number>();

  constructor() {
    afterNextRender(() => this.toolbarWanted.set(true));
    this.destroyRef.onDestroy(() => this.closePanel());
    this.objectChange.onObjectChangedForAlias(
      [GameCharacter.aliasName],
      (event) => {
        if (event.identifier !== this.sendFrom) return;
        const gameCharacter = this.objectStore.get<GameCharacter>(event.identifier);
        if (gameCharacter && !allowsChat(gameCharacter, this.myPeer.peerId, this.onlyCharacters())) {
          if (0 < this.gameCharacters().length && this.onlyCharacters()) {
            this.sendFrom = this.gameCharacters()[0].identifier;
          } else {
            this.sendFrom = this.myPeer.identifier;
          }
        }
      },
      this.destroyRef
    );
    this.objectChange.peerDisconnect$.subscribe((event) => {
      const object = this.objectStore.get(this.sendTo);
      if (object instanceof PeerCursor && object.peerId === event.peerId) {
        this.sendTo = '';
      }
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      [PeerCursor.aliasName],
      () => this.followWhisperTarget(),
      this.destroyRef
    );
    this.objectChange.objectDeleted$.subscribe((event) => {
      if (event.identifier === this.sendTo) this.followWhisperTarget();
    }, this.destroyRef);
    this.destroyRef.onDestroy(() => {
      this.batchService.remove(this);
      if (this.writingEventInterval) {
        clearTimeout(this.writingEventInterval);
        this.writingEventInterval = null;
      }
      if (this.calcFitHeightInterval) {
        clearTimeout(this.calcFitHeightInterval);
        this.calcFitHeightInterval = null;
      }
    });
    effect(() => {
      if (this.canSpeak() && this.chatPreferences.richInput()) untracked(() => this.requestEditor());
    });
    effect(() => this.followEditorHost());
    effect(() => {
      const text = this._text();
      const field = this.richField();
      if (field && untracked(() => field.text()) !== text) untracked(() => field.setText(text));
    });
    effect(() => {
      this.placeholderText();
      untracked(() => this.richField()?.reconfigure());
    });
    let refreshedText: string | null = null;
    let refreshedField: ChatEditorField | null = null;
    effect(() => {
      const session = this.activeSession();
      const field = this.richField();
      if (!session || !field) return;
      const text = this._text();
      if (text.length <= CHAT_HIGHLIGHT_LIMIT) session.annotations();
      this.objectChange.fileVersion();
      untracked(() => {
        if (field === refreshedField && text === refreshedText) field.refreshSoon();
        else field.refresh(field === refreshedField);
      });
      refreshedText = text;
      refreshedField = field;
    });
    afterEveryRender(() => this.richField()?.followRoot());
    this.destroyRef.onDestroy(() => this.richField()?.destroy());
    effect(() => {
      const req = this.uiSignalService.chatInputTextRequest();
      if (!req) return;
      untracked(() => {
        this.text = (this.text ? this.text + ' ' : '') + req.text;
      });
    });
    effect(() => {
      const req = this.compose ? this.compose.replyRequest() : this.uiSignalService.chatReplyRequest();
      if (!req) {
        this.replyTarget.set(null);
        return;
      }
      untracked(() => {
        const target = this.objectStore.get<ChatMessage>(req.messageIdentifier);
        this.replyTarget.set(target instanceof ChatMessage ? target : null);
        if (target instanceof ChatMessage) this.focusInput();
      });
    });
    effect(() => {
      if (this.disableQuote()) {
        this.quoteTarget.set(null);
        return;
      }
      const req = this.compose ? this.compose.quoteRequest() : this.uiSignalService.chatQuoteRequest();
      if (!req) {
        this.quoteTarget.set(null);
        return;
      }
      untracked(() => {
        const target = this.objectStore.get<ChatMessage>(req.messageIdentifier);
        this.quoteTarget.set(target instanceof ChatMessage ? target : null);
        if (target instanceof ChatMessage) this.focusInput();
      });
    });
  }

  /** The room's shared configuration. */
  get config(): Config {
    return this.objectStore.get<Config>('Config')!;
  }

  /**
   * Which of the speaking character's portraits goes with the line.
   *
   * It is kept on the character itself, so choosing one changes it for every peer. It reads 0 and
   * ignores writes when the speaker is not a character.
   */
  get portraitIndex(): number {
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) {
      return object.selectedPortraitIndex;
    }
    return 0;
  }

  set portraitIndex(num: number) {
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) {
      object.selectedPortraitIndex = num;
    }
  }

  readonly portraitChoices = computed<PortraitChoice[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(this._sendFrom())();
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return [];
    const children = (object.imageDataElement?.children ?? []) as DataElement[];
    return children.map((element, index) => ({
      index,
      name: portraitNameOf(element),
      url: this.imageStorage.get(element.value as string)?.url ?? '',
    }));
  });

  /**
   * Whether the speaker has portraits enough to choose between, so a slider running through them
   * is laid out beside the colours.
   */
  readonly hasPortraitSlider = computed(() => this.portraitChoices().length > 1);

  /** Whether the line is a whisper to one peer rather than a message to everyone. */
  get isDirect(): boolean {
    return this.sendTo != null && this.sendTo.length > 0;
  }

  readonly colorSelectNo = signal(0);

  /** Whether the speaker is a character rather than this seat's own cursor. */
  get isGameCharacter(): boolean {
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) {
      return true;
    }
    return false;
  }

  /**
   * The speaking character's chat colour in the given slot, or the default colour when the speaker
   * is not a character.
   */
  characterChatColor(num: number) {
    const object = this.objectStore.get(this.sendFrom);
    if (!(object instanceof GameCharacter)) return DEFAULT_CHAT_COLOR;
    this.objectChange.versionOf(object.identifier)();
    return chatColorOf(object, num);
  }

  /** The colour in the slot currently chosen, which the next line is sent in. */
  get selectChatColor() {
    return this.chatColor(this.colorSelectNo());
  }

  private readonly theme = inject(ThemeService);
  private readonly skins = inject(SkinService);
  private readonly colorStyle = new ChatColorStylePipe();

  /**
   * The colour a line is shown in from one of the three slots and the bubble it sits on, on this
   * reader's theme: the box written in shows it, and the colour buttons draw it as a sample.
   */
  protected lookOf(slot: number): Record<string, string> | null {
    const theme = this.theme.resolved();
    const bubbles = this.chatBubbles(slot);
    return this.colorStyle.transform(
      this.chatColor(slot),
      theme,
      theme === 'dark' ? bubbles.dark : bubbles.light,
      this.skins.toneOf(theme)
    );
  }

  /** How the line being written will look, in the slot chosen. */
  protected readonly lineLook = computed(() => this.lookOf(this.colorSelectNo()));

  /**
   * The colour the line is sent in, drawn under the letter of the colour button and ringed with its
   * bubble, so a dark ink still shows on a dark bar.
   */
  protected readonly lineInk = computed(() => {
    const look = this.lineLook();
    return {
      'background-color': look?.['color'] ?? this.selectChatColor,
      'box-shadow': `0 0 0 1px ${look?.['background-color'] ?? 'var(--ui-border-panel)'}`,
    };
  });

  /**
   * Whether the colours of the lines come from the character spoken as: they do but for a guest,
   * whose colour panel sets the colours of their own lines instead.
   */
  private colorsFromCharacter(object: unknown): object is GameCharacter {
    this.objectChange.trackMyCursor();
    return object instanceof GameCharacter && canRoleEdit(PeerCursor.myRole);
  }

  /** The bubble the sender asked for on each theme, which travels with the message. */
  private chatBubbles(num: number): ChatBubbleColors {
    const object = this.objectStore.get(this.sendFrom);
    const source = this.colorsFromCharacter(object) ? object : this.myPeer;
    this.objectChange.versionOf(source.identifier)();
    return chatBubbleOf(source, num);
  }

  /**
   * The speaker's chat colour in the given slot, taken from the character or from this seat's own
   * cursor.
   */
  chatColor(num: number): string {
    const object = this.objectStore.get(this.sendFrom);
    if (this.colorsFromCharacter(object)) return this.characterChatColor(num);
    return this.playerChatColor(num);
  }

  /** This seat's own chat colour in the given slot. */
  playerChatColor(num: number) {
    this.objectChange.versionOf(this.myPeer.identifier)();
    return chatColorOf(this.myPeer, num);
  }

  /**
   * Chooses which of the three colour slots the next line uses; values outside 0 to 2 are clamped.
   */
  setColorNum(num: number) {
    const clamped = Math.min(2, Math.max(0, num));
    this.colorSelectNo.set(clamped);
  }

  /**
   * The data element of the speaking character's chosen portrait, or null when the speaker has none
   * at that index.
   */
  get selectedPortrait(): DataElement | null {
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) {
      if (object.imageDataElement && object.imageDataElement.children.length > this.portraitIndex) {
        return object.imageDataElement.children[this.portraitIndex] ?? null;
      }
    }
    return null;
  }

  /**
   * The picture shown beside the input.
   *
   * The chosen portrait comes first, then the character's own image or the player's icon, and
   * `ImageFile.Empty` when there is none.
   */
  get imageFile(): ImageFile {
    if (this.selectedPortrait) {
      const image = this.imageStorage.get(this.selectedPortrait.value as string);
      return image ? image : ImageFile.Empty;
    }

    const object = this.objectStore.get(this.sendFrom);
    let image: ImageFile | null = null;
    if (object instanceof GameCharacter) {
      image = object.imageFile;
    } else if (object instanceof PeerCursor) {
      image = object.image;
    }
    return image ? image : ImageFile.Empty;
  }

  /**
   * The characters this seat may speak as. A piece on the table it cannot see is left out, so the
   * list does not name what the dark or the fog is keeping back; the one already chosen stays.
   */
  readonly gameCharacters = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const c of all) this.objectChange.versionOf(c.identifier)();
    const ignoreNonTalk = this.onlyCharacters();
    const chosen = this.sendFrom;
    return all.filter(
      (character) =>
        allowsChat(character, this.myPeer.peerId, ignoreNonTalk) &&
        (character.identifier === chosen || this.vision.mayBeListed(character))
    );
  });

  private writingEventInterval: ReturnType<typeof setTimeout> | null = null;
  private previousWritingLength: number = 0;

  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  /** The game systems offered in the dice bot selector. */
  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }
  /** This seat's own peer cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /**
   * Every peer cursor in the room offered as whisper targets: this seat's own, the one whispered to
   * now, so that it can be put back, and every other that may be chosen, which on a room server
   * leaves out a seat not logged in, as whoever names itself the same would be handed the whisper.
   */
  get otherPeers(): PeerCursor[] {
    return this.objectStore
      .getObjects(PeerCursor)
      .filter((peer) => peer === this.myPeer || peer.identifier === this.sendTo || mayBeChosen(peer));
  }

  /**
   * Moves the whisper onto the cursor its target came back on, as after the target opened the page
   * again, so that the choice shows who it still goes to.
   */
  private followWhisperTarget(): void {
    if (!this.sendTo) return;
    const standing = PeerCursor.standingFor(this.sendTo);
    if (standing && standing.identifier !== this.sendTo) this.sendTo = standing.identifier;
  }

  private calcFitHeightInterval: ReturnType<typeof setTimeout> | null = null;

  /**
   * Tells the other peers this seat is typing, and grows the text area to fit.
   *
   * The notice goes out at most once every 200ms and only while the text is getting longer. A
   * whisper only notifies the peer being whispered to.
   */
  onInput() {
    if (this.writingEventInterval === null && this.previousWritingLength <= this.text.length) {
      let sendTo: string | undefined;
      if (this.isDirect) {
        const object = this.objectStore.get(this.sendTo);
        if (object instanceof PeerCursor) {
          const peer = PeerContext.parse(object.peerId);
          if (peer) sendTo = peer.peerId;
        }
      }
      callWritingAMessage(this.chatTabidentifier(), sendTo, this.sendFrom);
      this.writingEventInterval = setTimeout(() => {
        this.writingEventInterval = null;
      }, 200);
    }
    this.previousWritingLength = this.text.length;
    this.calcFitHeight();
  }

  /**
   * Replaces the draft with an earlier or later line from this input's history, on Ctrl+Up and
   * Ctrl+Down.
   */
  moveHistory(event: Event | null, direction: number) {
    if (event) event.preventDefault();
    this.text = this.chatHistory.navigate(direction);
    this.previousWritingLength = this.text.length;
    this.kickCalcFitHeight();
  }

  /**
   * Asks the parent to move the auto-complete highlight, on the arrow keys.
   *
   * The caret keeps moving as usual unless there is more than one suggestion to step through.
   */
  selectAutoComplete(event: Event, direction: number) {
    if (this.autoCompleteListLen() > 1) {
      if (event) event.preventDefault();
    }
    this.autoCompleteSwitch.emit(direction);
  }

  /**
   * Sends the draft, from the Enter key or the send button.
   *
   * It does nothing for a seat that may not speak, for an empty draft, or while an IME is
   * composing. While a suggestion is highlighted it asks the parent to apply that instead. The
   * message is emitted under the game system the dice bot hands over for the line, which does not
   * wait for the system's code when the line cannot be a secret roll; the draft, reply and quote are
   * cleared at once. The box itself is emptied as well, since an Enter that comes before what was
   * typed has been drawn leaves the binding holding the empty draft from before, with nothing to change.
   */
  sendChat(event: Event | null) {
    if (event) event.preventDefault();

    if (!this.canSpeak()) return;
    if (!this.text.length) return;
    if (event && (event as KeyboardEvent).key !== 'Enter') return;
    if (event && (event as KeyboardEvent).isComposing) return;

    if (this.autoCompleteIndex() >= 0) {
      this.autoCompleteDo.emit(this.autoCompleteIndex());
      return;
    }

    const lone = this.loneStamp();
    if (lone) {
      this.chatHistory.push(this.text);
      this.text = '';
      this.textField()?.setText('', undefined, false);
      this.previousWritingLength = 0;
      this.sendStamp(lone);
      return;
    }
    this.sendDraft();
  }

  /**
   * The stamp a line is made of, where it is one stamp alone with nothing said, no reply and no quote:
   * such a line goes out as a stamp sent on its own, drawn large by every version.
   */
  private loneStamp(): string | null {
    if (this.replyTarget() || this.quoteTarget()) return null;
    const stamps = inlineStampsAlone(this.text);
    if (stamps?.length !== 1) return null;
    const [stampId] = stamps;
    return this.stampRules.allows('line', stampId) && stampOf(stampId) ? stampId : null;
  }

  /**
   * Sends what the box holds, with a stamp under it where one is given, and clears the box, the reply
   * and the quote.
   */
  private sendDraft(stamp?: OutgoingStamp): void {
    if (!this.sendFrom.length) this.sendFrom = this.myPeer.identifier;

    this.chatHistory.push(this.text);

    const draft = {
      text: this.text,
      sendFrom: this.sendFrom,
      sendTo: this.sendTo,
      portraitIndex: this.portraitIndex,
      color: this.selectChatColor,
      bubbles: this.chatBubbles(this.colorSelectNo()),
      replyTo: this.replyTarget()?.identifier ?? '',
      quoteOf: this.quoteTarget()?.identifier ?? '',
      toTicker: this.showsTickerSwitch() && this.sendsToTicker(),
      ...(stamp ? { stamp } : {}),
    };
    DiceBot.gameSystemForLineAsync(this.gameType, draft.text).then((gameSystem) => {
      this.chat.emit(composeChatOutgoing({ ...draft, gameSystem }));
    });
    this.text = '';
    this.textField()?.setText('', undefined, false);
    this.previousWritingLength = this.text.length;
    this.kickCalcFitHeight();
    this.cancelReply();
    this.cancelQuote();
  }

  /** Opens the stamps over their button in the bar, the one picked going in at the caret. */
  protected openStamps(anchor: EventTarget | null): void {
    if (!(anchor instanceof Element)) return;
    this.stampPicker.toggle(anchor, 'line', (stampId) => this.putStamp(stampId), 'end', 'up');
  }

  /**
   * Puts a stamp in at the caret, as an emoji is, to go out with the words round it, where the room
   * lets it be sent: a chip in the editor, its written form in the plain box.
   */
  private putStamp(stampId: string): void {
    if (!this.canSpeak() || !this.stampRules.allows('line', stampId)) return;
    const label = stampLabel(stampId, this.t, (imageIdentifier) => this.stampPacks.nameOf(imageIdentifier));
    this.writeIntoField((field) =>
      field.insertChip({ kind: 'stamp', id: stampId, label, raw: inlineStampToken(label, stampId) }, 'caret')
    );
  }

  /**
   * Sends a stamp, from whoever the box speaks as and to whoever it speaks to, in its colour. With
   * words in the box it goes under them as one line, sent as the send button sends them, and the box
   * is cleared; with the box empty it goes as a line of its own.
   */
  sendStamp(stampId: string): void {
    if (!this.canSpeak() || !this.stampRules.allows('line', stampId)) return;
    const words = stampWords(stampId, this.t, (imageIdentifier) => this.stampPacks.nameOf(imageIdentifier));
    if (words.length < 1) return;
    if (this.text.trim().length > 0) {
      this.sendDraft({ id: stampId, words });
      return;
    }
    if (!this.sendFrom.length) this.sendFrom = this.myPeer.identifier;
    this.chat.emit(
      composeStampOutgoing(
        {
          sendFrom: this.sendFrom,
          sendTo: this.sendTo,
          portraitIndex: this.portraitIndex,
          color: this.selectChatColor,
          bubbles: this.chatBubbles(this.colorSelectNo()),
        },
        stampId,
        words
      )
    );
  }

  /**
   * Refits the box on the next task, after the new text has reached the DOM; repeated calls before
   * then run it once.
   */
  kickCalcFitHeight() {
    if (this.calcFitHeightInterval == null) {
      this.calcFitHeightInterval = setTimeout(() => {
        this.calcFitHeightInterval = null;
        this.calcFitHeight();
      }, 0);
    }
  }

  /** Grows or shrinks the box to its content, unless the user has resized it by hand. */
  calcFitHeight() {
    this.textField()?.refit();
  }

  /**
   * Notes when the user grabs the box's resize corner, so its height is left to them from then on.
   */
  onTextAreaPointerDown(event: PointerEvent) {
    this.plainField()?.notePointerDown(event);
  }

  /** The dice bot help text last fetched for the help panel. */
  get gameHelp(): string {
    return this.dicebotHelper.gameHelp;
  }

  /** Starts fetching the dice bot for the game system just picked in the selector. */
  loadDiceBot(gameType: string) {
    this.dicebotHelper.load(gameType);
  }

  /**
   * Whether the current game system is in the dice bot catalogue; when it is not, the input warns
   * that no dice bot was found.
   */
  isGameTypeInList(): boolean {
    return this.dicebotHelper.isGameTypeInList(this.gameType, this.diceBotInfos);
  }

  /** Opens the help for the current game system's dice bot, from the ? button. */
  showDicebotHelp() {
    this.dicebotHelper.showHelp(this.gameType);
  }

  /**
   * Opens the chat colour settings for the speaker, or closes them if they are already open.
   *
   * A character speaker gets its own colours; otherwise the panel edits this seat's player colours.
   */
  showColorSetting() {
    // Pressing it again puts the panel away, rather than laying another one over it.
    if (this.panelService.closeSingle(COLOR_SETTING_PANEL)) return;
    // A guest, who may not write a piece, sets the colours of their own lines instead.
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter && canRoleEdit(PeerCursor.myRole)) {
      const coordinate = this.pointerDeviceService.pointers[0];
      const title = object.name.length
        ? this.t('feature.chat.input.colorSettingWithChar', { name: object.name })
        : this.t('feature.chat.input.colorSetting');
      const option: PanelOption = {
        title: title,
        left: coordinate.x + 50,
        top: coordinate.y - 200,
        width: 384,
        height: 300,
        single: COLOR_SETTING_PANEL,
      };
      const component = this.panelService.open<ChatColorSettingComponent>(ChatColorSettingComponent, option);
      component.tabletopObject = object;
    } else {
      const coordinate = this.pointerDeviceService.pointers[0];
      const title = this.t('feature.chat.input.colorSetting');
      const option: PanelOption = {
        title: title,
        left: coordinate.x + 50,
        top: coordinate.y - 150,
        width: 384,
        height: 282,
        single: COLOR_SETTING_PANEL,
      };
      const component = this.panelService.open<ChatColorSettingComponent>(ChatColorSettingComponent, option);
      component.tabletopObject = null;
    }
  }
}
