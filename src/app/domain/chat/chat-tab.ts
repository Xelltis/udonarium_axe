import { emitMessageAdded } from '@axe/core/event/domain-events';
import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatLogExporter } from '@axe/domain/chat/chat-log-exporter';
import { ChatMessage, ChatMessageContext } from '@axe/domain/chat/chat-message';
import { SYSTEM_CHAT_TAB_IDENTIFIER, TICKER_CHAT_TAB_IDENTIFIER } from '@axe/domain/chat/constants';
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

  /** The dedicated public conversation whose messages feed the four-edge ticker. */
  get isTickerTab(): boolean {
    return this.identifier === TICKER_CHAT_TAB_IDENTIFIER;
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

  get cutInLauncher(): CutInLauncher | null {
    return ObjectStore.instance.get<CutInLauncher>('CutInLauncher');
  }

  private _displayableMessageNum = 0;
  displayableMessagesLength(): number {
    return this._displayableMessageNum;
  }

  portraitReset() {
    this.imageIdentifier = [...DEFAULT_IMAGE_IDENTIFIERS];
    this.imageCharacterName = Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => `#${i}`);
    this.imageIdentifierZpos = Array.from({ length: PORTRAIT_SLOT_COUNT }, (_, i) => i);
    this.imageIdentifierDummy = 'test';
  }

  imageDispFlag: boolean[] = Array(PORTRAIT_SLOT_COUNT).fill(true) as boolean[];

  get chatMessages(): readonly ChatMessage[] {
    return this.children as readonly ChatMessage[];
  }

  get imageZposList(): number[] {
    const ret: number[] = this.imageIdentifierZpos.slice();
    return ret;
  }

  portraitSlotOf(name: string) {
    for (let i = 0; i < this.imageCharacterName.length; i++) {
      if (name == this.imageCharacterName[i]) {
        return i;
      }
    }
    return -1;
  }

  hidePortraitPos(pos: number) {
    this.imageDispFlag[pos] = false;
    this.update();
  }

  isPortraitPosVisible(pos: number): boolean {
    return this.imageDispFlag[pos];
  }

  portraitZIndex(toppos: number): number {
    const index = this.imageIdentifierZpos.indexOf(Number(toppos));
    return index;
  }

  private _chatSimpleDispFlag = 0;
  get chatSimpleDispFlag(): number {
    return this._chatSimpleDispFlag;
  }
  set chatSimpleDispFlag(v: number) {
    this._chatSimpleDispFlag = v;
    this.update();
  }

  private _portraitDisplayFlag = 1;
  get portraitDisplayFlag(): number {
    return this._portraitDisplayFlag;
  }
  set portraitDisplayFlag(v: number) {
    this._portraitDisplayFlag = v;
    this.update();
  }

  replacePortraitZIndex(toppos: number) {
    const index = this.imageIdentifierZpos.indexOf(Number(toppos));
    if (index >= 0) {
      this.imageIdentifierZpos.splice(index, 1);
      this.imageIdentifierZpos.push(Number(toppos));
    }
  }

  private _dispCharctorIcon = true;
  get dispCharctorIcon(): boolean {
    return this._dispCharctorIcon;
  }
  set dispCharctorIcon(flag: boolean) {
    this._dispCharctorIcon = flag;
  }

  private _unreadLength = 0;
  get unreadLength(): number {
    return this._unreadLength;
  }
  get hasUnread(): boolean {
    return this.unreadLength > 0;
  }

  get latestTimeStamp(): number {
    const lastIndex = this.chatMessages.length - 1;
    return lastIndex < 0 ? 0 : this.chatMessages[lastIndex].placedAt;
  }

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

  override parseAttributes(attributes: NamedNodeMap): void {
    ObjectSerializer.parseAttributes(this.attributes, attributes);
    const persistedIdentifier = this.attributes['identifier'];
    if (typeof persistedIdentifier === 'string' && persistedIdentifier.length > 0) {
      (this as unknown as { context: { identifier: string } }).context.identifier = persistedIdentifier;
      delete (this.attributes as Record<string, unknown>)['identifier'];
    }
  }

  markForRead() {
    this._unreadLength = 0;
  }

  override innerXml(): string {
    let xml = '';
    for (const child of this.children) {
      if (child instanceof ChatMessage && !child.isDisplayable) continue;
      xml += ObjectSerializer.instance.toXml(child);
    }
    return xml;
  }

  messageHtml(isTime: boolean, tabName: string, message: ChatMessage): string {
    return ChatLogExporter.formatMessageStandard(isTime, tabName, message);
  }

  messageHtmlCoc(tabName: string, message: ChatMessage): string {
    return ChatLogExporter.formatMessageCoc(tabName, message);
  }

  escapeHtml(value: unknown): string {
    return ChatLogExporter.escapeHtml(value);
  }

  logHtml(): string {
    return ChatLogExporter.exportTabHtml(this);
  }

  logHtmlCoc(): string {
    return ChatLogExporter.exportTabHtmlCoc(this);
  }
}
