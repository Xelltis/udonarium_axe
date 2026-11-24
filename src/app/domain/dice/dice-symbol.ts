import { ImageFile } from '@axe/core/storage/image-file';
import { forgetSealedFace, keepSealedFace, sealedFaceOf } from '@axe/core/storage/sealed-faces';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';

export enum DiceType {
  D2,
  D4,
  D6,
  D8,
  D10,
  D10_10TIMES,
  D12,
  D20,
}

@SyncObject('dice-symbol')
export class DiceSymbol extends OwnedTabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() hideName: boolean = false;
  /** Whether this die has been spent. A die is no less a die for it; it is only marked as done. */
  @SyncVar() isUsed: boolean = false;

  /**
   * The face the room is told the die shows: its face, except for a die sealed by its keeper, which
   * tells the room nothing and keeps its face in the keeper's browser alone.
   */
  @SyncVar('face') sentFace: string = '0';
  /** The user ID of the seat that keeps the die's face to itself; empty while anyone may read it. */
  @SyncVar('owner') keeper: string = '';
  /**
   * Whether the seat that keeps the die keeps its face from the game master too, and from the room
   * altogether: the face is not sent while it is, so no seat but the keeper's can read it in any way.
   */
  @SyncVar() sealed: boolean = false;
  /**
   * The piece this die belongs to. Empty when it belongs to nobody.
   *
   * It is apart from `owner`, which says who may see the face. A die can stand in front of
   * a character for everybody to read and still be that character's die.
   */
  @SyncVar() ownerCharacterIdentifier: string = '';
  @SyncVar() rotate: number = 0;
  @SyncVar() disclosureMode: string = '';
  @SyncVar() disclosureUserIds: string[] = [];

  @SyncVar() specifyKomaImageFlag: boolean = false;
  @SyncVar('komaImageHeignt') komaImageHeight: number = 100;

  /**
   * The face the die shows. For the keeper of a sealed die it is the face its browser keeps; for any
   * other seat it is the face the room was told, which for a sealed die is none. A face given to a
   * sealed die by its keeper is kept in the keeper's browser and drawn there anew, the room told only
   * that the die changed.
   */
  get face(): string {
    if (this.isSealedHere) return sealedFaceOf(this.identifier) ?? this.sentFace;
    return this.sentFace;
  }
  set face(face: string) {
    if (!this.isSealedHere) {
      this.sentFace = face;
      return;
    }
    keepSealedFace(this.identifier, face);
    this.sentFace = '';
    this.update();
  }

  /**
   * Who keeps the die's face. A die handed to another seat, or to none, as one brought in from a file
   * is, is unsealed, its face lost to the room: it was kept in the browser of the seat that had it
   * alone. It then stands on its first face, as a die made anew does.
   */
  get owner(): string {
    return this.keeper;
  }
  set owner(owner: string) {
    if (owner !== this.keeper && this.sealed) this.letSealGo();
    this.keeper = owner;
  }

  /**
   * Hands the die over to another id of the same seat, as when somebody logs in outside a room. A
   * sealed die stays sealed, its face being in the same browser still, as it is not when the die goes
   * to another seat.
   */
  override handOverWithinSeat(toUserId: string): void {
    this.keeper = toUserId;
  }

  /** Whether this browser holds the face of a die this seat sealed: only one that does can show it. */
  get holdsSealedFace(): boolean {
    return this.isSealedHere && sealedFaceOf(this.identifier) !== null;
  }

  /** Whether the die is sealed by a seat that keeps it: what is sealed and kept by nobody tells nothing. */
  get isSealed(): boolean {
    return this.sealed && this.hasOwner;
  }

  private get isSealedHere(): boolean {
    return this.sealed && this.isMine;
  }

  /**
   * Seals the die's face to the seat that keeps it: the face it shows is kept in this browser and the
   * room is told none. Meant for the keeper's own seat, which is the only one that can open it again.
   */
  seal(): void {
    const face = this.face;
    keepSealedFace(this.identifier, face);
    this.sealed = true;
    this.sentFace = '';
  }

  /**
   * Tells the room the face of a sealed die again, as kept in this browser, and lets go of what was
   * kept. The die stays kept by its seat until it is shown.
   */
  unseal(): void {
    const face = this.face;
    this.sealed = false;
    this.sentFace = face;
    forgetSealedFace(this.identifier);
  }

  /**
   * A copy of the die. A sealed die copied in the browser that holds its face is copied sealed alike,
   * this browser keeping its face for the copy too; copied anywhere else, as by the game master, the
   * copy has a face nobody holds, and lets its seal go.
   */
  override clone(): this {
    const copy = super.clone();
    if (this.holdsSealedFace) keepSealedFace(copy.identifier, this.face);
    else if (copy.sealed) copy.letSealGo();
    return copy;
  }

  /**
   * Lets go of the seal of a die whose face is lost to the room, as one handed to another seat or a
   * copy made where its face is not held: it stands unsealed on the face the room was told, or on its
   * first, as a die made anew does. No sealed die is ever left with a face nobody holds.
   */
  private letSealGo(): void {
    this.sealed = false;
    if (!this.sentFace) this.sentFace = this.faces[0] ?? '';
  }

  /** How many cells the die spans, kept in its common data. 1 when unset. */
  get size(): number {
    return this.getCommonValue('size', 1);
  }
  set size(size: number) {
    this.setCommonValue('size', size);
  }

  /** The names of the die's faces in order, read from its picture elements. */
  get faces(): string[] {
    return this.imageDataElement?.children.map((element) => (element as DataElement).name) ?? [];
  }
  /**
   * The picture of the face showing, or of the first face when the one showing has none. The empty
   * image for a die with no faces.
   */
  override get imageFile(): ImageFile {
    if (this.faces.length) return this.getImageFile(this.face) ?? this.getImageFile(this.faces[0]) ?? ImageFile.Empty;
    return ImageFile.Empty;
  }

  /**
   * Whether the local user may read the face: the die has no owner, or it belongs to the local
   * user.
   */
  get isVisible(): boolean {
    return !this.hasOwner || this.isMine;
  }

  /**
   * Whether a seat may read the die's face and its name, and turn it: roll it, set its face, hide or
   * show its name, and change it on its sheet. Anyone may while nobody keeps the die. Once a seat
   * keeps it, that seat may, and so may a seat that sees what is kept back. A sealed die only the
   * browser that holds its face may read, as no other has it: not even its keeper's on another
   * device, or once the browser's site data was cleared.
   */
  isOpenTo(seesHidden: boolean): boolean {
    if (this.isSealed) return this.holdsSealedFace;
    return seesHidden || this.isVisible;
  }

  /**
   * Whether the table shows a seat the die's name: a seat that sees what is kept back always, and any
   * other while the die is open to it and its name is not hidden.
   */
  showsNameTo(seesHidden: boolean): boolean {
    return seesHidden || (this.isVisible && !this.hideName);
  }

  /** Turns the die to a random face and returns that face. Empty for a die with no faces. */
  diceRoll(): string {
    const faces = this.faces;
    this.face = 0 < faces.length ? faces[Math.floor(Math.random() * faces.length)] : '';
    return this.face;
  }

  /** Replaces the die's faces with those of the given type and turns it to the first of them. */
  setDicetype(type: DiceType) {
    this.makeDiceFace(type);
  }

  private makeDiceFace(type: DiceType, identifierSuffix?: string): DataElement[] {
    let sided: number;
    const faces: DataElement[] = [];
    let faceGeneratorFunc: (index: number) => string = (index) => `${index + 1}`;

    switch (type) {
      case DiceType.D2:
        sided = 2;
        break;
      case DiceType.D4:
        sided = 4;
        break;
      case DiceType.D6:
        sided = 6;
        break;
      case DiceType.D8:
        sided = 8;
        break;
      case DiceType.D10_10TIMES:
        faceGeneratorFunc = (index) => `${index + 1}0`;
      // falls through
      case DiceType.D10:
        sided = 10;
        break;
      case DiceType.D12:
        sided = 12;
        break;
      case DiceType.D20:
        sided = 20;
        break;
      default:
        sided = 2;
        break;
    }

    for (let i = 0; i < sided; i++) {
      const faceName = faceGeneratorFunc(i);
      const identifier = identifierSuffix != null ? `${faceName}_${identifierSuffix}` : undefined;
      faces.push(DataElement.create(faceName, '', { type: 'image' }, identifier));
    }

    [...(this.imageDataElement?.children ?? [])].forEach((element) => element.destroy());
    faces.forEach((element) => this.imageDataElement?.appendChild(element));
    this.face = faces[0].name;

    return faces;
  }

  /**
   * Makes and initializes a die with a name, a size and the faces of a type. Its face elements take
   * identifiers built from the die's own.
   */
  static create(name: string, type: DiceType, size: number, identifier?: string): DiceSymbol {
    const object: DiceSymbol = identifier ? new DiceSymbol(identifier) : new DiceSymbol();

    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('size', size, {}, `size_${object.identifier}`));

    object.makeDiceFace(type, object.identifier);
    object.initialize();
    return object;
  }
}
