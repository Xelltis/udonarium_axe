import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { PieceResetService } from '@axe/application/character/piece-reset.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BuffRemovalCount, BuffRemovalRule, countBuffRemoval } from '@axe/domain/character/buff-bulk-removal';
import {
  BUFF_KINDS,
  type BuffKind,
  buffKindFrom,
  buffKindMarkPicked,
  buffKindOf,
  markBuffKind,
} from '@axe/domain/character/buff-kind';
import { describeBuffModifier, parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import {
  barColumns,
  BuffTimelineBar,
  BuffTimelineRow,
  timelineColumns,
  timelineSpan,
  toTimelineBars,
} from '@axe/domain/character/buff-timeline';
import {
  BUFF_EFFECT_TIMINGS,
  BUFF_TIMINGS,
  BuffEffectTiming,
  BuffTiming,
  writeBuffEffectTiming,
} from '@axe/domain/character/buff-timing';
import { buffTriggerOptions, selectedTriggerValue } from '@axe/domain/character/buff-trigger-options';
import { sheetItemsOf } from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { ResetCount } from '@axe/domain/character/piece-reset';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { STATUS_AILMENT_PANEL } from '@axe/domain/ui/room-panel';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const BUILDER_OPERATORS = ['+', '-', '='] as const;

/** One more status the built buff moves, beside the first. */
interface BuilderStatusRow {
  readonly status: string;
  readonly operator: string;
  readonly amount: string;
  readonly step: string;
  /** Whether the status stays where it is moved once the buff goes, as poison's damage does. */
  readonly keeps: boolean;
}
const COLUMN_WIDTH_MIN_PX = 16;
const COLUMN_WIDTH_MAX_PX = 112;
const COLUMN_WIDTH_STEP_PX = 12;
const COLUMN_WIDTH_DEFAULT_PX = 44;
const CHART_LABEL_WIDTH_PX = 176;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'buff-manager-panel',
  templateUrl: './buff-manager-panel.component.html',
  imports: [TextTooltipDirective, FormsModule, SafePipe, TranslocoModule],
})
export class BuffManagerPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly names = inject(PieceNameService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly panelService = inject(PanelService);

  constructor() {
    // Made a guest meanwhile, the seat may no longer write what this panel writes.
    closeWhenOffTheTable();
  }
  private readonly roomPanels = inject(RoomPanelService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);
  private readonly statusAilments = inject(StatusAilmentService);
  private readonly pieceReset = inject(PieceResetService);

  readonly timingChoices = BUFF_TIMINGS;
  readonly kindChoices = BUFF_KINDS;
  readonly effectTimingChoices = BUFF_EFFECT_TIMINGS;
  readonly operatorChoices = BUILDER_OPERATORS;

  readonly round = computed(() => Math.max(1, this.turnOrder.progress().round));

  readonly rows = computed<BuffTimelineRow[]>(() => {
    this.objectChange.collectionOf('character')();
    this.objectChange.collectionOf('data')();
    this.bumped();

    const rows: BuffTimelineRow[] = [];
    for (const character of this.inventory.tableInventory.tabletopObjects as GameCharacter[]) {
      this.objectChange.versionOf(character.identifier)();
      // A piece this reader cannot see on the table has no row: its name and buffs would give it away.
      if (!this.vision.mayBeListed(character)) continue;
      const bars = toTimelineBars(character.buffDataElement ?? null);
      if (bars.length < 1) continue;
      rows.push({
        characterIdentifier: character.identifier,
        characterName: this.names.shown(character),
        imageUrl: character.imageFile?.url ?? '',
        bars,
      });
    }
    return rows;
  });

  private readonly candidates = computed(() => {
    this.objectChange.collectionOf('character')();
    this.bumped();
    return (this.inventory.tableInventory.tabletopObjects as GameCharacter[])
      .filter((character) => this.vision.mayBeListed(character) && !this.names.isKept(character))
      .map((character) => ({ identifier: character.identifier, name: character.name }));
  });

  readonly span = computed(() => timelineSpan(this.rows()));
  readonly columns = computed(() => timelineColumns(this.round(), this.span()));

  readonly buffCount = computed(() => this.rows().reduce((total, row) => total + row.bars.length, 0));

  private readonly chartScroller = viewChild<ElementRef<HTMLElement>>('chartScroller');

  readonly labelWidthPx = CHART_LABEL_WIDTH_PX;

  /** How wide one round is drawn. The chart scrolls, so this is a zoom rather than a fit. */
  readonly columnWidth = signal(COLUMN_WIDTH_DEFAULT_PX);

  readonly canZoomIn = computed(() => this.columnWidth() < COLUMN_WIDTH_MAX_PX);
  readonly canZoomOut = computed(() => this.columnWidth() > COLUMN_WIDTH_MIN_PX);

  /** Draws each round one step wider, up to the widest the chart allows. */
  zoomIn(): void {
    this.columnWidth.update((width) => Math.min(COLUMN_WIDTH_MAX_PX, width + COLUMN_WIDTH_STEP_PX));
  }

  /** Draws each round one step narrower, down to the narrowest the chart allows. */
  zoomOut(): void {
    this.columnWidth.update((width) => Math.max(COLUMN_WIDTH_MIN_PX, width - COLUMN_WIDTH_STEP_PX));
  }

  /** Back to the round being played, which is the left edge of the chart. */
  backToNow(): void {
    const scroller = this.chartScroller()?.nativeElement;
    if (scroller) scroller.scrollLeft = 0;
  }

  readonly chartWidthPx = computed(() => CHART_LABEL_WIDTH_PX + this.span() * this.columnWidth());

  /** Rounds that fall inside the chart, so a longer buff runs to the edge rather than off it. */
  barWidth(bar: BuffTimelineBar): number {
    return barColumns(bar.rounds, this.span());
  }

  /** How long a buff's bar is drawn at the current zoom, in pixels. */
  barWidthPx(bar: BuffTimelineBar): number {
    return this.barWidth(bar) * this.columnWidth();
  }

  /**
   * Whether the buff lasts past the last round the chart shows, so its bar is cut off at the edge
   * and marked as going on.
   */
  isRunningOff(bar: BuffTimelineBar): boolean {
    return bar.rounds > this.span();
  }

  private readonly _bumped = signal(0);
  private readonly bumped = this._bumped.asReadonly();

  private refresh(): void {
    this._bumped.update((v) => v + 1);
  }

  readonly selected = signal<string>('');

  /**
   * Picks a buff's bar to edit in the form under the chart; picking the one already picked lets it
   * go.
   */
  select(bar: BuffTimelineBar): void {
    this.selected.update((current) => (current === bar.identifier ? '' : bar.identifier));
  }

  readonly selectedElement = computed<DataElement | null>(() => {
    const identifier = this.selected();
    this.bumped();
    if (identifier.length < 1) return null;
    return this.objectStore.get<DataElement>(identifier) ?? null;
  });

  readonly selectedBar = computed<BuffTimelineBar | null>(() => {
    const identifier = this.selected();
    for (const row of this.rows()) {
      const found = row.bars.find((bar) => bar.identifier === identifier);
      if (found) return found;
    }
    return null;
  });

  readonly triggerOptions = computed(() =>
    buffTriggerOptions(this.candidates(), this.selectedBar()?.trigger ?? '', (name) =>
      this.t('feature.character.buff.triggerUnknown', { name })
    )
  );

  readonly triggerValue = computed(() => selectedTriggerValue(this.candidates(), this.selectedBar()?.trigger ?? ''));

  /** The builder writes a chat command, and a command names its trigger. */
  readonly builderTriggerOptions = computed(() =>
    this.candidates().map((candidate) => ({ value: candidate.name, label: candidate.name }))
  );

  private ownerOf(element: DataElement): GameCharacter | null {
    let node = element.parent;
    while (node) {
      if (node instanceof GameCharacter) return node;
      node = node.parent;
    }
    return null;
  }

  /**
   * Renames the picked buff, trimmed of surrounding space. Does nothing while no buff is picked.
   */
  setName(value: string): void {
    const element = this.selectedElement();
    if (!element) return;
    element.name = value.trim();
    this.touch(element);
  }

  /** Sets the modifier text the picked buff applies. Does nothing while no buff is picked. */
  setEffect(value: string): void {
    const element = this.selectedElement();
    if (!element) return;
    element.currentValue = value;
    this.touch(element);
  }

  /**
   * Sets how many rounds the picked buff has left.
   *
   * The number is rounded to a whole round and kept at zero or above; a value that is not a finite
   * number, such as an emptied box, is ignored.
   */
  setRounds(value: number): void {
    const element = this.selectedElement();
    if (!element || !Number.isFinite(value)) return;
    element.value = Math.max(0, Math.round(value));
    this.touch(element);
  }

  /**
   * Sets when the picked buff's rounds are counted down.
   *
   * Counting down at the end of the round needs nobody's turn, so choosing it drops any trigger the
   * buff had.
   */
  setTiming(value: BuffTiming): void {
    const element = this.selectedElement();
    if (!element) return;
    element.setAttribute(DataElementAttribute.BUFF_TIMING, value);
    if (value === 'roundEnd') element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.touch(element);
  }

  /**
   * Sets the moment the picked buff's effect moves at; an empty choice takes it away, so the effect
   * moves as the buff is counted down, or at the end of the round for a buff that never is.
   */
  setEffectTiming(value: BuffEffectTiming | ''): void {
    const element = this.selectedElement();
    if (!element) return;
    writeBuffEffectTiming(element, value);
    this.touch(element);
  }

  /**
   * Sets the character whose turn counts the picked buff down, by name; an empty name clears the
   * trigger.
   */
  setTrigger(value: string): void {
    const element = this.selectedElement();
    if (!element) return;
    const trimmed = value.trim();
    if (trimmed.length > 0) element.setAttribute(DataElementAttribute.BUFF_TRIGGER, trimmed);
    else element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.touch(element);
  }

  /**
   * Whether the picked buff is a buff or a debuff: as it is marked, or, unmarked, a debuff where it
   * goes by the name of a state the room keeps.
   */
  readonly selectedKind = computed<BuffKind>(() => {
    const element = this.selectedElement();
    if (!element) return 'buff';
    this.objectChange.versionOf(element.identifier)();
    return buffKindOf(element, this.statusAilments.ailments());
  });

  /** Marks the picked buff a buff or a debuff by hand. Does nothing while no buff is picked. */
  setKind(kind: BuffKind): void {
    const element = this.selectedElement();
    if (!element || !this.rolePermission.canEditTabletop()) return;
    markBuffKind(element, kind);
    this.touch(element);
  }

  /**
   * Takes the picked buff off the character that carries it, or destroys it outright when it
   * belongs to none, and clears the pick.
   */
  removeSelected(): void {
    const element = this.selectedElement();
    if (!element) return;
    const owner = this.ownerOf(element);
    if (owner) owner.buffs.removeWhole(element);
    else element.destroy();
    this.selected.set('');
    this.refresh();
  }

  /** Whether this seat runs the game, the only one allowed to sweep buffs off the whole table. */
  readonly isGameMaster = computed(() => this.rolePermission.isGameMaster());

  /**
   * Which buffs the sweep takes: those held until cleared, those with so many rounds left, one name,
   * or, whatever their rounds and names, every buff, the buffs alone or the debuffs alone.
   */
  readonly sweepKind = signal<BuffRemovalRule['kind']>('held');
  readonly sweepRounds = signal<number | string>(1);
  readonly sweepName = signal('');
  /** Whether the sweep also puts the values of every piece on the table back to their defaults. */
  readonly sweepWithValues = signal(false);

  private piecesOnTable(): GameCharacter[] {
    this.objectChange.collectionOf('character')();
    this.objectChange.collectionOf('data')();
    this.bumped();
    const pieces = this.inventory.tableInventory.tabletopObjects as GameCharacter[];
    for (const piece of pieces) this.objectChange.versionOf(piece.identifier)();
    return pieces;
  }

  /** The names of the buffs on the table, each once, in the order they are first met. */
  readonly sweepNames = computed<string[]>(() => {
    const names = new Set<string>();
    for (const piece of this.piecesOnTable()) {
      for (const data of piece.buffs.list()) names.add(data.name);
    }
    return [...names];
  });

  /** The sweep as chosen, or nothing while the choice is incomplete. */
  readonly sweepRule = computed<BuffRemovalRule | null>(() => {
    const kind = this.sweepKind();
    switch (kind) {
      case 'held':
        return { kind: 'held' };
      case 'rounds': {
        const rounds = Number(this.sweepRounds());
        return Number.isInteger(rounds) ? { kind: 'rounds', rounds } : null;
      }
      case 'name': {
        const names = this.sweepNames();
        const name = names.includes(this.sweepName()) ? this.sweepName() : (names[0] ?? '');
        return name.length > 0 ? { kind: 'name', name } : null;
      }
      default:
        return { kind };
    }
  });

  /** The name the sweep takes, as the name box shows it. */
  readonly sweepNameChosen = computed(() => {
    const rule = this.sweepRule();
    return rule?.kind === 'name' ? rule.name : '';
  });

  /** How many pieces and buffs the sweep as chosen would reach. */
  readonly sweepCount = computed<BuffRemovalCount>(() => {
    const rule = this.sweepRule();
    const pieces = this.piecesOnTable();
    return rule ? countBuffRemoval(pieces, rule, this.statusAilments.ailments()) : { characters: 0, buffs: 0 };
  });

  /**
   * What the sweep would reach with the values put back as well: the pieces, the buffs, and the items
   * that do not stand at the default they keep. The items are counted as they stand now, so the line
   * reporting the sweep may give another number once the buffs are off.
   */
  readonly sweepReach = computed<ResetCount>(() => {
    const rule = this.sweepRule();
    const pieces = this.piecesOnTable();
    for (const piece of pieces) {
      for (const item of sheetItemsOf(piece)) this.objectChange.versionOf(item.identifier)();
    }
    return this.pieceReset.count(pieces, { rule, values: this.sweepWithValues() });
  });

  /** Whether the sweep as chosen has anything to do: a buff to take, or, with the values asked for, a value to put back. */
  readonly canSweep = computed(() => {
    if (!this.sweepRule()) return false;
    if (!this.sweepWithValues()) return this.sweepCount().buffs > 0;
    const reach = this.sweepReach();
    return reach.buffs > 0 || reach.items > 0;
  });

  /** The sweep named for the confirmation and the chat line. */
  private sweepLabel(rule: BuffRemovalRule): { key: string; params: Record<string, unknown> } {
    switch (rule.kind) {
      case 'held':
        return { key: 'feature.buffManager.sweepHeldWhat', params: {} };
      case 'rounds':
        return { key: 'feature.buffManager.sweepRoundsWhat', params: { n: rule.rounds } };
      case 'name':
        return { key: 'feature.buffManager.sweepNameWhat', params: { name: rule.name } };
      case 'all':
        return { key: 'feature.buffManager.sweepAllWhat', params: {} };
      case 'buffs':
        return { key: 'feature.buffManager.sweepBuffsWhat', params: {} };
      case 'debuffs':
        return { key: 'feature.buffManager.sweepDebuffsWhat', params: {} };
    }
  }

  /**
   * Takes the chosen buffs off every piece on the table, once the game master has confirmed how
   * many, and says in chat what went. Buffs that moved a status put it back as they go, and the buff
   * a piece rides two up by stays on it.
   *
   * Every sweep, whatever it picks by and with the values put back or not, is a reset: it goes
   * through {@link PieceResetService}, and can be taken back from the line that reports it.
   */
  async sweep(): Promise<void> {
    const rule = this.sweepRule();
    const withValues = this.sweepWithValues();
    if (!rule || !this.isGameMaster() || !this.canSweep()) return;
    const label = this.sweepLabel(rule);
    const what = this.t(label.key, label.params);
    const asked = withValues
      ? this.t('feature.buffManager.sweepConfirmWithValues', { what, ...this.sweepReach() })
      : this.t('feature.buffManager.sweepConfirm', { what, ...this.sweepCount() });
    if (!(await this.confirm.ask(asked))) return;
    if (!this.isGameMaster()) return;

    const pieces = this.inventory.tableInventory.tabletopObjects as GameCharacter[];
    this.pieceReset.run(pieces, { rule, values: withValues }, (done) => {
      if (done.buffs < 1 && done.items < 1) return null;
      const key = withValues ? 'feature.buffManager.resetDone' : 'feature.buffManager.sweepDone';
      return encodeI18nMessage(key, { what: encodeI18nMessage(label.key, label.params), ...done });
    });
    this.selected.set('');
    this.refresh();
  }

  /** Commits the name box of the edit form once its text is changed. */
  onSetName(event: Event): void {
    this.setName((event.target as HTMLInputElement).value);
  }

  /** Commits the effect box of the edit form once its text is changed. */
  onSetEffect(event: Event): void {
    this.setEffect((event.target as HTMLInputElement).value);
  }

  /** Commits the rounds box of the edit form once its number is changed. */
  onSetRounds(event: Event): void {
    this.setRounds((event.target as HTMLInputElement).valueAsNumber);
  }

  private touch(element: DataElement): void {
    this.objectChange.notifyChanged(element.identifier);
    const owner = this.ownerOf(element);
    if (owner) this.objectChange.notifyChanged(owner.identifier);
    this.refresh();
  }

  // The builder for the &! command, so the syntax can be read off rather than remembered.
  readonly builderName = signal('猛攻撃');
  readonly builderStatus = signal('命中');
  readonly builderOperator = signal<string>('+');
  readonly builderAmount = signal('2');
  readonly builderStep = signal('');
  readonly builderKeeps = signal(false);
  readonly builderRounds = signal('3');
  readonly builderTiming = signal<BuffTiming>('roundEnd');
  readonly builderTrigger = signal('');
  readonly builderEffectTiming = signal<BuffEffectTiming | ''>('');
  /** The kind picked for the built buff by hand, or null while the choice is left as it came. */
  readonly builderKindPicked = signal<BuffKind | null>(null);
  /**
   * The kind the builder's choice shows: the one picked by hand, or, left as it came, the kind the
   * buff's name makes it, a debuff for a state the room keeps and a buff for anything else.
   */
  readonly builderKind = computed<BuffKind>(
    () => this.builderKindPicked() ?? buffKindFrom(null, this.builderNameWritten(), this.statusAilments.ailments())
  );
  readonly builderStacks = signal(false);
  readonly builderExtends = signal(false);

  /** The statuses the built buff moves beyond the first, a row apiece. */
  readonly builderMore = signal<readonly BuilderStatusRow[]>([]);

  /** Adds a status for the built buff to move as well. */
  addBuilderStatus(): void {
    this.builderMore.update((rows) => [...rows, { status: '', operator: '+', amount: '1', step: '', keeps: false }]);
  }

  /** Changes one of the further statuses the built buff moves. */
  updateBuilderStatus(index: number, change: Partial<BuilderStatusRow>): void {
    this.builderMore.update((rows) => rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  }

  /** Takes one of the further statuses off the built buff. */
  removeBuilderStatus(index: number): void {
    this.builderMore.update((rows) => rows.filter((_, at) => at !== index));
  }

  /** Whether the first status can move again at every count: one held at a value never does. */
  readonly builderCanStep = computed(() => this.builderOperator() !== '=');

  /**
   * Whether the built buff moves any status again at every count, which is what a moment for its
   * effect times.
   */
  readonly builderCanTimeEffect = computed(() =>
    this.builderRows().some((row) => row.operator !== '=' && row.step.trim().length > 0)
  );

  /**
   * Whether a second helping would mean anything: holding a status at a value twice still holds it
   * there, so a buff holding any of its statuses so is laid anew.
   */
  readonly builderCanStack = computed(
    () => this.builderOperator() !== '=' && this.builderMore().every((row) => row.operator !== '=')
  );

  /** The name the command gives the built buff: the one typed, or the builder's own while none is. */
  private readonly builderNameWritten = computed(
    () => this.builderName().trim() || this.t('feature.buffManager.builderDefaultName')
  );

  /** Every status the built buff moves, the first among them, as the command writes each. */
  private readonly builderRows = computed<BuilderStatusRow[]>(() => [
    {
      status: this.builderStatus(),
      operator: this.builderOperator(),
      amount: this.builderAmount(),
      step: this.builderStep(),
      keeps: this.builderKeeps(),
    },
    ...this.builderMore(),
  ]);

  /**
   * The `&!` command the builder's fields make up: the older layout for one status, and the statuses
   * written together for several. A slash typed in an amount divides there, but the command is cut
   * into its fields at every slash, so it is written as ÷, which reads the same. A kind picked by
   * hand is marked after the timing, with the word `debuff`, or with `buff` where the name is a
   * state the room keeps and would otherwise make the buff a debuff; a choice left as it came writes
   * no word. A moment chosen for the effect is written last, behind `tick:`, where any status moves
   * again at every count.
   */
  readonly builderCommand = computed(() => {
    const rows = this.builderRows();
    const statusParts =
      rows.length > 1
        ? [rows.map((row) => `${builderStatusText(row)}${row.operator}${builderAmountText(row)}`).join(',')]
        : [builderStatusText(rows[0]), rows[0].operator, builderAmountText(rows[0])];
    const name = this.builderNameWritten();
    const parts = [name, ...statusParts, this.builderRounds().trim()];
    const timing = this.builderTiming();
    const trigger = this.builderTrigger().trim();
    if (timing !== 'roundEnd' || trigger.length > 0) parts.push(timing);
    if (trigger.length > 0) parts.push(trigger);
    const kind = buffKindMarkPicked(this.builderKindPicked(), name, this.statusAilments.ailments());
    if (kind) parts.push(kind);
    const effectTiming = this.builderEffectTiming();
    if (effectTiming.length > 0 && this.builderCanTimeEffect()) parts.push(`tick:${effectTiming}`);
    const stacks = this.builderStacks() && this.builderCanStack();
    const mark = stacks ? (this.builderExtends() ? '++' : '+') : '';
    return `&${mark}!${parts.join('/')}`;
  });

  readonly builderPreview = computed(() => {
    const requests = this.builderRows().map((row) =>
      parseBuffModifierRequest(builderStatusText(row), row.operator, builderAmountText(row).replace(/÷/g, '/'))
    );
    const parsed = requests.filter((request) => request !== null);
    return parsed.length === requests.length ? parsed.map((request) => describeBuffModifier(request)).join(',') : '';
  });

  readonly copied = transientSignal(false, 1200);

  /** The states this room keeps on hand, which are put on pieces as the buffs charted here. */
  openStatusAilments(): void {
    if (this.panelService.closeSingle(STATUS_AILMENT_PANEL)) return;
    this.roomPanels.open('statusAilment');
  }

  /**
   * Copies the `&!` command the builder has put together to the clipboard, and shows the copied
   * mark for a moment.
   *
   * When the browser refuses the clipboard nothing is shown; the command stays on screen to copy by
   * hand.
   */
  async copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.builderCommand());
      this.copied.show(true);
    } catch {
      /* clipboard unavailable (permission, insecure context) — the text is on screen to copy by hand */
    }
  }
}

/** The status as the command writes it, marked with a `:` where it is to stay moved once the buff goes. */
function builderStatusText(row: BuilderStatusRow): string {
  const status = row.status.trim();
  return row.keeps && !/^[:：]/.test(status) ? `:${status}` : status;
}

/**
 * The amount of one status as the command writes it, with how far it moves again at every count
 * where that is asked for, and any slash written as ÷, as the command is cut at every slash.
 */
function builderAmountText(row: BuilderStatusRow): string {
  const step = row.step.trim();
  const amount = row.amount.trim();
  const written = step.length > 0 && row.operator !== '=' ? `${amount}~${step}` : amount;
  return written.replace(/\//g, '÷');
}
