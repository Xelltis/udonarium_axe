import { emitMessageAdded } from '@axe/core/event/domain-events';
import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatLogExporter } from '@axe/domain/chat/chat-log-exporter';
import { ChatMessage, ChatMessageContext } from '@axe/domain/chat/chat-message';
import { SYSTEM_CHAT_TAB_IDENTIFIER } from '@axe/domain/chat/constants';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';

const PORTRAIT_SLOT_COUNT = 12;
const DEFAULT_IMAGE_IDENTIFIERS: readonly string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

@SyncObject('chat-tab')
export class ChatTab extends ObjectNode implements InnerXml {
  @SyncVar() name = 'タブ';

  /** Whether it is the tab for the system messages. It cannot be deleted and stays out of an export of every tab. */
  get isSystemTab(): boolean {
    return this.identifier === SYSTEM_CHAT_TAB_IDENTIFIER;
  }

  @SyncVar() plCanView = true;
  @SyncVar() plCanSpeak = true;
  @SyncVar() guestCanView = true;
  @SyncVar() guestCanSpeak = false;

  @SyncVar() pos_num = -1;
  @SyncVar() imageIdentifier: string[] = [...DEFAULT_IMAGE_IDENTIFIERS];
  @SyncVar('imageCharactorName') imageCharacterName: string[] = Array.from(
    { length: PORTRAIT_SLOT_COUNT },
    (_, i) => `#${i}`
  );
  @SyncVar() imageIdentifierZpos: number[] = Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => i);

  /**
   * When novel mode was last asked to clear the portraits standing on this tab.
   *
   * The stage is worked out from the log rather than kept anywhere, so clearing it is a line
   * drawn across the log: nothing said before this stands on the stage while the reader is
   * looking at anything said after it. It lives on the tab because a room read back from a
   * file makes its tabs afresh, and a note kept elsewhere under a tab's identifier would be
   * orphaned by that. Deliberately without an initialiser, so it is written only once asked
   * for. See `toStageResetAt`.
   */
  @SyncVar() vnPortraitResetAt: number;

  @SyncVar() count = 0;
  @SyncVar() imageIdentifierDummy = 'test';

  /** The room's cut-in launcher, looked up in the object store, or null when there is none. */
  get cutInLauncher(): CutInLauncher | null {
    return ObjectStore.instance.get<CutInLauncher>('CutInLauncher');
  }

  private _displayableMessageNum = 0;
  /**
   * How many lines the local user may see have arrived in this tab, counted in this browser as they
   * are added.
   */
  displayableMessagesLength(): number {
    return this._displayableMessageNum;
  }

  /**
   * Clears every portrait standing on the tab, returning each slot to its placeholder and the
   * stacking to its default order.
   */
  portraitReset() {
    this.imageIdentifier = [...DEFAULT_IMAGE_IDENTIFIERS];
    this.imageCharacterName = Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => `#${i}`);
    this.imageIdentifierZpos = Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => i);
    this.imageIdentifierDummy = 'test';
  }

  imageDispFlag: boolean[] = Array(PORTRAIT_SLOT_COUNT).fill(true) as boolean[];

  /** The lines in this tab, in the order they were placed. */
  get chatMessages(): readonly ChatMessage[] {
    return this.children as readonly ChatMessage[];
  }

  /**
   * The line a dice result answers: said by whoever rolled, the moment before the result.
   *
   * The messages are kept in the order they were placed in, so the search starts where that
   * moment falls rather than at the top of the log, and the line is usually the next one or
   * close by. A kept-back line disclosed later is placed at the moment it was shown, which is
   * never earlier than that moment but can be after the result, so the search reads on past the
   * result until it finds the line.
   */
  findRollSource(dice: ChatMessage): ChatMessage | null {
    const originFrom = dice.originFrom ?? '';
    const said = dice.timestamp - 1;
    const messages = this.chatMessages;
    let low = 0;
    let high = messages.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (messages[middle].index < said) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < messages.length; i++) {
      const candidate = messages[i];
      if (candidate.timestamp === said && candidate.from === originFrom) return candidate;
    }
    return null;
  }

  /** A copy of the stacking order of the portrait slots, bottom first. */
  get imageZposList(): number[] {
    const ret: number[] = this.imageIdentifierZpos.slice();
    return ret;
  }

  /** The portrait slot a speaker of that name stands in, or -1 when they stand in none. */
  portraitSlotOf(name: string) {
    for (let i = 0; i < this.imageCharacterName.length; i++) {
      if (name == this.imageCharacterName[i]) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Hides the portrait in that slot in this browser, until a line said to everyone stands someone
   * there again.
   */
  hidePortraitPos(pos: number) {
    this.imageDispFlag[pos] = false;
    this.update();
  }

  /** Whether the portrait in that slot is showing in this browser. */
  isPortraitPosVisible(pos: number): boolean {
    return this.imageDispFlag[pos];
  }

  /**
   * The stacking level of a portrait slot, higher drawn on top, or -1 for a slot not in the order.
   */
  portraitZIndex(toppos: number): number {
    const index = this.imageIdentifierZpos.indexOf(Number(toppos));
    return index;
  }

  private _chatSimpleDispFlag = 0;
  /**
   * Whether the tab shows its lines in the compact layout; 0 is off. Kept in this browser; setting
   * it announces a change to the tab.
   */
  get chatSimpleDispFlag(): number {
    return this._chatSimpleDispFlag;
  }
  set chatSimpleDispFlag(v: number) {
    this._chatSimpleDispFlag = v;
    this.update();
  }

  private _portraitDisplayFlag = 1;
  /**
   * Whether the tab shows speakers' portraits; 0 hides them. Kept in this browser; setting it
   * announces a change to the tab.
   */
  get portraitDisplayFlag(): number {
    return this._portraitDisplayFlag;
  }
  set portraitDisplayFlag(v: number) {
    this._portraitDisplayFlag = v;
    this.update();
  }

  /**
   * Brings a portrait slot to the top of the stacking order. Nothing changes for a slot not in the
   * order.
   */
  replacePortraitZIndex(toppos: number) {
    const index = this.imageIdentifierZpos.indexOf(Number(toppos));
    if (index >= 0) {
      this.imageIdentifierZpos.splice(index, 1);
      this.imageIdentifierZpos.push(Number(toppos));
    }
  }

  private _dispCharctorIcon = true;
  /** Whether the tab shows the speaker's icon beside each line. Kept in this browser alone. */
  get dispCharctorIcon(): boolean {
    return this._dispCharctorIcon;
  }
  set dispCharctorIcon(flag: boolean) {
    this._dispCharctorIcon = flag;
  }

  private _unreadLength = 0;
  /** How many lines the local user may see have arrived since the tab was last marked read. */
  get unreadLength(): number {
    return this._unreadLength;
  }
  /** Whether any line the local user may see has arrived since the tab was last marked read. */
  get hasUnread(): boolean {
    return this.unreadLength > 0;
  }

  /** When the last line in the tab was placed, or 0 for an empty tab. */
  get latestTimeStamp(): number {
    const lastIndex = this.chatMessages.length - 1;
    return lastIndex < 0 ? 0 : this.chatMessages[lastIndex].placedAt;
  }

  /**
   * Counts a new line the local user may see as unread, shows the portrait slot it speaks from
   * again when it is said to everyone, and announces the message as added.
   */
  override onChildAdded(child: ObjectNode) {
    super.onChildAdded(child);
    if (child.parent === this && child instanceof ChatMessage && child.isDisplayable) {
      if (this.children.length === 1) {
        this._unreadLength = 1;
        this._displayableMessageNum = 1;
      } else {
        this._unreadLength++;
        this._displayableMessageNum++;
      }

      if (child.to == null || child.to === '') {
        this.imageDispFlag[child.imagePos] = true;
      }

      emitMessageAdded({ tabIdentifier: this.identifier, messageIdentifier: child.identifier });
    }
  }

  /**
   * Adds a line to the tab from a message context and returns it.
   *
   * A line said to everyone that names a portrait slot stands its speaker's portrait there, moving
   * it out of any slot they held before and raising it to the top. Fields left empty are not copied
   * onto the line.
   */
  addMessage(message: ChatMessageContext): ChatMessage {
    message.tabIdentifier = this.identifier;

    const chat = new ChatMessage();
    for (const key of Object.keys(message as Record<string, unknown>)) {
      if (key === 'identifier') continue;
      if (key === 'tabIdentifier') continue;

      if (key === 'text') {
        chat.value = (message as Record<string, unknown>)[key] as string;
        continue;
      }
      if ((message as Record<string, unknown>)[key] == null || (message as Record<string, unknown>)[key] === '')
        continue;

      if (key === 'imagePos') {
        if (message.to != null && message.to !== '') continue;
        this.pos_num = (message as Record<string, unknown>)[key] as number;
        if (this.pos_num >= 0 && this.pos_num < this.imageIdentifier.length) {
          const oldpos = this.portraitSlotOf(message.name ?? '');
          if (oldpos >= 0) {
            this.imageIdentifier[oldpos] = '';
            this.imageCharacterName[oldpos] = '';
            this.imageDispFlag[oldpos] = false;
          }

          if (message.imageIdentifier !== '') {
            this.imageIdentifier[this.pos_num] = message.imageIdentifier ?? '';
            this.imageCharacterName[this.pos_num] = message.name ?? '';
            this.replacePortraitZIndex(this.pos_num);
            this.imageDispFlag[this.pos_num] = true;

            chat.imagePos = (message as Record<string, unknown>)[key] as number;
          }
          this.imageIdentifierDummy = message.imageIdentifier ?? '';
        }
        continue;
      }

      if (key === 'timestamp') {
        chat.setAttribute(key, (message as Record<string, unknown>)[key] as string | number);
      } else {
        (chat as unknown as Record<string, unknown>)[key] = (message as Record<string, unknown>)[key];
      }
    }
    chat.initialize();
    this.appendChild(chat);
    return chat;
  }

  /** Reserved tabs keep their identity through room save/load instead of becoming ordinary tabs. */
  override toAttributes(): Attributes {
    const attributes = { ...ObjectSerializer.toAttributes(this.attributes as Attributes) };
    attributes['identifier'] = this.identifier;
    return attributes;
  }

  /**
   * Reads the tab back, taking a saved identifier as its own so a reserved tab such as the system
   * tab keeps its identity.
   */
  override parseAttributes(attributes: NamedNodeMap): void {
    ObjectSerializer.parseAttributes(this.attributes, attributes);
    const persistedIdentifier = this.attributes['identifier'];
    if (typeof persistedIdentifier === 'string' && persistedIdentifier.length > 0) {
      (this as unknown as { context: { identifier: string } }).context.identifier = persistedIdentifier;
      delete (this.attributes as Record<string, unknown>)['identifier'];
    }
  }

  /** Marks every line in the tab as read in this browser. */
  markForRead() {
    this._unreadLength = 0;
  }

  /**
   * What goes into room data: the tab's lines, leaving out direct lines the local user may not see.
   */
  override innerXml(): string {
    let xml = '';
    for (const child of this.children) {
      if (child instanceof ChatMessage && !child.isDisplayable) continue;
      xml += ObjectSerializer.instance.toXml(child);
    }
    return xml;
  }

  /** One line in the standard log layout, as the local user sees it. */
  messageHtml(isTime: boolean, tabName: string, message: ChatMessage): string {
    return ChatLogExporter.formatMessageStandard(isTime, tabName, message);
  }

  /** One line in the classic log layout, as the local user sees it. */
  messageHtmlCoc(tabName: string, message: ChatMessage): string {
    return ChatLogExporter.formatMessageCoc(tabName, message);
  }

  /** Escapes text for log html; see `ChatLogExporter.escapeHtml`. */
  escapeHtml(value: unknown): string {
    return ChatLogExporter.escapeHtml(value);
  }

  /** The standard-layout log page of this tab, as the local user sees it. */
  logHtml(): string {
    return ChatLogExporter.exportTabHtml(this);
  }

  /** The classic-layout log page of this tab, as the local user sees it. */
  logHtmlCoc(): string {
    return ChatLogExporter.exportTabHtmlCoc(this);
  }
}
