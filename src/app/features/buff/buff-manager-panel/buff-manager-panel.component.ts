import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  BuffRemovalCount,
  BuffRemovalRule,
  countBuffRemoval,
  removeBuffsAcross,
} from '@axe/domain/character/buff-bulk-removal';
import { describeBuffModifier, parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import {
  barColumns,
  BuffTimelineBar,
  BuffTimelineRow,
  timelineColumns,
  timelineSpan,
  toTimelineBars,
} from '@axe/domain/character/buff-timeline';
import { BUFF_TIMINGS, BuffTiming } from '@axe/domain/character/buff-timing';
import { buffTriggerOptions, selectedTriggerValue } from '@axe/domain/character/buff-trigger-options';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { STATUS_AILMENT_PANEL } from '@axe/domain/ui/room-panel';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const BUILDER_OPERATORS = ['+', '-', '='] as const;
const COLUMN_WIDTH_MIN_PX = 16;
const COLUMN_WIDTH_MAX_PX = 112;
const COLUMN_WIDTH_STEP_PX = 12;
const COLUMN_WIDTH_DEFAULT_PX = 44;
const CHART_LABEL_WIDTH_PX = 176;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-buff-manager-panel',
  templateUrl: './buff-manager-panel.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class BuffManagerPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);
  private readonly chat = inject(ChatMessageService);

  readonly timingChoices = BUFF_TIMINGS;
  readonly operatorChoices = BUILDER_OPERATORS;

  readonly round = computed(() => {
    this.objectChange.versionOf('TurnState')();
    return Math.max(1, this.turnOrder.round);
  });

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
        characterName: character.name,
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
      .filter((character) => this.vision.mayBeListed(character))
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
   * Takes the picked buff off the character that carries it, or destroys it outright when it
   * belongs to none, and clears the pick.
   */
  removeSelected(): void {
    const element = this.selectedElement();
    if (!element) return;
    const owner = this.ownerOf(element);
    if (owner) owner.buffs.remove(element);
    else element.destroy();
    this.selected.set('');
    this.refresh();
  }

  /** Whether this seat runs the game, the only one allowed to sweep buffs off the whole table. */
  readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole === PeerRole.GameMaster;
  });

  /** Which buffs the sweep takes: those held until cleared, those with so many rounds left, or one name. */
  readonly sweepKind = signal<BuffRemovalRule['kind']>('held');
  readonly sweepRounds = signal<number | string>(1);
  readonly sweepName = signal('');

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
      for (const data of piece.buffDataElement?.children[0]?.children ?? []) names.add(data.name);
    }
    return [...names];
  });

  /** The sweep as chosen, or nothing while the choice is incomplete. */
  readonly sweepRule = computed<BuffRemovalRule | null>(() => {
    switch (this.sweepKind()) {
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
    return rule ? countBuffRemoval(pieces, rule) : { characters: 0, buffs: 0 };
  });

  /** The sweep named for the confirmation and the chat line. */
  private sweepLabel(rule: BuffRemovalRule): string {
    switch (rule.kind) {
      case 'held':
        return this.t('feature.buffManager.sweepHeldWhat');
      case 'rounds':
        return this.t('feature.buffManager.sweepRoundsWhat', { n: rule.rounds });
      case 'name':
        return this.t('feature.buffManager.sweepNameWhat', { name: rule.name });
    }
  }

  /**
   * Takes the chosen buffs off every piece on the table, once the game master has confirmed how
   * many, and says in chat what went. Buffs that moved a status put it back as they go.
   */
  async sweep(): Promise<void> {
    const rule = this.sweepRule();
    const count = this.sweepCount();
    if (!rule || !this.isGameMaster() || count.buffs < 1) return;
    const what = this.sweepLabel(rule);
    const asked = this.t('feature.buffManager.sweepConfirm', { what, ...count });
    if (!(await this.confirm.ask(asked))) return;

    const removed = removeBuffsAcross(this.inventory.tableInventory.tabletopObjects as GameCharacter[], rule);
    this.selected.set('');
    this.refresh();
    if (removed.buffs > 0) {
      this.chat.sendSystemMessageToMainTab(this.t('feature.buffManager.sweepDone', { what, ...removed }));
    }
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
  readonly builderRounds = signal('3');
  readonly builderTiming = signal<BuffTiming>('roundEnd');
  readonly builderTrigger = signal('');

  readonly builderCommand = computed(() => {
    const parts = [
      this.builderName().trim() || 'バフ',
      this.builderStatus().trim(),
      this.builderOperator(),
      this.builderAmount().trim(),
      this.builderRounds().trim(),
    ];
    const timing = this.builderTiming();
    const trigger = this.builderTrigger().trim();
    if (timing !== 'roundEnd' || trigger.length > 0) parts.push(timing);
    if (trigger.length > 0) parts.push(trigger);
    return `&!${parts.join('/')}`;
  });

  readonly builderPreview = computed(() => {
    const request = parseBuffModifierRequest(this.builderStatus(), this.builderOperator(), this.builderAmount());
    return request ? describeBuffModifier(request) : '';
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
