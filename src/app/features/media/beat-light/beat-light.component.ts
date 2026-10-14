import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { beatGlow } from '@axe/domain/media/beat-glow';
import { type BeatGrid } from '@axe/domain/media/beat-grid';
import { Jukebox } from '@axe/domain/media/jukebox';
import { roomMix } from '@axe/domain/media/mix-level';
import { BeatLightPreferenceService } from '@axe/features/media/beat-light/beat-light-preference.service';

/** How brightly the edges shine at the height of a glow, kept low so the table stays readable. */
export const BEAT_LIGHT_PEAK_OPACITY = 0.4;

/**
 * A soft glow round the edges of the screen that rises on every beat of the room's track and dies
 * away before the next, brighter on the first beat of a bar.
 *
 * It shines while the room turns it on and its track plays with beats known, and never for a
 * reader who keeps it off or asks for less motion, and then takes up no layer at all. It sits over
 * the table and under the panels, and lets every press through. The glow is set straight on the
 * element each animation frame, without going through change detection, and the frames stop while
 * it has nothing to show.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-beat-light',
  templateUrl: './beat-light.component.html',
  host: { class: 'pointer-events-none fixed inset-0 z-0', '[class.hidden]': '!allowed()', 'aria-hidden': 'true' },
})
export class BeatLightComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly analysis = inject(AudioAnalysisService);
  private readonly motion = inject(MotionService);
  private readonly preference = inject(BeatLightPreferenceService);
  readonly glow = viewChild<ElementRef<HTMLElement>>('glow');

  /** Whether the light may shine on this screen: the room turns it on, and the reader neither keeps it off nor asks for less motion. */
  readonly allowed = computed(() => {
    this.objectChange.versionOf('Config')();
    return roomMix().beatLight && this.motion.enabled() && !this.preference.off();
  });

  /** The beats of the track the room is playing, or null while nothing plays or its beats are unknown. */
  readonly grid = computed<BeatGrid | null>(() => {
    this.objectChange.versionOf('Jukebox')();
    const jukebox = this.jukebox;
    if (!jukebox?.isPlaying || !jukebox.audioIdentifier) return null;
    this.analysis.version();
    this.objectChange.versionOf(`audiotag_${jukebox.audioIdentifier}`)();
    return AudioProfile.gridOf(jukebox.audioIdentifier);
  });

  private frame = 0;

  constructor() {
    effect(() => {
      const shining = this.allowed() && this.grid() !== null;
      untracked(() => (shining ? this.start() : this.stop()));
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  private start(): void {
    if (this.frame !== 0) return;
    const shine = () => {
      this.frame = requestAnimationFrame(shine);
      const grid = this.grid();
      const position = this.jukebox?.position ?? 0;
      const level = grid ? beatGlow(grid, position) * BEAT_LIGHT_PEAK_OPACITY : 0;
      const element = this.glow()?.nativeElement;
      if (element) element.style.opacity = level.toFixed(3);
    };
    this.frame = requestAnimationFrame(shine);
  }

  private stop(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const element = this.glow()?.nativeElement;
    if (element) element.style.opacity = '0';
  }
}
