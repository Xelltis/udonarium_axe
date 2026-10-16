import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildEffectChatToken } from '@axe/domain/effect/effect-chat-token';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { kindGlyphSvg } from '@axe/domain/effect/effect-shapes';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { buildEffectLibraryContextMenu } from '@axe/features/effect/effect-library-panel/effect-library-context-menu';
import {
  collectTags,
  EffectLibraryGroup,
  filterPresets,
  groupPresets,
  isMultiTarget,
  TargetingFilter,
} from '@axe/features/effect/effect-library-panel/effect-library-list';
import { pushRecentEffect, readRecentEffects } from '@axe/features/effect/effect-library-panel/recent-effects';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { HotbarFillService } from '@axe/features/hotbar/hotbar-fill.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const GRADE_LEVELS: readonly number[] = [1, 2, 3];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-effect-library-panel',
  templateUrl: './effect-library-panel.component.html',
  imports: [FormsModule, NgTemplateOutlet, SafePipe, TranslocoModule],
})
export class EffectLibraryPanelComponent {
  private readonly hotbarFill = inject(HotbarFillService);
  private readonly library = inject(EffectLibraryService);
  private readonly castService = inject(EffectCastService);
  private readonly targeting = inject(EffectTargetingService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly autoPlay = inject(EffectAutoPlayService);
  private readonly fieldService = inject(EffectFieldService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  protected readonly gradeLevels = GRADE_LEVELS;

  readonly query = signal('');
  readonly tagFilter = signal<string | null>(null);
  readonly gradeFilter = signal<number | null>(null);
  readonly targetingFilter = signal<TargetingFilter | null>(null);

  readonly tags = computed<string[]>(() => collectTags(this.library.presets()));

  readonly isGameMaster = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  readonly groups = computed<EffectLibraryGroup[]>(() =>
    groupPresets(
      filterPresets(
        this.library.presets(),
        this.query(),
        this.tagFilter(),
        this.gradeFilter(),
        this.targetingFilter(),
        this.isGameMaster()
      )
    )
  );

  readonly matchCount = computed<number>(() => this.groups().reduce((total, group) => total + group.presets.length, 0));

  readonly hasFilter = computed<boolean>(
    () =>
      this.query().trim().length > 0 ||
      this.tagFilter() != null ||
      this.gradeFilter() != null ||
      this.targetingFilter() != null
  );

  readonly targetNames = computed<string[]>(() => {
    this.uiSignalService.targetChange();
    this.selectionSignalService.selectedObject();
    this.objectChange.collectionOf('character')();
    if (this.targeting.isPicking()) return this.pickedNames();
    return this.castService.candidateTargets().map((character) => character.name);
  });

  /** Where a projectile is fired from: the selected piece, which is not among the targets. */
  readonly casterName = computed<string>(() => {
    this.uiSignalService.targetChange();
    this.selectionSignalService.selectedObject();
    this.objectChange.collectionOf('character')();
    const targets = this.castService.candidateTargets();
    return this.castService.resolveCaster(targets)?.name ?? '';
  });

  /** An effect left standing, which stays on the board unless it can be taken away. */
  readonly fields = computed<EffectField[]>(() => this.fieldService.fields());

  readonly lastFired = signal('');
  readonly notice = signal('');

  /** What is being aimed at, in the order it was chosen. */
  readonly isPicking = computed<boolean>(() => this.targeting.isPicking());
  readonly pickingName = computed<string>(() => this.targeting.preset()?.name ?? '');
  readonly pickLimit = computed<number>(() => this.targeting.limit());

  readonly pickedNames = computed<string[]>(() => this.targeting.marks().map((mark) => this.nameOf(mark.identifier)));

  protected isPickingPreset(preset: EffectPreset): boolean {
    return this.targeting.preset()?.identifier === preset.identifier;
  }

  private nameOf(identifier: string): string {
    const character = this.objectStore.get<GameCharacter>(identifier);
    return character instanceof GameCharacter ? character.name : '';
  }

  private readonly storage = typeof localStorage === 'undefined' ? null : localStorage;
  private readonly recentIdentifiers = signal<string[]>(readRecentEffects(this.storage));

  /** What was used last, kept at the front whatever the list is narrowed to. */
  readonly recent = computed<EffectPreset[]>(() => {
    const presets = this.library.presets();
    return this.recentIdentifiers()
      .map((identifier) => presets.find((preset) => preset.identifier === identifier))
      .filter((preset): preset is EffectPreset => preset != null)
      .slice(0, 6);
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.effect.panelTitle')));
  }

  /** The mark on the list, drawn from the shape of the effect. */
  protected glyphOf(preset: EffectPreset): string {
    return kindGlyphSvg(preset.effectKind, { core: preset.colorPrimary, edge: preset.colorSecondary });
  }

  protected swatchStyle(preset: EffectPreset): string {
    return `linear-gradient(135deg, ${preset.colorPrimary}, ${preset.colorSecondary})`;
  }

  protected gradeLabel(grade: number): string {
    return this.t(`feature.effect.grade${grade}`);
  }

  /** It tells at a glance what takes one target from what takes several. */
  protected isMulti(preset: EffectPreset): boolean {
    return isMultiTarget(preset);
  }

  protected targetIcon(preset: EffectPreset): string {
    if (preset.effectTargeting === 'self') return 'self_improvement';
    return isMultiTarget(preset) ? 'groups' : 'person';
  }

  protected toggleTargeting(value: TargetingFilter): void {
    this.targetingFilter.update((current) => (current === value ? null : value));
  }

  protected targetLabel(preset: EffectPreset): string {
    if (preset.effectTargeting === 'self') return this.t('feature.effect.targetSelf');
    if (preset.targetLimit <= 1) return this.t('feature.effect.targetSingle');
    return this.t('feature.effect.targetMulti', { count: preset.targetLimit });
  }

  /** The families folded away; there are many, so the ones not in use can be closed. */
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  protected isCollapsed(tag: string): boolean {
    return this.collapsed().has(tag);
  }

  protected toggleGroup(tag: string): void {
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }

  protected toggleTag(tag: string): void {
    this.tagFilter.update((current) => (current === tag ? null : tag));
  }

  protected toggleGrade(grade: number): void {
    this.gradeFilter.update((current) => (current === grade ? null : grade));
  }

  protected clearFilters(): void {
    this.query.set('');
    this.tagFilter.set(null);
    this.gradeFilter.set(null);
    this.targetingFilter.set(null);
  }

  /**
   * Choosing from the list. Something cast on yourself fires at once; anything else goes to choosing targets.
   * Choosing the same one again while aiming calls it off. A guest, who shows nothing on anybody's
   * table, casts nothing.
   */
  protected fire(preset: EffectPreset): void {
    this.notice.set('');
    if (!this.rolePermission.canEditTabletop) return;
    if (this.targeting.preset()?.identifier === preset.identifier) {
      this.targeting.cancel();
      return;
    }

    if (preset.effectTargeting === 'self') {
      const targets = this.castService.resolveTargets(preset);
      if (targets.length < 1) {
        // Nothing happening in silence looks the same as something being broken.
        this.lastFired.set('');
        this.notice.set(this.t('feature.effect.previewNoTarget'));
        return;
      }
      this.castService.fire(preset, targets);
      this.reportFired(
        preset,
        targets.map((target) => target.name)
      );
      return;
    }

    this.targeting.begin(preset);
    this.recentIdentifiers.set(pushRecentEffect(this.storage, preset.identifier));
  }

  protected confirmTargets(): void {
    if (!this.rolePermission.canEditTabletop) return;
    const preset = this.targeting.preset();
    const names = this.pickedNames();
    if (!preset || !this.targeting.confirm()) return;
    this.reportFired(preset, names);
  }

  protected cancelTargets(): void {
    this.targeting.cancel();
  }

  private reportFired(preset: EffectPreset, names: readonly string[]): void {
    this.lastFired.set(names.join('、'));
    this.recentIdentifiers.set(pushRecentEffect(this.storage, preset.identifier));
  }

  /** Makes a blank one and opens it for editing. */
  protected createPreset(): void {
    const preset = this.library.create(this.t('feature.effect.newPresetName'));
    this.openEditor(preset);
  }

  protected duplicatePreset(preset: EffectPreset): void {
    this.openEditor(this.library.duplicate(preset));
  }

  protected removePreset(preset: EffectPreset): void {
    void this.confirm
      .ask({
        message: this.t('feature.effect.removeConfirm', { name: preset.name }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.library.remove(preset);
      });
  }

  /** Hands the effect to the hotbar, which finds it a free slot and comes out to show it. */
  private addToHotbar(preset: EffectPreset): void {
    const draft = emptyHotbarSlotDraft('effect');
    draft.value = preset.name;
    draft.valueName = preset.name;
    this.hotbarFill.fill(draft);
  }

  protected openEditor(preset: EffectPreset): void {
    const editor = this.panelService.open(EffectPresetEditorComponent, {
      width: 360,
      height: 560,
      left: 520,
      top: 80,
      title: this.t('feature.effect.editorTitle'),
    });
    editor.presetIdentifier.set(preset.identifier);
  }

  /** The right click on a tile, where the editing lives so it does not clutter the list. */
  protected openPresetMenu(preset: EffectPreset, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      { x: event.clientX, y: event.clientY },
      buildEffectLibraryContextMenu(
        preset,
        {
          onEdit: () => this.openEditor(preset),
          onDuplicate: () => this.duplicatePreset(preset),
          onPreview: () => this.previewPreset(preset),
          onInsertToken: () => this.insertToken(preset),
          onPlaceField: () => this.placeField(preset),
          onAddToHotbar: () => this.addToHotbar(preset),
          onExport: () => this.exportPreset(preset),
          onRemove: () => this.removePreset(preset),
        },
        this.t
      ),
      preset.name
    );
  }

  /** Puts a token into the chat box that can be pasted onto a palette row. */
  protected insertToken(preset: EffectPreset): void {
    this.uiSignalService.requestChatInputText(buildEffectChatToken(preset.name));
    this.notice.set(this.t('feature.effect.tokenInserted'));
  }

  /** Leaves a standing effect where the selected piece is. */
  protected placeField(preset: EffectPreset): void {
    const [anchor] = this.castService.candidateTargets();
    if (!anchor) {
      this.notice.set(this.t('feature.effect.previewNoTarget'));
      return;
    }
    this.fieldService.place(preset, anchor.location.x, anchor.location.y, anchor.posZ);
    this.notice.set(this.t('feature.effect.fieldPlaced', { name: preset.name }));
  }

  protected removeField(field: EffectField): void {
    this.fieldService.remove(field);
  }

  protected fieldName(field: EffectField): string {
    return this.fieldService.presetOf(field)?.name ?? '';
  }

  protected previewPreset(preset: EffectPreset): void {
    if (this.castService.preview(preset)) return;
    this.notice.set(this.t('feature.effect.previewNoTarget'));
  }

  /** Whether a change of health plays an effect by itself. It is a setting of this screen alone, so it takes effect at once. */
  readonly autoPlayEnabled = computed<boolean>(() => this.autoPlay.enabled());

  protected toggleAutoPlay(): void {
    this.autoPlay.toggle();
  }

  /**
   * Hands on one effect rather than the shelf.
   *
   * It is written in the same form as the shelf is, so it is read back the same way: by
   * dropping it onto the table, where it lands on itself — the file carries the effect's
   * identifier, so what comes back is the effect that left.
   */
  protected exportPreset(preset: EffectPreset): void {
    void this.saveDataService.saveGameObjectAsync(EffectPresetSet.of([preset]), `effect_${preset.name}`);
    this.notice.set(this.t('feature.effect.exported'));
  }

  /** Exports the effect library alone, so the effects can be handed on without the room. */
  protected exportLibrary(): void {
    void this.saveDataService.saveGameObjectAsync(new EffectPresetSet(), 'effect_library');
    this.notice.set(this.t('feature.effect.exported'));
  }

  protected restoreDefaults(): void {
    const { added, updated } = this.library.restoreDefaults();
    this.notice.set(this.t('feature.effect.restored', { added, updated }));
  }
}
