import { ImageFile } from '@axe/core/storage/image-file';
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

  @SyncVar() face: string = '0';
  @SyncVar() owner: string = '';
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
