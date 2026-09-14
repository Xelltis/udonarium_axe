import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  hasVnEmote,
  VN_EMOTE_DEFAULT,
  VN_MESSAGE_KINDS,
  VnBubbleAnimation,
  VnBubbleShape,
  VnEmote,
  VnEmotionMark,
  VnMessageKind,
  VnPortraitEmote,
} from '@axe/domain/visual-novel/vn-emote';

/**
 * How the next line will be staged, held apart from any one screen.
 *
 * The picker and the screen that sends are separate windows now, so neither can own this
 * between them. Whether the speaker is flipped is not here: that belongs to the character and
 * is read off them when the line is sent.
 */
@Injectable({ providedIn: 'root' })
export class VisualNovelEmoteSelectionService {
  private readonly objectChange = inject(ObjectChangeService);

  readonly kind = signal<VnMessageKind>('normal');
  readonly shape = signal<VnBubbleShape>('normal');
  readonly bubbleAnimation = signal<VnBubbleAnimation>('none');
  readonly portraitEmote = signal<VnPortraitEmote>('none');
  readonly emotionMark = signal<VnEmotionMark>('none');
  readonly exited = signal(false);

  readonly emote = computed<VnEmote>(() => ({
    kind: this.kind(),
    shape: this.shape(),
    bubbleAnimation: this.bubbleAnimation(),
    portraitEmote: this.portraitEmote(),
    emotionMark: this.emotionMark(),
    flipped: false,
    exited: this.exited(),
  }));

  readonly hasSelection = computed(() => hasVnEmote(this.emote()));

  readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  /** A scene change sweeps the stage for everybody, so only the game master may send one. */
  readonly messageKindOptions = computed(() =>
    this.isGameMaster() ? VN_MESSAGE_KINDS : VN_MESSAGE_KINDS.filter((kind) => kind !== 'scene')
  );

  /** Puts every staging choice back to the default, as after a line is sent or novel mode closes. */
  reset(): void {
    this.kind.set(VN_EMOTE_DEFAULT.kind);
    this.shape.set(VN_EMOTE_DEFAULT.shape);
    this.bubbleAnimation.set(VN_EMOTE_DEFAULT.bubbleAnimation);
    this.portraitEmote.set(VN_EMOTE_DEFAULT.portraitEmote);
    this.emotionMark.set(VN_EMOTE_DEFAULT.emotionMark);
    this.exited.set(VN_EMOTE_DEFAULT.exited);
  }

  /** Flips whether the next line marks its speaker as leaving the stage. */
  toggleExit(): void {
    this.exited.update((exited) => !exited);
  }
}
