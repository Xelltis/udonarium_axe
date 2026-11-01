import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScenarioTextService } from '@axe/application/chat/scenario-text.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { GameObject } from '@axe/core/sync/game-object';
import { withoutChatDecoration } from '@axe/domain/chat/chat-decoration';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { normalizeFolderPath } from '@axe/domain/folder/folder-path';
import { withFolderInOrder } from '@axe/domain/folder/folder-tree';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  SCENARIO_TEXT_SPEAKERS,
  ScenarioText,
  type ScenarioTextSpeaker,
  scenarioTextSpeakerOf,
} from '@axe/domain/scenario-text/scenario-text';
import { splitScenarioTexts } from '@axe/domain/scenario-text/scenario-text-import';
import { ChatLineEditorComponent } from '@axe/features/chat/chat-line-editor/chat-line-editor.component';
import { buildScenarioTextContextMenu } from '@axe/features/scenario-text/scenario-text-context-menu';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { RowReorder } from '@axe/ui/dragging/row-reorder';
import { FolderShelf } from '@axe/ui/folder-tree/folder-shelf';
import { FolderTreeComponent } from '@axe/ui/folder-tree/folder-tree.component';
import { TranslocoModule } from '@jsverse/transloco';
import { NgSelectModule } from '@ng-select/ng-select';

/** How long the passage waits after the last key before it is shared with the room. */
const WRITE_DELAY_MS = 400;
/** As much of a passage as its row shows. */
const PREVIEW_LETTERS = 60;

/** A text as its row shows it. */
interface ScenarioTextRow {
  readonly title: string;
  readonly preview: string;
  readonly hasWords: boolean;
  /** When it was last said from here, as the reader writes the time, or empty for never. */
  readonly sentAt: string;
}

/**
 * The game master's scenario texts: passages written before the session, filed in folders, each
 * said in the chat with one press, decorated as it was written. The list can be searched through
 * the titles and the words alike, and the text picked is written below it in the chat's own box.
 *
 * Only the game master uses it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scenario-text-panel',
  templateUrl: './scenario-text-panel.component.html',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    FolderTreeComponent,
    ChatLineEditorComponent,
    NgSelectModule,
    NgSelectWindowDirective,
    TranslocoModule,
  ],
})
export class ScenarioTextPanelComponent {
  private readonly texts = inject(ScenarioTextService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly confirm = inject(ConfirmService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly pointer = inject(PointerDeviceService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly speakers = SCENARIO_TEXT_SPEAKERS;
  protected readonly canEdit = computed(() => this.permission.isGameMaster());

  /** The text picked for writing, by identifier. */
  protected readonly picked = signal<string | null>(null);
  protected readonly search = signal('');
  /** The players the next text is whispered to, by cursor; none says it to all. */
  protected readonly whisperTo = signal<string[]>([]);
  protected readonly reorder = new RowReorder<ScenarioText>();

  private pendingWrite: { text: ScenarioText; words: string; timer: ReturnType<typeof setTimeout> } | null = null;

  protected readonly shelf = new FolderShelf<ScenarioText>({
    items: () => ScenarioText.all(),
    declared: () => Config.instance.scenarioTextFolders,
    setDeclared: (paths) => {
      Config.instance.scenarioTextFolders = paths;
      this.objectChange.notifyChanged(Config.instance.identifier);
    },
    canEdit: () => this.canEdit(),
    defaultFolderName: (index) => this.t('common.folder.defaultName', { index }),
    confirmDelete: (path, count) =>
      this.confirm.ask({
        message: this.t('common.folder.confirmDelete', { name: path, count }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      }),
  });

  /** Every text in the list order, each read again whenever it changes. */
  private readonly all = computed(() => {
    this.objectChange.collectionOf(ScenarioText.aliasName)();
    const texts = ScenarioText.all();
    for (const text of texts) this.objectChange.versionOf(text.identifier)();
    return texts;
  });

  private readonly rows = computed<ReadonlyMap<string, ScenarioTextRow>>(
    () =>
      new Map(
        this.all().map((text) => {
          const plain = withoutChatDecoration(`${text.text ?? ''}`)
            .replace(/\s+/g, ' ')
            .trim();
          const sentAt = this.texts.sentAt(text.identifier);
          return [
            text.identifier,
            {
              title: text.title.trim() || this.t('feature.scenarioText.untitled'),
              preview: plain.length > PREVIEW_LETTERS ? `${plain.slice(0, PREVIEW_LETTERS)}…` : plain,
              hasWords: plain.length > 0,
              sentAt:
                sentAt === null ? '' : new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
        })
      )
  );

  /** The texts whose title or words hold what is searched for, in the list order. */
  protected readonly found = computed<ScenarioText[] | null>(() => {
    const words = this.search().trim().toLowerCase();
    if (words.length < 1) return null;
    return this.all().filter((text) =>
      `${text.title}\n${withoutChatDecoration(`${text.text ?? ''}`)}`.toLowerCase().includes(words)
    );
  });

  protected readonly tree = computed(() => {
    this.objectChange.versionOf(Config.instance.identifier)();
    return this.shelf.tree(this.all());
  });

  protected readonly isEmpty = computed(() => this.all().length < 1 && this.tree().roots.length < 1);

  protected readonly pickedText = computed(() => {
    const identifier = this.picked();
    return identifier ? (this.all().find((text) => text.identifier === identifier) ?? null) : null;
  });
  /** The text picked, alone, for the box it is written in to be made anew for each. */
  protected readonly pickedList = computed(() => {
    const text = this.pickedText();
    return text ? [text] : [];
  });

  protected readonly chatTabs = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    return ChatTabList.instance.chatTabs
      .filter((tab) => !tab.isSystemTab)
      .map((tab) => ({ identifier: tab.identifier, name: tab.name }));
  });

  /** Everybody else at the table, who a text may be whispered to. */
  protected readonly players = computed(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.objectChange.networkVersion();
    return PeerCursor.linkedCursors()
      .filter((cursor) => cursor !== PeerCursor.myCursor)
      .map((cursor) => ({ identifier: cursor.identifier, name: cursor.name || cursor.userId }));
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.scenarioText.title')));
    inject(DestroyRef).onDestroy(() => this.flushWrite());
  }

  protected rowOf(text: ScenarioText): ScenarioTextRow {
    return this.rows().get(text.identifier) ?? { title: text.title, preview: '', hasWords: false, sentAt: '' };
  }

  protected speakerOf(text: ScenarioText): ScenarioTextSpeaker {
    return scenarioTextSpeakerOf(text.sendAs);
  }

  protected create(): void {
    const text = this.texts.create(this.t('feature.scenarioText.defaultTitle', { index: this.all().length + 1 }));
    if (text) this.pick(text);
  }

  protected createFolder(): void {
    this.shelf.createFolder();
  }

  /** Whether the box writing is pasted into, to be split into texts, is open. */
  protected readonly importing = signal(false);

  /**
   * Makes a text of each heading in writing pasted in, with the words under it, in the folder of
   * the text picked, and picks the first. Answers how many were made.
   */
  protected importFrom(pasted: string): number {
    if (!this.canEdit()) return 0;
    this.flushWrite();
    const folder = normalizeFolderPath(this.pickedText()?.folderName ?? '');
    let first: ScenarioText | null = null;
    let made = 0;
    for (const split of splitScenarioTexts(pasted)) {
      const title = split.title || this.t('feature.scenarioText.defaultTitle', { index: this.all().length + made + 1 });
      const text = this.texts.create(title, folder);
      if (!text) continue;
      text.write(split.text);
      first ??= text;
      made++;
    }
    if (first) this.picked.set(first.identifier);
    this.importing.set(false);
    return made;
  }

  /** Picks a text to write and say, the players chosen to whisper the last one to let go. */
  protected pick(text: ScenarioText): void {
    this.flushWrite();
    if (this.picked() !== text.identifier) this.whisperTo.set([]);
    this.picked.set(text.identifier);
  }

  /**
   * Says a text in the chat, as it says itself unless told otherwise. Only the button under the text
   * picked whispers it, to the players chosen beside that button; a row's own button and its menu
   * say it to everyone.
   */
  protected send(text: ScenarioText, options: { speaker?: ScenarioTextSpeaker; whispered?: boolean } = {}): void {
    this.flushWrite();
    const to = options.whispered ? this.whisperTo() : [];
    this.texts.send(text, { ...(options.speaker ? { speaker: options.speaker } : {}), to });
  }

  /** The colour the text goes out in as it stands, its own or its speaker's. */
  protected colorOf(text: ScenarioText): string {
    this.objectChange.versionOf(text.identifier)();
    return this.texts.colorOf(text);
  }

  protected rename(text: ScenarioText, title: string): void {
    if (this.canEdit()) text.title = title.trim();
  }

  /** Shares the passage with the room a moment after the last key, rather than at every key. */
  protected writeLater(text: ScenarioText, words: string): void {
    if (!this.canEdit()) return;
    if (this.pendingWrite && this.pendingWrite.text !== text) this.flushWrite();
    if (this.pendingWrite) clearTimeout(this.pendingWrite.timer);
    this.pendingWrite = { text, words, timer: setTimeout(() => this.flushWrite(), WRITE_DELAY_MS) };
  }

  protected setSpeaker(text: ScenarioText, speaker: ScenarioTextSpeaker): void {
    if (this.canEdit()) text.sendAs = speaker;
  }

  protected setTab(text: ScenarioText, identifier: string): void {
    if (this.canEdit()) text.tab = identifier;
  }

  protected setColor(text: ScenarioText, color: string): void {
    if (this.canEdit()) text.color = color;
  }

  protected openMenu(event: MouseEvent, text: ScenarioText): void {
    if (!this.canEdit()) return;
    event.preventDefault();
    event.stopPropagation();
    const row = this.rowOf(text);
    const siblings = this.siblingsOf(text);
    const index = siblings.indexOf(text);
    const reorder = buildReorderContextMenu(
      { index, count: siblings.length },
      {
        moveToTop: () => this.moveWithin(text, 0),
        moveUp: () => this.moveWithin(text, index - 1),
        moveDown: () => this.moveWithin(text, index + 1),
        moveToBottom: () => this.moveWithin(text, siblings.length - 1),
      },
      this.t
    );
    const actions = buildScenarioTextContextMenu(
      { folderName: normalizeFolderPath(text.folderName), hasWords: row.hasWords, speaker: this.speakerOf(text) },
      this.shelf.knownPaths(),
      reorder,
      {
        sendAs: (speaker) => this.send(text, { speaker }),
        edit: () => this.pick(text),
        duplicate: () => this.duplicate(text),
        moveTo: (path) => this.shelf.fileInto([text], path),
        remove: () => void this.remove(text),
      },
      this.t
    );
    this.contextMenu.open(this.pointer.pointers[0], actions, row.title);
  }

  protected duplicate(text: ScenarioText): void {
    this.flushWrite();
    const copy = this.texts.duplicate(
      text,
      this.t('feature.scenarioText.copyTitle', { title: this.rowOf(text).title })
    );
    if (copy) this.pick(copy);
  }

  /** Deletes a text for everyone, once the reader has said they mean it. */
  protected async remove(text: ScenarioText): Promise<void> {
    if (!this.canEdit()) return;
    const sure = await this.confirm.ask({
      message: this.t('feature.scenarioText.deleteConfirm', { title: this.rowOf(text).title }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!sure || !this.canEdit()) return;
    if (this.pendingWrite?.text === text) {
      clearTimeout(this.pendingWrite.timer);
      this.pendingWrite = null;
    }
    if (this.picked() === text.identifier) this.picked.set(null);
    text.destroy();
  }

  protected dragStart(event: DragEvent, text: ScenarioText): void {
    if (!this.canEdit()) return;
    event.dataTransfer?.setData('text/plain', text.title);
    this.reorder.begin(text);
  }

  protected dragOver(event: DragEvent, text: ScenarioText): void {
    if (this.reorder.held() === null) return;
    event.preventDefault();
    this.reorder.hoverHalf(text, (event.currentTarget as HTMLElement).getBoundingClientRect(), event.clientY);
  }

  /** A text dropped on another goes into that one's folder, before or after it. */
  protected dropOnRow(event: DragEvent): void {
    const dropped = this.reorder.release();
    if (!dropped) return;
    event.preventDefault();
    event.stopPropagation();
    const { held, over, side } = dropped;
    this.shelf.fileInto([held], over.folderName);
    const siblings = this.siblingsOf(held).filter((text) => text !== held);
    siblings.splice(siblings.indexOf(over) + (side === 'after' ? 1 : 0), 0, held);
    this.putInOrder(held, siblings);
  }

  /** A text dropped on a folder goes into it, last. */
  protected dropIntoFolder(path: string): void {
    const held = this.reorder.held();
    this.reorder.cancel();
    if (!held) return;
    this.shelf.fileInto([held], path);
    this.putInOrder(held, [...this.siblingsOf(held).filter((text) => text !== held), held]);
  }

  protected dragEnd(): void {
    this.reorder.cancel();
  }

  protected isDropTarget(text: ScenarioText): boolean {
    return this.reorder.over() === text;
  }

  private flushWrite(): void {
    const pending = this.pendingWrite;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingWrite = null;
    if (this.canEdit() && pending.text.text !== pending.words) pending.text.write(pending.words);
  }

  private siblingsOf(text: ScenarioText): ScenarioText[] {
    const folder = normalizeFolderPath(text.folderName);
    return ScenarioText.all().filter((candidate) => normalizeFolderPath(candidate.folderName) === folder);
  }

  private moveWithin(text: ScenarioText, to: number): void {
    const siblings = this.siblingsOf(text).filter((candidate) => candidate !== text);
    siblings.splice(Math.max(0, Math.min(siblings.length, to)), 0, text);
    this.putInOrder(text, siblings);
  }

  private putInOrder(moved: ScenarioText, ordered: readonly ScenarioText[]): void {
    if (!this.canEdit()) return;
    const folder = normalizeFolderPath(moved.folderName);
    const list = withFolderInOrder(ScenarioText.all(), (text) => text.folderName, folder, ordered);
    GameObject.batch(() => {
      list.forEach((text, index) => {
        if (Number(text.order) !== index + 1) text.order = index + 1;
      });
    });
  }
}
