import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import { chatTabIdentifierNear, INSERTABLE_KINDS, isTextEditable, textOf } from '@axe/domain/replay/replay-edit';
import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayFocusService } from '@axe/features/replay/replay-focus.service';
import {
  collectReplayActorIds,
  DEFAULT_REPLAY_LOG_FILTER,
  matchesReplayLogFilter,
  type ReplayLogFilter,
  ReplayLogScope,
} from '@axe/features/replay/replay-log-filter';
import {
  briefReplayLogLine,
  formatReplayElapsed,
  renderReplayLogLine,
  toReplayLogLine,
} from '@axe/features/replay/replay-log-line';
import { EMPTY_REPLAY_DICTIONARY, replayActorsOf, replayNamesAt } from '@axe/features/replay/replay-names';
import { buildReplayEntryContextMenu } from '@axe/features/replay/replay-workspace/replay-entry-context-menu';
import {
  foldReplayRows,
  pickReplayRows,
  type ReplayEntryRow,
  type ReplayListItem,
  type ReplayRowStyle,
  replayRowStyle,
  replayStepStops,
} from '@axe/features/replay/replay-workspace/replay-entry-items';
import { VirtualListComponent } from '@axe/ui/components/virtual-list/virtual-list.component';
import { landingIndex, RowReorder } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

export type { ReplayEntryRow } from '@axe/features/replay/replay-workspace/replay-entry-items';

/** What a row shows, worked out only for the rows drawn. */
interface ReplayEntryView {
  style: ReplayRowStyle;
  elapsed: string;
  icon: string;
  isSecret: boolean;
  /** Who spoke or rolled, for a line or a roll. */
  speaker: string;
  /** What was said, rolled or headed, or the whole line of anything else. */
  text: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-entry-list',
  templateUrl: './replay-entry-list.component.html',
  imports: [TranslocoModule, VirtualListComponent],
})
export class ReplayEntryListComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly focus = inject(ReplayFocusService);
  private readonly editor = inject(ReplayEditorService);
  private readonly staging = inject(ReplayStagingService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly writingField = viewChild<ElementRef<HTMLInputElement>>('writing');
  private readonly rewriteField = viewChild<ElementRef<HTMLInputElement>>('rewrite');
  private readonly listHost = viewChild(VirtualListComponent, { read: ElementRef });
  private readonly document = inject(DOCUMENT);

  readonly editing = input(false);

  /** Changes whenever editing starts or ends or another recording opens, when whatever was chosen means nothing any more. */
  private readonly session = computed(() => [this.editing(), this.playback.recordingId()]);

  protected readonly cursor = this.playback.cursor;
  protected readonly isStaging = this.staging.isStaging;
  protected readonly scopes = [ReplayLogScope.All, ReplayLogScope.Chat, ReplayLogScope.Board];
  protected readonly insertKinds = INSERTABLE_KINDS;

  protected readonly filter = signal<ReplayLogFilter>(DEFAULT_REPLAY_LOG_FILTER);
  /** The rows chosen for the next edit, by sequence number. */
  protected readonly chosen = linkedSignal<unknown, ReadonlySet<number>>({
    source: this.session,
    computation: () => new Set(),
  });
  private readonly anchor = linkedSignal<unknown, number | null>({ source: this.session, computation: () => null });
  /** The folded runs of board events opened, by the sequence number of their first event. */
  private readonly openGroups = linkedSignal<unknown, ReadonlySet<number>>({
    source: this.session,
    computation: () => new Set(),
  });
  protected readonly editingSeq = linkedSignal<unknown, number | null>({
    source: this.session,
    computation: () => null,
  });
  protected readonly rowDrag = new RowReorder<number>();

  protected readonly insertKind = signal<ReplayEventKind>(ReplayEventKind.ChatMessage);
  protected readonly insertCastId = signal('');
  protected readonly insertSpeaker = signal('');
  protected readonly insertActorId = signal('');
  protected readonly insertText = signal('');

  protected readonly isMarkerDraft = computed(() => this.insertKind() === ReplayEventKind.Marker);
  protected readonly isFreeSpeaker = computed(() => this.insertCastId().length < 1);

  /**
   * Lets go of a drag at the first move of the mouse after it, which no drag lets through.
   *
   * A row scrolled far enough out of the list is no longer drawn, and never hears that its drag ended.
   */
  private readonly settleDrag = (): void => this.rowDrag.cancel();

  constructor() {
    effect(() => this.rewriteField()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('mousemove', this.settleDrag));
  }

  private readonly viewer = computed(() => ({
    userId: PeerCursor.myCursor?.userId ?? '',
    role: PeerCursor.myRole,
  }));

  private readonly source = computed(() => (this.editing() ? this.editor.edited() : this.playback.events()));

  protected readonly actorIds = computed(() => collectReplayActorIds(this.source()));

  protected readonly actors = computed(() =>
    replayActorsOf(this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY, this.actorIds())
  );

  protected readonly cast = computed(() =>
    this.playback
      .cast()
      .filter((member) => member.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  /**
   * The rows the filter lets through, holding no more than where each stands.
   *
   * What a row shows is worked out as it is drawn (`view`), since a long recording has tens of
   * thousands of rows and only a screenful is ever on show.
   */
  protected readonly rows = computed<ReplayEntryRow[]>(() => {
    const filter = this.filter();
    const viewer = this.viewer();
    const rows: ReplayEntryRow[] = [];
    this.source().forEach((event, index) => {
      if (!matchesReplayLogFilter(event, filter, viewer)) return;
      rows.push({
        index,
        seq: event.seq,
        event,
        isChapter: event.kind === ReplayEventKind.Marker,
        editable: isTextEditable(event),
      });
    });
    return rows;
  });

  /** The rows with the board events between the lines of the story folded, as the list shows them. */
  protected readonly items = computed<ReplayListItem[]>(() => foldReplayRows(this.rows(), this.openGroups()));

  /** The rows on show, leaving out those inside a run that is folded, which a range must not reach into. */
  private readonly shownRows = computed<ReplayEntryRow[]>(() =>
    this.items().flatMap((item) => (item.kind === 'row' ? [item.row] : []))
  );

  protected readonly itemKey = (item: ReplayListItem): string => item.key;

  /** Where written or recorded entries go: after the last row chosen, or at the end. */
  private readonly insertIndex = computed(() => {
    const chosen = this.chosen();
    let last = -1;
    for (const row of this.rows()) if (chosen.has(row.seq)) last = Math.max(last, row.index);
    return last >= 0 ? last + 1 : this.source().length;
  });

  /** Says where the next entry goes, for the writing field. */
  protected readonly insertTarget = computed(() => {
    const index = this.insertIndex();
    const before = this.source()[index - 1];
    if (index >= this.source().length || !before) return this.t('feature.replay.editor.insertAtEnd');
    return this.t('feature.replay.editor.insertAfter', { time: formatReplayElapsed(before.t) });
  });

  private readonly views = new WeakMap<ReplayEvent, { lang: string; dictionary: object; view: ReplayEntryView }>();

  /**
   * What a row shows, in the reader's language.
   *
   * Kept per event, which an edit hands on unchanged, and worked out again only when the language
   * or the recording's names change.
   */
  protected view(row: ReplayEntryRow): ReplayEntryView {
    const lang = this.language.currentLang();
    const dictionary = this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY;
    const cached = this.views.get(row.event);
    if (cached && cached.lang === lang && cached.dictionary === dictionary) return cached.view;

    const names = replayNamesAt(dictionary, row.event.seq);
    const line = toReplayLogLine(row.event, names);
    const style = replayRowStyle(row.event);
    const detail = row.event.detail;
    const spoken = style === 'speech' || style === 'dice';
    const view: ReplayEntryView = {
      style,
      elapsed: formatReplayElapsed(row.event.t),
      icon: line.icon,
      isSecret: line.isSecret,
      speaker: spoken
        ? decodeI18nMessage(String(detail['name'] ?? ''), this.t) || names.actorName(row.event.actorId)
        : '',
      text:
        style === 'chapter'
          ? String(detail['label'] ?? '')
          : spoken
            ? decodeI18nMessage(String(detail['text'] ?? ''), this.t)
            : renderReplayLogLine(style === 'board' ? briefReplayLogLine(line) : line, this.t, lang),
    };
    this.views.set(row.event, { lang, dictionary, view });
    return view;
  }

  /** Whether a row was put in while editing rather than recorded. */
  protected isInserted(row: ReplayEntryRow): boolean {
    return this.editing() && this.editor.isInserted(row.seq);
  }

  /** The words a row can be rewritten to begin from. */
  protected rawText(row: ReplayEntryRow): string {
    return textOf(row.event);
  }

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected actorLabel(userId: string): string {
    return replayNamesAt(this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY, 0).actorName(userId);
  }

  protected setScope(scope: ReplayLogScope): void {
    this.filter.update((filter) => ({ ...filter, scope }));
  }

  protected setActor(actorId: string): void {
    this.filter.update((filter) => ({ ...filter, actorId }));
  }

  protected toggleSecret(): void {
    this.filter.update((filter) => ({ ...filter, hideSecret: !filter.hideSecret }));
  }

  protected toggleIncidental(): void {
    this.filter.update((filter) => ({ ...filter, showIncidental: !filter.showIncidental }));
  }

  /** Lists the running of the room as well — joins, roles, owners, locks — or leaves it out again. */
  protected toggleSystem(): void {
    this.filter.update((filter) => ({ ...filter, showSystem: !filter.showSystem }));
  }

  /** Whether a row is among those chosen. */
  protected isChosen(row: ReplayEntryRow): boolean {
    return this.chosen().has(row.seq);
  }

  /**
   * A press on a row: while editing it chooses rows, as files are chosen; otherwise it plays the
   * recording from there.
   */
  protected async press(row: ReplayEntryRow, event: MouseEvent): Promise<void> {
    if (!this.editing()) {
      await this.playback.seekTo(row.index);
      return;
    }
    this.focus.choose(row.seq);
    const picked = pickReplayRows(this.chosen(), this.anchor(), this.shownRows(), row.seq, {
      toggle: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    });
    this.chosen.set(picked.chosen);
    this.anchor.set(picked.anchor);
  }

  /** Opens a folded run of board events, or folds it again. */
  protected toggleGroup(first: ReplayEntryRow): void {
    this.openGroups.update((open) => {
      const next = new Set(open);
      if (next.has(first.seq)) next.delete(first.seq);
      else next.add(first.seq);
      return next;
    });
  }

  /**
   * The keys of the list while editing: Delete or Backspace removes the chosen rows, Alt with an
   * arrow moves them a row, Enter rewrites the one chosen, and Escape lets the choice go.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.editing() || this.editingSeq() !== null || event.target instanceof HTMLInputElement) return;
    const chosen = this.chosen();
    if (event.key === 'Escape') {
      this.chosen.set(new Set());
      return;
    }
    if (chosen.size < 1) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeChosen();
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.stepChosen(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Enter') {
      const only = this.onlyChosenRow();
      if (only) {
        event.preventDefault();
        this.beginRowEdit(only);
      }
    }
  }

  /** The menu of the chosen rows, opened on a row; a row not yet chosen is chosen alone first. */
  protected onRowContextMenu(row: ReplayEntryRow, event: MouseEvent): void {
    if (!this.editing()) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.isChosen(row)) {
      this.chosen.set(new Set([row.seq]));
      this.anchor.set(row.seq);
    }
    const only = this.onlyChosenRow();
    const actions = buildReplayEntryContextMenu(
      { count: this.chosen().size, canRewrite: !!only?.editable, canStage: this.canEdit && !this.isStaging() },
      {
        rewrite: () => only && this.beginRowEdit(only),
        moveUp: () => this.stepChosen(-1),
        moveDown: () => this.stepChosen(1),
        remove: () => this.removeChosen(),
        writeAfter: () => this.writingField()?.nativeElement.focus(),
        stageAfter: () => void this.stageAt(this.insertIndex()),
      },
      this.t
    );
    this.contextMenuService.open({ x: event.clientX, y: event.clientY }, actions);
  }

  private onlyChosenRow(): ReplayEntryRow | null {
    const chosen = this.chosen();
    if (chosen.size !== 1) return null;
    return this.rows().find((row) => chosen.has(row.seq)) ?? null;
  }

  private removeChosen(): void {
    this.editor.removeMany(this.chosen());
    this.chosen.set(new Set());
    this.anchor.set(null);
  }

  /** Moves the chosen rows past the next row on show, or past a folded run as a whole. */
  private stepChosen(direction: -1 | 1): void {
    const stops = replayStepStops(this.items(), direction);
    this.editor.stepMany(this.chosen(), direction, (event) => stops.has(event.seq));
  }

  protected beginRowEdit(row: ReplayEntryRow): void {
    if (!this.editing() || !row.editable) return;
    this.editingSeq.set(row.seq);
  }

  /**
   * Rewrites a row with what was typed, once: the field going away afterwards takes the focus with
   * it, and that must not write the row again, nor write one whose rewriting was called off.
   */
  protected commitRowEdit(seq: number, text: string, fromKey = false): void {
    if (this.editingSeq() !== seq) return;
    this.editor.retext(seq, text);
    this.editingSeq.set(null);
    if (fromKey) this.listHost()?.nativeElement.focus();
  }

  /** Calls the rewriting off, leaving the row as it was, and hands the keys back to the list. */
  protected cancelRowEdit(): void {
    this.editingSeq.set(null);
    this.listHost()?.nativeElement.focus();
  }

  protected dragStart(row: ReplayEntryRow, event: DragEvent): void {
    if (!this.editing()) return;
    this.rowDrag.begin(row.seq);
    this.document.addEventListener('mousemove', this.settleDrag, { once: true });
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(row.seq));
  }

  protected dragOver(row: ReplayEntryRow, event: DragEvent): void {
    if (this.rowDrag.held() === null) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.rowDrag.hoverHalf(row.seq, bounds, event.clientY);
  }

  protected dropHere(event: DragEvent): void {
    const drop = this.rowDrag.release();
    if (!drop) return;

    event.preventDefault();
    event.stopPropagation();

    const order = this.source().map((entry) => entry.seq);
    const to = landingIndex(order, drop.held, drop.over, drop.side);
    if (to === null) return;
    this.editor.move(drop.held, to - order.indexOf(drop.held));
  }

  protected dragEnd(): void {
    this.rowDrag.cancel();
    this.document.removeEventListener('mousemove', this.settleDrag);
  }

  protected dropHint(row: ReplayEntryRow): string | null {
    if (this.rowDrag.isDropBefore(row.seq)) return 'inset 0 2px 0 0 var(--color-ui-accent)';
    if (this.rowDrag.isDropAfter(row.seq)) return 'inset 0 -2px 0 0 var(--color-ui-accent)';
    return null;
  }

  protected setInsertKind(kind: string): void {
    this.insertKind.set(kind as ReplayEventKind);
  }

  protected setCastId(identifier: string): void {
    this.insertCastId.set(identifier);
  }

  protected canInsert(): boolean {
    return this.insertText().trim().length > 0;
  }

  /**
   * Puts what is written in the field after the last row chosen, or at the end, and chooses it,
   * so what is written next goes after it.
   */
  protected insertHere(index = this.insertIndex()): void {
    if (!this.canInsert()) return;
    const member = this.selectedCast();
    this.editor.insert(index, {
      kind: this.insertKind(),
      actorId: this.insertActorId() || this.actors()[0]?.userId || '',
      speaker: member?.name ?? this.insertSpeaker().trim(),
      text: this.insertText().trim(),
      tabIdentifier: this.insertTabIdentifier(index),
      imageIdentifier: member?.imageIdentifier ?? '',
      chatColor: member?.chatColor ?? '',
    });
    this.insertText.set('');
    const added = this.editor.edited()[Math.max(0, Math.min(index, this.editor.edited().length - 1))];
    if (added && this.editor.isInserted(added.seq)) {
      this.chosen.set(new Set([added.seq]));
      this.anchor.set(added.seq);
    }
  }

  protected async stageAt(index = this.insertIndex()): Promise<void> {
    if (!this.canEdit || this.isStaging()) return;
    if (!this.playback.isBoardMode() && !(await this.playback.enterBoardMode())) return;
    this.staging.begin(index, this.insertActorId() || this.actors()[0]?.userId || '');
  }

  private selectedCast(): ReplayCastMember | null {
    return this.cast().find((member) => member.identifier === this.insertCastId()) ?? null;
  }

  private insertTabIdentifier(index: number): string {
    const fromRecording = chatTabIdentifierNear(this.editor.edited(), index);
    if (fromRecording.length > 0) return fromRecording;
    return this.chatMessageService.chatTabs[0]?.identifier ?? '';
  }
}
