import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { applyVisionShape, asVisionShape, VISION_SHAPES, VisionShape } from '@axe/domain/tabletop/vision-shape';
import {
  applyLightPreset,
  LightAnimation,
  LightCategory,
  LightConfig,
  LightPreset,
  VisionType,
} from '@axe/domain/tabletop/vision-types';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What the panel sets the light and the sight of: a synced object known by its identifier, or
 * several answered for as one, known by theirs.
 */
type LightTarget = LightConfig & {
  update?: () => void;
  readonly identifier?: string;
  readonly identifiers?: readonly string[];
};

@Component({
  selector: 'light-settings',
  templateUrl: './light-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class LightSettingsComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly objectChange = inject(ObjectChangeService);

  constructor() {
    closeWhenOffTheTable();
  }

  private readonly targetState = signal<LightTarget | null>(null);
  private readonly advancedState = signal(false);
  private readonly showVisionState = signal(false);
  private readonly showLightState = signal(true);

  /** What the panel sets, given by whoever opens it; null until then. */
  get target(): LightTarget | null {
    return this.targetState();
  }
  set target(target: LightTarget | null) {
    this.targetState.set(target);
  }

  /** Whether the settings only a light source has are shown. */
  get advanced(): boolean {
    return this.advancedState();
  }
  set advanced(advanced: boolean) {
    this.advancedState.set(advanced);
  }

  /** Whether the sight of the target is shown, as for a piece that sees. */
  get showVision(): boolean {
    return this.showVisionState();
  }
  set showVision(showVision: boolean) {
    this.showVisionState.set(showVision);
  }

  /** Off for a reader setting sight alone, where a lamp is nothing to do with what was asked. */
  get showLight(): boolean {
    return this.showLightState();
  }
  set showLight(showLight: boolean) {
    this.showLightState.set(showLight);
  }

  /**
   * The target as the template reads its fields, followed as it changes at any seat. The object
   * stays the same one, so every change of it counts as a new reading.
   */
  protected readonly shown = computed<LightTarget | null>(
    () => {
      const target = this.targetState();
      if (!target) return null;
      const identifiers = target.identifiers ?? (target.identifier ? [target.identifier] : []);
      for (const identifier of identifiers) this.objectChange.versionOf(identifier)();
      return target;
    },
    { equal: () => false }
  );

  /** The look every select and number field of the panel shares. */
  protected readonly fieldClass =
    'rounded-ui-sm border-ui-border-panel bg-ui-input text-ui-text box-border w-full border border-solid px-2 py-1 text-[13px]';

  readonly presets = Object.values(LightPreset);
  readonly animations = Object.values(LightAnimation);
  readonly categories = Object.values(LightCategory);
  readonly visionTypes = Object.values(VisionType);
  readonly visionShapes = VISION_SHAPES;
  readonly VisionShape = VisionShape;

  /**
   * Applies a light preset to the target, turns its light on and pushes the change; does nothing
   * without a target.
   */
  onPreset(preset: string): void {
    if (!this.target) return;
    applyLightPreset(this.target, preset as LightPreset);
    this.target.lightEnabled = true;
    this.target.update?.();
  }

  /**
   * Gives the target a vision shape, setting the fields that shape uses, and pushes the change;
   * does nothing without a target.
   */
  onVisionShape(shape: string): void {
    if (!this.target) return;
    applyVisionShape(this.target, asVisionShape(shape));
    this.target.update?.();
  }

  /** The target's vision shape, with anything unrecognised read as the default. */
  get visionShape(): VisionShape {
    return asVisionShape(this.target?.visionShape);
  }

  /** The translated name of a vision shape. */
  shapeLabel(value: string): string {
    return this.t('feature.vision.settings.shape' + value.replace(/(^|-)(.)/g, (_, __, c: string) => c.toUpperCase()));
  }

  /** The translated name of a light preset. */
  presetLabel(value: string): string {
    return this.t('feature.light.preset.' + value);
  }
  /** The translated name of a light animation. */
  animationLabel(value: string): string {
    return this.t('feature.light.animation.' + value);
  }
  /** The translated name of a light category. */
  categoryLabel(value: string): string {
    return this.t('feature.light.category.' + value);
  }
  /** The translated name of a vision type. */
  visionLabel(value: string): string {
    return this.t('feature.vision.type.' + value);
  }
}
