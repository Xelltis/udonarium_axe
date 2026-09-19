import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SystemAvatarKind, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { chatColorOf } from '@axe/domain/chat/chat-color';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { encodeVnEmote, VN_EMOTION_MARK_CHARS, vnEmoteOf, VnEmotionMark } from '@axe/domain/visual-novel/vn-emote';
import {
  isVnPortraitPosSet,
  toPortraitSlot,
  toStageResetAt,
  VN_PORTRAIT_POS_UNSET,
} from '@axe/domain/visual-novel/vn-portrait-position';
import {
  buildVnStage,
  leftOfSlot,
  slotBandLeft,
  slotBandWidth,
  slotLabelLeftInBand,
  stageCutFor,
  VN_STAGE_LOOKBACK,
  VN_STAGE_SLOT_COUNT,
  VnStageCharacter,
  VnStageSource,
} from '@axe/domain/visual-novel/vn-stage-cast';
import { GameCharacterSheetComponent } from '@axe/features/character/game-character-sheet/game-character-sheet.component';
import { allowsChat } from '@axe/features/chat/chat-input/chat-input-helpers';
import {
  ChatPaletteHandle,
  ChatPaletteRegistryService,
} from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { ChatStreamPanelService } from '@axe/features/chat/chat-stream/chat-stream-panel.service';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { VisualNovelBacklogComponent } from '@axe/features/visual-novel/visual-novel-backlog/visual-novel-backlog.component';
import { VisualNovelDirectionPanelComponent } from '@axe/features/visual-novel/visual-novel-direction-panel/visual-novel-direction-panel.component';
import { VisualNovelDirectorService } from '@axe/features/visual-novel/visual-novel-director.service';
import { VisualNovelDisplayPanelComponent } from '@axe/features/visual-novel/visual-novel-display-panel/visual-novel-display-panel.component';
import { vnEmoteLabel } from '@axe/features/visual-novel/visual-novel-emote-label';
import { VisualNovelEmotePanelComponent } from '@axe/features/visual-novel/visual-novel-emote-panel/visual-novel-emote-panel.component';
import { VisualNovelEmoteSelectionService } from '@axe/features/visual-novel/visual-novel-emote-selection.service';
import { readableMessageName, readableMessageText } from '@axe/features/visual-novel/visual-novel-message';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import {
  closeVisualNovelPanels,
  VISUAL_NOVEL_PANELS,
  VN_BACKLOG_PANEL,
  VN_DIRECTION_PANEL,
  VN_DISPLAY_PANEL,
  VN_EMOTE_PANEL,
} from '@axe/features/visual-novel/visual-novel-panels';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { VisualNovelSceneService } from '@axe/features/visual-novel/visual-novel-scene.service';
import { VisualNovelSettingsService, VnLayout } from '@axe/features/visual-novel/visual-novel-settings.service';
import {
  isTypingTarget,
  type VisualNovelCommand,
  visualNovelKeyDown,
  visualNovelKeyUp,
} from '@axe/features/visual-novel/visual-novel-shortcut';
import {
  AttachedSound,
  VisualNovelSoundBoardComponent,
} from '@axe/features/visual-novel/visual-novel-sound-board/visual-novel-sound-board.component';
import { RubyTextComponent } from '@axe/ui/components/ruby-text/ruby-text.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { spotBeside } from '@axe/ui/panel-spot';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { Z_VISUAL_NOVEL_PANEL, Z_VISUAL_NOVEL_PANEL_ABOVE } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

const WHEEL_THROTTLE_MS = 160;

const SHORTCUT_HELP_ITEMS: readonly { keys: string; labelKey: string }[] = [
  { keys: 'Enter / Space / → / ↓', labelKey: 'next' },
  { keys: '← / ↑', labelKey: 'prev' },
  { keys: 'Ctrl', labelKey: 'skip' },
  { keys: 'Home / End', labelKey: 'edges' },
  { keys: 'A', labelKey: 'autoPlay' },
  { keys: 'L', labelKey: 'log' },
  { keys: 'S', labelKey: 'slot' },
  { keys: 'Esc', labelKey: 'close' },
];

const EMOTION_MARK_COLORS: Record<Exclude<VnEmotionMark, 'none'>, string> = {
  surprise: 'text-red-500',
  question: 'text-sky-500',
  anger: 'text-red-600',
  sweat: 'text-sky-500',
  heart: 'text-pink-500',
  note: 'text-amber-500',
  silence: 'text-gray-500',
};

/** The balloon, of which one opens at a time. */
type VisualNovelPopover = 'soundBoard' | 'slotGuide' | 'palette' | 'shortcutHelp';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'visual-novel-overlay',
  templateUrl: './visual-novel-overlay.component.html',
  host: {
    class: 'pointer-events-none fixed inset-0 z-160 block',
    '(window:keydown)': 'onKeydown($event)',
    '(window:keyup)': 'onKeyup($event)',
    '(window:blur)': 'stopSkip()',
  },
  imports: [
    FormsModule,
    SafePipe,
    TranslocoModule,
    NgSelectComponent,
    NgOptionComponent,
    NgSelectWindowDirective,
    RubyTextComponent,
    VisualNovelSoundBoardComponent,
  ],
})
export class VisualNovelOverlayComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly keyboardInset = inject(KeyboardInsetService).inset;
  protected readonly isControlsOpen = signal(false);

  protected toggleControls(): void {
    this.isControlsOpen.update((open) => !open);
  }

  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly imageService = inject(ImageService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly paletteRegistry = inject(ChatPaletteRegistryService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly vnMode = inject(VisualNovelModeService);
  readonly settings = inject(VisualNovelSettingsService);

  private readonly playback = inject(VisualNovelPlaybackService);
  readonly scene = inject(VisualNovelSceneService);
  readonly director = inject(VisualNovelDirectorService);
  private readonly emoteSelection = inject(VisualNovelEmoteSelectionService);
  private readonly chatStreamPanel = inject(ChatStreamPanelService);
  readonly readabilityClass = computed(() => {
    switch (this.settings.readability()) {
      case 1:
        return 'bg-black/25 backdrop-blur-[1px]';
      case 2:
        return 'bg-black/40 backdrop-blur-xs';
      case 3:
        return 'bg-black/55 backdrop-blur-sm';
      default:
        return '';
    }
  });

  readonly backgroundFrames = computed(() => {
    const url = this.scene.backgroundUrl();
    if (url.length < 1) return [];
    return [{ key: `${url}#${this.scene.transitionTrigger()}`, url }];
  });

  readonly backgroundTransitionClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    switch (this.scene.transition()) {
      case 'wipe':
        return 'vn-bg-wipe';
      case 'fade':
        return 'vn-bg-fade';
      default:
        return '';
    }
  });
  private lastWheelTime = 0;

  readonly text = signal('');
  readonly autoPlay = this.playback.autoPlay;
  /**
   * Only ever one is open.
   *
   * A flag per kind would mean writing close-the-others every time, and one missed leaves two open.
   */
  private readonly openPopover = signal<VisualNovelPopover | null>(null);
  private readonly soundBoard = viewChild(VisualNovelSoundBoardComponent);
  readonly isSkipping = this.playback.isSkipping;

  readonly selectedKind = this.emoteSelection.kind;
  readonly selectedShape = this.emoteSelection.shape;
  readonly selectedBubbleAnimation = this.emoteSelection.bubbleAnimation;
  readonly selectedPortraitEmote = this.emoteSelection.portraitEmote;
  readonly selectedEmotionMark = this.emoteSelection.emotionMark;
  readonly selectedExit = this.emoteSelection.exited;

  readonly messageKindOptions = this.emoteSelection.messageKindOptions;
  readonly isGameMaster = this.emoteSelection.isGameMaster;
  readonly slotIndexes = Array.from({ length: VN_STAGE_SLOT_COUNT }, (_, i) => i);
  readonly shortcutHelpItems = SHORTCUT_HELP_ITEMS;

  /**
   * The chat tab being read in novel mode; choosing another stops auto play, returns to its newest
   * line and is remembered.
   */
  get chatTabIdentifier(): string {
    return this.playback.chatTabIdentifier();
  }
  set chatTabIdentifier(identifier: string) {
    this.playback.setChatTab(identifier);
  }

  private readonly _sendFrom = signal('');
  /**
   * The identifier of whoever the next line is sent as: a character, or the game master's own
   * cursor.
   */
  get sendFrom(): string {
    return this._sendFrom();
  }
  set sendFrom(identifier: string) {
    this._sendFrom.set(identifier);
  }

  /**
   * The dice bot lines typed here are rolled with, falling back to the plain dice bot; it is the
   * same setting the chat input uses.
   */
  get gameType(): string {
    return this.chatMessageService.gameType.length > 0 ? this.chatMessageService.gameType : 'DiceBot';
  }
  set gameType(gameType: string) {
    this.chatMessageService.gameType = gameType;
  }

  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  /** Every dice bot the app knows, for the dice bot menu. */
  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  readonly chatTab = this.playback.chatTab;
  readonly messages = this.playback.messages;
  readonly currentIndex = this.playback.currentIndex;
  readonly currentMessage = this.playback.currentMessage;
  readonly isLatest = this.playback.isLatest;
  readonly displayedText = this.playback.displayedText;
  readonly displayedParts = this.playback.displayedParts;
  readonly isTyping = this.playback.isTyping;
  readonly currentFullText = this.playback.currentFullText;
  readonly currentFullParts = this.playback.currentFullParts;
  readonly currentIsDiceCommand = this.playback.currentIsDiceCommand;

  private readonly currentEmote = this.playback.currentEmote;

  readonly speakerName = computed(() => {
    this.language.currentLang();
    return readableMessageName(this.currentMessage(), this.t);
  });

  readonly announcedLine = computed(() => {
    if (this.isTyping()) return '';
    const name = this.speakerName();
    const text = this.playback.currentVisibleText();
    if (text.length < 1) return '';
    return name.length > 0 ? `${name}: ${text}` : text;
  });

  readonly currentMessageList = computed(() => {
    const message = this.currentMessage();
    return message ? [message] : [];
  });

  readonly isShoutShape = computed(() => this.currentEmote().shape === 'shout');

  readonly bubbleBoxClass = computed(() => {
    switch (this.currentEmote().shape) {
      case 'thought':
        return 'vn-bubble-thought bg-white/92 px-6 py-4 shadow-xl';
      case 'shout':
        return 'px-8 py-6 font-bold';
      case 'whisper':
        return 'vn-bubble-whisper px-5 py-3 shadow-xl';
      default:
        return 'vn-bubble-normal rounded-2xl bg-white/92 px-5 py-3 shadow-xl';
    }
  });

  readonly bubbleEnterClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    if (this.currentEmote().bubbleAnimation === 'pop') return 'animate-vn-pop';
    switch (this.currentEmote().shape) {
      case 'thought':
        return 'vn-enter-thought';
      case 'shout':
        return 'vn-enter-shout';
      case 'whisper':
        return 'vn-enter-whisper';
      default:
        return 'vn-enter-normal';
    }
  });

  readonly bubbleAnimationClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    switch (this.currentEmote().bubbleAnimation) {
      case 'shake':
        return 'animate-vn-shake';
      case 'pulse':
        return 'animate-vn-pulse';
      case 'float':
        return 'animate-vn-float';
      default:
        return '';
    }
  });

  readonly portraitEmoteClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    switch (this.currentEmote().portraitEmote) {
      case 'jump':
        return 'animate-vn-jump';
      case 'tremble':
        return 'animate-vn-tremble';
      case 'zoom':
        return 'animate-vn-zoom';
      case 'nod':
        return 'animate-vn-nod';
      case 'sway':
        return 'animate-vn-sway origin-bottom';
      case 'droop':
        return 'animate-vn-droop';
      default:
        return '';
    }
  });

  readonly emotionMark = computed(() => {
    const mark = this.currentEmote().emotionMark;
    if (mark === 'none') return null;
    return { char: VN_EMOTION_MARK_CHARS[mark], colorClass: EMOTION_MARK_COLORS[mark] };
  });

  readonly hasEmoteSelection = this.emoteSelection.hasSelection;

  readonly selectedEmoteSuffix = computed(() => {
    this.language.currentLang();
    return vnEmoteLabel(this.emoteSelection.emote(), this.t);
  });

  /** Puts every staging choice for the next line back to its default. */
  resetEmote(): void {
    this.emoteSelection.reset();
  }

  readonly stageCharacters = computed<VnStageCharacter[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.language.currentLang();
    const messages = this.messages();
    const index = this.currentIndex();
    if (index < 0) return [];
    const window: VnStageSource[] = [];
    for (let i = Math.max(0, index - VN_STAGE_LOOKBACK); i <= index; i++) {
      const message = messages[i];
      window.push({
        name: readableMessageName(message, this.t),
        placedAt: message.placedAt,
        sendFrom: message.sendFrom ?? '',
        imageIdentifier: message.imageIdentifier ?? '',
        imagePos: message.imagePos,
        vnPortraitPos: message.vnPortraitPos,
        isSystemMessage: message.isSystemMessage,
        isDicebot: message.isDicebot,
        isGameCharacter: this.isGameCharacterSender(message.sendFrom ?? ''),
        isDiceCommand: this.playback.isDiceCommandAt(i),
        emote: vnEmoteOf(message.vnEmote, readableMessageText(message, this.t)),
      });
    }
    return buildVnStage(
      window,
      (imageIdentifier) => this.imageService.getEmptyOr(imageIdentifier).url,
      (source) => this.stageSlotOf(source),
      stageCutFor(this.stageResetAt(), messages[index].placedAt, this.playback.isLatest())
    );
  });

  /** When the portraits of the tab being read were last cleared, if they ever were. */
  private readonly stageResetAt = computed(() => {
    const tab = this.chatTab();
    if (!tab) return 0;
    this.objectChange.versionOf(tab.identifier)();
    return toStageResetAt(tab.vnPortraitResetAt);
  });

  /** A line of its own beats the character's novel-mode place, which beats where it stands in chat. */
  private stageSlotOf(source: VnStageSource): number {
    const linePosition = toPortraitSlot(source.vnPortraitPos);
    if (linePosition != null) return linePosition;
    const character = this.objectStore.get(source.sendFrom);
    if (character instanceof GameCharacter) {
      this.objectChange.versionOf(character.identifier)();
      const novelPosition = toPortraitSlot(character.vnPortraitPos);
      if (novelPosition != null) return novelPosition;
      const chatPosition = character.portraitPosition;
      if (chatPosition != null) return chatPosition;
    }
    return toPortraitSlot(source.imagePos) ?? 0;
  }

  private isGameCharacterSender(identifier: string): boolean {
    if (identifier.length < 1) return false;
    return this.objectStore.get(identifier) instanceof GameCharacter;
  }

  readonly activeStageCharacter = computed(
    () => this.stageCharacters().find((character) => character.isActive) ?? null
  );

  readonly diceCommand = computed(() => {
    if (!this.currentIsDiceCommand()) return null;
    this.language.currentLang();
    const message = this.currentMessage();
    if (!message) return null;
    return { name: readableMessageName(message, this.t) };
  });

  readonly systemSpeaker = computed(() => {
    const message = this.currentMessage();
    if (!message) return null;
    const visible = this.systemAvatar.isVisible();
    const speakerVisible = this.systemAvatar.isSpeakerVisible();
    if (message.isDicebot) {
      const roller = this.findDiceRoller(message);
      const rollerImageUrl = roller?.imageUrl ?? '';
      const speakerUrl = rollerImageUrl.length > 0 ? rollerImageUrl : this.playerImageUrl(message);
      const speaks = speakerVisible && speakerUrl.length > 0;
      return {
        kind: 'dice' as SystemAvatarKind,
        imageUrl: speaks ? speakerUrl : visible ? this.systemAvatar.diceUrl() : '',
        isSpeaker: speaks,
        speakerName: '',
        rollerName: roller?.name ?? '',
        rollerImageUrl,
      };
    }
    if (message.isSystemMessage || message.isSystem) {
      return {
        kind: 'system' as SystemAvatarKind,
        imageUrl: visible ? this.systemAvatar.systemUrl() : '',
        isSpeaker: false,
        speakerName: '',
        rollerName: '',
        rollerImageUrl: '',
      };
    }
    // What the game master says as themselves is addressed to the table rather than spoken in
    // the scene, so it is given the place the room's own notices get, under their own picture
    // rather than in a balloon over a portrait they are not standing behind.
    if (this.playback.currentSpeakerKind() === 'gameMaster' && this.currentEmote().kind === 'normal') {
      return {
        kind: 'system' as SystemAvatarKind,
        imageUrl: this.playerImageUrl(message),
        isSpeaker: true,
        speakerName: readableMessageName(message, this.t),
        rollerName: '',
        rollerImageUrl: '',
      };
    }
    return null;
  });

  protected onSystemAvatarContextMenu(event: Event, kind: SystemAvatarKind): void {
    this.systemAvatarMenu.openContextMenu(event, kind);
  }

  private playerImageUrl(message: ChatMessage): string {
    this.objectChange.collectionOf('PeerCursor')();
    const userId = message.originFrom || message.from;
    if (!userId) return '';
    return PeerCursor.findByUserId(userId)?.image?.url ?? '';
  }

  private findDiceRoller(message: ChatMessage): { name: string; imageUrl: string } | null {
    this.objectChange.fileVersion();
    const matched = /^<(?:Secret-)?BCDice[：:](.+)>$/.exec(message.name ?? '');
    const messages = this.messages();
    const index = this.currentIndex();
    for (let i = index - 1; i >= Math.max(0, index - 5); i--) {
      const candidate = messages[i];
      if (!candidate) continue;
      if (candidate.timestamp === message.timestamp - 1 && candidate.from === (message.originFrom ?? '')) {
        return {
          name: matched?.[1] ?? candidate.name ?? '',
          imageUrl: this.imageService.getEmptyOr(candidate.imageIdentifier ?? '').url,
        };
      }
    }
    return matched ? { name: matched[1], imageUrl: '' } : null;
  }

  readonly narrationKind = computed(() => {
    if (!this.currentMessage() || this.systemSpeaker()) return null;
    const kind = this.currentEmote().kind;
    return kind === 'normal' ? null : kind;
  });

  readonly speechVisible = computed(
    () =>
      this.currentMessage() != null && !this.systemSpeaker() && !this.narrationKind() && !this.currentIsDiceCommand()
  );

  /**
   * Which of the three ways of showing a line this one is shown in.
   *
   * A balloon needs somebody to come from. A line whose speaker has no portrait on the stage -
   * said by a player as themselves, or left standing after the stage was cleared - would float
   * in the middle of the screen as a balloon with its tail pointing at nothing, so such a line
   * falls back to the window at the foot of the screen.
   */
  readonly speechLayout = computed<VnLayout | null>(() => {
    if (!this.speechVisible()) return null;
    const layout = this.settings.layout();
    if (layout === 'bubble' && !this.activeStageCharacter()) return 'adv';
    return layout;
  });

  readonly bubbleAnchor = computed(() => {
    if (this.speechLayout() !== 'bubble') return null;
    const active = this.activeStageCharacter();
    if (!active) return null;
    return { left: Math.min(83, Math.max(17, active.left)), bottom: '58vh' };
  });

  readonly bubbleTextSizeClass = computed(() => {
    switch (this.settings.textSize()) {
      case 'small':
        return 'text-[13px]/relaxed';
      case 'large':
        return 'text-[19px]/relaxed';
      default:
        return 'text-[15px]/relaxed';
    }
  });

  readonly narrationTextSizeClass = computed(() => {
    switch (this.settings.textSize()) {
      case 'small':
        return 'text-base/loose';
      case 'large':
        return 'text-2xl/loose';
      default:
        return 'text-lg/loose';
    }
  });

  readonly speakClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    return this.currentIndex() % 2 === 0 ? 'animate-vn-speak-a' : 'animate-vn-speak-b';
  });

  /**
   * Whether the line being read is one somebody leaves on.
   *
   * The portrait and the line fade away together once the words are all there. Waiting for the
   * typing to finish rather than starting on a timer means a long parting line is read in full
   * however long it takes to appear.
   */
  readonly isLeavingLine = computed(() => {
    if (this.settings.reduceMotion()) return false;
    return this.currentEmote().exited && !this.isTyping();
  });

  readonly portraitAnimationClass = computed(() => {
    if (this.settings.reduceMotion()) return '';
    switch (this.settings.portraitAnimation()) {
      case 'fade':
        return 'animate-vn-fade-in';
      case 'slide':
        return 'animate-vn-slide-in';
      case 'bounce':
        return 'animate-vn-bounce-in';
      default:
        return '';
    }
  });

  /**
   * The characters this seat may speak as. A piece on the table it cannot see is left out, as in
   * the chat; the one already chosen stays.
   */
  readonly gameCharacters = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const character of all) this.objectChange.versionOf(character.identifier)();
    const myPeerId = PeerCursor.myCursor?.peerId ?? '';
    const chosen = this.sendFrom;
    return all.filter(
      (character) =>
        allowsChat(character, myPeerId) && (character.identifier === chosen || this.vision.mayBeListed(character))
    );
  });

  /**
   * Who a line can be sent as.
   *
   * Characters only, for anybody at the table: novel mode plays a scene, and somebody's own
   * name has no part in one. The game master is the exception, since running the table means
   * saying things as themselves, and anything else would mean leaving novel mode for the chat
   * window and coming back.
   */
  readonly speakerOptions = computed<{ identifier: string; name: string }[]>(() => {
    const characters = this.gameCharacters();
    const current = this.objectStore.get(this._sendFrom());
    const cast =
      current instanceof GameCharacter && !characters.includes(current) ? [current, ...characters] : characters;
    const options = cast.map((character) => ({ identifier: character.identifier, name: character.name }));
    const cursor = PeerCursor.myCursor;
    if (this.isGameMaster() && cursor) {
      options.unshift({ identifier: cursor.identifier, name: cursor.name + this.t('feature.chat.input.you') });
    }
    return options;
  });

  readonly speakerPalette = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return [] as string[];
    this.objectChange.versionOf(object.identifier)();
    return object.chatPalette?.getPalette() ?? [];
  });

  readonly canSpeak = computed(() => {
    const tab = this.chatTab();
    if (!tab) return false;
    this.objectChange.trackMyCursor();
    return canRoleSpeakTab(tab, PeerCursor.myRole);
  });

  /**
   * A method rather than a computed: it hands back the same instance every time, so a computed
   * of it would compare equal and whatever read it would never hear about a change.
   */
  private speakerCharacter(): GameCharacter | null {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return null;
    this.objectChange.versionOf(object.identifier)();
    return object;
  }

  readonly speakerSlot = computed(() => {
    const character = this.speakerCharacter();
    if (!character) return -1;
    return toPortraitSlot(character.vnPortraitPos) ?? character.portraitPosition ?? 0;
  });

  readonly speakerSlotOverridden = computed(() => {
    const character = this.speakerCharacter();
    return character != null && isVnPortraitPosSet(character.vnPortraitPos);
  });

  protected leftOfSlot = leftOfSlot;
  protected slotBandLeft = slotBandLeft;
  protected slotBandWidth = slotBandWidth;
  protected slotLabelLeftInBand = slotLabelLeftInBand;

  /**
   * Which picture speaks next.
   *
   * The chosen one is the speaker's own, and is not part of what the room shares, so nothing
   * announces that it changed. This counts the changes made here so the bar redraws for them.
   */
  private readonly _portraitTick = signal(0);

  readonly speakerPortrait = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this._portraitTick();
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return null;
    this.objectChange.versionOf(object.identifier)();
    const children = object.imageDataElement?.children ?? [];
    if (children.length < 1) return null;
    const index = Math.min(Math.max(0, object.selectedPortraitIndex), children.length - 1);
    const element = children[index] as DataElement | undefined;
    const url = this.imageService.getEmptyOr((element?.value as string) ?? '').url;
    return { index, count: children.length, url, name: portraitNameOf(element) };
  });

  /** A picture answers to its name where it was given one, and to its place in the row otherwise. */
  readonly speakerPortraitLabel = computed(() => {
    const portrait = this.speakerPortrait();
    if (!portrait) return '';
    return portrait.name.length > 0 ? portrait.name : `${portrait.index + 1}/${portrait.count}`;
  });

  /**
   * Switches the speaker to the next or previous of their portraits, from the arrows beside it.
   *
   * Stops at either end. The choice is this user's own and is not shared with the room.
   */
  stepSpeakerPortrait(direction: number): void {
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return;
    const count = object.imageDataElement?.children.length ?? 0;
    const next = object.selectedPortraitIndex + direction;
    if (next < 0 || next >= count) return;
    object.selectedPortraitIndex = next;
    this._portraitTick.update((tick) => tick + 1);
  }

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  readonly attachedSe = signal<AttachedSound | null>(null);

  /**
   * Attaches a sound from the sound board to the next line, played when the line is sent, and
   * closes the board.
   */
  attachSe(sound: AttachedSound): void {
    this.attachedSe.set(sound);
    this.closePopovers();
  }

  /** Takes the attached sound off the next line. */
  clearAttachedSe(): void {
    this.attachedSe.set(null);
  }

  readonly speakerFlip = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return null;
    this.objectChange.versionOf(object.identifier)();
    const element = object.detailDataElement?.getFirstElementByName('FLIP');
    return element ? Number(element.value) === 1 : false;
  });

  /**
   * Mirrors the speaker's portrait for the lines they send, or turns it back.
   *
   * The setting lives on the character's sheet, where a flip field is added next to the portrait
   * position when it has none.
   */
  toggleSpeakerFlip(): void {
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return;
    let element = object.detailDataElement?.getFirstElementByName('FLIP') ?? null;
    if (!element) {
      const posElement = object.detailDataElement?.getFirstElementByName('POS');
      const parent = posElement?.parent instanceof DataElement ? posElement.parent : object.detailDataElement;
      if (!parent) return;
      element = DataElement.create('FLIP', 0, {}, `FLIP_${object.identifier}`);
      parent.appendChild(element);
    }
    element.value = Number(element.value) === 1 ? 0 : 1;
    element.update();
  }

  constructor() {
    this._sendFrom.set(this.gameCharacters()[0]?.identifier ?? '');
    this.playback.attach();
    this.destroyRef.onDestroy(() => this.playback.detach());
    // The windows are put up outside this screen, so leaving novel mode does not take them.
    this.destroyRef.onDestroy(() => closeVisualNovelPanels(this.panelService));
    // The selection outlives this screen, and an expression chosen before novel mode was
    // last closed should not be waiting to be sent when it is opened again.
    this.destroyRef.onDestroy(() => this.emoteSelection.reset());

    const seTimer = setInterval(() => {
      if (this.isPopover('soundBoard')) this.soundBoard()?.refresh();
    }, 500);
    this.destroyRef.onDestroy(() => clearInterval(seTimer));

    effect(() => {
      const characters = this.gameCharacters();
      const current = untracked(() => this._sendFrom());
      const object = untracked(() => this.objectStore.get(current));
      if (object instanceof GameCharacter) return;
      this._sendFrom.set(characters[0]?.identifier ?? '');
    });
    this.paletteRegistry.register(this.paletteHandle);
    this.destroyRef.onDestroy(() => this.paletteRegistry.unregister(this.paletteHandle));
  }

  /**
   * Starts or stops auto play from the current line; starting closes any open balloon and does
   * nothing at the newest line.
   */
  toggleAutoPlay(): void {
    if (!this.autoPlay()) this.closePopovers();
    this.playback.toggleAutoPlay();
  }

  readonly chatTabOptions = this.playback.availableChatTabs;

  /** Goes back to the tab's first line and plays it through in auto play. */
  playFromStart(): void {
    this.closePopovers();
    this.playback.playFromStart();
  }

  /** Stops auto play where it is. */
  stopAutoPlay(): void {
    this.playback.stopAutoPlay();
  }

  /**
   * Moves on to the next line, or shows the rest of the line still being typed, from a click, the
   * wheel or a key.
   *
   * It stops auto play and stops following the director, since the reader has taken over.
   */
  userAdvance(): void {
    this.director.leaveFollowing();
    this.playback.userAdvance();
  }

  /** Goes back a line, shown at once, stopping auto play and no longer following the director. */
  userBack(): void {
    this.director.leaveFollowing();
    this.playback.userBack();
  }

  /** Leaves novel mode. */
  exit(): void {
    this.vnMode.deactivate();
  }

  /**
   * Moves on to the next line without stopping auto play.
   *
   * A line still being typed is shown in full first. Moving past the last line returns to following
   * the newest one.
   */
  advance(): void {
    this.playback.advance();
  }

  /**
   * Goes back a line, shown at once, without stopping auto play; does nothing at the first line.
   */
  back(): void {
    this.playback.back();
  }

  /**
   * Jumps to the newest line and keeps following new ones, stopping auto play and no longer
   * following the director.
   */
  toLatest(): void {
    this.director.leaveFollowing();
    this.playback.toLatest();
  }

  /**
   * Jumps to the line at this index, shown at once, and closes any open balloon.
   *
   * Jumping to the last line follows new lines from there. It stops auto play and no longer follows
   * the director.
   */
  jumpTo(index: number): void {
    this.director.leaveFollowing();
    this.playback.jumpTo(index);
    this.closePopovers();
  }

  /** What `Escape` closes before it leaves novel mode. */
  private isAnythingOpen(): boolean {
    if (this.openPopover() !== null) return true;
    return VISUAL_NOVEL_PANELS.some((name) => this.panelService.hasSingle(name));
  }

  private closeOverlays(): void {
    this.closePopovers();
    closeVisualNovelPanels(this.panelService);
  }

  /** Whether the balloon of this kind is the one open. */
  isPopover(kind: VisualNovelPopover): boolean {
    return this.openPopover() === kind;
  }

  protected closePopovers(): void {
    this.openPopover.set(null);
  }

  private togglePopover(kind: VisualNovelPopover): void {
    this.openPopover.update((current) => (current === kind ? null : kind));
  }

  /** Opens or closes the balloon listing the keyboard shortcuts. */
  toggleShortcutHelp(): void {
    this.togglePopover('shortcutHelp');
  }

  readonly isBacklogOpen = computed(() => this.panelService.hasSingle(VN_BACKLOG_PANEL));

  /**
   * Opens the log of the tab being read in a window off to the side of the stage, or closes it when
   * it is open.
   */
  toggleBacklog(): void {
    if (this.panelService.closeSingle(VN_BACKLOG_PANEL)) return;
    this.closePopovers();
    const width = Math.min(700, Math.max(320, window.innerWidth - 48));
    this.panelService.open<VisualNovelBacklogComponent>(VisualNovelBacklogComponent, {
      title: this.t('feature.visualNovel.log'),
      // Off to the side rather than over the middle, which is where the portraits stand.
      left: Math.max(8, window.innerWidth - width - 24),
      top: 24,
      width,
      height: Math.min(560, Math.max(240, window.innerHeight - 220)),
      minWidth: 320,
      minHeight: 200,
      layer: Z_VISUAL_NOVEL_PANEL,
      single: VN_BACKLOG_PANEL,
    });
  }

  readonly isEmotePanelOpen = computed(() => this.panelService.hasSingle(VN_EMOTE_PANEL));
  readonly isDisplaySettingsOpen = computed(() => this.panelService.hasSingle(VN_DISPLAY_PANEL));

  /** Opens the staging window above the button that was pressed, or closes it when it is open. */
  toggleEmote(event?: Event): void {
    if (this.panelService.closeSingle(VN_EMOTE_PANEL)) return;
    this.closePopovers();
    const size = { width: 320, height: Math.min(440, Math.max(240, window.innerHeight - 220)) };
    this.panelService.open<VisualNovelEmotePanelComponent>(VisualNovelEmotePanelComponent, {
      title: this.t('feature.visualNovel.emote.title'),
      ...this.spotFor(event, size),
      ...size,
      minWidth: 260,
      minHeight: 180,
      layer: Z_VISUAL_NOVEL_PANEL_ABOVE,
      single: VN_EMOTE_PANEL,
      minimizeToContent: true,
    });
  }

  readonly isDirectionPanelOpen = computed(() => this.panelService.hasSingle(VN_DIRECTION_PANEL));

  /** Opens the direction window above the button that was pressed, or closes it when it is open. */
  toggleDirection(event?: Event): void {
    if (this.panelService.closeSingle(VN_DIRECTION_PANEL)) return;
    this.closePopovers();
    const size = { width: 320, height: Math.min(420, Math.max(240, window.innerHeight - 220)) };
    this.panelService.open<VisualNovelDirectionPanelComponent>(VisualNovelDirectionPanelComponent, {
      title: this.t('feature.visualNovel.direction.title'),
      ...this.spotFor(event, size),
      ...size,
      minWidth: 260,
      minHeight: 180,
      layer: Z_VISUAL_NOVEL_PANEL_ABOVE,
      single: VN_DIRECTION_PANEL,
      minimizeToContent: true,
    });
  }

  /** Whichever tab is being read, in a window of its own, to be watched beside the stage. */
  toggleChatStream(): void {
    const tab = this.chatTab();
    if (!tab) return;
    this.chatStreamPanel.toggle(tab);
  }

  readonly isChatStreamOpen = computed(() => {
    const tab = this.chatTab();
    return tab ? this.chatStreamPanel.isOpen(tab) : false;
  });

  /**
   * Opens the display settings window above the button that was pressed, or closes it when it is
   * open.
   */
  toggleDisplaySettings(event?: Event): void {
    if (this.panelService.closeSingle(VN_DISPLAY_PANEL)) return;
    this.closePopovers();
    const size = { width: 320, height: Math.min(520, Math.max(240, window.innerHeight - 160)) };
    this.panelService.open<VisualNovelDisplayPanelComponent>(VisualNovelDisplayPanelComponent, {
      title: this.t('feature.visualNovel.settings.title'),
      ...this.spotFor(event, size),
      ...size,
      minWidth: 260,
      minHeight: 180,
      layer: Z_VISUAL_NOVEL_PANEL_ABOVE,
      single: VN_DISPLAY_PANEL,
      minimizeToContent: true,
    });
  }

  /**
   * Where a window opened from a button in the bar belongs: just above the button, where the eye
   * already is. Anywhere fixed would sooner or later be under the menu button or over the
   * portraits.
   */
  private spotFor(event: Event | undefined, size: { width: number; height: number }) {
    const button = event?.currentTarget;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (!(button instanceof HTMLElement)) {
      return { left: Math.round((viewport.width - size.width) / 2), top: 24 };
    }
    return spotBeside(button.getBoundingClientRect(), size, viewport);
  }

  /** Opens or closes the sound board balloon. */
  toggleSoundBoard(): void {
    this.togglePopover('soundBoard');
  }

  /**
   * Opens or closes the guide for placing the speaker's portrait on the stage; does nothing when
   * the speaker is not a character.
   */
  toggleSlotGuide(): void {
    if (this.speakerSlot() < 0) return;
    this.togglePopover('slotGuide');
  }

  private readonly paletteHandle: ChatPaletteHandle = {
    setCharacterById: (identifier: string) => {
      const object = this.objectStore.get(identifier);
      if (object instanceof GameCharacter) this._sendFrom.set(identifier);
    },
  };

  private sheetPanelService: PanelService | null = null;
  readonly sheetOpen = signal(false);

  /**
   * Opens the speaker's character sheet in a window over novel mode, or closes it when it is open;
   * does nothing when the speaker is not a character.
   */
  toggleCharacterSheet(): void {
    if (this.sheetPanelService?.isShow) {
      this.sheetPanelService.close();
      this.sheetPanelService = null;
      this.sheetOpen.set(false);
      return;
    }
    this.sheetPanelService = null;
    this.sheetOpen.set(false);
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return;
    this.closePopovers();
    const title = sheetPanelTitle(this.t('feature.character.panel.sheet'), object.name);
    const option: PanelOption = {
      title,
      left: 60,
      top: 60,
      width: 800,
      height: Math.min(600, Math.max(360, window.innerHeight - 320)),
      layer: Z_VISUAL_NOVEL_PANEL,
    };
    const component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = object;
    this.sheetPanelService = (component as unknown as { panelService: PanelService }).panelService;
    this.sheetOpen.set(true);
  }

  /** Opens or closes the balloon listing the speaker's chat palette. */
  togglePalette(): void {
    this.togglePopover('palette');
  }

  /** Puts a chat palette line into the input and closes the palette. */
  pickPaletteLine(line: string): void {
    this.text.set(line);
    this.closePopovers();
  }

  /**
   * Places the speaker's portrait in a slot on the novel-mode stage, shared with the room, and
   * closes the guide.
   */
  pickSlot(slot: number): void {
    const character = this.speakerCharacter();
    if (character) character.vnPortraitPos = Math.min(VN_STAGE_SLOT_COUNT - 1, Math.max(0, slot));
    this.closePopovers();
  }

  /**
   * Lets the speaker's portrait stand where their chat position puts it again, and closes the
   * guide.
   */
  followChatSlot(): void {
    const character = this.speakerCharacter();
    if (character) character.vnPortraitPos = VN_PORTRAIT_POS_UNSET;
    this.closePopovers();
  }

  /**
   * Turns the wheel over the message into reading: up goes back a line, down moves on, at most once
   * every 160ms.
   */
  onMessageWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - this.lastWheelTime < WHEEL_THROTTLE_MS) return;
    this.lastWheelTime = now;
    if (event.deltaY < 0) {
      this.userBack();
    } else {
      this.userAdvance();
    }
  }

  /**
   * Runs the novel-mode shortcut for a key pressed anywhere in the window; keys typed into a field
   * or during composition are left alone as the shortcut rules decide.
   */
  onKeydown(event: KeyboardEvent): void {
    const action = visualNovelKeyDown(event.key, {
      composing: event.isComposing,
      typing: isTypingTarget(event.target),
      popoverOpen: this.isAnythingOpen(),
      chord: event.ctrlKey || event.metaKey || event.altKey,
    });
    if (!action) return;
    if (action.preventDefault) event.preventDefault();
    this.runCommand(action.command);
  }

  /**
   * Runs the novel-mode action for a released key, such as ending the skip that holding Ctrl
   * started.
   */
  onKeyup(event: KeyboardEvent): void {
    const action = visualNovelKeyUp(event.key);
    if (action) this.runCommand(action.command);
  }

  private runCommand(command: VisualNovelCommand): void {
    this.commands[command]();
  }

  private readonly commands: Record<VisualNovelCommand, () => void> = {
    advance: () => this.userAdvance(),
    back: () => this.userBack(),
    toStart: () => this.jumpTo(0),
    toLatest: () => this.toLatest(),
    startSkip: () => this.playback.startSkip(),
    stopSkip: () => this.stopSkip(),
    toggleBacklog: () => this.toggleBacklog(),
    toggleAutoPlay: () => this.toggleAutoPlay(),
    toggleSlotGuide: () => this.toggleSlotGuide(),
    toggleShortcutHelp: () => this.toggleShortcutHelp(),
    closePopovers: () => this.closeOverlays(),
    exit: () => this.exit(),
  };

  /** Stops skipping through lines, also when the window loses focus while Ctrl is held. */
  stopSkip(): void {
    this.playback.stopSkip();
  }

  /**
   * Sends the typed line when Enter is pressed in the input, except while an input method is
   * composing.
   */
  onInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    this.send();
  }

  /**
   * Sends the typed line to the tab being read, as the speaker and with the chosen staging.
   *
   * The line goes through the speaker's chat palette first, and an attached sound is played once it
   * is sent. Auto play stops. Nothing is sent without a tab, with an empty line, or when this user
   * may not speak in the tab; a speaker that no longer exists is replaced by the first character,
   * or this user's cursor. A scene line plays the transition, and the input and attached sound are
   * cleared.
   */
  send(): void {
    this.stopAutoPlay();
    const tab = this.chatTab();
    const text = this.text().trim();
    if (!tab || text.length < 1 || !this.canSpeak()) return;
    let sendFrom = this._sendFrom();
    if (!this.objectStore.get(sendFrom)) {
      sendFrom = this.gameCharacters()[0]?.identifier ?? PeerCursor.myCursor?.identifier ?? '';
      this._sendFrom.set(sendFrom);
    }
    const speaker = this.objectStore.get(sendFrom);
    let evaluated = text;
    if (speaker instanceof GameCharacter) {
      const palette = speaker.chatPalette;
      if (palette) evaluated = palette.evaluate(text, speaker.rootDataElement ?? undefined);
    }
    const emote = encodeVnEmote({ ...this.emoteSelection.emote(), flipped: this.speakerFlip() === true });
    const attachedSe = this.attachedSe();
    DiceBot.gameSystemForLineAsync(this.gameType, evaluated).then((gameSystem) => {
      this.chatMessageService.sendMessage(
        tab,
        evaluated,
        gameSystem,
        sendFrom,
        undefined,
        this.portraitIndexOf(sendFrom),
        this.colorOf(sendFrom),
        [{ text: evaluated, object: null }],
        undefined,
        undefined,
        undefined,
        undefined,
        emote
      );
      if (attachedSe) this.jukebox?.play(attachedSe.identifier);
    });
    if (this.selectedKind() === 'scene') this.scene.playTransition();
    this.attachedSe.set(null);
    this.text.set('');
    this.playback.followLatest();
  }

  private portraitIndexOf(sendFrom: string): number {
    const object = this.objectStore.get(sendFrom);
    return object instanceof GameCharacter ? object.selectedPortraitIndex : 0;
  }

  private colorOf(sendFrom: string): string {
    const object = this.objectStore.get(sendFrom);
    return chatColorOf(object instanceof GameCharacter ? object : PeerCursor.myCursor, 0);
  }
}
