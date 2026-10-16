import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { EFFECT_KINDS, EffectKind } from '@axe/domain/effect/effect-kind';
import { EFFECT_MOTE_OPTIONS } from '@axe/domain/effect/effect-motes';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  EFFECT_GRADE_OPTIONS,
  EFFECT_TARGETING_OPTIONS,
  PROJECTILE_STYLE_OPTIONS,
  SLASH_STYLE_OPTIONS,
  usesImpactKindField,
  usesProjectileFields,
  usesShotFields,
  usesSlashFields,
  usesTargetLimit,
} from '@axe/domain/effect/effect-preset-form';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { kindGlyphSvg } from '@axe/domain/effect/effect-shapes';
import {
  EFFECT_STAGE_ROLES,
  type EffectStage,
  type EffectStageRole,
  encodeEffectStages,
  MAX_STAGES,
} from '@axe/domain/effect/effect-stage';
import {
  addBranchStage,
  addStage,
  kindsForRole,
  moveStage,
  removeBranchStage,
  removeStage,
  updateBranchStage,
  updateStage,
} from '@axe/domain/effect/effect-stage-form';
import { presetSoundLabelKey, soundFileName } from '@axe/domain/media/preset-sound-labels';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

interface SoundOption {
  identifier: string;
  name: string;
}

/**
 * Editing a preset.
 *
 * The values go straight onto the model, which clamps them itself.
 * Fields the kind has no use for are hidden by the form.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-effect-preset-editor',
  templateUrl: './effect-preset-editor.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class EffectPresetEditorComponent {
  private readonly library = inject(EffectLibraryService);
  private readonly castService = inject(EffectCastService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly t = inject(TRANSLATE_FN);

  /** The preset being edited, put there by whoever opened it. */
  readonly presetIdentifier = signal('');

  readonly preset = computed<EffectPreset | null>(() => {
    const identifier = this.presetIdentifier();
    if (identifier.length < 1) return null;
    return this.library.get(identifier);
  });

  /**
   * How often the contents have changed.
   *
   * The preset hands back the same instance every time, so anything computed from it alone
   * never recomputes. Whatever is drawn from the contents goes through this version.
   */
  private readonly version = computed<number>(() => {
    const identifier = this.presetIdentifier();
    return identifier.length < 1 ? 0 : this.objectChange.versionOf(identifier)();
  });

  protected readonly kinds = EFFECT_KINDS;
  protected readonly targetings = EFFECT_TARGETING_OPTIONS;
  protected readonly grades = EFFECT_GRADE_OPTIONS;
  protected readonly projectileStyles = PROJECTILE_STYLE_OPTIONS;
  protected readonly slashStyles = SLASH_STYLE_OPTIONS;
  protected readonly motes = EFFECT_MOTE_OPTIONS;

  readonly notice = signal('');

  /** A sound is identified by its path, which says nothing about the sound. */
  protected readonly sounds = computed<SoundOption[]>(() => {
    this.objectChange.fileVersion();
    return [...this.audioStorage.audios]
      .map((audio) => {
        const labelKey = presetSoundLabelKey(audio.identifier);
        return { identifier: audio.identifier, name: labelKey ? this.t(labelKey) : soundFileName(audio.name) };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  });

  /** The families on offer, gathered from those already there to help with the typing. */
  protected readonly tagOptions = computed<string[]>(() =>
    [...new Set(this.library.presets().map((preset) => preset.tagName))].filter((tag) => tag.length > 0).sort()
  );

  protected readonly effectKind = computed<EffectKind>(() => {
    this.version();
    return this.preset()?.effectKind ?? 'burst';
  });
  protected readonly showsProjectile = computed(() => usesProjectileFields(this.effectKind()));
  protected readonly showsSlash = computed(() => usesSlashFields(this.effectKind()));
  protected readonly showsShots = computed(() => usesShotFields(this.effectKind()));
  protected readonly showsImpactKind = computed(() => usesImpactKindField(this.effectKind()));
  protected readonly showsTargetLimit = computed(() => {
    this.version();
    return usesTargetLimit(this.preset()?.effectTargeting ?? 'single');
  });

  /** The run this effect goes through. An empty list is an effect that draws one look. */
  protected readonly stages = computed<EffectStage[]>(() => {
    this.version();
    return this.preset()?.stageList ?? [];
  });

  protected readonly stageRoles = EFFECT_STAGE_ROLES;
  protected readonly canAddStage = computed(() => this.stages().length < MAX_STAGES);

  protected readonly glyph = computed<string>(() => {
    this.version();
    const preset = this.preset();
    if (!preset) return '';
    return kindGlyphSvg(preset.effectKind, { core: preset.colorPrimary, edge: preset.colorSecondary });
  });

  constructor() {
    closeWhenOffTheTable();
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.effect.editorTitle')));
  }

  protected kindLabel(kind: string): string {
    return this.t(`feature.effect.kinds.${kind}`);
  }

  protected gradeLabel(grade: number): string {
    return this.t(`feature.effect.grade${grade}`);
  }

  protected targetingLabel(targeting: string): string {
    return this.t(`feature.effect.targeting.${targeting}`);
  }

  protected projectileLabel(style: string): string {
    return this.t(`feature.effect.projectileStyle.${style}`);
  }

  protected moteLabel(mote: string): string {
    return mote.length < 1 ? this.t('feature.effect.moteAuto') : this.t(`feature.effect.mote.${mote}`);
  }

  protected slashLabel(style: string): string {
    return this.t(`feature.effect.slashStyle.${style}`);
  }

  /** The version goes up on a write, and the room hears about it. */
  protected edit<K extends keyof EffectPreset>(key: K, value: EffectPreset[K]): void {
    const preset = this.preset();
    if (!preset) return;
    preset[key] = value;
    preset.update();
    this.objectChange.notifyChanged(preset.identifier);
    this.notice.set('');
  }

  protected editNumber(key: keyof EffectPreset, value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.edit(key as never, numeric as never);
  }

  protected kindsFor(role: EffectStageRole): readonly EffectKind[] {
    return kindsForRole(role);
  }

  protected roleLabel(role: string): string {
    return this.t(`feature.effect.stageRole.${role}`);
  }

  /** The whole list is written in one go, so a half-finished edit never reaches the table. */
  private writeStages(stages: EffectStage[]): void {
    this.edit('stages', encodeEffectStages(stages));
  }

  protected addStage(role: EffectStageRole): void {
    this.writeStages(addStage(this.stages(), role));
  }

  protected removeStage(index: number): void {
    this.writeStages(removeStage(this.stages(), index));
  }

  protected moveStage(index: number, offset: number): void {
    this.writeStages(moveStage(this.stages(), index, offset));
  }

  protected editStage(index: number, patch: Partial<EffectStage>): void {
    this.writeStages(updateStage(this.stages(), index, patch));
  }

  protected editStageNumber(index: number, key: 'durationMs' | 'branches' | 'spreadDeg', value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.editStage(index, { [key]: numeric });
  }

  protected addBranch(index: number, role: EffectStageRole): void {
    this.writeStages(addBranchStage(this.stages(), index, role));
  }

  protected removeBranch(index: number, branchIndex: number): void {
    this.writeStages(removeBranchStage(this.stages(), index, branchIndex));
  }

  protected editBranch(index: number, branchIndex: number, patch: Partial<EffectStage>): void {
    this.writeStages(updateBranchStage(this.stages(), index, branchIndex, patch));
  }

  protected editBranchNumber(index: number, branchIndex: number, value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.editBranch(index, branchIndex, { durationMs: numeric });
  }

  /** A test fire, played on this screen alone. */
  protected preview(): void {
    const preset = this.preset();
    if (!preset) return;
    if (!this.castService.preview(preset)) {
      this.notice.set(this.t('feature.effect.previewNoTarget'));
    }
  }

  /**
   * Hands this one effect on, written in the same form the whole shelf is.
   *
   * It is read back by dropping it onto the table, where it lands on itself: the file
   * carries the effect's identifier, so what comes back is the effect that left.
   */
  protected export(): void {
    const preset = this.preset();
    if (!preset) return;
    void this.saveDataService.saveGameObjectAsync(EffectPresetSet.of([preset]), `effect_${preset.name}`);
    this.notice.set(this.t('feature.effect.exported'));
  }
}
