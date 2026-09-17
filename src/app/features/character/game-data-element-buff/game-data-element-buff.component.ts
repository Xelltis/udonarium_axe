import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { BUFF_COLORS, DEFAULT_BUFF_COLOR } from '@axe/domain/character/buff-appearance';
import { buffColorOf, buffIconOf, buffIconUrlOf, parseBuffStrength } from '@axe/domain/character/buff-badge';
import { BUFF_TIMINGS, BuffTiming, buffTimingOf, buffTriggerOf } from '@axe/domain/character/buff-timing';
import { buffTriggerOptions, selectedTriggerValue } from '@axe/domain/character/buff-trigger-options';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-data-element-buff, [game-data-element-buff]',
  templateUrl: './game-data-element-buff.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
  host: { '[attr.inert]': "isReadOnly() ? '' : null" },
})
export class GameDataElementBuffComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });

  readonly gameDataElement = input.required<DataElement>();
  readonly isEdit = input(false);
  readonly isTagLocked = input(false);
  readonly isValueLocked = input(false);
  readonly isPieceMode = input(false);

  /** How many children there are, following what is added and removed. */
  protected readonly childrenCount = computed<number>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.children.length;
  });

  private readonly _name = signal<string>('');
  /**
   * The buff's name as typed in the row, following the element whenever it changes.
   *
   * A write is held locally and reaches the synced element after a short pause, so each keystroke
   * does not send an update to the room.
   */
  get name(): string {
    this.objectChange.versionOf(this.gameDataElement().identifier)();
    return this._name();
  }
  set name(name: string) {
    this._name.set(name);
    this.setUpdateTimer();
  }

  private readonly _value = signal<number | string>(0);
  /** The buff's value field, written to the synced element after the same short pause as the name. */
  get value(): number | string {
    return this._value();
  }
  set value(value: number | string) {
    this._value.set(value);
    this.setUpdateTimer();
  }

  private readonly _currentValue = signal<number | string>(0);
  /**
   * The buff's current value, which is also the text its strength is read from.
   *
   * Written to the synced element after the same short pause as the name.
   */
  get currentValue(): number | string {
    return this._currentValue();
  }
  set currentValue(currentValue: number | string) {
    this._currentValue.set(currentValue);
    this.setUpdateTimer();
  }

  readonly iconChoices = ['✦', '☠️', '🛡️', '⚔️', '🔥', '❄️', '💤', '💫', '🍀', '⛓️', '👁️', '💊'];

  readonly icon = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffIconOf(element);
  });

  /** Where the picture is, for a buff whose mark is one that was brought in. */
  readonly iconUrl = computed(() => buffIconUrlOf(this.icon()));

  readonly colorChoices = BUFF_COLORS;
  readonly defaultColor = DEFAULT_BUFF_COLOR;

  readonly color = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffColorOf(element);
  });

  readonly strength = computed(() => parseBuffStrength(`${this.currentValue ?? ''}`));

  readonly timingChoices = BUFF_TIMINGS;

  readonly timing = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffTimingOf(element);
  });

  readonly trigger = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return buffTriggerOf(element);
  });

  /** The pieces a buff may be timed by, leaving out those on the table this reader cannot see. */
  private readonly candidates = computed(() => {
    this.objectChange.collectionOf('character')();
    return (this.inventory.tableInventory.tabletopObjects as GameCharacter[])
      .filter((character) => this.vision.mayBeListed(character))
      .map((character) => ({ identifier: character.identifier, name: character.name }));
  });

  readonly triggerOptions = computed(() =>
    buffTriggerOptions(this.candidates(), this.trigger(), (name) =>
      this.t('feature.character.buff.triggerUnknown', { name })
    )
  );

  readonly triggerValue = computed(() => selectedTriggerValue(this.candidates(), this.trigger()));

  /**
   * Sets when the buff counts down, and tells the room the element changed.
   *
   * Counting at the round's end needs no character to key off, so any trigger set before is removed.
   */
  selectTiming(timing: BuffTiming): void {
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.BUFF_TIMING, timing);
    if (timing === 'roundEnd') element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Applies the timing picked in the row's timing dropdown. */
  onSelectTiming(event: Event): void {
    this.selectTiming((event.target as HTMLSelectElement).value as BuffTiming);
  }

  /**
   * Names the character whose turn start or end the buff counts down on.
   *
   * A blank name removes the trigger, so the buff counts on its own character's turn.
   */
  setTrigger(name: string): void {
    const element = this.gameDataElement();
    const trimmed = name.trim();
    if (trimmed.length > 0) element.setAttribute(DataElementAttribute.BUFF_TRIGGER, trimmed);
    else element.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Applies the character picked in the row's trigger dropdown. */
  onSetTrigger(event: Event): void {
    this.setTrigger((event.target as HTMLSelectElement).value);
  }

  /** Gives the buff one of the offered marks; picking the mark it already has goes back to the default. */
  selectIcon(icon: string): void {
    const element = this.gameDataElement();
    if (buffIconOf(element) === icon) element.removeAttribute(DataElementAttribute.BUFF_ICON);
    else element.setAttribute(DataElementAttribute.BUFF_ICON, icon);
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Puts a picture from the room's images in place of the mark. */
  chooseIconImage(): void {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (identifier == null) return;
      const element = this.gameDataElement();
      if (identifier.length > 0) element.setAttribute(DataElementAttribute.BUFF_ICON, identifier);
      else element.removeAttribute(DataElementAttribute.BUFF_ICON);
      this.objectChange.notifyChanged(element.identifier);
    });
  }

  /** Gives the buff a badge colour; an empty colour, or the one it already has, goes back to the default. */
  selectColor(color: string): void {
    const element = this.gameDataElement();
    if (color.length < 1 || buffColorOf(element) === color) element.removeAttribute(DataElementAttribute.BUFF_COLOR);
    else element.setAttribute(DataElementAttribute.BUFF_COLOR, color);
    this.objectChange.notifyChanged(element.identifier);
  }

  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const element = this.gameDataElement();
      this.objectChange.versionOf(element.identifier)();
      this.setValues(element);
    });
  }

  /** Appends a placeholder numeric resource named TEST under this element. The template does not call it. */
  addElement() {
    this.gameDataElement().appendChild(
      DataElement.create('TEST', 8, { type: DataElementType.NUMBER_RESOURCE, currentValue: '001' }, 'TEST')
    ); // + '_' + character.identifier
  }

  /**
   * Destroys this element outright.
   *
   * Unlike `deletBuff`, it does not go through the owning character, so a status the buff moved is
   * not put back. The template does not call it.
   */
  deleteElement() {
    this.gameDataElement().destroy();
  }

  /** Moves this element one place earlier among its siblings; the first one stays put. */
  upElement() {
    const parentElement = this.gameDataElement().parent!;
    const index: number = parentElement.children.indexOf(this.gameDataElement());
    if (index > 0) {
      const prevElement = parentElement.children[index - 1];
      parentElement.insertBefore(this.gameDataElement(), prevElement);
    }
  }

  /** Moves this element one place later among its siblings; the last one stays put. */
  downElement() {
    const parentElement = this.gameDataElement().parent!;
    const index: number = parentElement.children.indexOf(this.gameDataElement());
    if (index < parentElement.children.length - 1) {
      const nextElement = parentElement.children[index + 1];
      parentElement.insertBefore(nextElement, this.gameDataElement());
    }
  }

  /** Writes the element's `type` attribute, which decides how a data element is shown and edited. */
  setElementType(type: string) {
    this.gameDataElement().setAttribute('type', type);
  }

  private setValues(object: DataElement) {
    this._name.set(object.name);
    this._currentValue.set(object.currentValue);
    this._value.set(object.value);
  }

  private setUpdateTimer() {
    clearTimeout(this.updateTimer ?? undefined);
    this.updateTimer = setTimeout(() => {
      if (this.gameDataElement().name !== this.name) this.gameDataElement().name = this.name;
      if (this.gameDataElement().currentValue !== this.currentValue)
        this.gameDataElement().currentValue = this.currentValue;
      if (this.gameDataElement().value !== this.value) this.gameDataElement().value = this.value;
      this.updateTimer = null;
    }, 66);
  }

  /**
   * Takes a buff off, from the row's delete button.
   *
   * Removed through the character that holds it where there is one; a buff with no character above
   * it is simply destroyed.
   */
  deletBuff(data: DataElement) {
    // Through the owner, so a buff that moved a status puts it back on the way out.
    const owner = ownerCharacterOf(data);
    if (owner) owner.buffs.remove(data);
    else data.destroy();
  }
}

function ownerCharacterOf(data: DataElement): GameCharacter | null {
  let node = data.parent;
  while (node) {
    if (node instanceof GameCharacter) return node;
    node = node.parent;
  }
  return null;
}
