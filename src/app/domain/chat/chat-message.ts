import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { OUT_OF_STORY_TAG } from '@axe/domain/chat/constants';
import { type DiceRollDetail, parseDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { VN_PORTRAIT_POS_UNSET } from '@axe/domain/visual-novel/vn-portrait-position';

/** Whether an attribute holds a moment, as opposed to being unset; an empty one is not read as 0. */
function isPositiveTime(value: unknown): boolean {
  const time = Number(value);
  return Number.isFinite(time) && time > 0;
}

export interface ChatMessageTargetContext {
  text: string;
  object: GameCharacter | null;
}

export interface ChatMessageContext {
  identifier?: string;
  tabIdentifier?: string;
  originFrom?: string;
  from?: string;
  to?: string;
  name?: string;
  text?: string;
  timestamp?: number;
  tag?: string;
  dicebot?: string;
  imageIdentifier?: string;
  attachmentImageIdentifiers?: string;

  imagePos?: number;
  messColor?: string;
  messBubbleLight?: string;
  messBubbleDark?: string;
  sendFrom?: string;
  replyTo?: string;
  quoteOf?: string;
  vnEmote?: string;
  senderRole?: string;
  diceLook?: string;
  diceImageIdentifier?: string;
}

@SyncObject('chat')
export class ChatMessage extends ObjectNode implements ChatMessageContext {
  @SyncVar() originFrom: string;
  @SyncVar() from: string;
  @SyncVar() to: string;
  @SyncVar() name: string;
  @SyncVar() tag: string;
  @SyncVar() dicebot: string;
  @SyncVar() imageIdentifier: string;
  @SyncVar() attachmentImageIdentifiers: string = '';
  @SyncVar() imagePos: number;
  @SyncVar() vnPortraitPos: number = VN_PORTRAIT_POS_UNSET;
  /**
   * How novel mode is asked to stage this line, read by `vnEmoteOf`.
   *
   * Deliberately left without an initialiser: class fields are assigned rather than defined
   * here, so giving one would write the attribute onto every message ever said, novel mode or
   * not. Unset reads back as an empty string, which is what an absent staging means anyway.
   */
  @SyncVar() vnEmote: string;
  /**
   * What the person speaking was when they said it.
   *
   * A role is worn now and taken off later, and the cursor that carried it is built afresh on
   * every connection, so neither can answer for a line already said. Recorded here so that a
   * reading of the log settles what it is once and keeps that answer.
   *
   * Left without an initialiser, as `vnEmote` is: a line from a room that never wrote one has
   * nothing to say about its speaker, and reads back empty.
   */
  @SyncVar() senderRole: string;
  @SyncVar() messColor: string;
  /** The bubble the sender asked for on each theme. Empty is worked out from the colour. */
  @SyncVar() messBubbleLight: string = '';
  @SyncVar() messBubbleDark: string = '';
  @SyncVar() sendFrom: string;
  /**
   * How the one who said it wants their dice to look, as `encodeDiceLook` writes it; read with
   * `decodeDiceLook`. A dice bot's answer carries the look of the line it answers.
   *
   * Left without an initialiser, as `vnEmote` is: most lines say nothing of dice, and a line from
   * before looks were offered reads back empty, which is the plain look.
   */
  @SyncVar() diceLook: string;
  /**
   * The picture the dice of the line wear, by the identifier the room's images know it by; read
   * with the look as `decodeDiceLook(diceLook, diceImageIdentifier)`.
   *
   * Kept apart from the look, under a name ending in ImageIdentifier, so that saving the room keeps
   * the picture as it keeps any other a line or a piece points at. Left without an initialiser, as
   * `diceLook` is.
   */
  @SyncVar() diceImageIdentifier: string;
  @SyncVar() replyTo: string = '';
  @SyncVar() quoteOf: string = '';
  @SyncVar() fixd: boolean = false;
  @SyncVar() disclosedAt: number;
  /**
   * When the one who said the line made it an after-the-fact whisper (あとから秘話), in epoch
   * milliseconds; read with `isAfterWhisper`.
   *
   * Such a line becomes a whisper like any other: addressed and named as one, so from then on it
   * reaches the one it is whispered to and its speaker alone, in older versions of the tool too.
   * This only remembers that it was said to everyone first, so that it can be put back. Left without
   * an initialiser, as `vnEmote` is: most lines never become one.
   */
  @SyncVar() afterWhisperAt: number;
  /**
   * Who the line was addressed to before it became an after-the-fact whisper, put back by
   * `undoAfterWhisper`. Empty for everyone.
   */
  @SyncVar() afterWhisperTo: string;
  /** The name the line was said under before it became an after-the-fact whisper, put back by `undoAfterWhisper`. */
  @SyncVar() afterWhisperName: string;

  targetInfo: ChatMessageTargetContext[];

  /**
   * The identifier of the tab the line sits in, read from its parent. Empty for a line in no tab.
   */
  get tabIdentifier(): string {
    return this.parent?.identifier ?? '';
  }
  /** What the line says, kept as the node's value. */
  get text(): string {
    return this.value as string;
  }
  set text(text: string) {
    this.value = text;
  }

  /**
   * When the line was said, in epoch milliseconds, from its `timestamp` attribute. 0 when unset,
   * and 1 when it is not a number.
   */
  get timestamp(): number {
    const timestamp = this.getAttribute('timestamp');
    const num = timestamp ? +timestamp : 0;
    return Number.isNaN(num) ? 1 : num;
  }
  private _to!: string;
  private _sendTo: string[] = [];
  /**
   * The user ids a direct line is addressed to, split out of `to`. Empty for a line said to
   * everyone. Cached until `to` changes.
   */
  get sendTo(): string[] {
    if (this._to !== this.to) {
      this._to = this.to;
      this._sendTo = this.to != null && this.to.trim().length > 0 ? this.to.trim().split(/\s+/) : [];
    }
    return this._sendTo;
  }
  private _tag!: string;
  private _tags: string[] = [];
  /**
   * The line's tags split out of `tag`, such as its dice bot, `system` or `secret`. Cached until
   * `tag` changes.
   */
  get tags(): string[] {
    if (this._tag !== this.tag) {
      this._tag = this.tag;
      this._tags = this.tag != null && this.tag.trim().length > 0 ? this.tag.trim().split(/\s+/) : [];
    }
    return this._tags;
  }
  /** The portrait shown beside the line, or null when that picture is not in storage. */
  get image(): ImageFile | null {
    return ImageStorage.instance.get(this.imageIdentifier);
  }
  /**
   * The line this one replies to, or null when it replies to none or that line is not in the store.
   */
  get replyToMessage(): ChatMessage | null {
    if (!this.replyTo) return null;
    const target = ObjectStore.instance.get<ChatMessage>(this.replyTo);
    return target instanceof ChatMessage ? target : null;
  }
  /** The line this one quotes, or null when it quotes none or that line is not in the store. */
  get quoteOfMessage(): ChatMessage | null {
    if (!this.quoteOf) return null;
    const target = ObjectStore.instance.get<ChatMessage>(this.quoteOf);
    return target instanceof ChatMessage ? target : null;
  }
  /**
   * The identifiers of the pictures attached to the line.
   *
   * They are stored as a json array or, in the older form, one to a line. Blank entries are
   * dropped, and an array that cannot be read gives none.
   */
  get attachmentImageIdentifierList(): string[] {
    const rawValue = String(this.attachmentImageIdentifiers ?? '').trim();
    if (rawValue.startsWith('[')) {
      try {
        const identifiers = JSON.parse(rawValue) as unknown;
        if (Array.isArray(identifiers)) {
          return identifiers
            .map((identifier) => String(identifier).trim())
            .filter((identifier) => identifier.length > 0);
        }
      } catch {
        return [];
      }
    }
    return rawValue
      .split(/\n+/)
      .map((identifier) => identifier.trim())
      .filter((identifier) => identifier.length > 0);
  }
  /** The attached pictures that are in storage, in order; any not received yet are left out. */
  get attachmentImages(): ImageFile[] {
    return this.attachmentImageIdentifierList
      .map((identifier) => ImageStorage.instance.get(identifier))
      .filter((image): image is ImageFile => image != null);
  }
  /**
   * Where the line falls in the log, in epoch milliseconds: when it was shown to the table, for a
   * kept-back line disclosed later, and otherwise when it was said.
   */
  get placedAt(): number {
    const disclosedAt = Number(this.disclosedAt);
    return Number.isFinite(disclosedAt) && disclosedAt > 0 ? disclosedAt : this.timestamp;
  }
  /**
   * The line's sort key among its tab's lines: its placed time plus a random fraction, so lines
   * keep log order and two placed at the same moment still sort apart.
   */
  override get index(): number {
    return this.minorIndex + this.placedAt;
  }

  // The reply and the quotation hold the identifier of the message they refer to as text.
  // The base class does not write that identifier out, so every save and load would mint a
  // new one and break the reference. This class writes it out and reads it back as an
  // attribute, so the relationship survives.
  /**
   * Writes the line out with its identifier as an attribute, so replies and quotations that refer
   * to it still find it after a save and a load.
   */
  override toAttributes(): Attributes {
    const attrs: Attributes = { ...ObjectSerializer.toAttributes(this.attributes as Attributes) };
    attrs['identifier'] = this.identifier;
    return attrs;
  }

  /**
   * Reads the line back, taking a saved identifier as its own rather than leaving it among the
   * attributes.
   */
  override parseAttributes(attributes: NamedNodeMap): void {
    ObjectSerializer.parseAttributes(this.attributes, attributes);
    const persistedId = this.attributes['identifier'];
    if (typeof persistedId === 'string' && persistedId.length > 0) {
      (this as unknown as { context: { identifier: string } }).context.identifier = persistedId;
      // it is removed from the attributes, the context being the one place it belongs
      delete (this.attributes as Record<string, unknown>)['identifier'];
    }
  }
  /** Whether the line is addressed to particular users rather than said to everyone. */
  get isDirect(): boolean {
    return this.sendTo.length > 0;
  }
  /**
   * Whether the local user sent the line, or is the one whose line it answers, as a dice result
   * does.
   */
  get isSendFromSelf(): boolean {
    return this.isSentBy(getPeerContext().userId);
  }
  /** Whether the user sent the line, or is the one whose line it answers, as a dice result does. */
  isSentBy(userId: string): boolean {
    return this.from === userId || this.originFrom === userId;
  }
  /** Whether the line concerns the local user: addressed to them, or sent by them. */
  get isRelatedToMe(): boolean {
    return this.isRelatedTo(getPeerContext().userId);
  }
  /** Whether the line concerns the user: addressed to them, or sent by them. */
  isRelatedTo(userId: string): boolean {
    return this.sendTo.includes(userId) || this.isSentBy(userId);
  }
  /**
   * Whether the local user may see the line: anything said to everyone, or a direct line that
   * concerns them.
   */
  get isDisplayable(): boolean {
    return this.isDirect ? this.isRelatedToMe : true;
  }
  /**
   * Whether the user may see the line: anything said to everyone, or a direct line that concerns
   * them.
   */
  isDisplayableTo(userId: string): boolean {
    return this.isDirect ? this.isRelatedTo(userId) : true;
  }
  /**
   * Whether the tool put the line out rather than someone typing it, as with dice results. Told by
   * its `system` tag.
   */
  get isSystem(): boolean {
    return this.tags.includes('system');
  }
  /** Whether the line is a dice bot's answer to a roll. */
  get isDicebot(): boolean {
    return this.isSystem && this.from === 'System-BCDice';
  }

  /** What was rolled and whether it succeeded. Anything rolled before this was recorded has neither. */
  get rollDetail(): DiceRollDetail | null {
    return parseDiceRollDetail(this.dicebot);
  }
  /**
   * Whether the line is kept back as secret, as a secret roll and its result are, until it is
   * disclosed.
   */
  get isSecret(): boolean {
    return this.tags.includes('secret');
  }

  /** Whether the one who said the line made it an after-the-fact whisper. */
  get isAfterWhisper(): boolean {
    return isPositiveTime(this.afterWhisperAt);
  }

  /**
   * Makes the line a whisper to the user given, named as a whisper is, `speaker > listener`; or
   * whispers it to them instead of whoever it was whispered to afterwards before. Who it was said to
   * in the first place, and under what name, are kept for `undoAfterWhisper`. Nothing changes
   * without anyone to whisper to.
   */
  makeAfterWhisper(to: string, toName: string, at: number): void {
    if (!to) return;
    if (!this.isAfterWhisper) {
      this.afterWhisperTo = this.to ?? '';
      this.afterWhisperName = this.name ?? '';
      this.afterWhisperAt = at;
    }
    this.to = to;
    const speaker = String(this.afterWhisperName ?? '');
    this.name = toName ? `${speaker} > ${toName}` : speaker;
  }

  /** Puts an after-the-fact whisper back where it was, said again to whoever it was said to before. */
  undoAfterWhisper(): void {
    if (!this.isAfterWhisper) return;
    this.to = String(this.afterWhisperTo ?? '');
    this.name = String(this.afterWhisperName ?? '');
    this.removeAttribute('afterWhisperTo');
    this.removeAttribute('afterWhisperName');
    this.removeAttribute('afterWhisperAt');
  }

  /** The room's tab list, looked up in the object store. */
  get chatTabList(): ChatTabList {
    return ObjectStore.instance.get<ChatTabList>('ChatTabList')!;
  }

  /**
   * Whether the line is a notice from the tool addressed to one reader alone, which is not styled
   * as a direct or secret line.
   */
  get isSystemToPL(): boolean {
    return this.tags.includes('to-pl-system-message');
  }
  /**
   * Whether the line is a notice from the tool rather than something said. Such a line cannot be
   * edited.
   */
  get isSystemMessage(): boolean {
    return this.from === 'System' || (this.tag ?? '').includes('system-message');
  }
  /** Whether novel mode should pass this line over rather than have it read out. */
  get isOutOfStory(): boolean {
    return this.tags.includes(OUT_OF_STORY_TAG);
  }

  /**
   * Whether the local user may edit the line: they sent it, and it is not a notice from the tool.
   */
  get changeable(): boolean {
    return this.isChangeableBy(getPeerContext().userId);
  }
  /**
   * Whether the user may edit the line: they sent it, and it is not a notice from the tool. A dice
   * result is sent by the dice bot, so nobody may.
   */
  isChangeableBy(userId: string): boolean {
    if (this.isSystemMessage) return false;
    return userId === this.from;
  }
}
