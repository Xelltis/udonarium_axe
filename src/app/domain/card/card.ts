import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ImageFile } from '@axe/core/storage/image-file';
import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { handLocationOf, isHandLocation, isHandOf } from '@axe/domain/card/hand-location';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { moveToTopmost } from '@axe/domain/tabletop/tabletop-object-util';

const FACE_FONT_COLOR = /^#[0-9a-f]{6}$/i;

export enum CardState {
  FRONT,
  BACK,
}

@SyncObject('card')
export class Card extends OwnedTabletopObject {
  static readonly DEFAULT_FACE_FONT_SIZE = 18;
  static readonly DEFAULT_FACE_FONT_COLOR = '#16171c';
  @SyncVar() isLock: boolean = false;
  @SyncVar() dispLockMark: boolean = true;

  @SyncVar() state: CardState = CardState.FRONT;
  @SyncVar() rotate: number = 0;
  @SyncVar() owner: string = '';
  @SyncVar() zindex: number = 0;
  @SyncVar() handOrder: number = 0;
  @SyncVar() cutInIdentifier: string = '';
  @SyncVar() targetIdentifier: string = '';
  @SyncVar() disclosureMode: string = '';
  @SyncVar() disclosureUserIds: string[] = [];

  @SyncVar() overViewWidth: number = 250;
  @SyncVar() overViewMaxHeight: number = 250;

  /** A card is drawn loose on the table only when it is not inside a card stack, or its stack is gone. */
  override get isVisibleOnTable(): boolean {
    return this.location.name === 'table' && (!this.parentIsAssigned || this.parentIsDestroyed);
  }

  /** The card's width on the table, in grid cells; 2 when the card has no size element. */
  get size(): number {
    return this.getCommonValue('size', 2);
  }
  /** Text drawn over the front face. Legacy cards without the element read as empty. */
  get faceText(): string {
    return this.getCommonValue('text', '');
  }
  set faceText(value: string) {
    this.setOrCreateCommonValue('text', value, { type: DataElementType.NOTE, currentValue: value });
    const element = this.commonDataElement?.getFirstElementByName('text');
    if (element && element.currentValue !== value) element.currentValue = value;
  }
  /**
   * Font size of the face text, kept between 1 and 120 and rounded to a whole number.
   *
   * A value that is not a number reads and writes as the default size.
   */
  get faceFontSize(): number {
    const value = Number(this.getCommonValue('fontsize', Card.DEFAULT_FACE_FONT_SIZE));
    return Number.isFinite(value) ? Math.max(1, Math.min(120, Math.round(value))) : Card.DEFAULT_FACE_FONT_SIZE;
  }
  set faceFontSize(value: number) {
    const normalized = Number.isFinite(value)
      ? Math.max(1, Math.min(120, Math.round(value)))
      : Card.DEFAULT_FACE_FONT_SIZE;
    this.setOrCreateCommonValue('fontsize', normalized);
  }
  /** Colour of the face text as `#rrggbb`; anything else reads and writes as the default colour. */
  get faceFontColor(): string {
    const value = String(this.getCommonValue('fontcolor', Card.DEFAULT_FACE_FONT_COLOR));
    return FACE_FONT_COLOR.test(value) ? value : Card.DEFAULT_FACE_FONT_COLOR;
  }
  set faceFontColor(value: string) {
    this.setOrCreateCommonValue('fontcolor', FACE_FONT_COLOR.test(value) ? value : Card.DEFAULT_FACE_FONT_COLOR);
  }
  private setOrCreateCommonValue(name: string, value: string | number, attributes: Attributes = {}): void {
    const existing = this.commonDataElement?.getFirstElementByName(name);
    if (existing) {
      existing.value = value;
      return;
    }
    this.commonDataElement?.appendChild(DataElement.create(name, value, attributes, `${name}_${this.identifier}`));
  }
  set size(size: number) {
    this.setCommonValue('size', size);
  }
  /** The image on the card's front, or null when none is set or it is not in image storage. */
  get frontImage(): ImageFile | null {
    return this.getImageFile('front');
  }
  /** The image on the card's back, or null when none is set or it is not in image storage. */
  get backImage(): ImageFile | null {
    return this.getImageFile('back');
  }

  /** The image this user sees: the front when the card is visible to them, the back otherwise. */
  override get imageFile(): ImageFile {
    return this.isVisible ? (this.frontImage ?? ImageFile.Empty) : (this.backImage ?? ImageFile.Empty);
  }

  /** Whether this user is peeking at the card, which is what owning a card means. */
  get isPeeking(): boolean {
    return this.isMine;
  }
  /** Whether the card lies face up for everyone. */
  get isFront(): boolean {
    return this.state === CardState.FRONT;
  }
  /** Whether the card is in this user's hand; false before a room has been joined. */
  get isInMyHand(): boolean {
    return isHandOf(this.location.name, getPeerContext().userId);
  }
  /** Whether the card is in any player's hand rather than on the table. */
  get isInAnyHand(): boolean {
    return isHandLocation(this.location.name);
  }
  /** Whether this user can see the card's front: it is face up, they are peeking, or it is in their hand. */
  get isVisible(): boolean {
    return this.isPeeking || this.isFront || this.isInMyHand;
  }

  /** Turns the card face up for everyone and ends any peek at it. */
  faceUp() {
    this.state = CardState.FRONT;
    this.owner = '';
  }

  /** Turns the card face down and ends any peek at it. */
  faceDown() {
    this.state = CardState.BACK;
    this.owner = '';
  }

  /**
   * Moves the card into a player's hand, face down so only that player sees its front.
   *
   * The hand is sorted by `handOrder`, which defaults to now so the card joins the end of the hand.
   */
  toHand(userId: string, handOrder: number = Date.now()) {
    this.owner = '';
    this.state = CardState.BACK;
    this.handOrder = handOrder;
    this.setLocation(handLocationOf(userId));
  }

  /** Puts the card on the table face up, as when playing it from a hand. */
  playFaceUp() {
    this.setLocation('table');
    this.faceUp();
  }

  /** Puts the card on the table face down, as when playing it from a hand. */
  playFaceDown() {
    this.setLocation('table');
    this.faceDown();
  }

  /** Raises the card above every other card and card stack in the drawing order. */
  toTopmost() {
    moveToTopmost(this, ['card-stack']);
  }

  /**
   * Makes a face-up card from front and back image identifiers, with the default face font and no face text.
   *
   * Pass an identifier to give the card a fixed id; otherwise a new one is generated.
   */
  static create(name: string, fornt: string, back: string, size: number = 2, identifier?: string): Card {
    let object: Card;

    if (identifier) {
      object = new Card(identifier);
    } else {
      object = new Card();
    }
    object.createDataElements();

    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('size', size, {}, `size_${object.identifier}`));
    object.commonDataElement!.appendChild(
      DataElement.create('fontsize', Card.DEFAULT_FACE_FONT_SIZE, {}, `fontsize_${object.identifier}`)
    );
    object.commonDataElement!.appendChild(
      DataElement.create('text', '', { type: DataElementType.NOTE, currentValue: '' }, `text_${object.identifier}`)
    );
    object.imageDataElement!.appendChild(
      DataElement.create('front', fornt, { type: 'image' }, `front_${object.identifier}`)
    );
    object.imageDataElement!.appendChild(
      DataElement.create('back', back, { type: 'image' }, `back_${object.identifier}`)
    );
    object.initialize();

    return object;
  }
}
