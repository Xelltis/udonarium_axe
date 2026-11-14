import { computed, inject, Injectable } from '@angular/core';
import { SystemAvatarKind, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VN_EMOTION_MARK_CHARS, vnEmoteOf, VnEmotionMark } from '@axe/domain/visual-novel/vn-emote';
import { toPortraitSlot, toStageResetAt } from '@axe/domain/visual-novel/vn-portrait-position';
import {
  buildVnStage,
  stageCutFor,
  VN_STAGE_LOOKBACK,
  VnStageCharacter,
  VnStageSource,
} from '@axe/domain/visual-novel/vn-stage-cast';
import { readableMessageName, readableMessageText } from '@axe/features/visual-novel/visual-novel-message';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { VisualNovelSettingsService, VnLayout } from '@axe/features/visual-novel/visual-novel-settings.service';

const EMOTION_MARK_COLORS: Record<Exclude<VnEmotionMark, 'none'>, string> = {
  surprise: 'text-red-500',
  question: 'text-sky-500',
  anger: 'text-red-600',
  sweat: 'text-sky-500',
  heart: 'text-pink-500',
  note: 'text-amber-500',
  silence: 'text-gray-500',
};

/**
 * What novel mode's stage shows for the line being read: who stands on it and where, who is
 * speaking and in which of the three layouts, and the classes its balloon and portraits are drawn
 * and moved with.
 *
 * Provided by the overlay that draws the stage, and read from the playback and the display
 * settings alone, so nothing here knows of the overlay's panels, keys or input.
 */
@Injectable()
export class VnStageViewService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly settings = inject(VisualNovelSettingsService);
  private readonly playback = inject(VisualNovelPlaybackService);

  private readonly chatTab = this.playback.chatTab;
  private readonly messages = this.playback.messages;
  private readonly currentIndex = this.playback.currentIndex;
  private readonly currentMessage = this.playback.currentMessage;
  private readonly isTyping = this.playback.isTyping;
  private readonly currentIsDiceCommand = this.playback.currentIsDiceCommand;
  private readonly currentEmote = this.playback.currentEmote;

  readonly speakerName = computed(() => {
    this.language.currentLang();
    return readableMessageName(this.currentMessage(), this.t);
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
}
