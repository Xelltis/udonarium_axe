import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import {
  REPLAY_KEEP_CHOICES,
  type ReplayKeepCount,
  ReplayPreferenceService,
} from '@axe/application/replay/replay-preference.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ReplayDetailLevel } from '@axe/domain/replay/replay-event';
import { formatReplayElapsed } from '@axe/features/replay/replay-log-line';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-replay-indicator',
  templateUrl: './replay-indicator.component.html',
  imports: [TranslocoModule],
})
export class ReplayIndicatorComponent {
  private readonly recorder = inject(ReplayRecorderService);
  private readonly preference = inject(ReplayPreferenceService);
  private readonly playback = inject(ReplayPlaybackService);
  private readonly rolePermission = inject(RolePermissionService);
  protected readonly widgets = inject(WidgetVisibilityService);

  protected readonly detailLevels = [ReplayDetailLevel.ChatOnly, ReplayDetailLevel.Notable, ReplayDetailLevel.Full];
  protected readonly keepChoices = REPLAY_KEEP_CHOICES;

  protected readonly isRecording = this.recorder.isRecording;
  protected readonly eventCount = this.recorder.eventCount;
  protected readonly detailLevel = this.recorder.detailLevel;
  protected readonly isHeld = this.playback.isBoardMode;
  protected readonly isFailing = this.recorder.isFailing;

  protected readonly isOpen = signal(false);
  protected readonly markLabel = signal('');

  protected readonly isShown = computed(() => {
    if (!this.widgets.recording()) return false;
    return this.isRecording() || this.recorder.isSupported;
  });

  private readonly tick = signal(0);

  protected readonly elapsed = computed(() => {
    this.tick();
    this.eventCount();
    return formatReplayElapsed(this.isRecording() ? Date.now() - this.recorder.startedAt() : 0);
  });

  constructor() {
    const timer = setInterval(() => {
      if (this.isRecording()) this.tick.update((count) => count + 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected hide(): void {
    this.isOpen.set(false);
    this.widgets.recording.set(false);
  }

  protected keepCountValue(): string {
    return this.keepValueOf(this.preference.keepCount());
  }

  /** How a choice of how many recordings to keep is written in the select. */
  protected keepValueOf(count: number | null | undefined): string {
    return count == null ? 'all' : String(count);
  }

  protected setKeepCount(value: string): void {
    const count: ReplayKeepCount = value === 'all' ? null : Number(value);
    this.preference.setKeepCount(Number.isFinite(count as number) ? count : null);
  }

  protected setDetailLevel(level: string): void {
    this.recorder.setDetailLevel(level as ReplayDetailLevel);
  }

  protected async mark(): Promise<void> {
    const label = this.markLabel().trim();
    if (!this.canEdit || !this.isRecording() || label.length < 1) return;
    this.markLabel.set('');
    await this.recorder.mark(label);
  }

  protected async start(): Promise<void> {
    if (!this.canEdit || this.isRecording() || this.isHeld()) return;
    this.isOpen.set(false);
    await this.recorder.start();
  }

  protected async stop(): Promise<void> {
    if (!this.canEdit) return;
    this.isOpen.set(false);
    await this.recorder.stop();
  }
}
