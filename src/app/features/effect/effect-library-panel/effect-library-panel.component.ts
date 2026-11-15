import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { browserLocalStorage } from '@axe/core/storage/local-preference';
import { ObjectStore } from '@axe/core/sync/object-store';
import { joinList } from '@axe/core/util/join-list';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildEffectChatToken } from '@axe/domain/effect/effect-chat-token';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { kindGlyphSvg } from '@axe/domain/effect/effect-shapes';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { buildEffectLibraryContextMenu } from '@axe/features/effect/effect-library-panel/effect-library-context-menu';
import {
  collectTags,
  EffectLibraryGroup,
  filterPresets,
  groupPresets,
  isMultiTarget,
  TargetingFilter,
} from '@axe/features/effect/effect-library-panel/effect-library-list';
import { movesBetweenTiles, tileAfterKey } from '@axe/features/effect/effect-library-panel/effect-tile-keys';
import { pushRecentEffect, readRecentEffects } from '@axe/features/effect/effect-library-panel/recent-effects';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { EffectPreviewComponent } from '@axe/features/effect/effect-preview/effect-preview.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const GRADE_LEVELS: readonly number[] = [1, 2, 3];
/** How long the pointer or the keyboard's focus rests on a tile before its effect is previewed, in milliseconds. */
export const EFFECT_TILE_PREVIEW_DELAY_MS = 200;

/** A piece named in the row of targets. */
interface TargetChip {
  readonly identifier: string;
  readonly name: string;
}

/**
 * The list of effects, and the box an effect chosen from it is held ready in until it is cast.
 *
 * The box holds the one preview of the panel, which plays the effect held ready, and with none held
 * the effect of the tile the pointer or the keyboard's focus has rested on. The preview is made the
 * first time there is something to play and goes with the panel. The tiles are one stop for the Tab
 * key, moved among by the arrows.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'effect-library-panel',
  templateUrl: './effect-library-panel.component.html',
  imports: [EffectPreviewComponent, FormsModule, NgTemplateOutlet, SafePipe, TranslocoModule],
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
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly vision = inject(VisionService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly confirm = inject(ConfirmService);
  private readonly names = inject(PieceNameService);
  private readonly viewport = inject(ViewportService);

  protected readonly gradeLevels = GRADE_LEVELS;

  readonly query = signal('');
  readonly tagFilter = signal<string | null>(null);
  readonly gradeFilter = signal<number | null>(null);
  readonly targetingFilter = signal<TargetingFilter | null>(null);

  readonly tags = computed<string[]>(() => collectTags(this.library.presets()));

  readonly isGameMaster = computed<boolean>(() => this.rolePermission.isGameMaster());

  readonly groups = computed<EffectLibraryGroup[]>(() =>
    groupPresets(
      filterPresets(
        this.library.presets(),
        this.query(),
        this.tagFilter(),
        this.gradeFilter(),
        this.targetingFilter(),
        this.isGameMaster()
      ),
      this.language.currentLang()
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

  /**
   * The pieces named in the row of targets, in order: the ones picked while an effect is held ready,
   * and before that the ones already aimed at, which an effect chosen now would start with.
   */
  readonly targetChips = computed<TargetChip[]>(() => {
    const identifiers = this.targeting.isPicking()
      ? [...this.targeting.pickOrder().keys()]
      : this.pieceTarget
          .onTable()
          .filter((piece) => this.vision.isTokenVisible(piece))
          .map((piece) => piece.identifier);
    return identifiers.map((identifier) => ({ identifier, name: this.nameOf(identifier) }));
  });

  /**
   * The name of the piece the effect is cast from: the one fixed when the effect was held ready, which
   * picking targets does not change, and before that the selected piece, which an effect chosen now
   * would be cast from. Empty for none.
   */
  readonly casterName = computed<string>(() => {
    const identifier = this.targeting.isPicking()
      ? this.targeting.casterIdentifier()
      : this.targeting.upcomingCasterIdentifier();
    if (identifier.length < 1) return '';
    this.objectChange.versionOf(identifier)();
    return this.nameOf(identifier);
  });

  /** Whether the next piece pressed on the table is taken as the caster. */
  readonly isChangingCaster = computed<boolean>(() => this.targeting.isChangingCaster());

  /** Whether the effect held ready has a caster to take away. */
  readonly hasCaster = computed<boolean>(() => this.targeting.casterIdentifier().length > 0);

  /** An effect left standing, which stays on the board unless it can be taken away. */
  readonly fields = computed<EffectField[]>(() => this.fieldService.fields());

  readonly lastFired = signal('');
  readonly notice = signal('');

  /** What the one line of notices says: the latest notice, or else whom the last cast was at; empty for neither. */
  readonly noticeLine = computed<string>(() => {
    if (this.notice().length > 0) return this.notice();
    return this.lastFired().length > 0 ? this.t('feature.effect.fired', { names: this.lastFired() }) : '';
  });

  /** What is being aimed at, in the order it was chosen. */
  readonly isPicking = computed<boolean>(() => this.targeting.isPicking());
  readonly pickingName = computed<string>(() => this.targeting.preset()?.name ?? '');
  readonly pickLimit = computed<number>(() => this.targeting.limit());

  /** The names of the pieces picked that this reader is shown, in the order picked, a part picked with its body among them. */
  readonly pickedNames = computed<string[]>(() =>
    [...this.targeting.pickOrder().keys()].map((identifier) => this.nameOf(identifier))
  );

  /** Whether the effect held ready has a target to be cast at. */
  readonly canFire = computed<boolean>(() => this.isPicking() && this.pickedNames().length > 0);

  protected isPickingPreset(preset: EffectPreset): boolean {
    return this.targeting.preset()?.identifier === preset.identifier;
  }

  /** The name of the piece under an identifier as this reader may be told it; see {@link shownName}. */
  private nameOf(identifier: string): string {
    const character = this.objectStore.get<GameCharacter>(identifier);
    return character instanceof GameCharacter ? this.shownName(character) : '';
  }

  /** A piece's name as this reader may be told it: one whose name is kept from them goes unnamed. */
  private shownName(character: GameCharacter): string {
    return this.names.shown(character);
  }

  private readonly storage = browserLocalStorage();
  private readonly recentIdentifiers = signal<string[]>(readRecentEffects(this.storage));

  /** What was used last, kept at the front whatever the list is narrowed to. */
  readonly recent = computed<EffectPreset[]>(() => {
    const presets = this.library.presets();
    return this.recentIdentifiers()
      .map((identifier) => presets.find((preset) => preset.identifier === identifier))
      .filter((preset): preset is EffectPreset => preset != null)
      .slice(0, 6);
  });

  /** The effect of the tile the pointer or the keyboard's focus has rested on, or null for none. */
  private readonly pointed = signal<EffectPreset | null>(null);
  private pointTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The effect the preview plays: the one held ready, and with none held the one of the tile pointed
   * at, where the main pointer can hover. Null for nothing to play.
   */
  readonly previewed = computed<EffectPreset | null>(() => {
    const held = this.targeting.preset();
    if (held) return held;
    const pointed = this.pointed();
    if (!pointed || !this.viewport.canHover()) return null;
    return this.library.presets().includes(pointed) ? pointed : null;
  });

  /** How often the values of the effect previewed have changed, as one being edited meanwhile does. */
  readonly previewVersion = computed<number>(() => {
    const preset = this.previewed();
    return preset ? this.objectChange.versionOf(preset.identifier)() : 0;
  });

  /** Whether the preview is made, which it is from the first time there is an effect for it to play. */
  readonly previewMade = linkedSignal<boolean, boolean>({
    source: () => this.previewed() != null,
    computation: (wanted, previous) => wanted || previous?.value === true,
  });

  /** The tile the Tab key stops at, as last focused; null before any was. */
  private readonly tabStop = signal<string | null>(null);

  /** The keys of the tiles drawn, in the order they are read. */
  private readonly tileKeys = computed<string[]>(() => {
    const keys = this.hasFilter() ? [] : this.recent().map((preset) => this.recentKey(preset));
    for (const group of this.groups()) {
      if (this.collapsed().has(group.tag)) continue;
      for (const preset of group.presets) keys.push(this.groupKey(group.tag, preset));
    }
    return keys;
  });

  /** The key of the one tile the Tab key stops at: the tile last focused while it is drawn, and else the first. */
  protected readonly tabStopKey = computed<string>(() => {
    const keys = this.tileKeys();
    const held = this.tabStop();
    return held != null && keys.includes(held) ? held : (keys[0] ?? '');
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.effect.panelTitle')));
    const toldBefore = untracked(this.targeting.lastConfirmed);
    effect(() => {
      const told = this.targeting.lastConfirmed();
      if (!told || told === toldBefore) return;
      untracked(() =>
        this.reportFired(
          told.preset,
          told.shown.map((identifier) => this.nameOf(identifier))
        )
      );
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pointTimer));
  }

  /** The key of an effect's tile among those used last. */
  protected recentKey(preset: EffectPreset): string {
    return `recent/${preset.identifier}`;
  }

  /** The key of an effect's tile in its family. */
  protected groupKey(tag: string, preset: EffectPreset): string {
    return `family:${tag}/${preset.identifier}`;
  }

  /** Has the preview play a tile's effect once the pointer or the focus has rested on it a moment. */
  protected pointAt(preset: EffectPreset): void {
    clearTimeout(this.pointTimer);
    this.pointTimer = setTimeout(() => this.pointed.set(preset), EFFECT_TILE_PREVIEW_DELAY_MS);
  }

  /** Stops previewing a tile's effect as the pointer or the focus leaves it. */
  protected pointAway(preset: EffectPreset): void {
    clearTimeout(this.pointTimer);
    if (untracked(this.pointed) === preset) this.pointed.set(null);
  }

  /** Makes the tile focused the one the Tab key stops at, and previews its effect as a pointer over it would. */
  protected focusTile(preset: EffectPreset, key: string): void {
    this.tabStop.set(key);
    this.pointAt(preset);
  }

  /**
   * Enter on a tile holds its effect ready, as Space and a click do, and is kept from the table, which
   * would cast at the same press. On the tile of the effect already held ready it is left to the
   * table, so that Enter casts wherever the focus was left.
   */
  protected enterOnTile(preset: EffectPreset, event: Event): void {
    if (this.isPickingPreset(preset)) return;
    event.preventDefault();
    event.stopPropagation();
    this.choose(preset);
  }

  /** Moves the focus from one tile to another by the arrows, Home and End, keeping the key from the table. */
  protected moveAmongTiles(event: KeyboardEvent): void {
    if (!movesBetweenTiles(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = event.currentTarget;
    const from = event.target instanceof Element ? event.target.closest('[data-effect-tile]') : null;
    if (!(list instanceof HTMLElement) || !from) return;

    const tiles = Array.from(list.querySelectorAll<HTMLElement>('[data-effect-tile]'));
    const boxes = tiles.map((tile) => tile.getBoundingClientRect());
    event.preventDefault();
    event.stopPropagation();
    tiles[tileAfterKey(boxes, tiles.indexOf(from as HTMLElement), event.key)]?.focus();
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
   * Choosing from the list, which holds the effect ready and casts nothing, one cast on yourself too:
   * casting is left to the button and the Enter key. Choosing the same one again while aiming calls it
   * off. A guest, who shows nothing on anybody's table, holds nothing ready.
   */
  protected choose(preset: EffectPreset): void {
    this.notice.set('');
    if (!this.rolePermission.canEditTabletop()) return;
    if (this.targeting.preset()?.identifier === preset.identifier) {
      this.targeting.cancel();
      return;
    }

    this.targeting.begin(preset);
    this.recentIdentifiers.set(pushRecentEffect(this.storage, preset.identifier));
  }

  /** Casts the effect held ready. Whom it was cast at is said on the line of notices, as for a cast confirmed anywhere. */
  protected confirmTargets(): void {
    if (!this.rolePermission.canEditTabletop()) return;
    this.targeting.confirm();
  }

  protected cancelTargets(): void {
    this.targeting.cancel();
  }

  /** Waits for a piece pressed on the table to take it as the caster, or stops waiting when pressed again. */
  protected toggleCasterChange(): void {
    this.targeting.changeCaster(!this.targeting.isChangingCaster());
  }

  /** Casts the effect held ready from no piece. */
  protected clearCaster(): void {
    this.targeting.setCaster('');
  }

  /** Puts a notice on the line of notices in place of whatever it said. */
  private say(text: string): void {
    this.lastFired.set('');
    this.notice.set(text);
  }

  private reportFired(preset: EffectPreset, names: readonly string[]): void {
    this.notice.set('');
    this.lastFired.set(joinList(names, this.language.currentLang()));
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
    this.say(this.t('feature.effect.tokenInserted'));
  }

  /** Leaves a standing effect where the selected piece is. */
  protected placeField(preset: EffectPreset): void {
    const [anchor] = this.castService.candidateTargets();
    if (!anchor) {
      this.say(this.t('feature.effect.previewNoTarget'));
      return;
    }
    this.fieldService.place(preset, anchor.location.x, anchor.location.y, anchor.posZ);
    this.say(this.t('feature.effect.fieldPlaced', { name: preset.name }));
  }

  protected removeField(field: EffectField): void {
    this.fieldService.remove(field);
  }

  protected fieldName(field: EffectField): string {
    return this.fieldService.presetOf(field)?.name ?? '';
  }

  protected previewPreset(preset: EffectPreset): void {
    if (this.castService.preview(preset)) return;
    this.say(this.t('feature.effect.previewNoTarget'));
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
    this.say(this.t('feature.effect.exported'));
  }

  /** Exports the effect library alone, so the effects can be handed on without the room. */
  protected exportLibrary(): void {
    void this.saveDataService.saveGameObjectAsync(new EffectPresetSet(), 'effect_library');
    this.say(this.t('feature.effect.exported'));
  }

  protected restoreDefaults(): void {
    const { added, updated } = this.library.restoreDefaults();
    this.say(this.t('feature.effect.restored', { added, updated }));
  }

  /** Whether this reader may add the defaults the room lacks, which every role but a guest may. */
  protected readonly canAddMissingDefaults = computed<boolean>(() => this.rolePermission.canEditTabletop());

  /**
   * Adds the defaults this room does not have, touching none that exist, and says how many on
   * the line of notices. A guest, who changes nothing in the room, adds none.
   */
  protected addMissingDefaults(): void {
    if (!this.rolePermission.canEditTabletop()) return;
    const count = this.library.addMissingDefaults();
    this.say(count > 0 ? this.t('feature.effect.missingAdded', { count }) : this.t('feature.effect.noneMissing'));
  }
}
