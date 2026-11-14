import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
  Type,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPaletteHandle, ChatPaletteRegistryService } from '@axe/application/chat/chat-palette-registry.service';
import { SystemAvatarKind } from '@axe/application/chat/system-avatar.service';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { Logger } from '@axe/core/logging/logger';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { chatColorOf } from '@axe/domain/chat/chat-color';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { isPaletteTabLine } from '@axe/domain/chat/palette-rows';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { keyboardShortcutsOf, shortcutKeysText } from '@axe/domain/ui/keyboard-shortcuts';
import { isAudienceOffered } from '@axe/domain/ui/menu-command';
import { encodeVnEmote } from '@axe/domain/visual-novel/vn-emote';
import { vnEmoteLabel } from '@axe/domain/visual-novel/vn-emote-label';
import {
  isVnPortraitPosSet,
  toPortraitSlot,
  VN_PORTRAIT_POS_UNSET,
} from '@axe/domain/visual-novel/vn-portrait-position';
import {
  leftOfSlot,
  slotBandLeft,
  slotBandWidth,
  slotLabelLeftInBand,
  VN_STAGE_SLOT_COUNT,
  VN_STAGE_SLOT_INDEXES,
} from '@axe/domain/visual-novel/vn-stage-cast';
import { GameCharacterSheetComponent } from '@axe/features/character/game-character-sheet/game-character-sheet.component';
import { allowsChat } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatStreamPanelService } from '@axe/features/chat/chat-stream/chat-stream-panel.service';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { VisualNovelBacklogComponent } from '@axe/features/visual-novel/visual-novel-backlog/visual-novel-backlog.component';
import { VisualNovelDirectionPanelComponent } from '@axe/features/visual-novel/visual-novel-direction-panel/visual-novel-direction-panel.component';
import { VisualNovelDirectorService } from '@axe/features/visual-novel/visual-novel-director.service';
import { VisualNovelDisplayPanelComponent } from '@axe/features/visual-novel/visual-novel-display-panel/visual-novel-display-panel.component';
import { VisualNovelEmotePanelComponent } from '@axe/features/visual-novel/visual-novel-emote-panel/visual-novel-emote-panel.component';
import { VisualNovelEmoteSelectionService } from '@axe/features/visual-novel/visual-novel-emote-selection.service';
import { VnStageViewService } from '@axe/features/visual-novel/visual-novel-overlay/vn-stage-view.service';
import {
  closeVisualNovelPanels,
  VISUAL_NOVEL_PANELS,
  VN_BACKLOG_PANEL,
  VN_DIRECTION_PANEL,
  VN_DISPLAY_PANEL,
  VN_EMOTE_PANEL,
  VN_SHEET_PANEL,
} from '@axe/features/visual-novel/visual-novel-panels';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { VisualNovelSceneService } from '@axe/features/visual-novel/visual-novel-scene.service';
import { VisualNovelSettingsService } from '@axe/features/visual-novel/visual-novel-settings.service';
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
import { DiceRollStageComponent } from '@axe/ui/components/dice-roll-stage/dice-roll-stage.component';
import { RubyTextComponent } from '@axe/ui/components/ruby-text/ruby-text.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { spotBeside } from '@axe/ui/panel-spot';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { Z_VISUAL_NOVEL_PANEL, Z_VISUAL_NOVEL_PANEL_ABOVE } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

const WHEEL_THROTTLE_MS = 160;

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
  // One of these to an overlay, as what the stage shows is worked out for the overlay drawing it.
  providers: [VnStageViewService],
  imports: [
    FormsModule,
    SafePipe,
    TranslocoModule,
    NgSelectComponent,
    NgOptionComponent,
    NgSelectWindowDirective,
    RubyTextComponent,
    VisualNovelSoundBoardComponent,
    DiceRollStageComponent,
  ],
})
export class VisualNovelOverlayComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly rolePermission = inject(RolePermissionService);
  protected readonly keyboardInset = inject(KeyboardInsetService).inset;
  protected readonly isControlsOpen = signal(false);

  protected toggleControls(): void {
    this.isControlsOpen.update((open) => !open);
  }

  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly names = inject(PieceNameService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly imageService = inject(ImageService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
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
  readonly isSkipping = this.playback.isSkipping;

  readonly selectedKind = this.emoteSelection.kind;
  readonly selectedShape = this.emoteSelection.shape;
  readonly selectedBubbleAnimation = this.emoteSelection.bubbleAnimation;
  readonly selectedPortraitEmote = this.emoteSelection.portraitEmote;
  readonly selectedEmotionMark = this.emoteSelection.emotionMark;
  readonly selectedExit = this.emoteSelection.exited;

  readonly messageKindOptions = this.emoteSelection.messageKindOptions;
  readonly isGameMaster = this.emoteSelection.isGameMaster;
  readonly slotIndexes = VN_STAGE_SLOT_INDEXES;
  /** The keys novel mode answers, less those for what this reader's role may not do. */
  readonly shortcutHelpItems = computed(() => {
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return keyboardShortcutsOf('visualNovel')
      .filter((shortcut) => isAudienceOffered(shortcut.audience ?? 'anyone', role))
      .map((shortcut) => ({ keys: shortcutKeysText(shortcut), labelKey: shortcut.labelKey }));
  });

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

  /**
   * Whoever was chosen to speak, kept while they still can: a character for as long as it is in the
   * room, and the reader themselves for as long as they are a game master. Anybody else gives way
   * to the first character that can be spoken as.
   */
  private readonly _sendFrom = linkedSignal<{ listed: GameCharacter[]; isGameMaster: boolean }, string>({
    source: () => ({ listed: this.listedCharacters(), isGameMaster: this.isGameMaster() }),
    computation: ({ listed, isGameMaster }, previous) => {
      const current = previous?.value ?? '';
      if (this.objectStore.get(current) instanceof GameCharacter) return current;
      if (isGameMaster && current.length > 0 && current === PeerCursor.myCursor?.identifier) return current;
      return listed[0]?.identifier ?? '';
    },
  });
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

  private readonly stage = inject(VnStageViewService);

  /** What the stage shows for the line being read; see {@link VnStageViewService}. */
  readonly speakerName = this.stage.speakerName;
  readonly isShoutShape = this.stage.isShoutShape;
  readonly bubbleBoxClass = this.stage.bubbleBoxClass;
  readonly bubbleEnterClass = this.stage.bubbleEnterClass;
  readonly bubbleAnimationClass = this.stage.bubbleAnimationClass;
  readonly portraitEmoteClass = this.stage.portraitEmoteClass;
  readonly emotionMark = this.stage.emotionMark;
  readonly stageCharacters = this.stage.stageCharacters;
  readonly activeStageCharacter = this.stage.activeStageCharacter;
  readonly diceCommand = this.stage.diceCommand;
  readonly systemSpeaker = this.stage.systemSpeaker;
  readonly narrationKind = this.stage.narrationKind;
  readonly speechVisible = this.stage.speechVisible;
  readonly speechLayout = this.stage.speechLayout;
  readonly bubbleAnchor = this.stage.bubbleAnchor;
  readonly bubbleTextSizeClass = this.stage.bubbleTextSizeClass;
  readonly narrationTextSizeClass = this.stage.narrationTextSizeClass;
  readonly speakClass = this.stage.speakClass;
  readonly isLeavingLine = this.stage.isLeavingLine;
  readonly portraitAnimationClass = this.stage.portraitAnimationClass;

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

  /** Joins lists of classes into one for a `[class]` binding made of several, leaving out the empty ones. */
  protected classes(...lists: string[]): string {
    return lists.filter((list) => list.length > 0).join(' ');
  }

  readonly hasEmoteSelection = this.emoteSelection.hasSelection;

  readonly selectedEmoteSuffix = computed(() => {
    this.language.currentLang();
    return vnEmoteLabel(this.emoteSelection.emote(), this.t);
  });

  /** Puts every staging choice for the next line back to its default. */
  resetEmote(): void {
    this.emoteSelection.reset();
  }

  protected onSystemAvatarContextMenu(event: Event, kind: SystemAvatarKind): void {
    this.systemAvatarMenu.openContextMenu(event, kind);
  }

  /**
   * The characters this seat may speak as. A piece on the table it cannot see is left out, as in
   * the chat; the one already chosen stays.
   */
  readonly gameCharacters = computed(() => this.speakableCharacters(this.sendFrom));

  /** The characters this seat may speak as, whoever is chosen; the first is who speaks when nobody is. */
  private readonly listedCharacters = computed(() => this.speakableCharacters(''));

  private speakableCharacters(chosen: string): GameCharacter[] {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const character of all) this.objectChange.versionOf(character.identifier)();
    const myPeerId = PeerCursor.myCursor?.peerId ?? '';
    return all.filter(
      (character) =>
        allowsChat(character, myPeerId) &&
        (character.identifier === chosen || (this.vision.mayBeListed(character) && !this.names.isKept(character)))
    );
  }

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
    const options = cast.map((character) => ({ identifier: character.identifier, name: this.names.shown(character) }));
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
    return (object.chatPalette?.getPalette() ?? []).filter((line) => !isPaletteTabLine(line));
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
    const index = clamp(object.selectedPortraitIndex, 0, children.length - 1);
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
   * Whether this reader may change the table: play sounds and cut-ins for the room from the board,
   * as on the jukebox, and move or turn the portrait of the piece they speak as. A guest may not.
   */
  readonly mayEditTable = computed(() => this.rolePermission.canEditTabletop());

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
   * position when it has none, under a name of its own: it is found by its field name, and a row
   * deleted from the sheet stays deleted under its name on a room server.
   */
  toggleSpeakerFlip(): void {
    if (!this.mayEditTable()) return;
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return;
    let element = object.detailDataElement?.getFirstElementByName('FLIP') ?? null;
    if (!element) {
      const posElement = object.detailDataElement?.getFirstElementByName('POS');
      const parent = posElement?.parent instanceof DataElement ? posElement.parent : object.detailDataElement;
      if (!parent) return;
      element = DataElement.create('FLIP', 0, {});
      parent.appendChild(element);
    }
    element.value = Number(element.value) === 1 ? 0 : 1;
    element.update();
  }

  constructor() {
    this.playback.attach();
    this.destroyRef.onDestroy(() => this.playback.detach());
    // The windows are put up outside this screen, so leaving novel mode does not take them.
    this.destroyRef.onDestroy(() => closeVisualNovelPanels(this.panelService));
    // The selection outlives this screen, and an expression chosen before novel mode was
    // last closed should not be waiting to be sent when it is opened again.
    this.destroyRef.onDestroy(() => this.emoteSelection.reset());

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
    const width = clamp(window.innerWidth - 48, 320, 700);
    this.panelService.open<VisualNovelBacklogComponent>(VisualNovelBacklogComponent, {
      title: this.t('feature.visualNovel.log'),
      // Off to the side rather than over the middle, which is where the portraits stand.
      left: Math.max(8, window.innerWidth - width - 24),
      top: 24,
      width,
      height: clamp(window.innerHeight - 220, 240, 560),
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
    this.toggleVnPanel(VN_EMOTE_PANEL, VisualNovelEmotePanelComponent, 'feature.visualNovel.emote.title', event, {
      height: 440,
      clearance: 220,
    });
  }

  readonly isDirectionPanelOpen = computed(() => this.panelService.hasSingle(VN_DIRECTION_PANEL));

  /** Opens the direction window above the button that was pressed, or closes it when it is open. */
  toggleDirection(event?: Event): void {
    this.toggleVnPanel(
      VN_DIRECTION_PANEL,
      VisualNovelDirectionPanelComponent,
      'feature.visualNovel.direction.title',
      event,
      { height: 420, clearance: 220 }
    );
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
    this.toggleVnPanel(
      VN_DISPLAY_PANEL,
      VisualNovelDisplayPanelComponent,
      'feature.visualNovel.settings.title',
      event,
      {
        height: 520,
        clearance: 160,
      }
    );
  }

  /**
   * Opens one of the small windows of the bar above the button that was pressed, or closes it when
   * it is open: as tall as asked, less where the screen is short, the clearance being what is left
   * for the bar and the line under it.
   */
  private toggleVnPanel(
    name: string,
    component: Type<unknown>,
    titleKey: string,
    event: Event | undefined,
    fit: { height: number; clearance: number }
  ): void {
    if (this.panelService.closeSingle(name)) return;
    this.closePopovers();
    const size = { width: 320, height: clamp(window.innerHeight - fit.clearance, 240, fit.height) };
    this.panelService.open(component, {
      title: this.t(titleKey),
      ...this.spotFor(event, size),
      ...size,
      minWidth: 260,
      minHeight: 180,
      layer: Z_VISUAL_NOVEL_PANEL_ABOVE,
      single: name,
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
    if (this.speakerSlot() < 0 || !this.mayEditTable()) return;
    this.togglePopover('slotGuide');
  }

  private readonly paletteHandle: ChatPaletteHandle = {
    setCharacterById: (identifier: string) => {
      const object = this.objectStore.get(identifier);
      if (object instanceof GameCharacter) this._sendFrom.set(identifier);
    },
  };

  /** Whether the speaker's character sheet is open over novel mode. */
  readonly sheetOpen = computed(() => this.panelService.hasSingle(VN_SHEET_PANEL));

  /**
   * Opens the speaker's character sheet in a window over novel mode, or closes it when it is open;
   * does nothing when the speaker is not a character.
   */
  toggleCharacterSheet(): void {
    if (this.panelService.closeSingle(VN_SHEET_PANEL)) return;
    const object = this.objectStore.get(this._sendFrom());
    if (!(object instanceof GameCharacter)) return;
    this.closePopovers();
    const title = sheetPanelTitle(this.t('feature.character.panel.sheet'), object.name);
    const option: PanelOption = {
      title,
      left: 60,
      top: 60,
      width: 800,
      height: clamp(window.innerHeight - 320, 360, 600),
      layer: Z_VISUAL_NOVEL_PANEL,
      single: VN_SHEET_PANEL,
    };
    const component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = object;
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
    const character = this.mayEditTable() ? this.speakerCharacter() : null;
    if (character) character.vnPortraitPos = clamp(slot, 0, VN_STAGE_SLOT_COUNT - 1);
    this.closePopovers();
  }

  /**
   * Lets the speaker's portrait stand where their chat position puts it again, and closes the
   * guide.
   */
  followChatSlot(): void {
    const character = this.mayEditTable() ? this.speakerCharacter() : null;
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
    DiceBot.gameSystemForLineAsync(this.gameType, evaluated)
      .then((gameSystem) => {
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
        if (attachedSe && this.mayEditTable()) this.jukebox?.play(attachedSe.identifier);
      })
      .catch((reason: unknown) => Logger.error('[VisualNovel] 発言を送れませんでした', reason));
    if (this.selectedKind() === 'scene') this.scene.playTransition();
    this.attachedSe.set(null);
    this.text.set('');
    this.playback.followLatest();
  }

  private portraitIndexOf(sendFrom: string): number {
    const object = this.objectStore.get(sendFrom);
    return object instanceof GameCharacter ? object.selectedPortraitIndex : 0;
  }

  /** The colour a line goes in: the character's, but a guest's own, as the chat input has it. */
  private colorOf(sendFrom: string): string {
    const object = this.objectStore.get(sendFrom);
    const fromCharacter = object instanceof GameCharacter && canRoleEdit(PeerCursor.myRole);
    return chatColorOf(fromCharacter ? object : PeerCursor.myCursor, 0);
  }
}
