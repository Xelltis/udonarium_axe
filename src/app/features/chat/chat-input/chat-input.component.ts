import { NgClass, NgStyle } from '@angular/common';
import {
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
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
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
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { composeChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatColorSettingComponent } from '@axe/features/chat/chat-color-setting/chat-color-setting.component';
import { ChatInputDiceBotHelper } from '@axe/features/chat/chat-input/chat-input-dicebot';
import { allowsChat } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatInputHistory } from '@axe/features/chat/chat-input/chat-input-history';
import { PortraitChoice, PortraitPickerComponent } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { PortraitSliderComponent } from '@axe/ui/components/portrait-slider/portrait-slider.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

const COLOR_SETTING_PANEL = 'chat-color-setting';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-input',
  templateUrl: './chat-input.component.html',
  host: { class: 'block min-w-0 [container-type:inline-size]' },
  imports: [
    NgClass,
    NgSelectComponent,
    FormsModule,
    NgOptionComponent,
    NgSelectWindowDirective,
    NgStyle,
    PortraitPickerComponent,
    PortraitSliderComponent,
    SafePipe,
    TranslocoModule,
  ],
})
export class ChatInputComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly isToolsOpen = signal(false);

  protected toggleTools(): void {
    this.isToolsOpen.update((open) => !open);
  }

  private readonly destroyRef = inject(DestroyRef);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  private readonly tabletopService = inject(TabletopService);

  /** The ticker is this screen's, so the switch is offered only where one is running. */
  /**
   * Whether this seat has a ticker to send a line to.
   *
   * The band only runs along the edge of a table being looked straight down on, so a seat in
   * perspective has none. Offered there all the same, the switch would send a line to everybody
   * else's band and leave the sender's own screen with nothing to show for it.
   */
  readonly showsTickerSwitch = computed(
    () => this.tabletopService.mode2d() && this.tabletopDisplay.settings().multiAngleTickerEnabled
  );
  readonly sendsToTicker = signal(false);

  /** Switches whether the lines this seat sends also run along the ticker band. */
  toggleTickerSend(): void {
    this.sendsToTicker.update((sends) => !sends);
  }
  private readonly batchService = inject(BatchService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly uiSignalService = inject(UiSignalService);

  private chatHistory = new ChatInputHistory();
  private dicebotHelper = new ChatInputDiceBotHelper();

  /** The box lines are written in, which a reader who may not speak in the tab is not given. */
  readonly textAreaElementRef = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');

  readonly onlyCharacters = input(false);
  readonly disableQuote = input(false);
  /**
   * Packs the input down for a panel whose own list needs the room: a smaller portrait, and the
   * colours and the ticker switch folded behind a button.
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
    const text = (target.text ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  });

  /** Drops the message being replied to, both here and in the app-wide reply request. */
  cancelReply(): void {
    this.replyTarget.set(null);
    this.uiSignalService.clearChatReply();
  }

  readonly quoteTarget = signal<ChatMessage | null>(null);
  readonly quoteToName = computed(() => this.quoteTarget()?.name ?? '');
  readonly quoteToText = computed(() => {
    const target = this.quoteTarget();
    if (!target) return '';
    const text = (target.text ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  });

  /** Drops the message being quoted, both here and in the app-wide quote request. */
  cancelQuote(): void {
    this.quoteTarget.set(null);
    this.uiSignalService.clearChatQuote();
  }

  readonly autoCompleteSwitch = output<number>();

  readonly autoCompleteDo = output<number>();

  constructor() {
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
      const req = this.uiSignalService.chatInputTextRequest();
      if (!req) return;
      untracked(() => {
        this.text = (this.text ? this.text + ' ' : '') + req.text;
      });
    });
    effect(() => {
      const req = this.uiSignalService.chatReplyRequest();
      if (!req) {
        this.replyTarget.set(null);
        return;
      }
      untracked(() => {
        const target = this.objectStore.get<ChatMessage>(req.messageIdentifier);
        this.replyTarget.set(target instanceof ChatMessage ? target : null);
        if (target instanceof ChatMessage) {
          this.textAreaElementRef()?.nativeElement.focus();
        }
      });
    });
    effect(() => {
      if (this.disableQuote()) {
        this.quoteTarget.set(null);
        return;
      }
      const req = this.uiSignalService.chatQuoteRequest();
      if (!req) {
        this.quoteTarget.set(null);
        return;
      }
      untracked(() => {
        const target = this.objectStore.get<ChatMessage>(req.messageIdentifier);
        this.quoteTarget.set(target instanceof ChatMessage ? target : null);
        if (target instanceof ChatMessage) {
          this.textAreaElementRef()?.nativeElement.focus();
        }
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

  /** The bubble the sender asked for on each theme, which travels with the message. */
  private chatBubbles(num: number): ChatBubbleColors {
    const object = this.objectStore.get(this.sendFrom);
    const source = object instanceof GameCharacter ? object : this.myPeer;
    this.objectChange.versionOf(source.identifier)();
    return chatBubbleOf(source, num);
  }

  /**
   * The speaker's chat colour in the given slot, taken from the character or from this seat's own
   * cursor.
   */
  chatColor(num: number): string {
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) return this.characterChatColor(num);
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
  /** Every peer cursor in the room, including this seat's own, offered as whisper targets. */
  get otherPeers(): PeerCursor[] {
    return this.objectStore.getObjects(PeerCursor);
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
  moveHistory(event: Event, direction: number) {
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
   * cleared at once.
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
    };
    DiceBot.gameSystemForLineAsync(this.gameType, draft.text).then((gameSystem) => {
      this.chat.emit(composeChatOutgoing({ ...draft, gameSystem }));
    });
    this.text = '';
    this.previousWritingLength = this.text.length;
    this.kickCalcFitHeight();
    this.cancelReply();
    this.cancelQuote();
  }

  /**
   * Refits the text area on the next task, after the new text has reached the DOM; repeated calls
   * before then run it once.
   */
  kickCalcFitHeight() {
    if (this.calcFitHeightInterval == null) {
      this.calcFitHeightInterval = setTimeout(() => {
        this.calcFitHeightInterval = null;
        this.calcFitHeight();
      }, 0);
    }
  }

  /** Grows or shrinks the text area to its content, unless the user has resized it by hand. */
  calcFitHeight() {
    const textArea = this.textAreaElementRef()?.nativeElement;
    if (!textArea || this.userResized) return;
    textArea.style.height = '';
    if (textArea.scrollHeight >= textArea.offsetHeight) {
      textArea.style.height = textArea.scrollHeight + 'px';
    }
  }

  private userResized = false;
  /**
   * Notes when the user grabs the text area's resize corner, so its height is left to them from
   * then on.
   */
  onTextAreaPointerDown(event: PointerEvent) {
    const textArea = event.currentTarget as HTMLTextAreaElement;
    const rect = textArea.getBoundingClientRect();
    // resize handle is the bottom-right ~16px corner
    if (event.offsetX > rect.width - 16 && event.offsetY > rect.height - 16) {
      this.userResized = true;
    }
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
    const object = this.objectStore.get(this.sendFrom);
    if (object instanceof GameCharacter) {
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
