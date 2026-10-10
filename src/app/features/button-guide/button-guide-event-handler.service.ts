import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { buttonGuideKeyDown } from '@axe/features/button-guide/button-guide-shortcut';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';

/** Marks what a press may land on without putting the guide away, since it answers the press itself. */
export const BUTTON_GUIDE_KEEP_ATTRIBUTE = 'data-button-guide-keep';

/**
 * The keys and the presses that bring out and put away the guide to the buttons.
 *
 * Only the desktop screen has the menu and the toolbars the guide writes on. Novel mode answers
 * the same key with its own list, the small-screen layout has neither, and the streaming overlay
 * has nothing to press, so the guide is put away and left alone while any of them holds the screen.
 *
 * A press anywhere puts the guide away, before it reaches what it landed on. The names are drawn
 * beside the buttons without moving them, so the press still lands on the button it was aimed at.
 * The menu's drawer is the exception: it lays itself out differently while the guide is out, so it
 * is marked to keep the guide and puts it away itself once whatever was pressed has run.
 */
@Injectable({ providedIn: 'root' })
export class ButtonGuideEventHandlerService {
  private readonly guide = inject(ButtonGuideService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly overlayMode = inject(OverlayModeService);

  private listeningForPresses = false;

  constructor() {
    document.addEventListener('keydown', this.onKeyDown);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', this.onKeyDown);
      this.stopListeningForPresses();
    });

    effect(() => {
      if (this.blocked()) untracked(() => this.guide.hide());
    });
    effect(() => {
      if (this.guide.shown()) this.listenForPresses();
      else this.stopListeningForPresses();
    });
  }

  private blocked(): boolean {
    return this.visualNovel.active() || this.mobile.isActive() || this.overlayMode.active();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.blocked()) return;
    const action = buttonGuideKeyDown(event.key, {
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      shown: this.guide.shown(),
    });
    if (!action) return;
    if (action.preventDefault) event.preventDefault();
    if (action.command === 'toggle') this.guide.toggle();
    else this.guide.hide();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(`[${BUTTON_GUIDE_KEEP_ATTRIBUTE}]`)) return;
    this.guide.hide();
  };

  private listenForPresses(): void {
    if (this.listeningForPresses) return;
    this.listeningForPresses = true;
    document.addEventListener('pointerdown', this.onPointerDown, true);
  }

  private stopListeningForPresses(): void {
    if (!this.listeningForPresses) return;
    this.listeningForPresses = false;
    document.removeEventListener('pointerdown', this.onPointerDown, true);
  }
}
