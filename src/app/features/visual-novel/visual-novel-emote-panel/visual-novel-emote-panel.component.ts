import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  VN_BUBBLE_ANIMATIONS,
  VN_BUBBLE_SHAPES,
  VN_EMOTION_MARK_CHARS,
  VN_EMOTION_MARKS,
  VN_PORTRAIT_EMOTES,
  VnEmotionMark,
} from '@axe/domain/visual-novel/vn-emote';
import { VisualNovelEmoteSelectionService } from '@axe/features/visual-novel/visual-novel-emote-selection.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What the next line will be staged as.
 *
 * Kept apart from the display settings: this is touched line by line while a scene is played,
 * those are settled once and left alone. Together they would make one tall column to scroll past
 * every time an expression is wanted.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'visual-novel-emote-panel',
  templateUrl: './visual-novel-emote-panel.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class VisualNovelEmotePanelComponent {
  private readonly selection = inject(VisualNovelEmoteSelectionService);

  readonly messageKindOptions = this.selection.messageKindOptions;
  readonly bubbleShapeOptions = VN_BUBBLE_SHAPES;
  readonly bubbleAnimationOptions = VN_BUBBLE_ANIMATIONS;
  readonly portraitEmoteOptions = VN_PORTRAIT_EMOTES;
  readonly emotionMarkOptions = VN_EMOTION_MARKS;

  readonly selectedKind = this.selection.kind;
  readonly selectedShape = this.selection.shape;
  readonly selectedBubbleAnimation = this.selection.bubbleAnimation;
  readonly selectedPortraitEmote = this.selection.portraitEmote;
  readonly selectedEmotionMark = this.selection.emotionMark;
  readonly selectedExit = this.selection.exited;

  /** The character drawn for an emotion mark's button; empty for no mark. */
  emotionMarkLabel(mark: VnEmotionMark): string {
    return mark === 'none' ? '' : VN_EMOTION_MARK_CHARS[mark];
  }

  /**
   * Puts every staging choice for the next line back to its default, from the panel's reset button.
   */
  resetEmote(): void {
    this.selection.reset();
  }

  /** Marks the next line as one the speaker leaves the stage on, or clears that mark. */
  toggleSelectedExit(): void {
    this.selection.toggleExit();
  }
}
