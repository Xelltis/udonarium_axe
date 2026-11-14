import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MotionService } from '@axe/application/ui/motion.service';
import { sceneFade$ } from '@axe/core/event/domain-events';
import { debounce } from '@axe/core/util/debounce';
import { SCENE_FADE } from '@axe/domain/scene/board-scene';

/**
 * The dark a scene changes under: the table goes black for a moment, the scene is put on, and it
 * comes back. A screen kept still does not darken, and the scene simply changes there.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'scene-fade-overlay',
  templateUrl: './scene-fade-overlay.component.html',
  host: { class: 'pointer-events-none absolute inset-0' },
})
export class SceneFadeOverlayComponent {
  private readonly motion = inject(MotionService);

  /** How dark the table is, from 0 to 1, and how long it takes to get there. */
  protected readonly opacity = signal(0);
  protected readonly durationMs = signal<number>(SCENE_FADE.inMs);

  /** Brings the table back once it has gone dark and been held so; a fade asked for meanwhile starts the wait over. */
  private readonly lift = debounce(() => {
    this.durationMs.set(SCENE_FADE.outMs);
    this.opacity.set(0);
  }, SCENE_FADE.inMs + SCENE_FADE.holdMs);

  constructor() {
    const destroyRef = inject(DestroyRef);
    sceneFade$.subscribe(() => this.fade(), destroyRef);
    destroyRef.onDestroy(() => this.lift.cancel());
  }

  private fade(): void {
    if (!this.motion.enabled()) return;
    this.durationMs.set(SCENE_FADE.inMs);
    this.opacity.set(1);
    this.lift();
  }
}
