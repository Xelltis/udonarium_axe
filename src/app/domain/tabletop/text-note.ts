import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { moveToTopmost } from '@axe/domain/tabletop/tabletop-object-util';

@SyncObject('text-note')
export class TextNote extends OwnedTabletopObject {
  @SyncVar() owner: string = '';
  @SyncVar() isLock: boolean = false;
  @SyncVar() disclosureMode: string = '';
  @SyncVar() disclosureUserIds: string[] = [];

  @SyncVar() rotate: number = 0;
  @SyncVar() zindex: number = 0;
  @SyncVar() password: string = '';
  @SyncVar() isUpright: boolean = true;

  @SyncVar() limitHeight: boolean = false;
  @SyncVar() overViewWidth: number = 250;
  @SyncVar() overViewMaxHeight: number = 250;

  /** How many grid cells wide the note is, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  /** How many grid cells tall the note is, kept in its common data. */
  get height(): number {
    return this.getCommonValue('height', 1);
  }
  /** The size the note's text is drawn at, kept in its common data. */
  get fontSize(): number {
    return this.getCommonValue('fontsize', 1);
  }
  /** The note's title, kept in its common data. */
  get title(): string {
    return this.getCommonValue('title', '');
  }
  /** The note's body text. Setting it does nothing when the note has no text element. */
  get text(): string {
    return this.getCommonValue('text', '');
  }
  set text(text: string) {
    this.setCommonValue('text', text);
  }

  /** Brings the note in front of the other notes on the table. */
  toTopmost() {
    moveToTopmost(this);
  }

  /** Makes a text note with its size, font size, title and body text, and registers it for sync. */
  static create(
    title: string,
    text: string,
    fontSize: number = 16,
    width: number = 1,
    height: number = 1,
    identifier?: string
  ): TextNote {
    const object: TextNote = identifier ? new TextNote(identifier) : new TextNote();

    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('width', width, {}, `width_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('height', height, {}, `height_${object.identifier}`));
    object.commonDataElement!.appendChild(
      DataElement.create('fontsize', fontSize, {}, `fontsize_${object.identifier}`)
    );
    object.commonDataElement!.appendChild(DataElement.create('title', title, {}, `title_${object.identifier}`));
    object.commonDataElement!.appendChild(
      DataElement.create('text', text, { type: DataElementType.NOTE, currentValue: text }, `text_${object.identifier}`)
    );
    object.initialize();

    return object;
  }
}
