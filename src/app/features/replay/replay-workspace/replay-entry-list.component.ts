import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import { chatTabIdentifierNear, INSERTABLE_KINDS, isTextEditable, textOf } from '@axe/domain/replay/replay-edit';
import { ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  collectReplayActorIds,
  DEFAULT_REPLAY_LOG_FILTER,
  filterReplayEvents,
  type ReplayLogFilter,
  ReplayLogScope,
} from '@axe/features/replay/replay-log-filter';
import { formatReplayElapsed, type ReplayLogLine, toReplayLogLine } from '@axe/features/replay/replay-log-line';
import { EMPTY_REPLAY_DICTIONARY, replayActorsOf, replayNamesAt } from '@axe/features/replay/replay-names';
import { landingIndex, RowReorder } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

export interface ReplayEntryRow {
  index: number;
  seq: number;
  elapsed: string;
  isChapter: boolean;
  inserted: boolean;
  editable: boolean;
  text: string;
  line: ReplayLogLine;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'replay-entry-list',
  templateUrl: './replay-entry-list.component.html',
  imports: [TranslocoModule, NgTemplateOutlet],
})
export class ReplayEntryListComponent {
  private readonly playback = inject(ReplayPlaybackService);
  private readonly editor = inject(ReplayEditorService);
  private readonly staging = inject(ReplayStagingService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  readonly editing = input(false);

  protected readonly cursor = this.playback.cursor;
  protected readonly isStaging = this.staging.isStaging;
  protected readonly scopes = [ReplayLogScope.All, ReplayLogScope.Chat, ReplayLogScope.Board];
  protected readonly insertKinds = INSERTABLE_KINDS;

  protected readonly filter = signal<ReplayLogFilter>(DEFAULT_REPLAY_LOG_FILTER);
  protected readonly composeAt = signal<number | null>(null);
  protected readonly editingSeq = signal<number | null>(null);
  protected readonly rowDrag = new RowReorder<number>();

  protected readonly insertKind = signal<ReplayEventKind>(ReplayEventKind.ChatMessage);
  protected readonly insertCastId = signal('');
  protected readonly insertSpeaker = signal('');
  protected readonly insertActorId = signal('');
  protected readonly insertText = signal('');

  protected readonly isMarkerDraft = computed(() => this.insertKind() === ReplayEventKind.Marker);
  protected readonly isFreeSpeaker = computed(() => this.insertCastId().length < 1);

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

  protected readonly rows = computed<ReplayEntryRow[]>(() => {
    const dictionary = this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY;
    const events = this.source();
    const visible = new Set(filterReplayEvents(events, this.filter(), this.viewer()).map((event) => event.seq));

    return events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => visible.has(event.seq))
      .map(({ event, index }) => ({
        index,
        seq: event.seq,
        elapsed: formatReplayElapsed(event.t),
        isChapter: event.kind === ReplayEventKind.Marker,
        inserted: this.editing() && this.editor.isInserted(event.seq),
        editable: isTextEditable(event),
        text: textOf(event),
        line: toReplayLogLine(event, replayNamesAt(dictionary, event.seq)),
      }));
  });

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected actorLabel(userId: string): string {
    return replayNamesAt(this.playback.manifest() ?? EMPTY_REPLAY_DICTIONARY, 0).actorName(userId);
  }

  protected lineParams(line: ReplayLogLine): Record<string, string | number> {
    if (!line.paramKeys) return line.params;
    const resolved: Record<string, string | number> = { ...line.params };
    for (const [name, key] of Object.entries(line.paramKeys)) resolved[name] = this.t(key);
    return resolved;
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

  protected async activate(row: ReplayEntryRow): Promise<void> {
    if (this.editing()) return;
    await this.playback.seekTo(row.index);
  }

  protected beginRowEdit(row: ReplayEntryRow): void {
    if (!this.editing() || !row.editable) return;
    this.editingSeq.set(row.seq);
  }

  protected commitRowEdit(seq: number, text: string): void {
    this.editor.retext(seq, text);
    this.editingSeq.set(null);
  }

  protected move(seq: number, offset: number): void {
    this.editor.move(seq, offset);
  }

  protected dragStart(row: ReplayEntryRow, event: DragEvent): void {
    if (!this.editing()) return;
    this.rowDrag.begin(row.seq);
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
  }

  protected dropHint(row: ReplayEntryRow): string | null {
    if (this.rowDrag.isDropBefore(row.seq)) return 'inset 0 2px 0 0 var(--color-ui-accent)';
    if (this.rowDrag.isDropAfter(row.seq)) return 'inset 0 -2px 0 0 var(--color-ui-accent)';
    return null;
  }

  protected remove(seq: number): void {
    this.editor.remove(seq);
  }

  protected openCompose(index: number): void {
    this.composeAt.set(index);
    this.insertText.set('');
  }

  protected closeCompose(): void {
    this.composeAt.set(null);
    this.insertText.set('');
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

  protected insertHere(index: number): void {
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
  }

  protected async stageAt(index: number): Promise<void> {
    if (!this.canEdit || this.isStaging()) return;
    this.composeAt.set(null);
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
