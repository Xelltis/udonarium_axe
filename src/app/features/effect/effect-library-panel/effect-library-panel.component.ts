import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { EFFECT_LIBRARY_SIZE, writeEffectLibrarySize } from '@axe/application/effect/effect-library-size';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { browserLocalStorage } from '@axe/core/storage/local-preference';
import { ObjectStore } from '@axe/core/sync/object-store';
import { joinList } from '@axe/core/util/join-list';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildEffectChatToken } from '@axe/domain/effect/effect-chat-token';
import { effectFamilyColor } from '@axe/domain/effect/effect-families';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset, presetsShownTo } from '@axe/domain/effect/effect-preset';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { presetGlyphSvg } from '@axe/domain/effect/effect-shapes';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { buildEffectLibraryContextMenu } from '@axe/features/effect/effect-library-panel/effect-library-context-menu';
import {
  EffectFamilyEntry,
  EffectLibraryGroup,
  EffectReach,
  familyAtScroll,
  familyIndex,
  filterPresets,
  groupPresets,
  ReachFilter,
  reachOf,
  tailSpaceFor,
} from '@axe/features/effect/effect-library-panel/effect-library-list';
import { HighlightPart, highlightParts, searchTextOf } from '@axe/features/effect/effect-library-panel/effect-search';
import {
  movesAlongColumn,
  movesBetweenTiles,
  rowAfterKey,
  tileAfterKey,
} from '@axe/features/effect/effect-library-panel/effect-tile-keys';
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

/** A reach the list can be narrowed to, as its button shows it. */
interface ReachChoice {
  readonly value: ReachFilter;
  readonly icon: string;
  readonly label: string;
}

const REACH_CHOICES: readonly ReachChoice[] = [
  { value: 'single', icon: 'person', label: 'feature.effect.targetSingle' },
  { value: 'multi', icon: 'groups', label: 'feature.effect.reachSeveral' },
  { value: 'area', icon: 'blur_circular', label: 'feature.effect.reachAreaName' },
];

const REACH_ICONS: Readonly<Record<EffectReach, string>> = {
  self: 'self_improvement',
  single: 'person',
  multi: 'groups',
  area: 'blur_circular',
};

/** What of an effect its row is drawn and found by, whatever is being searched for. */
interface EffectFacts {
  readonly glyph: string;
  readonly kindName: string;
  readonly reach: EffectReach;
  readonly reachIcon: string;
  readonly reachLabel: string;
  readonly stars: string;
  readonly blanks: string;
  readonly summary: string;
  readonly searchText: string;
}

/** One row of the list: an effect's mark, name, grade, reach and kind, with what was searched for marked. */
interface EffectRow extends EffectFacts {
  readonly name: HighlightPart[];
  readonly kind: HighlightPart[];
}

/** What the menu of the list does, by name. */
type LibraryCommand =
  'restoreDefaults' | 'addMissingDefaults' | 'exportLibrary' | 'toggleAutoPlay' | 'collapseAll' | 'expandAll';

/** How far right of the list an effect's editor opens, so that neither covers the other where the window is wide enough. */
const EDITOR_GAP = 8;

/**
 * The list of effects, and the box an effect chosen from it is held ready in until it is cast.
 *
 * The list stands beside an index of its families, each with its colour and how many of its effects
 * the list shows; pressing a family brings its heading to the top of the list, which is narrowed by
 * the search, the grade and the reach alone. The box holds the one preview of the panel, which plays
 * the effect held ready, and with none held the effect of the row the pointer or the keyboard's
 * focus has rested on. The preview is made the first time there is something to play and goes with
 * the panel. The rows are one stop for the Tab key, moved among by the arrows, and so is the index.
 * The size the reader leaves the panel at is kept in this browser for the next time it is opened.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'effect-library-panel',
  templateUrl: './effect-library-panel.component.html',
  imports: [EffectPreviewComponent, FormsModule, NgTemplateOutlet, SafePipe, TranslocoModule],
  host: { '(document:pointerdown)': 'closeMenuFrom($event)' },
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
  private readonly theme = inject(ThemeService);
  private readonly guide = inject(ButtonGuideService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly gradeLevels = GRADE_LEVELS;
  protected readonly reachChoices = REACH_CHOICES;

  readonly query = signal('');
  readonly gradeFilter = signal<number | null>(null);
  readonly reachFilter = signal<ReachFilter | null>(null);

  /** What is searched for, without the blanks around it; empty for no search. */
  protected readonly searched = computed<string>(() => this.query().trim());

  readonly isGameMaster = computed<boolean>(() => this.rolePermission.isGameMaster());

  /** Whether the screen is a narrow one, where the grade and the reach are chosen from two lists rather than rows of buttons. */
  protected readonly isCompact = computed<boolean>(() => this.viewport.isCompact());

  /** Whether the name of every button is being written out, as the question mark key asks. */
  protected readonly guideShown = computed<boolean>(() => this.guide.shown());

  /** What each effect's row is drawn and found by, in the reader's language. */
  private readonly facts = computed<Map<EffectPreset, EffectFacts>>(() => {
    this.language.currentLang();
    return new Map(this.library.presets().map((preset) => [preset, this.factsOf(preset)]));
  });

  readonly groups = computed<EffectLibraryGroup[]>(() => {
    const facts = this.facts();
    return groupPresets(
      filterPresets(this.library.presets(), {
        query: this.query(),
        grade: this.gradeFilter(),
        reach: this.reachFilter(),
        isGameMaster: this.isGameMaster(),
        searchText: (preset) => facts.get(preset)?.searchText ?? '',
      }),
      this.language.currentLang()
    );
  });

  /** The index beside the list: every family the reader is shown an effect of, with how many the list shows now. */
  readonly families = computed<EffectFamilyEntry[]>(() =>
    familyIndex(presetsShownTo(this.library.presets(), this.isGameMaster()), this.groups(), this.language.currentLang())
  );

  /** The rows of the list, with what is searched for marked in each name and kind. */
  private readonly rows = computed<Map<EffectPreset, EffectRow>>(() => {
    const query = this.query();
    return new Map(
      [...this.facts()].map(([preset, facts]) => [
        preset,
        { ...facts, name: highlightParts(preset.name, query), kind: highlightParts(facts.kindName, query) },
      ])
    );
  });

  readonly matchCount = computed<number>(() => this.groups().reduce((total, group) => total + group.presets.length, 0));

  readonly hasFilter = computed<boolean>(
    () => this.searched().length > 0 || this.gradeFilter() != null || this.reachFilter() != null
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

  /** The effects left standing this seat is shown, which stay on the board unless they are taken away. */
  readonly fields = computed<EffectField[]>(() => this.fieldService.shownFields());

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
    effect(() => {
      this.groups();
      untracked(() => afterNextRender(() => this.followShownFamilies(), { injector: this.injector }));
    });
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.pointTimer));
    this.panelService.resized$.subscribe((size) => writeEffectLibrarySize(this.storage, size), destroyRef);
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

  /** The row of an effect on the list. */
  protected rowOf(preset: EffectPreset): EffectRow {
    return this.rows().get(preset) ?? { ...this.factsOf(preset), name: [{ text: preset.name, hit: false }], kind: [] };
  }

  private factsOf(preset: EffectPreset): EffectFacts {
    const kindName = this.t(`feature.effect.kinds.${preset.effectKind}`);
    const gradeName = this.gradeLabel(preset.gradeLevel);
    const reach = reachOf(preset);
    const reachLabel = this.reachLabel(preset, reach);
    return {
      glyph: presetGlyphSvg(preset),
      kindName,
      reach,
      reachIcon: REACH_ICONS[reach],
      reachLabel,
      stars: '★'.repeat(preset.gradeLevel),
      blanks: '★'.repeat(3 - preset.gradeLevel),
      summary: `${preset.name} — ${gradeName} / ${reachLabel} / ${kindName}`,
      searchText: searchTextOf([
        preset.name,
        this.familyLabel(preset.tagName.trim()),
        kindName,
        gradeName,
        reachLabel,
        reach === 'multi' ? this.t('feature.effect.reachSeveral') : '',
      ]),
    };
  }

  protected gradeLabel(grade: number): string {
    return this.t(`feature.effect.grade${grade}`);
  }

  /** Whom an effect reaches, in words: its caster, one piece, up to so many, or everything within so many cells. */
  private reachLabel(preset: EffectPreset, reach: EffectReach): string {
    switch (reach) {
      case 'self':
        return this.t('feature.effect.targetSelf');
      case 'single':
        return this.t('feature.effect.targetSingle');
      case 'area':
        return this.t('feature.effect.reachArea', { cells: preset.areaRadiusCells });
      case 'multi':
        return this.t('feature.effect.reachUpTo', { count: preset.targetLimit });
    }
  }

  /** A family's name as the list shows it, the effects of no family under a name of their own. */
  protected familyLabel(tag: string): string {
    return tag.length > 0 ? tag : this.t('feature.effect.untagged');
  }

  /** The colour a family is marked with, in the index and on its heading, as the theme on screen takes it. */
  protected familyColor(tag: string): string {
    return effectFamilyColor(tag)[this.theme.resolved()];
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

  /** Folds every family away, leaving the headings to read down. */
  protected collapseAll(): void {
    this.collapsed.set(new Set(this.families().map((entry) => entry.tag)));
  }

  /** Opens every family again. */
  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  protected clearFilters(): void {
    this.query.set('');
    this.gradeFilter.set(null);
    this.reachFilter.set(null);
  }

  /** The family whose heading the list was last brought to or scrolled to; null before either. */
  private readonly stoodAt = signal<string | null>(null);

  /**
   * The family the index marks as the one the list stands at: the one last scrolled or brought to
   * while the list still shows an effect of it, and else the first it shows one of.
   */
  protected readonly shownFamily = computed<string | null>(() => {
    const listed = this.groups();
    const at = this.stoodAt();
    return at !== null && listed.some((group) => group.tag === at) ? at : (listed[0]?.tag ?? null);
  });

  /** The row of the index the Tab key stops at: the family the list stands at, and else the first. */
  protected readonly indexStop = computed<string | null>(() => this.shownFamily() ?? this.families()[0]?.tag ?? null);

  /**
   * The blank left under the list so that the heading of the family last brought to could reach the
   * top of it; taken away as soon as the list shows something else.
   */
  protected readonly tailSpace = linkedSignal<EffectLibraryGroup[], number>({
    source: this.groups,
    computation: () => 0,
  });

  /** Marks in the index the family whose heading has reached the top of the list as it is scrolled. */
  protected followScroll(): void {
    const list = this.list()?.nativeElement;
    if (!list) return;
    const tops = Array.from(list.querySelectorAll<HTMLElement>('[data-family-section]')).map((section) => ({
      tag: section.dataset['familySection'] ?? '',
      top: section.offsetTop,
    }));
    const at = familyAtScroll(tops, list.scrollTop);
    if (at !== null) this.stoodAt.set(at);
  }

  /**
   * Marks in the index the family at the top of the list once the list shows other families, which
   * moves what stands at the top without a scroll. A list not laid out tells nothing of where it
   * stands, and is left alone.
   */
  private followShownFamilies(): void {
    if ((this.list()?.nativeElement.clientHeight ?? 0) > 0) this.followScroll();
  }

  /**
   * Brings a family's heading to the top of the list, opening the family where it was folded away.
   * The list is not narrowed by it. A family the list shows nothing of is left alone.
   */
  protected jumpToFamily(tag: string): void {
    if (!this.groups().some((group) => group.tag === tag)) return;
    this.collapsed.update((current) => {
      if (!current.has(tag)) return current;
      const next = new Set(current);
      next.delete(tag);
      return next;
    });
    this.stoodAt.set(tag);

    afterNextRender(
      () => {
        const list = this.list()?.nativeElement;
        const section = list ? this.sectionOf(list, tag) : null;
        if (!list || !section) return;
        const natural = list.scrollHeight - untracked(this.tailSpace);
        this.tailSpace.set(tailSpaceFor(natural, list.clientHeight, section.offsetTop));
        afterNextRender(
          () => {
            list.scrollTop = this.sectionOf(list, tag)?.offsetTop ?? list.scrollTop;
          },
          { injector: this.injector }
        );
      },
      { injector: this.injector }
    );
  }

  private sectionOf(list: HTMLElement, tag: string): HTMLElement | null {
    return (
      Array.from(list.querySelectorAll<HTMLElement>('[data-family-section]')).find(
        (section) => section.dataset['familySection'] === tag
      ) ?? null
    );
  }

  /** Moves the focus from one family of the index to another by the up and down arrows, Home and End, keeping the key from the table. */
  protected moveAlongIndex(event: KeyboardEvent): void {
    if (!movesAlongColumn(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    this.moveFocusAlong(event, '[data-family-entry]');
  }

  /** Moves the focus along the buttons of a column that match a selector, as {@link rowAfterKey} has the key go. */
  private moveFocusAlong(event: KeyboardEvent, selector: string): void {
    const column = event.currentTarget;
    const from = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!(column instanceof HTMLElement) || !from) return;
    const rows = Array.from(column.querySelectorAll<HTMLElement>(selector));
    event.preventDefault();
    event.stopPropagation();
    rows[rowAfterKey(rows.length, rows.indexOf(from as HTMLElement), event.key)]?.focus();
  }

  /** Whether the menu of the list is open. */
  protected readonly menuOpen = signal(false);

  /** Opens the menu of the list with the focus on its first item, or closes it. */
  protected toggleMenu(): void {
    const open = !this.menuOpen();
    this.menuOpen.set(open);
    if (!open) return;
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[role="menu"] button:not(:disabled)')?.focus(),
      { injector: this.injector }
    );
  }

  /** Closes the menu of the list at a press anywhere but on the menu and its button. */
  protected closeMenuFrom(event: Event): void {
    if (!untracked(this.menuOpen)) return;
    if (event.target instanceof Element && event.target.closest('[data-effect-menu]')) return;
    this.menuOpen.set(false);
  }

  /**
   * The keys of the open menu: the arrows, Home and End move among its items, and Escape closes it
   * and gives the focus back to its button. Escape is kept from the table, which would call off an
   * effect held ready at the same press.
   */
  protected moveInMenu(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.menuOpen.set(false);
      this.host.nativeElement.querySelector<HTMLElement>('[data-effect-menu] > button')?.focus();
      return;
    }
    if (!movesAlongColumn(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    this.moveFocusAlong(event, 'button:not(:disabled)');
  }

  /** Does what an item of the menu names. The menu closes, but for the setting ticked in it, which is seen to change. */
  protected runFromMenu(command: LibraryCommand): void {
    if (command !== 'toggleAutoPlay') this.menuOpen.set(false);
    switch (command) {
      case 'restoreDefaults':
        this.restoreDefaults();
        break;
      case 'addMissingDefaults':
        this.addMissingDefaults();
        break;
      case 'exportLibrary':
        this.exportLibrary();
        break;
      case 'toggleAutoPlay':
        this.toggleAutoPlay();
        break;
      case 'collapseAll':
        this.collapseAll();
        break;
      case 'expandAll':
        this.expandAll();
        break;
    }
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

  /**
   * Whether this reader may change the room's effects and the effects left standing on the table,
   * which every role but a guest may.
   */
  protected readonly canChangeRoom = computed<boolean>(() => this.rolePermission.canEditTabletop());

  /** Makes a blank one and opens it for editing. A guest, who changes nothing in the room, makes none. */
  protected createPreset(): void {
    if (!this.rolePermission.canEditTabletop()) return;
    const preset = this.library.create(this.t('feature.effect.newPresetName'));
    this.openEditor(preset);
  }

  /** Copies an effect and opens the copy for editing. A guest copies none. */
  protected duplicatePreset(preset: EffectPreset): void {
    if (!this.rolePermission.canEditTabletop()) return;
    this.openEditor(this.library.duplicate(preset));
  }

  /**
   * Deletes an effect from the room once the reader has agreed to it. A guest deletes none, one made
   * a guest while they were asked among them.
   */
  protected removePreset(preset: EffectPreset): void {
    if (!this.rolePermission.canEditTabletop()) return;
    void this.confirm
      .ask({
        message: this.t('feature.effect.removeConfirm', { name: preset.name }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok || !this.rolePermission.canEditTabletop()) return;
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

  /** Opens an effect for editing. Not for a guest, who changes nothing in the room. */
  protected openEditor(preset: EffectPreset): void {
    if (!this.rolePermission.canEditTabletop()) return;
    const editor = this.panelService.open(EffectPresetEditorComponent, {
      width: 360,
      height: 560,
      left: this.editorLeft(),
      top: 80,
      title: this.t('feature.effect.editorTitle'),
    });
    editor.presetIdentifier.set(preset.identifier);
  }

  /**
   * Where an effect's editor opens: just right of the list as it stands, and where the list has no
   * place on the screen, right of where it first opens. The panel service keeps it on the screen.
   */
  private editorLeft(): number {
    const box = this.host.nativeElement.getBoundingClientRect();
    return Math.round(box.width > 0 ? box.right + EDITOR_GAP : EFFECT_LIBRARY_SIZE.width + EDITOR_GAP);
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
        this.t,
        this.rolePermission.canEditTabletop()
      ),
      preset.name
    );
  }

  /** Puts a token into the chat box that can be pasted onto a palette row. */
  protected insertToken(preset: EffectPreset): void {
    this.uiSignalService.requestChatInputText(buildEffectChatToken(preset.name));
    this.say(this.t('feature.effect.tokenInserted'));
  }

  /** Leaves a standing effect where the selected piece is. A guest leaves none. */
  protected placeField(preset: EffectPreset): void {
    if (!this.rolePermission.canEditTabletop()) return;
    const [anchor] = this.castService.candidateTargets();
    if (!anchor) {
      this.say(this.t('feature.effect.previewNoTarget'));
      return;
    }
    this.fieldService.place(preset, anchor.location.x, anchor.location.y, anchor.posZ);
    this.say(this.t('feature.effect.fieldPlaced', { name: preset.name }));
  }

  /** Clears away an effect left standing on the table. A guest clears none. */
  protected removeField(field: EffectField): void {
    if (!this.rolePermission.canEditTabletop()) return;
    this.fieldService.remove(field);
  }

  /**
   * What an effect left standing is called in the list: the name of the effect it plays, what stands in
   * for a name kept from this seat where that effect is kept for the game master, and nothing where the
   * effect is gone from the room.
   */
  protected fieldName(field: EffectField): string {
    if (!this.fieldService.presetOf(field)) return '';
    return this.library.shownPreset(field.presetIdentifier)?.name ?? this.t('common.hiddenName');
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

  /**
   * Brings the room's default effects up to date and says how many were built and refreshed on the
   * line of notices. A guest, who changes nothing in the room, brings none.
   */
  protected restoreDefaults(): void {
    if (!this.rolePermission.canEditTabletop()) return;
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
